// app/store/react.ts (#15 step 2.8): the islands' useStoreSelector hook and the snapshot helper it is built on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createSlice, configureStore } from '@reduxjs/toolkit';
import { selectionSnapshot, useStoreSelector, windowStore } from '../../app/store/react.ts';
import { createKsmStore } from '../../app/store/index.ts';

const counter = createSlice({
  name: 'counter',
  initialState: { n: 0, other: 0 },
  reducers: { inc: s => { s.n++; }, bumpOther: s => { s.other++; } },
});
const counterStore = () => configureStore({ reducer: counter.reducer });

test('selectionSnapshot: same state object -> selector not run again', () => {
  const s = counterStore();
  let runs = 0;
  const snap = selectionSnapshot(s.getState, st => { runs++; return st.n; });
  assert.equal(snap(), 0);
  assert.equal(snap(), 0);
  assert.equal(runs, 1);
  s.dispatch(counter.actions.inc());
  assert.equal(snap(), 1);
  assert.equal(runs, 2);
});

test('selectionSnapshot: an equal selection keeps the previous object (no re-render)', () => {
  const s = counterStore();
  const shallow = (a, b) => a.n === b.n;
  const snap = selectionSnapshot(s.getState, st => ({ n: st.n }), shallow);
  const first = snap();
  s.dispatch(counter.actions.bumpOther());
  assert.equal(snap(), first, 'unrelated change: same object');
  s.dispatch(counter.actions.inc());
  assert.notEqual(snap(), first);
  assert.equal(snap().n, 1);
});

test('selectionSnapshot: without isEqual a new object each change (Object.is)', () => {
  const s = counterStore();
  const snap = selectionSnapshot(s.getState, st => ({ n: st.n }));
  const first = snap();
  s.dispatch(counter.actions.bumpOther());
  assert.notEqual(snap(), first);
});

test('useStoreSelector renders the selected value from the given store', () => {
  const s = createKsmStore({ device: { sliceVersion: 42 } });
  const selectVersion = st => st.device.sliceVersion;
  function Probe() { return createElement('span', null, String(useStoreSelector(selectVersion, Object.is, s))); }
  assert.equal(renderToString(createElement(Probe)), '<span>42</span>');
});

test('useStoreSelector defaults to window.KSMStore, and says so when it is missing', () => {
  const selectVersion = st => st.tournament.sliceVersion;
  function Probe() { return createElement('b', null, String(useStoreSelector(selectVersion))); }
  assert.equal(windowStore(), undefined);
  assert.throws(() => renderToString(createElement(Probe)), /window\.KSMStore/);
  globalThis.KSMStore = createKsmStore({ tournament: { sliceVersion: 5 } });
  try {
    assert.equal(renderToString(createElement(Probe)), '<b>5</b>');
  } finally { delete globalThis.KSMStore; }
});
