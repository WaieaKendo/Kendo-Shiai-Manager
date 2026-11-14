// #15 PR 7 (docs/STORE.md section 3 item 7): the court screen's match and score pad. state.matches is a read-only getter
// derived from allMatches[currentDivision] (the live list, never a copy); state.current is device.currentMatchIndex
// (device/matchShown, ksmShowMatch()); state.score is device.activeScore[currentCourt] (device/scoreChanged,
// ksmSetScore()). A load ignores a payload's matches / current / score; the snapshot still carries all three.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKsmStore, deviceSlice, dispatch, getState, setStoreStrict } from '../../app/store/index.ts';
import {
  assignState, ksmEmptyScore, ksmResetCourtPads, ksmSetCurrentCourt, ksmSetScore, ksmShowDivision, ksmShowMatch, replaceState, setStrayStoreWriteReporter,
  state, stateFieldIsDerived, storeFieldPath,
} from '../../app/modules/app-state.js';

const actions = deviceSlice.actions;
const empty = () => ({ W: [], R: [], WT: 0, RT: 0 });
const bout = n => ({ division: 'Open', white: `W${n}`, red: `R${n}`, wp: [], rp: [], done: false });
const defaultReporter = w => console.warn('[KSM Store] A store field was assigned outside an action', w);
function reset() {
  ksmSetCurrentCourt('A'); ksmShowDivision('Women’s Open'); ksmResetCourtPads();
  delete state.allMatches.Open; delete state.allMatches.Kids;
}
function withOpen() { state.allMatches.Open = [bout(1), bout(2), bout(3)]; ksmShowDivision('Open'); return state.allMatches.Open; }

test('the slice: the shown index and a pad per court, one action each', () => {
  const s = createKsmStore();
  assert.equal(s.getState().device.currentMatchIndex, 0);
  assert.deepEqual(s.getState().device.activeScore, { A: empty(), B: empty() });
  assert.deepEqual([actions.matchShown, actions.scoreChanged, actions.scoresCleared].map(a => a.type), ['device/matchShown', 'device/scoreChanged', 'device/scoresCleared']);
  s.dispatch(actions.matchShown(2));
  s.dispatch(actions.scoreChanged({ court: 'B', score: { W: ['M'], R: [], WT: 1, RT: 0 } }));
  assert.equal(s.getState().device.currentMatchIndex, 2);
  assert.deepEqual(s.getState().device.activeScore, { A: empty(), B: { W: ['M'], R: [], WT: 1, RT: 0 } });
  s.dispatch(actions.scoresCleared());
  assert.deepEqual(s.getState().device.activeScore, { A: empty(), B: empty() });
});

test('matches, current and score are enumerable getters in their old place; the snapshot carries their values', () => {
  const keys = Object.keys(state);
  assert.deepEqual(keys.slice(keys.indexOf('courtState') + 1, keys.indexOf('courtState') + 4), ['matches', 'current', 'score'], 'the literal\'s order');
  for (const key of ['matches', 'current', 'score']) {
    const d = Object.getOwnPropertyDescriptor(state, key);
    assert.ok(d.enumerable && !d.configurable && d.get && d.set, key);
  }
  assert.ok(stateFieldIsDerived('matches') && storeFieldPath('matches') === null, 'matches has no store path: it is derived');
  assert.deepEqual(storeFieldPath('current'), ['device', 'currentMatchIndex']);
  assert.deepEqual(storeFieldPath('score'), ['device', 'activeScore', 'A']);
  const open = withOpen();
  ksmShowMatch(1); ksmSetScore({ W: ['M'], R: [], WT: 0, RT: 1 });
  const saved = JSON.parse(JSON.stringify(state));
  assert.deepEqual([saved.matches, saved.current, saved.score], [JSON.parse(JSON.stringify(open)), 1, { W: ['M'], R: [], WT: 0, RT: 1 }]);
  reset();
});

test('state.matches is the live list of the shown division: the same array object, in-place writes land in allMatches', () => {
  const open = withOpen();
  assert.equal(state.matches, open);
  state.matches[1].wp = ['K'];
  state.matches.push(bout(4));
  assert.deepEqual(state.allMatches.Open[1].wp, ['K']);
  assert.equal(state.allMatches.Open.length, 4);
  state.allMatches.Open = [...open].reverse();
  assert.equal(state.matches, state.allMatches.Open, 'a replaced list (a sort, a repair) is followed at once');
  state.allMatches.Kids = [bout(1)];
  ksmShowDivision('Kids');
  assert.equal(state.matches, state.allMatches.Kids, 'another division shown: its list');
  ksmShowDivision('Nothing drawn');
  assert.deepEqual(state.matches, [], 'a division with no list: []');
  reset();
});

test('the helpers dispatch once per change; an unchanged value dispatches nothing', () => {
  withOpen();
  let s = getState();
  ksmShowMatch(0); ksmSetScore(empty()); ksmSetScore({ W: [], R: [] });
  assert.equal(getState(), s, 'no action for the same value');
  ksmShowMatch(2);
  assert.equal(state.current, 2);
  s = getState();
  ksmSetScore({ ...state.score, W: [...state.score.W, 'M'] });
  assert.notEqual(getState(), s);
  assert.deepEqual(state.score, { W: ['M'], R: [], WT: 0, RT: 0 });
  s = getState();
  ksmSetScore({ W: ['M'], R: [], WT: 0, RT: 0 });
  assert.equal(getState(), s, 'an equal pad (a new object) dispatches nothing');
  reset();
});

test('state.score is the pad of this device\'s court', () => {
  ksmSetScore({ W: ['M'], R: [], WT: 0, RT: 0 });
  ksmSetCurrentCourt('B');
  assert.deepEqual(state.score, empty(), 'Court B has its own pad');
  ksmSetScore({ W: [], R: ['K'], WT: 1, RT: 0 });
  assert.deepEqual(getState().device.activeScore, { A: { W: ['M'], R: [], WT: 0, RT: 0 }, B: { W: [], R: ['K'], WT: 1, RT: 0 } });
  ksmSetCurrentCourt('A');
  assert.deepEqual(state.score, { W: ['M'], R: [], WT: 0, RT: 0 });
  ksmResetCourtPads();
  assert.deepEqual(getState().device.activeScore, { A: empty(), B: empty() });
  reset();
});

test('strict (tests): assigning matches, current or score throws, and the pad is frozen', () => {
  withOpen();
  for (const key of ['matches', 'current', 'score']) {
    const before = state[key];
    assert.throws(() => { state[key] = key === 'current' ? 5 : []; }, TypeError, key);
    assert.equal(state[key], before);
  }
  assert.throws(() => { state.score.W.push('M'); }, TypeError, 'the pad is store data: build a new one');
  assert.throws(() => { state.score.WT++; }, TypeError);
  reset();
});

test('production: matches is logged and ignored; current and score are logged and applied', () => {
  const open = withOpen();
  const reports = [];
  setStoreStrict(false);
  setStrayStoreWriteReporter(w => reports.push(w));
  try {
    state.matches = [];
    assert.equal(state.matches, open, 'derived: the assignment is ignored');
    state.current = 2;
    state.score = { W: ['D'], R: [], WT: 0, RT: 0 };
    assert.equal(getState().device.currentMatchIndex, 2);
    assert.deepEqual(getState().device.activeScore.A, { W: ['D'], R: [], WT: 0, RT: 0 });
    assert.deepEqual(reports.map(r => [r.field, r.path]), [['matches', '(derived; ignored)'], ['current', 'device.currentMatchIndex'], ['score', 'device.activeScore.A']]);
  } finally {
    setStoreStrict(true);
    setStrayStoreWriteReporter(defaultReporter);
    reset();
  }
});

test('a load ignores the payload\'s matches, current and score; assignState ignores matches', () => {
  const open = withOpen();
  ksmShowMatch(1); ksmSetScore({ W: ['M'], R: [], WT: 0, RT: 0 });
  const own = JSON.parse(JSON.stringify(state));
  // Another device's payload (remote apply, reload, first load, file load, tournament switch all go through replaceState).
  replaceState({ ...own, matches: [bout(9)], current: 2, score: { W: [], R: ['K', 'K'], WT: 0, RT: 0 } });
  assert.equal(state.current, 1);
  assert.deepEqual(state.score, { W: ['M'], R: [], WT: 0, RT: 0 });
  assert.equal(state.matches, state.allMatches.Open, 'the loaded allMatches.Open, not the payload\'s matches copy');
  assert.deepEqual(state.matches, JSON.parse(JSON.stringify(open)));
  const { matches, current, score, ...without } = own;
  replaceState(without);
  assert.equal(state.current, 1);
  assert.ok(['matches', 'current', 'score'].every(k => Object.keys(state).includes(k)), 'still in the snapshot');
  assignState({ matches: [bout(8)] });
  assert.equal(state.matches, state.allMatches.Open);
  reset();
});
