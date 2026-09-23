// app/engine/championship.ts (roadmap 2.4): template library, seeds, championship nodes
// and Match Objects, advancement planning and individual placements, plus equivalence
// with the pre-move legacy code over states rebuilt from the golden scenarios.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  championshipTemplateForTotal, championshipLabels, championshipCourtFor, buildChampionshipTemplateMatches,
  poolSeedResolution, seedNameForLabel, championshipNodeSource, syncChampionshipTemplate, sourceLabelForRound,
  individualPlacements, firstRoundName, roundMatchCount,
} from '../../app/engine/championship.ts';
import { html, engine, extractFunction } from '../lib/ksm-source.mjs';
import { gitShow } from '../lib/git-show.mjs';

const pool = (label, ...names) => ({ label, players: names.map(n => ({ name: n, dojo: `${n}-dojo` })) });
const bout = (white, red, wp, rp, extra = {}) => ({ pool: 'A', type: 'individual', white, red, wp, rp, done: true, ...extra });
const apply = (arr, plan) => { arr.push(...plan.missing); plan.updates.forEach(u => Object.assign(arr[u.index], u.set)); return arr; };
const MATCH_KEYS = ['division', 'pool', 'white', 'red', 'wdojo', 'rdojo', 'position', 'done', 'wp', 'rp', 'type', 'championship',
  'templateNode', 'origin', 'ready', 'champNodeId', 'bracketSlot', 'court', 'seedRed', 'seedWhite'];

test('template library: none below 6 or above 40; 2/4/8 first-round pairs; fresh arrays', () => {
  for (const n of [0, 1, 5, 41, 6.5, NaN]) assert.deepEqual(championshipTemplateForTotal(n), [], String(n));
  assert.deepEqual(championshipTemplateForTotal(6), [['A1', 'B2'], ['B1', 'A2']]);
  assert.deepEqual(championshipTemplateForTotal(9), [['A1', 'B1'], ['C1', 'A2']]);
  assert.deepEqual(championshipTemplateForTotal(17), [['A1', 'D1'], ['B1', 'C2'], ['C1', 'A2'], ['B2', 'E1']]);
  assert.deepEqual(championshipTemplateForTotal(40)[7], ['H1', 'J1']);
  for (let n = 6; n <= 40; n++) assert.equal(championshipTemplateForTotal(n).length, n <= 9 ? 2 : n <= 22 ? 4 : 8, String(n));
  const t = championshipTemplateForTotal(6); t[0][0] = 'X'; t.push([]);
  assert.deepEqual(championshipTemplateForTotal(6), [['A1', 'B2'], ['B1', 'A2']]);
  const pools = [pool('A', 'a', 'b', 'c'), pool('B', 'd', 'e', 'f')];
  assert.deepEqual(championshipLabels(false, [['X1', 'Y2']], pools), championshipTemplateForTotal(6));
  assert.deepEqual(championshipLabels(true, [['X1', 'Y2']], pools), [['X1', 'Y2']], 'stored bracket stays authoritative');
  assert.deepEqual(championshipLabels(true, [], [pool('A', 'a', 'b')]), []);
});

test('seed resolution: tied first place only seeds once its tiebreak locks it', () => {
  const p = pool('A', 'P', 'Q', 'R');
  const base = [bout('P', 'R', ['M'], []), bout('Q', 'R', ['K'], []), bout('P', 'Q', [], [])];
  const resFor = ms => () => poolSeedResolution(p, 'A', ms, 2);
  assert.deepEqual(poolSeedResolution(p, 'A', [...base.slice(0, 2), { ...base[2], done: false }], 2), { complete: false, seeds: {}, rows: [] }, 'pool not finished');
  const tied = poolSeedResolution(p, 'A', base, 2);
  assert.equal(tied.complete, false);
  assert.equal(seedNameForLabel('A1', resFor(base)), null, 'undecided while tied');
  assert.ok(seedNameForLabel('A1', resFor(base), false), 'provisional row when not finalized');
  const pending = [...base, bout('Q', 'P', [], [], { tiebreak: true, tiebreakSeries: 1, done: false })];
  assert.equal(poolSeedResolution(p, 'A', pending, 2).complete, false, 'pending tiebreak');
  const locked = [...base, bout('Q', 'P', ['M'], [], { tiebreak: true, tiebreakSeries: 1, requiresWinner: true })];
  const r = poolSeedResolution(p, 'A', locked, 2);
  assert.equal(r.complete, true);
  assert.deepEqual([r.seeds[1].name, r.seeds[2].name], ['Q', 'P']);
  assert.equal(seedNameForLabel('A1', resFor(locked)).name, 'Q');
  assert.equal(seedNameForLabel('A2', resFor(locked)).name, 'P');
  for (const bad of ['A4', 'a1', 'BYE', '', null]) assert.equal(seedNameForLabel(bad, resFor(locked)), null, String(bad));
});

test('nodes and Match Objects: rounds, feeder refs, field order, courts (single and split)', () => {
  const pairs = championshipTemplateForTotal(10);
  const single = buildChampionshipTemplateMatches('Open', pairs, (r, s, t) => championshipCourtFor('B', r, s, t), 4);
  assert.deepEqual(single.nodes.map(n => n.id), ['C-Quarterfinal-0', 'C-Quarterfinal-1', 'C-Quarterfinal-2', 'C-Quarterfinal-3',
    'C-Semifinal-0', 'C-Semifinal-1', 'C-Final-0']);
  assert.ok(single.nodes.every(n => n.court === 'B'));
  assert.deepEqual(single.nodes[4], { id: 'C-Semifinal-0', round: 'Semifinal', slot: 0, left: { ref: 'C-Quarterfinal-0' }, right: { ref: 'C-Quarterfinal-1' }, court: 'B' });
  assert.deepEqual(single.nodes[0].left, { seed: 'A1' });
  const m = single.matches[0];
  assert.deepEqual(Object.keys(m), MATCH_KEYS);
  assert.deepEqual(m, { division: 'Open', pool: 'Championship', white: '', red: '', wdojo: '', rdojo: '', position: 'Quarterfinal',
    done: false, wp: [], rp: [], type: 'individual', championship: true, templateNode: true, origin: 'TEMPLATE', ready: false,
    champNodeId: 'C-Quarterfinal-0', bracketSlot: 0, court: 'B', seedRed: 'A1', seedWhite: 'B2' });
  assert.equal(single.matches[6].seedRed, null);
  const split = buildChampionshipTemplateMatches('Open', pairs, (r, s, t) => championshipCourtFor('split', r, s, t), 4);
  assert.deepEqual(split.nodes.map(n => n.court), ['A', 'A', 'B', 'B', 'A', 'B', 'A']);
  const big = buildChampionshipTemplateMatches('Open', championshipTemplateForTotal(30), (r, s, t) => championshipCourtFor('split', r, s, t), 8);
  assert.equal(big.nodes[0].round, 'Round of 16');
  assert.deepEqual(big.nodes.filter(n => n.round === 'Quarterfinal').map(n => n.court), ['A', 'A', 'B', 'B']);
  assert.equal(big.nodes.length, 15);
  assert.deepEqual(buildChampionshipTemplateMatches('Open', [], () => 'A', 0), { nodes: [], matches: [] });
  assert.equal(firstRoundName(2), 'Semifinal');
  assert.equal(roundMatchCount(4, 'Quarterfinal'), 4);
  assert.equal(championshipCourtFor('split', 'Final', 5, 1), 'A');
});

test('advancement QF → SF → Final: seeds, "Winner of …" placeholders, invalid feeders, done bouts untouched', () => {
  const pairs = championshipTemplateForTotal(10);
  const { nodes, matches } = buildChampionshipTemplateMatches('Open', pairs, () => 'A', 4);
  const seeds = { A1: 'a1', B2: 'b2', C1: 'c1', A3: 'a3', B1: 'b1', C2: 'c2', A2: 'a2' }; // B3 undecided
  const seedFor = l => (seeds[l] ? { name: seeds[l], dojo: `${seeds[l]}-dojo`, wins: 3 } : null);
  const arr = matches.map(x => ({ ...x }));
  apply(arr, syncChampionshipTemplate('Open', nodes, arr, seedFor));
  assert.deepEqual([arr[0].red, arr[0].rdojo, arr[0].white, arr[0].ready], ['a1', 'a1-dojo', 'b2', true]);
  assert.deepEqual([arr[3].red, arr[3].white, arr[3].ready], ['a2', '', false], 'undecided seed');
  assert.deepEqual([arr[4].red, arr[4].white, arr[4].ready], ['', '', false]);
  const finish = (i, wp, rp) => Object.assign(arr[i], { done: true, wp, rp });
  finish(0, [], ['M']); // red a1 wins
  finish(1, [], []); // tied bout: no valid winner
  finish(2, ['K'], []); // white c2 wins
  const before2 = JSON.stringify(arr[2]);
  const plan = syncChampionshipTemplate('Open', nodes, arr, seedFor);
  assert.ok(plan.updates.every(u => !arr[u.index].done), 'finished bouts are not updated');
  apply(arr, plan);
  assert.equal(JSON.stringify(arr[2]), before2);
  assert.deepEqual([arr[4].red, arr[4].white, arr[4].ready], ['a1', '', false], 'tied feeder does not advance');
  assert.deepEqual([arr[5].red, arr[5].ready], ['c2', false]);
  assert.deepEqual(championshipNodeSource(nodes[4].left, seedFor, arr), { name: 'a1', dojo: 'a1-dojo' });
  assert.deepEqual(sourceLabelForRound(arr, 'Quarterfinal', 0), { name: 'a1', dojo: 'a1-dojo', done: true });
  assert.deepEqual(sourceLabelForRound(arr, 'Quarterfinal', 1), { name: 'Winner of Quarterfinal Match 2', dojo: '', done: false });
  assert.deepEqual(sourceLabelForRound(arr, 'Quarterfinal', 3), { name: 'Winner of Quarterfinal Match 4', dojo: '', done: false });
  // Re-score the tied bout, finish the other QF and both SFs, then the Final fills.
  Object.assign(arr[1], { wp: ['M'] });
  seeds.B3 = 'b3';
  apply(arr, syncChampionshipTemplate('Open', nodes, arr, seedFor));
  assert.deepEqual([arr[4].white, arr[4].ready, arr[3].white, arr[3].ready], ['a3', true, 'b3', true]);
  finish(3, ['M'], []);
  apply(arr, syncChampionshipTemplate('Open', nodes, arr, seedFor));
  finish(4, [], ['M', 'K']); finish(5, ['M'], []);
  apply(arr, syncChampionshipTemplate('Open', nodes, arr, seedFor));
  assert.deepEqual([arr[6].position, arr[6].red, arr[6].white, arr[6].ready], ['Final', 'a1', 'b3', true]);
  // Self-heal: a node without a Match Object gets a fresh one, appended and filled.
  const healed = arr.slice(0, 6);
  const heal = syncChampionshipTemplate('Open', nodes, healed, seedFor);
  assert.equal(heal.missing.length, 1);
  assert.deepEqual(Object.keys(heal.missing[0]), MATCH_KEYS);
  apply(healed, heal);
  assert.deepEqual([healed[6].champNodeId, healed[6].red, healed[6].white], ['C-Final-0', 'a1', 'b3']);
});

test('placements: 1st/2nd from the Final, two 3rds from Semifinals; pool-only 1st–3rd', () => {
  const ch = (position, white, red, wp, rp, done = true) => ({ championship: true, type: 'individual', position, white, red, wdojo: '', rdojo: '', wp, rp, done });
  const ms = [ch('Semifinal', 'a', 'b', ['M'], []), ch('Semifinal', 'c', 'd', [], ['K']), ch('Final', 'a', 'd', [], ['M'])];
  assert.deepEqual(individualPlacements(ms, null), [
    { place: '1st', name: 'd', tier: 'gold' }, { place: '2nd', name: 'a', tier: 'silver' },
    { place: '3rd', name: 'b', tier: 'bronze' }, { place: '3rd', name: 'c', tier: 'bronze' },
  ]);
  assert.deepEqual(individualPlacements(ms.slice(0, 2), null), [], 'no finished Final');
  let called = 0;
  const rows = () => { called++; return [{ name: 'p' }, { name: 'q' }, { name: 'r' }, { name: 's' }]; };
  assert.deepEqual(individualPlacements([], rows), [
    { place: '1st', name: 'p', tier: 'gold' }, { place: '2nd', name: 'q', tier: 'silver' }, { place: '3rd', name: 'r', tier: 'bronze' },
  ]);
  individualPlacements(ms, rows);
  assert.equal(called, 1, 'pool standings only computed without a Final');
});

// ---- Legacy equivalence over golden-scenario states --------------------------------
// The pre-move functions (7431433) and the current legacy globals run in two vm
// contexts; each builds the championship, replays the golden bouts and records the
// Match Objects, nodes, seeds, placeholders and placements after every step.
const FUNCS = ['championshipTemplateForTotal', 'championshipLabels', 'requiredSeedPlaces', 'poolSeedResolution', 'seedNameForLabel',
  'championshipMatchObjectForNode', 'buildChampionshipTemplateMatches', 'championshipNodeSource', 'syncChampionshipTemplate',
  'champWinnerObj', 'roundMatchCountForDivision', 'maybeAdvanceChampionship', 'firstRoundName', 'nextRoundFromName',
  'sourceLabelForRound', 'champMatchBySlot', 'championshipCourtFor', 'poolFinished', 'pendingTiebreak', 'initialPoolStandings',
  'resolveTiebreakBaseGroup', 'poolStandings', 'winnerOf', 'resultPlacements'];
const STUBS = `
function divisionCourtMode(div){return state.divisionCourts[div]||'A'}
function isPoolOnlyDivision(div){return !!state.poolOnly[div]}
function divisionComplete(div){return true}
function isTeamDivision(div){return false}`;

function statesFromGoldens() {
  const dir = new URL('../golden/engine/', import.meta.url);
  const out = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const g = JSON.parse(fs.readFileSync(new URL(file, dir), 'utf8'));
    const dojo = Object.fromEntries((g.setup || []).flatMap(d => d.entrants || []).map(e => [e.name, e.dojo]));
    for (const [div, gen] of Object.entries(g.generated || {})) {
      if (!gen.pools?.length) continue;
      const setup = (g.setup || []).find(d => d.name === div) || {};
      const final = (g.final?.[div]?.matches || []).filter(m => m.type === 'individual');
      const s = {
        generated: true, brackets: {}, championshipNodes: {}, divisionCourts: { [div]: setup.court || 'A' },
        poolOnly: { [div]: gen.pools.length === 1 && !final.some(m => m.championship) },
        pools: { [div]: gen.pools.map(p => ({ label: p.label, players: p.players.map(n => ({ name: n, dojo: dojo[n] || '' })) })) },
        allMatches: { [div]: final.filter(m => !m.championship).map(m => ({ division: div, pool: m.pool, white: m.white, red: m.red,
          wdojo: dojo[m.white] || '', rdojo: dojo[m.red] || '', wp: m.wp || [], rp: m.rp || [], done: !!m.done, type: 'individual',
          tiebreak: !!m.tiebreak, ...(m.tiebreak ? { tiebreakSeries: 1, requiresWinner: true } : {}) })) },
      };
      const champ = final.filter(m => m.championship).map(m => ({ node: m.node, wp: m.wp || [], rp: m.rp || [] }));
      out.push([`${file}:${div}`, div, s, champ]);
      if (setup.court !== 'split') out.push([`${file}:${div}@split`, div, { ...structuredClone(s), divisionCourts: { [div]: 'split' } }, champ]);
    }
  }
  return out;
}

test('championship build, advancement, seeds and placements equal the pre-move legacy code on golden states', t => {
  const OLD = '7431433';
  const oldFiles = ['04-engine-pools.js', '12-engine-result-integrity.js', '13-engine-standings-and-tiebreaks.js',
    '14-engine-championship.js', '15-engine-pool-standings.js', '27-results-screen.js'].map(f => gitShow(OLD, `app/js/${f}`));
  if (oldFiles.includes(null)) return t.skip(`${OLD} not in this clone`);
  const oldSrc = oldFiles.join('\n');
  const load = src => {
    const ctx = vm.createContext({ state: null, console: { warn() {} } });
    vm.runInContext(`${engine}\n${STUBS}\n${FUNCS.map(n => extractFunction(src, n)).join('\n')}`, ctx);
    return ctx;
  };
  const legacy = load(oldSrc), current = load(html);
  assert.ok(!/KSMEngine/.test(extractFunction(oldSrc, 'syncChampionshipTemplate')), 'old code is pre-move');
  assert.ok(/KSMEngine\.syncChampionshipTemplate/.test(extractFunction(html, 'syncChampionshipTemplate')), 'current code delegates');
  const states = statesFromGoldens();
  let brackets = 0, steps = 0;
  for (const [id, div, s, champ] of states) {
    const run = ctx => {
      ctx.state = structuredClone(s);
      const st = ctx.state, res = [];
      const snap = () => {
        const labels = ctx.championshipLabels(div);
        res.push(JSON.stringify(st.allMatches[div]), JSON.stringify(st.championshipNodes[div] || null), JSON.stringify(ctx.resultPlacements(div)),
          JSON.stringify(labels.flat().map(l => [ctx.seedNameForLabel(div, l, true), ctx.seedNameForLabel(div, l, false)])),
          JSON.stringify(['Round of 16', 'Quarterfinal', 'Semifinal'].flatMap(r => [0, 1, 2, 3].map(i => ctx.sourceLabelForRound(div, r, i)))));
      };
      const labels = ctx.championshipLabels(div);
      st.brackets[div] = labels;
      res.push(JSON.stringify(labels), ctx.championshipTemplateForTotal(st.pools[div].reduce((n, p) => n + p.players.length, 0)).length);
      st.allMatches[div].push(...ctx.buildChampionshipTemplateMatches(div, labels));
      ctx.syncChampionshipTemplate(div); snap();
      for (const c of champ) {
        const m = st.allMatches[div].find(x => x.championship && x.champNodeId === c.node);
        if (!m) continue;
        Object.assign(m, { wp: c.wp, rp: c.rp, done: true });
        ctx.maybeAdvanceChampionship(m); snap(); steps++;
      }
      // Self-heal path: drop the Final's Match Object and resync.
      st.allMatches[div] = st.allMatches[div].filter(x => !(x.championship && x.position === 'Final'));
      ctx.syncChampionshipTemplate(div); snap();
      return res;
    };
    const a = run(legacy), b = run(current);
    if (s.brackets && a[0] !== '[]') brackets++;
    assert.deepEqual(b, a, id);
  }
  assert.ok(brackets > 20 && steps > 50, `brackets: ${brackets}, advancement steps: ${steps}`);
});
