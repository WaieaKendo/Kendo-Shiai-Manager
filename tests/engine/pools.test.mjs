// app/engine/pools.ts poolSizes: the frozen template table (6..40) and the fallback
// below it, plus parity with the legacy global that now delegates to KSMEngine.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { poolSizes } from '../../app/engine/pools.ts';
import { html, withDependencies, extractFunction } from '../lib/ksm-source.mjs';

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
