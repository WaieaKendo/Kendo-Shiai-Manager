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
import { execFileSync } from 'node:child_process';
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
test('engine pool building and match generation equal the pre-move legacy code', () => {
  const legacySrc = execFileSync('git', ['show', 'ef0a095:app/js/04-engine-pools.js'], { encoding: 'utf8' });
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
