// Issue #136 step 1: pure helpers moved from app/js into app/engine/ (championship round names,
// registration status cycle). Each must give the same answer as its pre-move legacy declaration
// in the last single-file version (def5010), and app/js must now delegate to KSMEngine.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  champRoundOrder, nextChampRoundName, previousRoundName, roundSequenceFromFirst, nextRoundFromName,
} from '../../app/engine/championship.ts';
import { statusCycle } from '../../app/engine/registration.ts';
import { html, extractFunction } from '../lib/ksm-source.mjs';
import { gitShow } from '../lib/git-show.mjs';

const MOVED = { champRoundOrder, nextChampRoundName, previousRoundName, roundSequenceFromFirst, statusCycle };
const ROUNDS = ['Round of 16', 'Quarterfinal', 'Semifinal', 'Final', 'Pool A', '', undefined, null];
const CASES = {
  champRoundOrder: ROUNDS.map(r => [r]),
  nextChampRoundName: ROUNDS.flatMap(r => [0, 1, 2, 4, 8, 16].map(n => [r, n])),
  previousRoundName: ROUNDS.map(r => [r]),
  roundSequenceFromFirst: ROUNDS.map(r => [r]),
  statusCycle: ['Registered', 'Checked', 'NoShow', '', 'Other', undefined, null].map(s => [s]),
};

test('app/js delegates each moved helper to KSMEngine', () => {
  for (const name of Object.keys(MOVED)) {
    assert.match(extractFunction(html, name), new RegExp(`KSMEngine\\.${name}\\(`), name);
  }
});

test('moved helpers match the pre-move legacy code', t => {
  const old = gitShow('def5010', 'public/index.html');
  if (!old) { t.skip('def5010 not in this clone'); return; }
  const ctx = vm.createContext({});
  vm.runInContext([...Object.keys(MOVED), 'nextRoundFromName'].map(n => extractFunction(old, n)).join('\n'), ctx);
  for (const [name, fn] of Object.entries(MOVED)) {
    assert.ok(!/KSMEngine/.test(extractFunction(old, name)), `${name}: old code is pre-move`);
    for (const args of CASES[name]) {
      assert.deepEqual(fn(...args), JSON.parse(JSON.stringify(ctx[name](...args))), `${name}(${args.map(a => JSON.stringify(a)).join(', ')})`);
    }
  }
  assert.deepEqual(roundSequenceFromFirst('Quarterfinal'), ['Quarterfinal', 'Semifinal', 'Final']);
  assert.equal(nextRoundFromName('Final'), null);
});
