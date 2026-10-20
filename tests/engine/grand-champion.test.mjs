import test from 'node:test';
import assert from 'node:assert/strict';
import {
  grandChampionEntrants, grandChampionSignature, grandChampionPlan, grandChampionFusenBouts, grandChampionPlacements, grandChampionSetupError,
  grandChampionFormat, grandChampionCompetitors, drawnEntrants, migrateGrandChampions, renameGrandChampionSources, newGrandChampion, isGrandChampionId,
} from '../../app/engine/grand-champion.ts';
import { generateDivision } from '../../app/engine/generation.ts';
import { matchRequiresWinner } from '../../app/engine/standings.ts';
import { renamedDivisionState } from '../../app/engine/divisions.ts';
import { readSettings } from '../../app/engine/settings.ts';
import { mergeTeamDivisionRecords } from '../../app/engine/team-divisions.ts';
import { syncIndividualSingleElim } from '../../app/engine/single-elim.ts';

const gc = (over = {}) => ({ ...newGrandChampion('gc:1', 0, ['Open', 'Women']), ...over });
const done = (winner, runnerUp) => ({ complete: true, winner: { name: winner, dojo: winner + ' Dojo' }, runnerUp: runnerUp ? { name: runnerUp, dojo: runnerUp + ' Dojo' } : null });
const results = { Open: done('Aki', 'Ben'), Women: done('Cora', 'Dee') };
const draw = (row, entrants) => {
  const plan = generateDivision({ division: row.id, competitors: grandChampionCompetitors(row.id, entrants), teams: [], divisionType: grandChampionFormat(row), courtMode: row.court, settings: readSettings({}) });
  // The app then fills the bracket's sides (syncIndividualSingleElim(), 06-).
  const matches = plan.matches.map(m => ({ ...m }));
  if (plan.kind === 'singleElim') syncIndividualSingleElim(plan.singleElimNodes, matches, plan.singleElimComps, row.court).updates.forEach(u => Object.assign(matches[u.index], u.set));
  return { matches, singleElimComps: plan.singleElimComps, pools: plan.pools };
};

test('entrants wait for every source and follow stand-ins only while that person is still the winner', () => {
  const waiting = grandChampionEntrants(gc(), { Open: results.Open, Women: { complete: false } });
  assert.deepEqual(waiting.waiting, ['Women']); assert.equal(waiting.ready, false); assert.equal(waiting.entrants[1], null);
  const ready = grandChampionEntrants(gc(), results);
  assert.equal(ready.ready, true); assert.deepEqual(ready.entrants.map(e => [e.source, e.name, e.via]), [['Open', 'Aki', 'winner'], ['Women', 'Cora', 'winner']]);
  const runnerUp = grandChampionEntrants(gc({ standIns: { Open: { winner: 'Aki', kind: 'runner-up' } } }), results);
  assert.deepEqual([runnerUp.entrants[0].name, runnerUp.entrants[0].dojo, runnerUp.entrants[0].via], ['Ben', 'Ben Dojo', 'runner-up']);
  const fusen = grandChampionEntrants(gc({ standIns: { Open: { winner: 'Aki', kind: 'fusen-sho' } } }), results);
  assert.deepEqual([fusen.entrants[0].name, fusen.entrants[0].via], ['Aki', 'fusen-sho']);
  // The source was corrected: Ben won. The stand-in was for Aki, so Ben plays.
  const corrected = grandChampionEntrants(gc({ standIns: { Open: { winner: 'Aki', kind: 'runner-up' } } }), { ...results, Open: done('Ben', 'Aki') });
  assert.deepEqual([corrected.entrants[0].name, corrected.entrants[0].via], ['Ben', 'winner']);
});

test('the same person winning two sources needs a stand-in before the draw', () => {
  const both = grandChampionEntrants(gc(), { Open: done('Aki', 'Ben'), Women: done('Aki', 'Dee') });
  assert.deepEqual(both.duplicates, ['Women']); assert.equal(both.ready, false);
  assert.deepEqual(grandChampionPlan({}, both, {}), { kind: 'none' });
  const solved = grandChampionEntrants(gc({ standIns: { Women: { winner: 'Aki', kind: 'runner-up' } } }), { Open: done('Aki', 'Ben'), Women: done('Aki', 'Dee') });
  assert.equal(solved.ready, true); assert.equal(solved.entrants[1].name, 'Dee');
});

test('two winners play one Final that needs a winner (Encho); three to five can be a pool of winners', () => {
  const row = gc(), now = grandChampionEntrants(row, results);
  const plan = grandChampionPlan(row, now, {});
  assert.equal(plan.kind, 'draw');
  const s = draw(row, plan.entrants);
  assert.equal(s.matches.length, 1);
  const final = s.matches[0];
  assert.equal(final.position, 'Final'); assert.equal(final.court, 'A'); assert.equal(final.division, 'gc:1');
  assert.deepEqual([final.white, final.red].sort(), ['Aki', 'Cora']);
  assert.equal(matchRequiresWinner(final), true);
  // A round robin row with two sources is still one Final.
  assert.equal(grandChampionFormat(gc({ format: 'Round Robin' })), 'Single Elimination');
  const three = gc({ sources: ['Open', 'Women', 'Masters'], format: 'Round Robin', court: 'B' });
  const pool = draw(three, grandChampionEntrants(three, { ...results, Masters: done('Eli', 'Fay') }).entrants);
  assert.equal(pool.pools.length, 1); assert.equal(pool.matches.length, 3);
  assert.ok(pool.matches.every(m => m.court === 'B' && !m.championship));
  assert.deepEqual(drawnEntrants(pool).map(e => e.name).sort(), ['Aki', 'Cora', 'Eli']);
  // The draw is the same on every device.
  assert.deepEqual(draw(three, grandChampionEntrants(three, { ...results, Masters: done('Eli', 'Fay') }).entrants), pool);
});

test('before the start the draw follows the sources: refilled or cleared on a correction', () => {
  const row = gc(), drawn = draw(row, grandChampionEntrants(row, results).entrants);
  assert.deepEqual(grandChampionPlan(row, grandChampionEntrants(row, results), drawn), { kind: 'none' });
  const corrected = grandChampionEntrants(row, { ...results, Open: done('Ben', 'Aki') });
  const refill = grandChampionPlan(row, corrected, drawn);
  assert.equal(refill.kind, 'draw'); assert.deepEqual(refill.entrants.map(e => e.name), ['Ben', 'Cora']);
  assert.deepEqual(grandChampionPlan(row, grandChampionEntrants(row, { ...results, Open: { complete: false } }), drawn), { kind: 'clear' });
});

test('after the start a correction is the director\'s decision, remembered by signature', () => {
  const row = gc(), drawn = draw(row, grandChampionEntrants(row, results).entrants);
  drawn.matches = drawn.matches.map(m => ({ ...m, wp: ['M'] }));
  const corrected = grandChampionEntrants(row, { ...results, Open: done('Ben', 'Aki') });
  const ask = grandChampionPlan(row, corrected, drawn);
  assert.equal(ask.kind, 'ask'); assert.equal(ask.ready, true);
  assert.ok(ask.signature.startsWith(grandChampionSignature(corrected.entrants) + '|'), ask.signature);
  assert.deepEqual(grandChampionPlan({ keep: ask.signature }, corrected, drawn), { kind: 'none' });
  assert.equal(grandChampionPlan({ rebuild: ask.signature }, corrected, drawn).kind, 'draw');
  // A further correction asks again.
  const again = grandChampionEntrants(row, { ...results, Women: done('Dee', 'Cora') });
  assert.equal(grandChampionPlan({ keep: ask.signature }, again, drawn).kind, 'ask');
  // A source no longer decided after the start: asked too; "draw again" then clears.
  const undone = grandChampionEntrants(row, { ...results, Open: { complete: false } });
  const askUndone = grandChampionPlan(row, undone, drawn);
  assert.equal(askUndone.kind, 'ask'); assert.equal(askUndone.ready, false);
  assert.deepEqual(grandChampionPlan({ rebuild: askUndone.signature }, undone, drawn), { kind: 'clear' });
  // Review #86: a decision is never reused for another draw. "Draw again" for Ben vs Cora, that draw is
  // played, the sources move on and come back to Ben vs Cora: asked, not silently drawn again.
  const redrawn = draw(row, corrected.entrants);
  redrawn.matches = redrawn.matches.map(m => ({ ...m, wp: ['K'] }));
  const later = grandChampionEntrants(row, { ...results, Open: done('Ben', 'Aki'), Women: done('Dee', 'Cora') });
  const back = grandChampionEntrants(row, { ...results, Open: done('Aki', 'Ben') });
  assert.equal(grandChampionPlan({ rebuild: ask.signature }, back, redrawn).kind, 'ask');
  assert.equal(grandChampionPlan({ rebuild: ask.signature }, later, redrawn).kind, 'ask');
});

test('a withdrawal by Fusen-sho loses the entrant\'s unplayed bouts, never a scored one', () => {
  const matches = [
    { white: 'Aki', red: 'Cora', wdojo: 'Aki Dojo', rdojo: 'Cora Dojo' },
    { white: 'Eli', red: 'Aki', wdojo: 'Eli Dojo', rdojo: 'Aki Dojo' },
    { white: 'Aki', red: 'Fay', wdojo: 'Aki Dojo', rdojo: 'Fay Dojo', wp: ['M'] },
    { white: '', red: 'Aki', rdojo: 'Aki Dojo' },
    { white: 'Cora', red: 'Eli', wdojo: 'Cora Dojo', rdojo: 'Eli Dojo' },
  ];
  assert.deepEqual(grandChampionFusenBouts(matches, [{ name: 'Aki', dojo: 'Aki Dojo' }]), [{ index: 0, winner: 'R' }, { index: 1, winner: 'W' }]);
});

test('awards: Grand Champion, and Runner-up only when the row gives it', () => {
  const placements = [{ place: '1st', name: 'Aki', tier: 'gold' }, { place: '2nd', name: 'Cora', tier: 'silver' }, { place: '3rd', name: 'Eli', tier: 'bronze' }];
  assert.deepEqual(grandChampionPlacements(placements, 'top1'), [{ place: 'Grand Champion', name: 'Aki', tier: 'gold' }]);
  assert.deepEqual(grandChampionPlacements(placements, 'top2'), [{ place: 'Grand Champion', name: 'Aki', tier: 'gold' }, { place: 'Runner-up', name: 'Cora', tier: 'silver' }]);
  assert.deepEqual(grandChampionPlacements([], 'top2'), []);
  // A finalist who withdrew (Fusen-sho) is not the Runner-up.
  assert.deepEqual(grandChampionPlacements(placements, 'top2', ['Cora']), [{ place: 'Grand Champion', name: 'Aki', tier: 'gold' }]);
});

test('setup checks: individual divisions in use, two or more, a pool of 3–5', () => {
  const divisions = ['Open', 'Women', 'Masters'];
  assert.equal(grandChampionSetupError(gc(), divisions), null);
  assert.match(grandChampionSetupError(gc({ sources: ['Open'] }), divisions), /at least two/);
  assert.match(grandChampionSetupError(gc({ sources: ['Open', 'Gone'] }), divisions), /"Gone"/);
  assert.match(grandChampionSetupError(gc({ sources: ['Open', 'team:1'] }), divisions, ['team:1']), /Team divisions/);
  assert.match(grandChampionSetupError(gc({ name: ' ' }), divisions), /name/);
  assert.equal(grandChampionSetupError(gc({ sources: divisions, format: 'Round Robin' }), divisions), null);
  assert.match(grandChampionSetupError(gc({ sources: [...divisions, 'D', 'E', 'F'], format: 'Round Robin' }), [...divisions, 'D', 'E', 'F']), /3–5/);
});

test('load boundary, renames and the record merge', () => {
  assert.deepEqual(migrateGrandChampions({}), {}, 'older files stay without the key');
  assert.deepEqual(migrateGrandChampions({ grandChampions: null }).grandChampions, []);
  const loaded = migrateGrandChampions({ grandChampions: [{ id: 'gc:b', order: 1, sources: ['X', 'Y'] }, { id: 'nope' }, gc({ id: 'gc:a', court: 'Q' })] });
  assert.deepEqual(loaded.grandChampions.map(r => [r.id, r.court, r.format, r.awardMode]), [['gc:a', 'A', 'Single Elimination', 'top1'], ['gc:b', 'A', 'Single Elimination', 'top1']]);
  assert.deepEqual(migrateGrandChampions(loaded), loaded, 'idempotent');
  assert.ok(isGrandChampionId('gc:a')); assert.ok(!isGrandChampionId('Open'));
  const renamed = renameGrandChampionSources([gc({ standIns: { Open: { winner: 'Aki', kind: 'runner-up' } } })], 'Open', 'Open Men');
  assert.deepEqual(renamed[0].sources, ['Open Men', 'Women']); assert.deepEqual(Object.keys(renamed[0].standIns), ['Open Men']);
  const st = renamedDivisionState({ divisions: ['Open', 'Women'], grandChampions: [gc()] }, 'Open', 'Open Men');
  assert.deepEqual(st.grandChampions[0].sources, ['Open Men', 'Women']);
  // Rows merge by id, field by field: the court changed here, the award there; a removal wins.
  const base = [gc()], conflicts = [];
  const merged = mergeTeamDivisionRecords([{ ...gc(), awardMode: 'top2' }], [{ ...gc(), court: 'B' }], base, 'Grand champion', conflicts);
  assert.deepEqual([merged[0].court, merged[0].awardMode, conflicts], ['B', 'top2', []]);
  assert.deepEqual(mergeTeamDivisionRecords([], [{ ...gc(), court: 'B' }], base, 'Grand champion', conflicts), []);
  assert.deepEqual(conflicts, ['Grand champion']);
});
