// app/store (#15 step 2.8, foundation): the Redux Toolkit store, its two slices and the action metadata helper.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlice } from '@reduxjs/toolkit';
import {
  createKsmStore, dispatch, getState, store, subscribe, rootReducer,
  DEVICE_SLICE_VERSION, TOURNAMENT_SLICE_VERSION, actionMeta, initialSettings, metaCourt, withMeta,
} from '../../app/store/index.ts';
import { DIVISION_PRESETS } from '../../app/engine/division-lists.ts';

test('two slices, tournament (its version and the Setup settings) and device (its version and the device fields)', () => {
  const s = createKsmStore();
  assert.deepEqual(s.getState(), {
    // The division lists (PR 9): the standard divisions, and the team court's entry (= settings.teamCourt).
    tournament: { sliceVersion: TOURNAMENT_SLICE_VERSION, settings: initialSettings, divisions: DIVISION_PRESETS.map(p => p[0]),
      divisionTypes: Object.fromEntries(DIVISION_PRESETS.map(p => [p[0], p[1]])),
      divisionCourts: { ...Object.fromEntries(DIVISION_PRESETS.map(p => [p[0], p[2]])), 'Team Tournament': 'Both' },
      // The people (PR 10): no rows; no team divisions until the load-time migration builds them.
      competitors: [], teams: [], exhibitions: [],
      // The awards (PR 11): none; no grand champions until one is added.
      awards: [],
      // The draw (PR 12a): not generated; no single elimination entrants or bye winners until Generate Tournament.
      pools: {}, teamPools: {}, brackets: {}, generated: false, managementRevision: 0, championshipNodes: {}, singleElimNodes: {}, teamBracketNodes: {}, teamElimTeams: {},
      // The court pointers (PR 13a): no division drawn; both courts on no division.
      currentByDivision: {}, courtState: { A: { division: null, index: 0 }, B: { division: null, index: 0 } }, courtActiveDivision: { A: null, B: null },
      // The court history (PR 13b): both courts' Undo and Redo lists empty; no Undo log until the first Undo/Redo.
      courtActionHistory: { A: [], B: [] }, courtRedoHistory: { A: [], B: [] },
      // The bouts (PR 13c-2): none drawn.
      allMatches: {} },
    device: { sliceVersion: DEVICE_SLICE_VERSION, regMode: 'individual', poolViewDivision: 'Women’s Open', currentCourt: 'A', publicCourt: 'A', currentDivision: 'Women’s Open', localCourtDivision: { A: null, B: null },
      currentMatchIndex: 0, activeScore: { A: { W: [], R: [], WT: 0, RT: 0 }, B: { W: [], R: [], WT: 0, RT: 0 } } },
  });
  assert.deepEqual(Object.keys(rootReducer(undefined, { type: '@@init' })), ['tournament', 'device']);
});

test('the app store and its plain-function accessors share one instance', () => {
  assert.equal(getState(), store.getState());
  let calls = 0;
  const off = subscribe(() => { calls++; });
  const action = dispatch({ type: 'test/unknown' });
  assert.deepEqual(action, { type: 'test/unknown' });
  assert.equal(calls, 1, 'listeners run on every dispatch');
  off();
  dispatch({ type: 'test/unknown' });
  assert.equal(calls, 1);
  assert.equal(getState().tournament, store.getState().tournament, 'an unknown action keeps each slice object');
});

test('preloaded state', () => {
  const s = createKsmStore({ device: { sliceVersion: 7 } });
  assert.equal(s.getState().device.sliceVersion, 7);
  assert.equal(s.getState().tournament.sliceVersion, TOURNAMENT_SLICE_VERSION);
});

test('store state is frozen: legacy-style in-place writes throw', () => {
  const s = createKsmStore();
  assert.ok(Object.isFrozen(s.getState().tournament));
  assert.throws(() => { 'use strict'; s.getState().tournament.sliceVersion = 2; }, TypeError);
});

test('no thunks: dispatching a function is refused', () => {
  const s = createKsmStore();
  assert.throws(() => s.dispatch(/** @type {any} */ (() => {})));
});

test('the serializable-action check reports a non-JSON payload (development builds)', () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => { errors.push(args.join(' ')); };
  try {
    createKsmStore().dispatch({ type: 'test/date', payload: new Date(0) });
  } finally { console.error = original; }
  assert.ok(errors.some(e => /non-serializable/i.test(e)), 'a Date payload is reported');
});

test('actionMeta: who / when / device / court, all plain JSON', () => {
  const now = () => new Date('2026-11-11T10:00:00Z');
  assert.deepEqual(actionMeta({}, now), { who: '', when: '2026-11-11T10:00:00.000Z', device: '', court: null });
  assert.deepEqual(actionMeta({ who: 'Table B', when: '2026-11-11T09:00:00+01:00', device: 'c1/t2', court: ' b ' }, now),
    { who: 'Table B', when: '2026-11-11T08:00:00.000Z', device: 'c1/t2', court: 'B' });
  assert.equal(actionMeta({ when: new Date(0) }).when, '1970-01-01T00:00:00.000Z');
  assert.throws(() => actionMeta({ when: 'not a date' }), RangeError);
  const meta = actionMeta({ court: 'a' });
  assert.deepEqual(JSON.parse(JSON.stringify(meta)), meta);
});

test('metaCourt', () => {
  assert.equal(metaCourt('A'), 'A');
  assert.equal(metaCourt('b'), 'B');
  for (const v of ['C', '', null, undefined, 1, {}]) assert.equal(metaCourt(v), null);
});

test('withMeta() as a slice prepare callback: the action carries payload and meta and passes the checks', () => {
  const now = () => new Date('2026-11-11T10:00:00Z');
  const slice = createSlice({
    name: 'probe',
    initialState: { last: null },
    reducers: {
      record: { reducer: (state, action) => { state.last = { ...action.payload, court: action.meta.court }; }, prepare: withMeta(now) },
    },
  });
  const action = slice.actions.record({ point: 'M' }, { who: 'Ana', device: 'c1/t1', court: 'A' });
  assert.deepEqual(action, { type: 'probe/record', payload: { point: 'M' }, meta: { who: 'Ana', when: '2026-11-11T10:00:00.000Z', device: 'c1/t1', court: 'A' } });
  assert.deepEqual(slice.reducer(undefined, action).last, { point: 'M', court: 'A' });
});

// #15 PR 13c-2 (#207 review M1): store.hold() / holdNotifications(). A court action, an Undo/Redo and a structural step
// run inside one; nothing in production subscribes to the store yet (the islands listen to window events), so this is the
// contract item 14 builds on.
test('hold(): the state changes at once, the subscribers run once at the outermost end, and only if something was dispatched', () => {
  const s = createKsmStore();
  const ping = () => ({ type: 'test/ping' });
  let n = 0, seen = [];
  const off = s.subscribe(() => { n++; seen.push(s.getState()); });
  // nesting: one notification, after the outermost hold; getState() is new right after each dispatch inside
  const out = s.hold(() => {
    const before = s.getState();
    s.dispatch({ type: 'tournament/settingChanged', payload: { key: 'tName', value: 'A' }, meta: actionMeta() });
    assert.notEqual(s.getState(), before);
    s.hold(() => { s.dispatch(ping()); s.dispatch(ping()); });
    assert.equal(n, 0, 'nothing while held, the inner hold\'s end included');
    return 'result';
  });
  assert.deepEqual([out, n], ['result', 1]);
  assert.equal(seen[0].tournament.settings.tName, 'A', 'the listener sees the end state');
  // no dispatch: no notification
  s.hold(() => s.getState()); assert.equal(n, 1);
  // without a hold, one notification per dispatch, as Redux
  s.dispatch(ping()); s.dispatch(ping()); assert.equal(n, 3);
  // a throw inside: the error is thrown, the subscribers are notified once and the hold is released
  assert.throws(() => s.hold(() => { s.dispatch(ping()); throw new Error('inside'); }), /inside/);
  assert.equal(n, 4);
  s.dispatch(ping()); assert.equal(n, 5, 'released: the next dispatch notifies at once');
  off();
  // a listener that dispatches during the flush (re-entrant): its dispatch notifies at once (nothing is held any more), once
  const order = [];
  const s2 = createKsmStore();
  let again = true;
  s2.subscribe(() => { order.push('a'); if (again) { again = false; s2.dispatch(ping()); } });
  s2.subscribe(() => order.push('b'));
  s2.hold(() => s2.dispatch(ping()));
  assert.deepEqual(order, ['a', 'a', 'b', 'b'], 'the nested dispatch notifies every listener, then the flush goes on');
  // a listener unsubscribed during the flush: the flush runs the listeners it started with; later ones see it gone
  const s3 = createKsmStore(), calls = [];
  let offB = () => {};
  s3.subscribe(() => { calls.push('a'); offB(); });
  offB = s3.subscribe(() => calls.push('b'));
  s3.hold(() => s3.dispatch(ping()));
  s3.dispatch(ping());
  assert.deepEqual(calls, ['a', 'b', 'a'], 'unsubscribed in the flush: called in that flush, not after');
  // a listener that throws while the held step threw too: the step's error is thrown; the listener's is reported as an
  // unhandled rejection, not in its place
  // (Promise.reject() is watched here: node:test would fail the test on the real unhandled rejection.)
  const s4 = createKsmStore(), reported = [], reject = Promise.reject;
  Promise.reject = e => { reported.push(e.message); return reject.call(Promise, e).catch(() => {}); };
  try {
    s4.subscribe(() => { throw new Error('listener'); });
    assert.throws(() => s4.hold(() => { s4.dispatch(ping()); throw new Error('step'); }), /step/);
    assert.deepEqual(reported, ['listener']);
    assert.throws(() => s4.hold(() => s4.dispatch(ping())), /listener/, 'when the step did not throw, the listener\'s error is thrown, as Redux');
    assert.deepEqual(reported, ['listener']);
  } finally { Promise.reject = reject; }
});
