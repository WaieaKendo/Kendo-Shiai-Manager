// Engine edge cases (test audit, issue #19; docs/TEST-AUDIT.md): the tournament rules the
// engine already implements, checked where the golden scenarios and the per-module tests do
// not reach: 3- and 4-way ties and their tiebreak series (a tiebreak of a tiebreak),
// withdrawals mid-pool (fusen-gachi), draws where a winner is required (encho / hantei),
// empty, one- and two-player divisions, odd pool sizes, single elimination with byes up to
// the 32 the validation allows, and kachinuki draws and last players.
//
// Where the engine's answer looks wrong, the test pins today's answer as an expected-failure
// check naming the finding (docs/ROADMAP.md, Bug triage): it fails once the finding is fixed;
// then assert the right answer and mark the finding fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  winnerOf, matchRequiresWinner, completedResultWinnerValid, initialPoolStandings, poolStandings, requiredSeedPlaces,
  resolveTiebreakBaseGroup, unresolvedRequiredTiebreakGroup, tiebreakMatchesForGroup,
} from '../../app/engine/standings.ts';
import { poolSizes, poolMatchPairs, buildPools, buildPoolMatches } from '../../app/engine/pools.ts';
import { generateDivision } from '../../app/engine/generation.ts';
import { championshipTemplateForTotal, individualPlacements } from '../../app/engine/championship.ts';
import { placeIndividualsForSingleElim, buildIndividualSingleElimMatches, syncIndividualSingleElim } from '../../app/engine/single-elim.ts';
import {
  teamBracketNodesForCount, buildTeamMatches, teamStandings, teamRoundRobinPlacements, teamWinner, teamPairIds, teamPairMatches,
  teamRoundRobinTiebreakPlan,
} from '../../app/engine/teams.ts';
import { kachinukiTransitionState, kachinukiPairWinner, maybeCreateKachinukiNext } from '../../app/engine/kachinuki.ts';

const pool = (label, ...names) => ({ label, players: names.map(n => ({ name: n, dojo: `${n}-dojo` })) });
const bout = (white, red, wp, rp, extra = {}) => ({ pool: 'A', type: 'individual', white, red, wp, rp, done: true, ...extra });
const tb = (series, white, red, wp, rp, extra = {}) => bout(white, red, wp, rp, { tiebreak: true, tiebreakSeries: series, ...extra });
const names = rows => rows.map(r => r.name);
const draw = (a, b) => bout(a, b, [], []);
// Plays generated tiebreak bouts with `winners` ('P|Q' -> winner name, missing = hikiwake).
const playSeries = (bouts, winners) => bouts.map(m => {
  const w = winners[`${m.white}|${m.red}`] ?? winners[`${m.red}|${m.white}`];
  return tb(m.tiebreakSeries, m.white, m.red, w === m.white ? ['M'] : [], w === m.red ? ['M'] : [], { requiresWinner: m.requiresWinner });
});
const people = (n, division = 'Open') => Array.from({ length: n }, (_, i) => ({ name: `P${String(i + 1).padStart(2, '0')}`, dojo: `Dojo ${i % 4}`, seed: '', division, status: 'Checked' }));
const SETTINGS = { teamFormat: '3-Person Team', teamTournamentFormat: 'Round Robin', exhibitionEnabled: 'Disabled' };

// ---- Ties and tiebreaks -------------------------------------------------------------------

test('3-way tie whose first tiebreak series is all hikiwake: the same three play a second series', () => {
  const p = pool('A', 'P', 'Q', 'R');
  const circle = [bout('P', 'Q', ['M'], []), bout('Q', 'R', ['M'], []), bout('R', 'P', ['M'], [])];
  const base = initialPoolStandings(p, circle);
  const target = { start: 1, end: 3, players: base };
  const s1 = tiebreakMatchesForGroup(circle, 'Open', 'A', base, 'A');
  assert.equal(s1.length, 3);
  assert.ok(s1.every(m => m.tiebreakSeries === 1 && m.requiresWinner === false), 'a 3-player series may end in draws');
  const afterS1 = [...circle, ...playSeries(s1, {})];
  const r1 = resolveTiebreakBaseGroup(afterS1, 'A', target);
  assert.deepEqual(r1.locked, [], 'nobody locked by three draws');
  assert.deepEqual(names(r1.unresolved).sort(), ['P', 'Q', 'R']);
  assert.deepEqual(names(unresolvedRequiredTiebreakGroup(afterS1, 'A', target, 1)).sort(), ['P', 'Q', 'R']);
  const s2 = tiebreakMatchesForGroup(afterS1, 'Open', 'A', r1.unresolved, 'A');
  assert.equal(s2.length, 3);
  assert.ok(s2.every(m => m.tiebreakSeries === 2), 'the tiebreak of the tiebreak is series 2');
  // Series 2: Q beats both, R beats P -> Q, R, P; the pool record stays 1 win / 1 point each.
  const afterS2 = [...afterS1, ...playSeries(s2, { 'Q|P': 'Q', 'Q|R': 'Q', 'R|P': 'R' })];
  assert.equal(unresolvedRequiredTiebreakGroup(afterS2, 'A', target, 3), null);
  assert.deepEqual(poolStandings(p, afterS2, 3).map(r => [r.name, r.wins, r.pts, r.tbWins, r.seedLocked]),
    [['Q', 1, 1, 2, true], ['R', 1, 1, 1, true], ['P', 1, 1, 0, true]]);
});

test('2-way tie at the top of a 3-way series, then series 2 between the two: all three ordered', () => {
  // Q and R beat P in series 1 and draw each other: Q/R tied for 1st, P 3rd.
  const p = pool('A', 'P', 'Q', 'R');
  const circle = [bout('P', 'Q', ['M'], []), bout('Q', 'R', ['M'], []), bout('R', 'P', ['M'], [])];
  const target = { start: 1, end: 3, players: initialPoolStandings(p, circle) };
  const afterS1 = [...circle, ...playSeries(tiebreakMatchesForGroup(circle, 'Open', 'A', target.players, 'A'), { 'Q|P': 'Q', 'R|P': 'R' })];
  const r1 = resolveTiebreakBaseGroup(afterS1, 'A', target);
  assert.deepEqual(names(r1.unresolved), ['Q', 'R']);
  assert.deepEqual(names(r1.ordered), ['Q', 'R', 'P'], 'P, beaten by both, is behind them');
  const s2 = tiebreakMatchesForGroup(afterS1, 'Open', 'A', r1.unresolved, 'A');
  assert.deepEqual(s2.map(m => [m.white, m.red, m.tiebreakSeries, m.requiresWinner]), [['Q', 'R', 2, true]]);
  const afterS2 = [...afterS1, ...playSeries(s2, { 'Q|R': 'R' })];
  assert.deepEqual(names(poolStandings(p, afterS2, 3)), ['R', 'Q', 'P']);
});

test('F26 (fixed): 4-way tie, the two players behind a still-tied pair are ordered by series 1, not by name', () => {
  // Pool-only pool of 4 (places 1-3 count): every pool bout hikiwake -> 4-way tie.
  const p = pool('A', 'P', 'Q', 'R', 'S');
  const draws = [['P', 'Q'], ['R', 'S'], ['R', 'P'], ['Q', 'S'], ['Q', 'R'], ['S', 'P']].map(([a, b]) => draw(a, b));
  const base = initialPoolStandings(p, draws);
  const target = { start: 1, end: 4, players: base };
  const req = requiredSeedPlaces(p, [])[p.label];
  assert.equal(req, 3);
  assert.deepEqual(names(unresolvedRequiredTiebreakGroup(draws, 'A', target, req)), ['P', 'Q', 'R', 'S']);
  // Series 1: Q and R beat P and S and draw each other; S beats P -> Q/R 2 wins, S 1, P 0.
  const s1 = tiebreakMatchesForGroup(draws, 'Open', 'A', base, 'A');
  assert.equal(s1.length, 6);
  const afterS1 = [...draws, ...playSeries(s1, { 'Q|P': 'Q', 'Q|S': 'Q', 'R|P': 'R', 'R|S': 'R', 'S|P': 'S' })];
  assert.deepEqual(names(unresolvedRequiredTiebreakGroup(afterS1, 'A', target, req)), ['Q', 'R']);
  const afterS2 = [...afterS1, ...playSeries(tiebreakMatchesForGroup(afterS1, 'Open', 'A', ['Q', 'R'].map(n => base.find(r => r.name === n)), 'A'), { 'Q|R': 'Q' })];
  assert.equal(unresolvedRequiredTiebreakGroup(afterS2, 'A', target, req), null, 'no further tiebreak is created');
  const order = names(poolStandings(p, afterS2, req));
  const third = individualPlacements([], () => poolStandings(p, afterS2, req))[2].name;
  // The rule (docs/TOURNAMENT_MANAGEMENT.md, v3.12.4: "resolves any determinable seeds"): S beat
  // P in series 1, so S is 3rd. Before the fix P (0 tiebreak wins) was 3rd: the players behind a
  // pair still tied after series 1 kept the pool (name) order.
  assert.deepEqual(order, ['Q', 'R', 'S', 'P'], 'F26: series 1 orders S ahead of P');
  assert.equal(third, 'S', 'F26: the bronze goes to S, who beat P in the tiebreak');
  // S and P were already placed by series 1 (before series 2 between Q and R).
  const r1 = resolveTiebreakBaseGroup(afterS1, 'A', target);
  assert.deepEqual(names(r1.ordered), ['Q', 'R', 'S', 'P']);
  assert.deepEqual(names(r1.locked), ['S', 'P'], 'S and P placed, Q/R still level');
  assert.deepEqual(poolStandings(p, afterS2, req).map(r => [r.name, r.wins, r.pts, r.tbWins, r.seedLocked]),
    [['Q', 0, 0, 3, true], ['R', 0, 0, 2, true], ['S', 0, 0, 1, true], ['P', 0, 0, 0, true]]);
});

test('F26: 4-way tie, two pairs still level after series 1: the pair behind is tiebroken too when its places count', () => {
  const p = pool('A', 'P', 'Q', 'R', 'S');
  const draws = [['P', 'Q'], ['R', 'S'], ['R', 'P'], ['Q', 'S'], ['Q', 'R'], ['S', 'P']].map(([a, b]) => draw(a, b));
  const base = initialPoolStandings(p, draws);
  const target = { start: 1, end: 4, players: base };
  // Series 1: Q and R beat P and S and draw each other; P and S draw -> Q/R 2 wins, P/S none.
  const afterS1 = [...draws, ...playSeries(tiebreakMatchesForGroup(draws, 'Open', 'A', base, 'A'), { 'Q|P': 'Q', 'Q|S': 'Q', 'R|P': 'R', 'R|S': 'R' })];
  assert.deepEqual(names(unresolvedRequiredTiebreakGroup(afterS1, 'A', target, 3)), ['Q', 'R'], 'first the pair for 1st');
  const s2 = tiebreakMatchesForGroup(afterS1, 'Open', 'A', ['Q', 'R'].map(n => base.find(r => r.name === n)), 'A');
  const afterS2 = [...afterS1, ...playSeries(s2, { 'Q|R': 'R' })];
  // Before the fix: no tiebreak for P/S and P (by name) got the bronze. Now 3rd counts, so P and S play.
  assert.deepEqual(names(unresolvedRequiredTiebreakGroup(afterS2, 'A', target, 3)), ['P', 'S'], 'then the pair for 3rd');
  assert.equal(unresolvedRequiredTiebreakGroup(afterS2, 'A', target, 2), null, 'only 1st-2nd counted: no tiebreak for 3rd');
  const s3 = tiebreakMatchesForGroup(afterS2, 'Open', 'A', ['P', 'S'].map(n => base.find(r => r.name === n)), 'A');
  assert.deepEqual(s3.map(m => [m.white, m.red, m.tiebreakSeries, m.requiresWinner]), [['P', 'S', 3, true]]);
  const afterS3 = [...afterS2, ...playSeries(s3, { 'P|S': 'S' })];
  assert.equal(unresolvedRequiredTiebreakGroup(afterS3, 'A', target, 3), null);
  assert.deepEqual(names(poolStandings(p, afterS3, 3)), ['R', 'Q', 'S', 'P']);
  assert.equal(individualPlacements([], () => poolStandings(p, afterS3, 3))[2].name, 'S');
});

test('F26: 3-way tie, the player behind a still-tied pair is placed 3rd by series 1', () => {
  const p = pool('A', 'P', 'Q', 'R');
  const circle = [bout('P', 'Q', ['M'], []), bout('Q', 'R', ['M'], []), bout('R', 'P', ['M'], [])];
  const target = { start: 1, end: 3, players: initialPoolStandings(p, circle) };
  // Series 1: Q and R beat P, draw each other -> P placed 3rd at once, Q/R tied.
  const afterS1 = [...circle, ...playSeries(tiebreakMatchesForGroup(circle, 'Open', 'A', target.players, 'A'), { 'Q|P': 'Q', 'R|P': 'R' })];
  const r1 = resolveTiebreakBaseGroup(afterS1, 'A', target);
  assert.deepEqual([names(r1.ordered), names(r1.locked), names(r1.unresolved)], [['Q', 'R', 'P'], ['P'], ['Q', 'R']]);
  assert.equal(unresolvedRequiredTiebreakGroup(afterS1, 'A', target, 3).length, 2);
});

test('F26: 5-way tie (pool-only pool of 5): the three behind a still-tied pair are ordered by series 1', () => {
  const p = pool('A', 'P', 'Q', 'R', 'S', 'T');
  const all = poolMatchPairs(5).map(([w, r]) => draw(['P', 'Q', 'R', 'S', 'T'][w], ['P', 'Q', 'R', 'S', 'T'][r]));
  const base = initialPoolStandings(p, all);
  const target = { start: 1, end: 5, players: base };
  const req = requiredSeedPlaces(p, [])[p.label];
  assert.equal(req, 3);
  // Series 1: Q and R beat S, T, P and draw each other; S beats T and P; T beats P.
  const s1 = tiebreakMatchesForGroup(all, 'Open', 'A', base, 'A');
  assert.equal(s1.length, 10);
  const afterS1 = [...all, ...playSeries(s1, { 'Q|S': 'Q', 'Q|T': 'Q', 'Q|P': 'Q', 'R|S': 'R', 'R|T': 'R', 'R|P': 'R', 'S|T': 'S', 'S|P': 'S', 'T|P': 'T' })];
  assert.deepEqual(names(unresolvedRequiredTiebreakGroup(afterS1, 'A', target, req)), ['Q', 'R']);
  const afterS2 = [...afterS1, ...playSeries(tiebreakMatchesForGroup(afterS1, 'Open', 'A', ['Q', 'R'].map(n => base.find(r => r.name === n)), 'A'), { 'Q|R': 'Q' })];
  assert.equal(unresolvedRequiredTiebreakGroup(afterS2, 'A', target, req), null);
  // Before the fix: Q, R, P, S, T (the three by name) and P got the bronze.
  assert.deepEqual(names(poolStandings(p, afterS2, req)), ['Q', 'R', 'S', 'T', 'P']);
  assert.equal(individualPlacements([], () => poolStandings(p, afterS2, req))[2].name, 'S');
});

test('a tie below the places that count gets no tiebreak; a tie that straddles the last counted place does', () => {
  // Pool of 4 feeding a championship with 2 places: P 3 wins; Q/R/S 1 win 1 point each (circle).
  const p = pool('A', 'P', 'Q', 'R', 'S');
  const ms = [bout('P', 'Q', ['M'], []), bout('P', 'R', ['M'], []), bout('P', 'S', ['M'], []),
    bout('Q', 'R', ['M'], []), bout('R', 'S', ['M'], []), bout('S', 'Q', ['M'], [])];
  const base = initialPoolStandings(p, ms);
  assert.deepEqual(names(base), ['P', 'Q', 'R', 'S']);
  const tied = { start: 2, end: 4, players: base.slice(1) };
  assert.equal(unresolvedRequiredTiebreakGroup(ms, 'A', tied, 1), null, 'only 1st counts: no tiebreak');
  assert.deepEqual(names(unresolvedRequiredTiebreakGroup(ms, 'A', tied, 2)), ['Q', 'R', 'S'], 'places 2-4 tied, 2nd counts');
  assert.deepEqual(poolStandings(p, ms, 1), base, 'not re-ordered while it does not count');
});

test('two-player pool: one bout, both places count, a draw is a tie for 1st settled by a must-win bout', () => {
  const p = pool('A', 'P', 'Q');
  assert.deepEqual(poolMatchPairs(2), [[0, 1]]);
  assert.deepEqual(requiredSeedPlaces(p, []), { A: 2 });
  const ms = [draw('P', 'Q')];
  const base = initialPoolStandings(p, ms);
  assert.deepEqual(names(unresolvedRequiredTiebreakGroup(ms, 'A', { start: 1, end: 2, players: base }, 2)), ['P', 'Q']);
  const s1 = tiebreakMatchesForGroup(ms, 'Open', 'A', base, 'A');
  assert.deepEqual(s1.map(m => [m.white, m.red, m.requiresWinner]), [['P', 'Q', true]]);
  assert.equal(matchRequiresWinner(s1[0]), true, 'Next Match refuses a draw (encho until a point)');
  const done = [...ms, ...playSeries(s1, { 'P|Q': 'Q' })];
  assert.deepEqual(names(poolStandings(p, done, 2)), ['Q', 'P']);
  assert.deepEqual(individualPlacements([], () => poolStandings(p, done, 2)).map(r => [r.place, r.name]), [['1st', 'Q'], ['2nd', 'P']]);
});

// ---- Withdrawals, encho and hantei -------------------------------------------------------------

test('withdrawal mid-pool: the remaining bouts as fusen-gachi count as 2-0 wins; earlier results stay', () => {
  // R wins its first bout, then withdraws: its two other bouts are fusen-gachi for the opponent
  // (the court's Fusen-gachi gives the other side F, F).
  const p = pool('A', 'P', 'Q', 'R', 'S');
  const ms = [
    bout('R', 'S', ['M'], []),                 // played before the withdrawal
    bout('P', 'Q', ['K'], []), bout('Q', 'S', [], ['D']), bout('P', 'S', ['M', 'K'], []),
    bout('P', 'R', ['F', 'F'], []), bout('Q', 'R', ['F', 'F'], []), // fusen-gachi after the withdrawal
  ];
  assert.equal(winnerOf(ms[4]), 'P');
  const rows = initialPoolStandings(p, ms);
  assert.deepEqual(rows.map(r => [r.name, r.wins, r.pts]), [['P', 3, 5], ['Q', 1, 2], ['R', 1, 1], ['S', 1, 1]]);
  // R's earlier win still counts: R and S are level on 1 win / 1 point (the bout between them is
  // not a tiebreak rule; a tiebreak bout is).
  assert.deepEqual(names(unresolvedRequiredTiebreakGroup(ms, 'A', { start: 3, end: 4, players: rows.slice(2) }, 3)), ['R', 'S'],
    'a withdrawn player still tied for a counted place is put in a tiebreak (the court gives fusen-gachi again)');
});

test('encho and hantei: a must-win bout cannot end level; a hantei is recorded as one point (F28: no hantei result)', () => {
  const final = { championship: true, type: 'individual', white: 'P', red: 'Q', done: true, wp: [], rp: [] };
  assert.equal(matchRequiresWinner(final), true);
  assert.equal(completedResultWinnerValid(final, 'Hikiwake'), false, 'a championship bout has no hikiwake');
  // Encho: the bout goes on until a point; it is saved as a 1-0 like any other.
  assert.equal(winnerOf({ ...final, wp: ['M'] }), 'P');
  // Hantei (a decision): KSM has no result for it, so the scorekeeper enters a point; it then
  // counts as an ippon in the points standings and tiebreaks (F28, a recorded limitation).
  const hanteiAsPoint = bout('P', 'Q', ['M'], []);
  assert.deepEqual(initialPoolStandings(pool('A', 'P', 'Q'), [hanteiAsPoint]).map(r => [r.name, r.wins, r.pts]), [['P', 1, 1], ['Q', 0, 0]]);
});

// ---- Empty, small and odd-sized divisions -------------------------------------------------------

test('generation: nobody -> nothing; one entrant -> a pool or bracket with no bout (validation needs 2)', () => {
  for (const divisionType of ['Round Robin', 'Single Elimination']) {
    const input = n => ({ division: 'Open', competitors: people(n), teams: [], divisionType, courtMode: 'A', settings: SETTINGS });
    assert.equal(generateDivision(input(0)), null, `${divisionType}: no entrants`);
    assert.equal(generateDivision({ ...input(3), competitors: people(3).map(c => ({ ...c, status: 'NoShow' })) }), null, 'only no-shows');
    const one = generateDivision(input(1));
    assert.deepEqual(one.matches, [], `${divisionType}: one entrant, no bout`);
    const two = generateDivision(input(2));
    assert.equal(two.matches.length, 1, `${divisionType}: two entrants, one bout`);
  }
  assert.equal(generateDivision({ division: 'Team Tournament', competitors: [], teams: [], settings: SETTINGS }), null);
});

test('odd pool sizes: every pool is a full round robin; 3-5 players are one pool-only division', () => {
  for (let n = 2; n <= 5; n++) {
    const pairs = poolMatchPairs(n), seen = new Set(pairs.map(([a, b]) => [a, b].sort().join()));
    assert.equal(pairs.length, n * (n - 1) / 2, `${n}: every pair once`);
    assert.equal(seen.size, pairs.length, `${n}: no pair twice`);
    assert.ok(pairs.every(([a, b]) => a !== b && a < n && b < n));
  }
  for (const n of [3, 4, 5]) {
    assert.deepEqual(poolSizes(n), [n]);
    assert.deepEqual(championshipTemplateForTotal(n) || [], [], `${n}: no championship, places from the pool`);
  }
  for (let n = 6; n <= 32; n++) {
    const pools = buildPools(people(n));
    assert.equal(pools.reduce((s, x) => s + x.players.length, 0), n, `${n}: everyone seated`);
    assert.ok(pools.every(x => x.players.length >= 3 && x.players.length <= 5), `${n}: pools of 3-5 (${pools.map(x => x.players.length)})`);
    const matches = buildPoolMatches('Open', pools, pools.map(() => 'A'));
    assert.equal(matches.length, pools.reduce((s, x) => s + x.players.length * (x.players.length - 1) / 2, 0), `${n}: bouts`);
  }
});

test('single elimination 17-32 (the validation maximum): byes, everyone placed once, played to the Final', () => {
  const apply = (nodes, arr, plan) => { plan.winners.forEach(w => { nodes[w.index].winner = w.winner; }); plan.updates.forEach(u => Object.assign(arr[u.index], u.set)); };
  for (const n of [17, 19, 23, 24, 27, 31, 32]) {
    const template = teamBracketNodesForCount(n);
    assert.ok(template && template.length, `${n}: a bracket template`);
    const comps = placeIndividualsForSingleElim(people(n).map((c, i) => ({ ...c, seed: i < 4 ? String(i + 1) : '' })), template);
    assert.equal(new Set(comps.map(c => c.name)).size, n, `${n}: everyone placed once`);
    const { nodes, matches } = buildIndividualSingleElimMatches('Open', teamBracketNodesForCount(comps.length), 'split');
    const sync = () => apply(nodes, matches, syncIndividualSingleElim(nodes, matches, comps, 'split'));
    sync();
    const entered = new Set();
    let guard = 0;
    while (!matches.at(-1).done && guard++ < 64) {
      const m = matches.find(x => x.ready && !x.done);
      assert.ok(m, `${n}: a ready bout until the Final is done`);
      assert.ok(m.white && m.red && m.white !== m.red, `${n}: two different entrants`);
      [m.white, m.red].forEach(x => entered.add(x));
      Object.assign(m, { wp: ['M'], rp: [], done: true }); // White wins
      sync();
    }
    assert.equal(entered.size, n, `${n}: every entrant fought at least once (no one lost in a bye)`);
    const final = matches.at(-1);
    assert.equal(final.position, 'Final');
    const places = individualPlacements(matches, null);
    assert.deepEqual(places.slice(0, 2).map(r => r.name), [final.white, final.red]);
    assert.equal(places.filter(r => r.place === '3rd').length, 2, `${n}: two bronzes`);
  }
});

// ---- Kachinuki --------------------------------------------------------------------------------

const kachinukiPair = () => buildTeamMatches('Team Tournament', [
  { team: 'Team A', senpo: 'A1', chuken: 'A2', taisho: 'A3' }, { team: 'Team B', senpo: 'B1', chuken: 'B2', taisho: 'B3' },
], { teamFormat: 'Kachinuki', teamTournamentFormat: 'Round Robin' }).matches;
// Plays the pairing's next bout with a result ('W', 'R' or '=') and adds what follows; returns the next bout's names.
function kachinuki(results) {
  const arr = kachinukiPair();
  for (const r of results) {
    const m = arr.at(-1);
    Object.assign(m, { wp: r === 'W' ? ['M'] : [], rp: r === 'R' ? ['M'] : [], done: true });
    const next = maybeCreateKachinukiNext(m);
    if (next) arr.push(next.match);
  }
  return arr;
}

test('kachinuki: draws remove both players; the last player left wins the pairing for the team', () => {
  // A1-B1 draw; A2 beats B2 and B3 -> Team B exhausted with A2 still standing (A3 never fights).
  let arr = kachinuki(['=', 'W', 'W']);
  assert.deepEqual(arr.map(m => [m.white, m.red]), [['A1', 'B1'], ['A2', 'B2'], ['A2', 'B3']]);
  assert.equal(kachinukiPairWinner(arr), 'Team A');
  assert.equal(teamWinner(arr, arr[0].teamPair), 'Team A');
  // Two draws, then B3 beats A3: Team B wins with its last player.
  arr = kachinuki(['=', '=', 'R']);
  assert.deepEqual(arr.map(m => [m.white, m.red]), [['A1', 'B1'], ['A2', 'B2'], ['A3', 'B3']]);
  assert.equal(kachinukiPairWinner(arr), 'Team B');
  // Three draws: both lineups exhausted -> representative playoff, which must have a winner.
  arr = kachinuki(['=', '=', '=']);
  assert.equal(arr.at(-1).type, 'teamPlayoff');
  assert.equal(matchRequiresWinner(arr.at(-1)), true);
  assert.equal(kachinukiPairWinner(arr), null, 'undecided until the playoff is played');
});

test('kachinuki: a team\'s last player is not removed by a draw while the other team has players left', () => {
  // The rule (kachinukiTransitionState; confirmed by the owners: the last player must lose for the team to lose): B1 beats A1 and A2, then A3 (Team A's
  // last) draws B1: only B1 leaves, A3 stays and meets B2.
  const arr = kachinuki(['R', 'R', '=']);
  assert.deepEqual(arr.map(m => [m.white, m.red]), [['A1', 'B1'], ['A2', 'B1'], ['A3', 'B1'], ['A3', 'B2']]);
  assert.deepEqual(kachinukiTransitionState({ wp: [], rp: [], wIndex: 2, rIndex: 0 }), { wi: 2, ri: 1, whiteExhausted: false, redExhausted: false });
  // A3 then beats B2 and B3: Team A wins with its last player.
  const done = kachinuki(['R', 'R', '=', 'W', 'W']);
  assert.equal(done.length, 5);
  assert.equal(kachinukiPairWinner(done), 'Team A');
  assert.equal(maybeCreateKachinukiNext(done.at(-1)), null, 'pairing decided: no further bout');
});

// ---- Team round robin ties ------------------------------------------------------------------------

test('F27 (fixed): team round robin ranked by team wins, bout wins, points, then a daihyosen for a counted place', () => {
  // Three 3-person teams, each wins one pairing; every team scores 2 points in total.
  // A beat B with one 2-0 bout (two draws); B beat C with two 1-0 bouts; C beat A with one 2-0 bout.
  const teams = ['A', 'B', 'C'].map(t => ({ team: `Team ${t}`, senpo: `${t}1`, chuken: `${t}2`, taisho: `${t}3` }));
  const arr = buildTeamMatches('Team Tournament', teams, SETTINGS).matches;
  const results = {
    'Team A|Team B': [[['M', 'K'], []], [[], []], [[], []]],
    'Team B|Team C': [[['M'], []], [['K'], []], [[], []]],
    'Team A|Team C': [[[], ['M', 'K']], [[], []], [[], []]],
  };
  for (const pair of teamPairIds(arr)) {
    const bouts = teamPairMatches(arr, pair), key = [bouts[0].teamWhite, bouts[0].teamRed].sort().join('|');
    const swap = bouts[0].teamWhite !== key.split('|')[0];
    bouts.forEach((m, i) => { const [a, b] = results[key][i]; Object.assign(m, { wp: swap ? b : a, rp: swap ? a : b, done: true }); });
  }
  const rows = teamStandings(arr, teams);
  // The owners' rule (WKC style): team wins, then bout wins, then points; Team B has the most bout
  // wins and is 1st. Before the fix the name decided (A, B, C) and no daihyosen was made.
  assert.deepEqual(rows.map(r => [r.name, r.wins, r.matchWins, r.pts, r.rank, r.nameFallback]), [
    ['Team B', 1, 2, 2, 1, false], ['Team A', 1, 1, 2, 2, true], ['Team C', 1, 1, 2, 2, true],
  ], 'Team B 1st on bout wins; A and C level on all three share 2nd until their daihyosen');
  // A and C are level for 2nd (a counted place): one daihyosen between them, a winner required.
  const plan = teamRoundRobinTiebreakPlan(arr.at(-1), arr, teams, '3-Person Team');
  assert.deepEqual(plan.bouts.map(b => [b.teamWhite, b.teamRed, b.white, b.red, b.position, b.type, b.tiebreakSeries, b.requiresWinner, matchRequiresWinner(b)]),
    [['Team A', 'Team C', 'Team A Representative', 'Team C Representative', 'Daihyosen', 'teamPlayoff', 1, true, true]]);
  assert.equal(plan.dynamicType, 'TEAM_3_PERSON_ROUND_ROBIN_TIEBREAK');
  const withDaihyosen = [...arr, ...plan.bouts];
  assert.equal(teamRoundRobinTiebreakPlan(arr.at(-1), withDaihyosen, teams, '3-Person Team'), null, 'not twice while it is unplayed');
  assert.deepEqual(teamPairIds(withDaihyosen), teamPairIds(arr), 'the daihyosen is not a pairing of the round robin');
  // Team C's representative wins the daihyosen (ippon shobu): C 2nd, A 3rd; the records are unchanged.
  Object.assign(withDaihyosen.at(-1), { wp: [], rp: ['M'], done: true });
  assert.deepEqual(teamStandings(withDaihyosen, teams).map(r => [r.name, r.wins, r.matchWins, r.pts, r.rank, r.nameFallback]), [
    ['Team B', 1, 2, 2, 1, false], ['Team C', 1, 1, 2, 2, false], ['Team A', 1, 1, 2, 3, false],
  ]);
  const placements = teamRoundRobinPlacements(true, withDaihyosen, teams);
  assert.deepEqual([placements.first, placements.second, placements.thirds], ['Team B', 'Team C', ['Team A']]);
  assert.equal(teamRoundRobinTiebreakPlan(withDaihyosen.at(-1), withDaihyosen, teams, '3-Person Team'), null, 'decided: no further daihyosen');
});
