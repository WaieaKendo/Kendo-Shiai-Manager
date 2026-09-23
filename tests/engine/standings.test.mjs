// app/engine/standings.ts (roadmap 2.3): winner helpers, pool standings, required
// places and tiebreak resolution, plus equivalence with the pre-move legacy code over
// states rebuilt from the golden scenarios.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  scoreWinnerOf, winnerOf, matchRequiresWinner, pendingTiebreak, initialPoolStandings, poolStandings,
  requiredSeedPlaces, resolveTiebreakBaseGroup, unresolvedRequiredTiebreakGroup, tiebreakStatsForPlayers,
  tiebreakMatchesForGroup,
} from '../../app/engine/standings.ts';
import { html, engine, extractFunction } from '../lib/ksm-source.mjs';
import { gitShow } from '../lib/git-show.mjs';

const pool = (label, ...names) => ({ label, players: names.map(n => ({ name: n, dojo: `${n}-dojo` })) });
const bout = (white, red, wp, rp, extra = {}) => ({ pool: 'A', type: 'individual', white, red, wp, rp, done: true, ...extra });
const tb = (series, white, red, wp, rp, extra = {}) => bout(white, red, wp, rp, { tiebreak: true, tiebreakSeries: series, ...extra });
const names = rows => rows.map(r => r.name);

test('winner helpers: points, valid snapshot wins, invalid snapshot ignored', () => {
  assert.equal(scoreWinnerOf(bout('P', 'Q', ['M'], [])), 'P');
  assert.equal(scoreWinnerOf(bout('P', 'Q', [], ['K'])), 'Q');
  assert.equal(scoreWinnerOf(bout('P', 'Q', [], [])), 'Hikiwake');
  assert.equal(scoreWinnerOf(null), 'Hikiwake');
  const snap = { winner: 'Q', wp: [], rp: ['M'] };
  assert.equal(winnerOf(bout('P', 'Q', ['M'], [], { completedResult: snap })), 'Q', 'saved result wins');
  assert.equal(winnerOf(bout('P', 'Q', ['M'], [], { done: false, completedResult: snap })), 'P', 'not done: points');
  assert.equal(winnerOf(bout('P', 'Q', ['M'], [], { completedResult: { winner: 'Q', wp: ['M'], rp: [] } })), 'P', 'inconsistent snapshot');
  const hikiwake = { winner: 'Hikiwake', wp: [], rp: [] };
  assert.equal(winnerOf(bout('P', 'Q', [], [], { completedResult: hikiwake })), 'Hikiwake');
  assert.equal(winnerOf(bout('P', 'Q', ['M'], [], { requiresWinner: true, completedResult: hikiwake })), 'P', 'draw not allowed');
  assert.equal(matchRequiresWinner({ championship: true, type: 'individual' }), true);
  assert.equal(matchRequiresWinner({ type: 'teamPlayoff' }), true);
  assert.equal(matchRequiresWinner({ type: 'individual' }), false);
  assert.equal(matchRequiresWinner(null), false);
});

test('initialPoolStandings: wins, then points, then name; tiebreaks and other pools ignored', () => {
  const p = pool('A', 'Dan', 'Cal', 'Bea', 'Amy');
  const ms = [
    bout('Dan', 'Cal', ['M', 'K'], []), bout('Bea', 'Amy', ['M'], []),
    bout('Bea', 'Dan', [], ['M']), bout('Cal', 'Amy', ['D'], []),
    bout('Cal', 'Bea', [], [], { done: false }), tb(1, 'Amy', 'Bea', ['M', 'M'], []),
    bout('Amy', 'Cal', ['M', 'M', 'M'], [], { pool: 'B' }),
  ];
  const rows = initialPoolStandings(p, ms);
  assert.deepEqual(rows, [
    { name: 'Dan', dojo: 'Dan-dojo', wins: 2, pts: 3 },
    { name: 'Bea', dojo: 'Bea-dojo', wins: 1, pts: 1 },
    { name: 'Cal', dojo: 'Cal-dojo', wins: 1, pts: 1 },
    { name: 'Amy', dojo: 'Amy-dojo', wins: 0, pts: 0 },
  ]);
  assert.deepEqual(initialPoolStandings(undefined, ms), []);
  assert.equal(pendingTiebreak([...ms, tb(2, 'Bea', 'Cal', [], [], { done: false })], 'A'), true);
  assert.equal(pendingTiebreak(ms, 'A'), false);
});

test('requiredSeedPlaces: highest place per pool from labels; pool-only needs 1st–3rd', () => {
  assert.deepEqual(requiredSeedPlaces(null, [['A1', 'B2'], ['B1', 'A2']]), { A: 2, B: 2 });
  assert.deepEqual(requiredSeedPlaces(null, [['A1', 'C3'], 'B1', ['Winner SF1', 'A2']]), { A: 2, C: 3, B: 1 });
  assert.deepEqual(requiredSeedPlaces(null, []), {});
  for (const n of [3, 4, 5]) assert.deepEqual(requiredSeedPlaces(pool('A', ...'PQRST'.slice(0, n)), []), { A: 3 }, `pool-only n=${n}`);
  assert.deepEqual(requiredSeedPlaces(pool('A', 'P', 'Q'), []), { A: 2 });
});

// P beats Q and R; Q and R draw -> Q/R tied on 0 wins 0 pts for places 2-3.
const twoWay = [bout('P', 'Q', ['M'], []), bout('R', 'P', [], ['K']), bout('Q', 'R', [], [])];

test('2-way tie: resolved by the tiebreak; rows keep the pool record and add tbWins/tbPts', () => {
  const p = pool('A', 'P', 'Q', 'R');
  const before = poolStandings(p, twoWay, 2);
  assert.deepEqual(names(before), ['P', 'Q', 'R'], 'unplayed tiebreak: name order');
  const ms = [...twoWay, tb(1, 'Q', 'R', [], ['M', 'K'], { requiresWinner: true })];
  const rows = poolStandings(p, ms, 2);
  assert.deepEqual(rows, [
    { name: 'P', dojo: 'P-dojo', wins: 2, pts: 2 },
    { name: 'R', dojo: 'R-dojo', wins: 0, pts: 0, tbWins: 1, tbPts: 2, seedLocked: true },
    { name: 'Q', dojo: 'Q-dojo', wins: 0, pts: 0, tbWins: 0, tbPts: 0, seedLocked: true },
  ]);
  // A tie below the required places is not re-ordered and carries no tiebreak record.
  assert.deepEqual(poolStandings(p, ms, 1).slice(1), [
    { name: 'Q', dojo: 'Q-dojo', wins: 0, pts: 0 }, { name: 'R', dojo: 'R-dojo', wins: 0, pts: 0 },
  ]);
});

// Circular pool: everyone 1 win / 1 point -> 3-way tie for 1st.
const circle = [bout('P', 'Q', ['M'], []), bout('Q', 'R', ['M'], []), bout('R', 'P', ['M'], [])];

test('3-way tie over two series: series 1 locks the leader, series 2 splits the rest', () => {
  const p = pool('A', 'P', 'Q', 'R');
  const base = initialPoolStandings(p, circle);
  const target = { start: 1, end: 3, players: base };
  assert.deepEqual(unresolvedRequiredTiebreakGroup(circle, 'A', target, 2), base, 'no tiebreak yet: whole group');
  const series1 = tiebreakMatchesForGroup(circle, 'D', 'A', base, 'B');
  assert.deepEqual(series1.map(m => [m.white, m.red, m.tiebreakSeries, m.tiebreakIndex, m.requiresWinner]),
    [['P', 'Q', 1, 0, false], ['R', 'Q', 1, 1, false], ['R', 'P', 1, 2, false]]);
  assert.deepEqual(Object.keys(series1[0]), ['division', 'pool', 'white', 'red', 'wdojo', 'rdojo', 'done', 'wp', 'rp',
    'tiebreak', 'type', 'requiresWinner', 'tiebreakSeries', 'tiebreakIndex', 'court']);
  assert.equal(series1[0].court, 'B');

  // Series 1: P beats Q and R, Q-R draw -> P locked 1st, Q/R still tied for 2nd.
  const afterS1 = [...circle, tb(1, 'P', 'Q', ['M'], []), tb(1, 'R', 'Q', [], []), tb(1, 'R', 'P', [], ['K'])];
  const r1 = resolveTiebreakBaseGroup(afterS1, 'A', target);
  assert.deepEqual(names(r1.locked), ['P']);
  assert.deepEqual(names(r1.unresolved), ['Q', 'R']);
  assert.deepEqual(unresolvedRequiredTiebreakGroup(afterS1, 'A', target, 2).map(x => x.name), ['Q', 'R']);
  assert.equal(unresolvedRequiredTiebreakGroup(afterS1, 'A', target, 1), null, 'only 1st needed: done');
  const series2 = tiebreakMatchesForGroup(afterS1, 'D', 'A', r1.unresolved, 'A');
  assert.deepEqual(series2.map(m => [m.white, m.red, m.tiebreakSeries, m.requiresWinner]), [['Q', 'R', 2, true]]);

  // Series 2: R beats Q.
  const afterS2 = [...afterS1, tb(2, 'Q', 'R', [], ['M'], { requiresWinner: true })];
  const r2 = resolveTiebreakBaseGroup(afterS2, 'A', target);
  assert.deepEqual(names(r2.locked), ['P', 'R', 'Q']);
  assert.deepEqual(r2.unresolved, []);
  assert.equal(unresolvedRequiredTiebreakGroup(afterS2, 'A', target, 3), null);
  // tbWins/tbPts sum every tiebreak series; wins/pts stay the pool record.
  assert.deepEqual(tiebreakStatsForPlayers(afterS2, 'A', base).stats.map(s => [s.name, s.wins, s.pts]), [['P', 2, 2], ['R', 1, 1], ['Q', 0, 0]]);
  assert.deepEqual(poolStandings(p, afterS2, 2).map(r => [r.name, r.wins, r.pts, r.tbWins, r.tbPts, r.seedLocked]),
    [['P', 1, 1, 2, 2, true], ['R', 1, 1, 1, 1, true], ['Q', 1, 1, 0, 0, true]]);
  // A pending series-2 bout leaves Q/R unresolved.
  const pending = [...afterS1, tb(2, 'Q', 'R', [], [], { done: false })];
  assert.deepEqual(names(resolveTiebreakBaseGroup(pending, 'A', target).unresolved), ['Q', 'R']);
});

test('pool-only division: a tie for 3rd needs a tiebreak (places 1-3), a championship feed of 2 does not', () => {
  // S beats everyone, P beats Q and R, Q/R draw and lose the rest -> Q/R tied for 3rd.
  const p = pool('A', 'S', 'P', 'Q', 'R');
  const ms = [bout('S', 'P', ['M'], []), bout('S', 'Q', ['M'], []), bout('S', 'R', ['M'], []),
    bout('P', 'Q', ['M'], []), bout('P', 'R', ['M'], []), bout('Q', 'R', [], [])];
  const base = initialPoolStandings(p, ms);
  const target = { start: 3, end: 4, players: base.slice(2) };
  const req = requiredSeedPlaces(p, [])[p.label];
  assert.equal(req, 3);
  assert.deepEqual(names(unresolvedRequiredTiebreakGroup(ms, 'A', target, req)), ['Q', 'R']);
  assert.equal(unresolvedRequiredTiebreakGroup(ms, 'A', target, 2), null);
  const done = [...ms, tb(1, 'Q', 'R', [], ['M'], { requiresWinner: true })];
  assert.deepEqual(names(poolStandings(p, done, req)), ['S', 'P', 'R', 'Q']);
  assert.deepEqual(names(poolStandings(p, done, 2)), ['S', 'P', 'Q', 'R']);
});

// ---- Legacy equivalence over golden-scenario states --------------------------------
// The pre-move functions (52e1806) and the current legacy globals (delegating to
// KSMEngine) run in two vm contexts on the same states; results must be identical.
const MOVED = ['matchRequiresWinner', 'completedResultWinnerValid', 'completedResultSnapshotValid', 'scoreWinnerOf',
  'winnerOf', 'pendingTiebreak', 'initialPoolStandings', 'tiebreakStatsForPlayers', 'tiebreakSeriesStats',
  'resolveTiebreakBaseGroup', 'unresolvedRequiredTiebreakGroup', 'tiebreakMatchesForGroup', 'makeTiebreakMatch',
  'requiredSeedPlaces', 'poolStandings', 'poolMatchPairs'];
const STUBS = `
function isPoolOnlyDivision(div){return !!state.poolOnly[div]}
function championshipLabels(div){return state.labels[div]||[]}
function poolCourtFor(div,pool){return (state.courts[div]||{})[pool]||'A'}`;

function statesFromGoldens() {
  const dir = new URL('../golden/engine/', import.meta.url);
  const states = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const g = JSON.parse(fs.readFileSync(new URL(file, dir), 'utf8'));
    const dojo = Object.fromEntries((g.setup || []).flatMap(d => d.entrants || []).map(e => [e.name, e.dojo]));
    const base = { pools: {}, allMatches: {}, poolOnly: {}, labels: {}, courts: {} };
    for (const [div, gen] of Object.entries(g.generated || {})) {
      if (!gen.pools?.length) continue;
      base.pools[div] = gen.pools.map(p => ({ label: p.label, players: p.players.map(n => ({ name: n, dojo: dojo[n] || '' })) }));
      const hasChamp = (gen.matches || []).some(m => m.championship);
      base.poolOnly[div] = gen.pools.length === 1 && !hasChamp;
      base.labels[div] = hasChamp ? gen.pools.map((p, i) => [`${p.label}1`, `${gen.pools[(i + 1) % gen.pools.length].label}2`]) : [];
      base.courts[div] = Object.fromEntries(gen.pools.map((p, i) => [p.label, i % 2 ? 'B' : 'A']));
      const seen = {};
      const all = (g.final?.[div]?.matches || []).filter(m => m.type === 'individual' && !m.championship).map((m, i) => {
        const match = { division: div, pool: m.pool, white: m.white, red: m.red, wp: m.wp || [], rp: m.rp || [], done: !!m.done, type: 'individual', tiebreak: !!m.tiebreak };
        if (m.tiebreak) {
          const key = `${m.pool}|${[m.white, m.red].sort()}`;
          match.tiebreakSeries = seen[key] = (seen[key] || 0) + 1;
          match.requiresWinner = m.winner !== 'Hikiwake';
        }
        if (m.done && i % 3 === 0) match.completedResult = { winner: m.winner, wp: m.wp || [], rp: m.rp || [] };
        return match;
      });
      base.allMatches[div] = all;
    }
    if (!Object.keys(base.pools).length) continue;
    // The final state, plus partial states (later bouts undone) and a required-3 variant.
    for (const cut of [1, 0.5, 0.8]) {
      const s = structuredClone(base);
      for (const div of Object.keys(s.allMatches)) {
        const n = Math.ceil(s.allMatches[div].length * cut);
        s.allMatches[div].forEach((m, i) => { if (i >= n) { m.done = false; delete m.completedResult; } });
      }
      states.push([`${file}@${cut}`, s]);
    }
    const s3 = structuredClone(base);
    for (const div of Object.keys(s3.labels)) s3.labels[div] = s3.pools[div].map(p => [`${p.label}1`, `${p.label}3`]);
    states.push([`${file}@req3`, s3]);
  }
  return states;
}

test('standings, required places and tiebreak matches equal the pre-move legacy code on golden states', t => {
  const OLD = '52e1806';
  const oldFiles = ['04-engine-pools.js', '10-court-scoring-and-history.js', '12-engine-result-integrity.js',
    '13-engine-standings-and-tiebreaks.js', '14-engine-championship.js', '15-engine-pool-standings.js'].map(f => gitShow(OLD, `app/js/${f}`));
  if (oldFiles.includes(null)) return t.skip(`${OLD} not in this clone`);
  const oldSrc = oldFiles.join('\n');
  const load = src => {
    const ctx = vm.createContext({ state: null });
    vm.runInContext(`${engine}\n${STUBS}\n${MOVED.map(n => extractFunction(src, n)).join('\n')}`, ctx);
    return ctx;
  };
  const legacy = load(oldSrc), current = load(html);
  assert.ok(!/KSMEngine\.poolStandings/.test(extractFunction(oldSrc, 'poolStandings')), 'old code is pre-move');
  assert.ok(/KSMEngine\.poolStandings/.test(extractFunction(html, 'poolStandings')), 'current code delegates');
  const states = statesFromGoldens();
  assert.ok(states.length > 100, `golden states: ${states.length}`);
  let groups = 0;
  for (const [id, s] of states) {
    const out = ctx => {
      ctx.state = structuredClone(s);
      const res = [];
      for (const div of Object.keys(s.pools)) {
        const req = ctx.requiredSeedPlaces(div);
        res.push(req);
        for (const m of s.allMatches[div]) res.push(ctx.winnerOf(m), ctx.scoreWinnerOf(m));
        for (const p of s.pools[div]) {
          const base = ctx.initialPoolStandings(p.label, div);
          res.push(base, ctx.poolStandings(p.label, div), ctx.pendingTiebreak(p.label, div), ctx.poolStandings('?', div));
          for (let i = 0; i < base.length;) {
            let j = i + 1;
            while (j < base.length && base[j].wins === base[i].wins && base[j].pts === base[i].pts) j++;
            if (j - i > 1) {
              groups++;
              const target = { start: i + 1, end: j, players: base.slice(i, j) };
              res.push(ctx.resolveTiebreakBaseGroup(p.label, div, target), ctx.tiebreakStatsForPlayers(p.label, div, target.players),
                ctx.unresolvedRequiredTiebreakGroup(p.label, div, target, req[p.label] || 2),
                ctx.tiebreakMatchesForGroup(div, p.label, target.players));
            }
            i = j;
          }
        }
      }
      return JSON.stringify(res);
    };
    assert.equal(out(current), out(legacy), id);
  }
  assert.ok(groups > 50, `tied groups compared: ${groups}`);
});
