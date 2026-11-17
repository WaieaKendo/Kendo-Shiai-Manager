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
      courtActionHistory: { A: [], B: [] }, courtRedoHistory: { A: [], B: [] } },
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
