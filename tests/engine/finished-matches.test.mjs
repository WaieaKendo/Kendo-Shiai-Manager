import test from 'node:test';
import assert from 'node:assert/strict';
import { finishedMatchSummary as engineFinishedMatchSummary } from '../../app/engine/finished-matches.ts';
const finishedMatchSummary = (...args) => JSON.parse(JSON.stringify(engineFinishedMatchSummary(...args)));
test('no matches or unfinished matches', () => {
  assert.deepEqual(finishedMatchSummary(), { total: 0, divisions: [] });
  assert.deepEqual(finishedMatchSummary({ Open: [null, { done: false }] }), { total: 0, divisions: [] });
});
test('pool and bracket results, divisions in stored Results order', () => {
  assert.deepEqual(finishedMatchSummary({ Kids: [{ done: true }, { done: true, championship: true }], Empty: [], Open: [{ done: true }] }), { total: 3, divisions: ['Kids', 'Open'] });
});
test('each team position and kachinuki bout counts once, not once per pairing or lineup', () => {
  assert.deepEqual(finishedMatchSummary({ Teams: [
    { done: true, type: 'teamPosition', teamPair: 'a' },
    { done: true, type: 'teamPosition', teamPair: 'a' },
    { done: false, type: 'teamPosition', teamPair: 'a' },
    { done: true, type: 'kachinuki', lineupW: ['A', 'B', 'C'] },
  ] }), { total: 3, divisions: ['Teams'] });
});
