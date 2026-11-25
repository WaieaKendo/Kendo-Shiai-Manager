// app/engine/pools.ts poolSizes: the frozen template table (6..40) and the fallback
// below it, plus parity with the legacy global that now delegates to KSMEngine.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { poolSizes } from '../../app/engine/pools.ts';
import { html, engine, withDependencies, extractFunction } from '../lib/ksm-source.mjs';

const r = (count, size) => Array(count).fill(size);
// Documented table: as many 4-person pools as possible, no 2-person pools.
const TABLE = {
  6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [3, 3, 3], 10: [4, 3, 3], 11: [4, 4, 3], 12: [4, 4, 4],
  13: [4, 3, 3, 3], 14: [4, 4, 3, 3], 15: [4, 4, 4, 3], 16: r(4, 4),
  17: [4, 4, 3, 3, 3], 18: [4, 4, 4, 3, 3], 19: [...r(4, 4), 3], 20: r(5, 4),
  21: [...r(3, 4), ...r(3, 3)], 22: [...r(4, 4), 3, 3],
  23: [4, 4, ...r(5, 3)], 24: [...r(3, 4), ...r(4, 3)], 25: [...r(4, 4), 3, 3, 3], 26: [...r(5, 4), 3, 3], 27: [...r(6, 4), 3], 28: r(7, 4),
  29: [...r(5, 4), 3, 3, 3], 30: [...r(6, 4), 3, 3], 31: [...r(7, 4), 3], 32: r(8, 4),
  33: [...r(6, 4), 3, 3, 3], 34: [...r(7, 4), 3, 3], 35: [...r(8, 4), 3], 36: r(9, 4),
  37: [...r(7, 4), 3, 3, 3], 38: [...r(8, 4), 3, 3], 39: [...r(9, 4), 3], 40: r(10, 4),
};
// Fallback below 6: one pool; n < 3 keeps the legacy [3] (never reached by the app).
const FALLBACK = { 0: [3], 1: [3], 2: [3], 3: [3], 4: [4], 5: [5] };

test('poolSizes matches the documented table and fallback for n = 0..40', () => {
  for (let n = 0; n <= 40; n++) assert.deepEqual(poolSizes(n), TABLE[n] ?? FALLBACK[n], `n=${n}`);
});

test('poolSizes seats every entrant for 3..40 and never makes a 2-person pool', () => {
  for (let n = 3; n <= 40; n++) {
    const sizes = poolSizes(n);
    assert.equal(sizes.reduce((a, b) => a + b, 0), n, `n=${n} total`);
    assert.ok(sizes.every(s => s >= 3), `n=${n} no pool under 3`);
  }
  assert.deepEqual(poolSizes(5), [5], 'n=5 wraps the remainder instead of [4, NaN]');
});

test('poolSizes returns a fresh array (callers may mutate it)', () => {
  poolSizes(8).push(99);
  assert.deepEqual(poolSizes(8), [4, 4]);
});

test('legacy global poolSizes delegates to KSMEngine with the same results', () => {
  const ctx = vm.createContext({});
  vm.runInContext(withDependencies(html, extractFunction(html, 'poolSizes')), ctx);
  for (let n = 0; n <= 60; n++) assert.deepEqual([...ctx.poolSizes(n)], poolSizes(n), `n=${n}`);
});

// ---- Step 2.2: pool building, slots and pool match order --------------------------
import { gitShow } from '../lib/git-show.mjs';
import {
  clubGroup, shuffleDeterministic, poolPlayerSlotLetter, poolPlayerSlot,
  assignPoolPlayerSlots, buildPools, poolMatchPairs, buildPoolMatches,
} from '../../app/engine/pools.ts';

const c = (name, dojo, seed = '') => ({ name, dojo, division: 'D', seed, status: 'Active' });

test('clubGroup lower-cases and merges Aiea/Waipahu into one group', () => {
  assert.equal(clubGroup('Hilo Kendo'), 'hilo kendo');
  assert.equal(clubGroup('AIEA Hongwanji'), 'aiea-waipahu');
  assert.equal(clubGroup('Waipahu Kendo'), 'aiea-waipahu');
  assert.equal(clubGroup(''), '');
  assert.equal(clubGroup(undefined), '');
});

test('shuffleDeterministic orders by group+name+index and does not mutate', () => {
  const input = [c('Zed', 'Hilo'), c('Amy', 'Waipahu'), c('Bob', 'Aiea'), c('Cal', 'Hilo')];
  const copy = [...input];
  const out = shuffleDeterministic(input);
  assert.deepEqual(out.map(x => x.name), ['Amy', 'Bob', 'Cal', 'Zed']);
  assert.deepEqual(input, copy);
  assert.deepEqual(shuffleDeterministic(input), out, 'deterministic');
});

test('slot letters and assignPoolPlayerSlots copy players with A/B/C/D slots', () => {
  assert.deepEqual([0, 1, 2, 3, -1, NaN].map(poolPlayerSlotLetter), ['A', 'B', 'C', 'D', 'A', 'A']);
  assert.equal(poolPlayerSlot({ poolSlot: 'C' }, 0), 'C');
  assert.equal(poolPlayerSlot({}, 1), 'B');
  assert.equal(poolPlayerSlot(null, 2), 'C');
  const pools = [{ label: 'A', size: 2, players: [c('P', 'X'), c('Q', 'Y')] }];
  const out = assignPoolPlayerSlots(pools);
  assert.deepEqual(out[0].players.map(p => [p.name, p.poolSlot, p.poolSlotIndex]), [['P', 'A', 0], ['Q', 'B', 1]]);
  assert.equal(pools[0].players[0].poolSlot, undefined, 'input untouched');
  assert.deepEqual(Object.keys(out[0]), ['label', 'size', 'players']);
  assert.deepEqual(assignPoolPlayerSlots(null), []);
});

test('buildPools: one seed per pool, best seeds first', () => {
  const comps = [c('S3', 'A', '3'), c('S1', 'B', '1'), c('S2', 'C', '2'), ...'defghi'.split('').map(n => c(n, n))];
  const pools = buildPools(comps); // 9 → [3,3,3]
  assert.deepEqual(pools.map(p => p.size), [3, 3, 3]);
  assert.deepEqual(pools.map(p => p.players[0].name), ['S1', 'S2', 'S3']);
  assert.ok(pools.every(p => p.players.filter(x => x.seed).length === 1));
  assert.equal(pools.flatMap(p => p.players).length, 9);
});

test('buildPools spreads dojo-mates (Aiea and Waipahu together) across pools', () => {
  const comps = [
    c('a1', 'Aiea'), c('a2', 'Waipahu'), c('a3', 'Aiea'), c('a4', 'Waipahu'),
    c('h1', 'Hilo'), c('h2', 'Hilo'), c('h3', 'Hilo'), c('h4', 'Hilo'),
  ];
  const pools = buildPools(comps); // [4,4]
  for (const p of pools) {
    assert.equal(p.players.filter(x => clubGroup(x.dojo) === 'aiea-waipahu').length, 2, `pool ${p.label}`);
    assert.equal(p.players.filter(x => x.dojo === 'Hilo').length, 2, `pool ${p.label}`);
    assert.deepEqual(p.players.map(x => x.poolSlot), ['A', 'B', 'C', 'D']);
  }
  assert.deepEqual(buildPools([...comps].reverse()), pools, 'order of registration does not matter');
});

test('poolMatchPairs: fixed templates for 2..4, round robin above', () => {
  assert.deepEqual(poolMatchPairs(2), [[0, 1]]);
  assert.deepEqual(poolMatchPairs(3), [[0, 1], [2, 1], [2, 0]]);
  assert.deepEqual(poolMatchPairs(4), [[0, 1], [2, 3], [2, 0], [1, 3], [1, 2], [3, 0]]);
  assert.deepEqual(poolMatchPairs(5), [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]);
  assert.equal(poolMatchPairs(6).length, 15);
  assert.deepEqual(poolMatchPairs(1), []);
  poolMatchPairs(3)[0][0] = 9;
  assert.deepEqual(poolMatchPairs(3)[0], [0, 1], 'fresh arrays');
});

test('buildPoolMatches: canonical order, courts per pool, fixed field order', () => {
  const pools = buildPools(['p', 'q', 'r', 's', 't', 'u', 'v'].map(n => c(n, n))); // [4,3]
  const m = buildPoolMatches('D', pools, ['A', 'B']);
  assert.equal(m.length, 9);
  assert.deepEqual(Object.keys(m[0]), ['division', 'pool', 'white', 'red', 'wdojo', 'rdojo', 'whitePoolSlot', 'redPoolSlot',
    'done', 'wp', 'rp', 'type', 'origin', 'court', 'poolOrder', 'poolTemplateOrder']);
  assert.deepEqual(m.map(x => `${x.pool}${x.whitePoolSlot}${x.redPoolSlot}${x.court}${x.poolOrder}${x.poolTemplateOrder}`),
    ['AABA00', 'ACDA01', 'ACAA02', 'ABDA03', 'ABCA04', 'ADAA05', 'BABB10', 'BCBB11', 'BCAB12']);
  assert.deepEqual(buildPoolMatches('D', null, []), []);
});

// Equivalence with the pre-move legacy code (ef0a095), run in a vm on the same inputs.
test('engine pool building and match generation equal the pre-move legacy code', t => {
  const legacySrc = gitShow('ef0a095', 'app/js/04-engine-pools.js');
  if (legacySrc === null) return t.skip('ef0a095 not in this clone');
  const ctx = vm.createContext({ state: { divisionCourts: {}, pools: {} } });
  vm.runInContext(`${engine}\n${extractFunction(html, 'poolSizes')}\n${legacySrc.replace(/function poolSizes\(n\)\{[\s\S]*?\n\}\n/, '')}`, ctx);
  const dojos = ['Aiea', 'Waipahu', 'Hilo', 'Maui', 'Kona', 'Honolulu', ''];
  let rnd = 7;
  const next = k => (rnd = (rnd * 1103515245 + 12345) % 2147483648) % k;
  for (let n = 3; n <= 24; n++) for (let rep = 0; rep < 4; rep++) {
    const comps = Array.from({ length: n }, (_, i) => c(`N${next(50)}-${i}`, dojos[next(dojos.length)], next(4) === 0 ? String(1 + next(n)) : ''));
    const legacyPools = ctx.buildPools(comps.map(x => ({ ...x })));
    const pools = buildPools(comps.map(x => ({ ...x })));
    assert.equal(JSON.stringify(pools), JSON.stringify(legacyPools), `pools n=${n}`);
    for (const mode of ['A', 'B', 'split']) {
      ctx.state.divisionCourts.D = mode;
      const legacy = ctx.buildPoolMatches('D', JSON.parse(JSON.stringify(legacyPools)));
      const courts = pools.map((p, i) => (mode !== 'split' ? mode : i < Math.floor(pools.length / 2) ? 'A' : 'B'));
      assert.equal(JSON.stringify(buildPoolMatches('D', pools, courts)), JSON.stringify(legacy), `matches n=${n} ${mode}`);
    }
  }
});

// ---- #24 (product owner): a no-show before a pool starts rebuilds its bout order ----------
import { poolNoShowPlan } from '../../app/engine/pools.ts';

// [white, red] names of a pool's bouts.
const sides = ms => ms.map(m => [m.white, m.red]);
// Nobody changes tasuki (white/red side) between two consecutive bouts of the pool.
function assertNoTasukiChange(ms, label) {
  for (let i = 1; i < ms.length; i++) {
    const prev = ms[i - 1], cur = ms[i];
    for (const name of [cur.white, cur.red]) {
      const before = prev.white === name ? 'W' : prev.red === name ? 'R' : null;
      const now = cur.white === name ? 'W' : 'R';
      assert.ok(!before || before === now, `${label}: ${name} changes tasuki between bouts ${i} and ${i + 1} (${JSON.stringify(sides(ms))})`);
    }
  }
}
// A generated division: pools [4, 3] (A: 4 players, B: 3) and a championship template stand-in.
function division() {
  const pools = buildPools(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3'].map((n, i) => c(n, `Dojo ${i}`)));
  const matches = [...buildPoolMatches('D', pools, ['A', 'B']),
    { division: 'D', pool: 'Championship', championship: true, position: 'Final', white: '', red: '', done: false, court: 'A' }];
  return { pools, matches };
}

test('#24: a no-show in a pool of 4 leaves the 3-player order A-B, C-B, C-A; nobody changes tasuki; slots kept', () => {
  for (let k = 0; k < 4; k++) {
    const { pools, matches } = division();
    const poolA = pools[0], name = poolA.players[k].name, slot = 'ABCD'[k];
    assert.equal(poolA.players.length, 4);
    const plan = poolNoShowPlan('D', pools, matches, name);
    assert.ok(plan, `no-show of slot ${slot}`);
    const rest = poolA.players.filter(p => p.name !== name);
    assert.deepEqual(plan.players.map(p => [p.name, p.poolSlot]), rest.map(p => [p.name, p.poolSlot]), `${slot}: remaining players keep their slots`);
    const bouts = plan.matches.filter(m => m.pool === poolA.label);
    // poolMatchPairs(3): [0,1], [2,1], [2,0] over the remaining players in slot order.
    assert.deepEqual(sides(bouts), [[rest[0].name, rest[1].name], [rest[2].name, rest[1].name], [rest[2].name, rest[0].name]], `${slot}: 3-player order`);
    assert.deepEqual(bouts.map(m => [m.whitePoolSlot, m.redPoolSlot]),
      [[rest[0].poolSlot, rest[1].poolSlot], [rest[2].poolSlot, rest[1].poolSlot], [rest[2].poolSlot, rest[0].poolSlot]]);
    assert.deepEqual(bouts.map(m => [m.poolOrder, m.poolTemplateOrder, m.court, m.origin, m.done]),
      [[0, 0, 'A', 'TEMPLATE', false], [0, 1, 'A', 'TEMPLATE', false], [0, 2, 'A', 'TEMPLATE', false]]);
    assertNoTasukiChange(bouts, `no-show ${slot}`);
    // The rebuilt bouts take pool A's place; pool B and the championship are the same objects, in order.
    assert.equal(plan.matches.length, matches.length - 3);
    assert.ok(plan.matches.slice(3).every((m, i) => m === matches[6 + i]), `${slot}: other matches are the same objects, in order`);
  }
});

test('#24: the old order (the 4-player bouts minus the no-show) changed tasuki: why the pool is rebuilt', () => {
  // The 4-player order minus the no-show's bouts: without C, A-B then B-D (B red, then white);
  // without D, A-B then C-A (A white, then red). Without A or B the sides happened to hold.
  const changed = [0, 1, 2, 3].filter(k => {
    const { pools, matches } = division();
    const gone = pools[0].players[k].name;
    const filtered = matches.filter(m => m.pool === 'A' && m.white !== gone && m.red !== gone);
    try { assertNoTasukiChange(filtered, 'old order'); return false; } catch { return true; }
  }).map(k => 'ABCD'[k]);
  assert.deepEqual(changed, ['C', 'D']);
});

test('#24: a pool generated with 3 keeps its order; a pool of 5 shrinks to the 4-player order; 3 -> 2', () => {
  const three = buildPools(['P', 'Q', 'R', 'S', 'T', 'U'].map(n => c(n, n))); // [3, 3]
  const ms3 = buildPoolMatches('D', three, ['A', 'A']).filter(m => m.pool === 'A');
  assert.deepEqual(ms3.map(m => [m.whitePoolSlot, m.redPoolSlot]), [['A', 'B'], ['C', 'B'], ['C', 'A']]);
  assertNoTasukiChange(ms3, 'generated pool of 3');
  const five = [{ label: 'A', players: ['V', 'W', 'X', 'Y', 'Z'].map((n, i) => ({ name: n, dojo: '', poolSlot: 'ABCDE'[i], poolSlotIndex: i })) }];
  const plan = poolNoShowPlan('D', five, buildPoolMatches('D', five, ['B']), 'X');
  const rest = ['V', 'W', 'Y', 'Z'];
  assert.deepEqual(sides(plan.matches), poolMatchPairs(4).map(([w, r]) => [rest[w], rest[r]]), '5 -> 4: the 4-player order');
  assert.deepEqual(plan.matches.map(m => `${m.whitePoolSlot}${m.redPoolSlot}`), ['AB', 'DE', 'DA', 'BE', 'BD', 'EA'], 'slots kept (C left)');
  assert.ok(plan.matches.every(m => m.court === 'B'), 'the pool keeps its court');
  assertNoTasukiChange(plan.matches, '5 -> 4');
  // 3 -> 2: one bout between the two left (slots from the old positions when none were saved).
  const p3 = [{ label: 'A', players: ['P', 'Q', 'R'].map(n => ({ name: n, dojo: '' })) }];
  const two = poolNoShowPlan('D', p3, buildPoolMatches('D', p3, ['A']), 'Q');
  assert.deepEqual(two.matches.map(m => [m.white, m.red, m.whitePoolSlot, m.redPoolSlot]), [['P', 'R', 'A', 'C']]);
  assert.deepEqual(two.players.map(p => p.poolSlot), ['A', 'C']);
});

test('#24: a pool with a played bout is not restructured; an unknown name changes nothing', () => {
  const { pools, matches } = division();
  matches[1] = { ...matches[1], done: true, wp: ['M'], rp: [] };
  assert.equal(poolNoShowPlan('D', pools, matches, pools[0].players[0].name), null, 'pool A started');
  assert.ok(poolNoShowPlan('D', pools, matches, pools[1].players[0].name), 'pool B has not started: rebuilt');
  assert.equal(poolNoShowPlan('D', pools, matches, 'Nobody'), null);
  assert.equal(poolNoShowPlan('D', null, [], 'A1'), null);
});
