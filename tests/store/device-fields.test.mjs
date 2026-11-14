// #15 PR 5 (docs/STORE.md section 3): the first device fields, regMode and poolViewDivision, in the store's `device` slice.
// `state` reads them through getters; they are written only through device/registrationTabChanged and
// device/poolViewDivisionChanged; a load (replaceState) keeps this device's value.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKsmStore, deviceSlice, dispatch, getState, setStoreStrict, rootReducer } from '../../app/store/index.ts';
import { ksmSetPoolViewDivision, replaceState, setStrayStoreWriteReporter, state, storeFieldPath } from '../../app/modules/app-state.js';

const actions = deviceSlice.actions;
const KEYS = ['regMode', 'poolViewDivision'];

/** Runs `fn` as app.js runs for users (not strict, auto-freeze off); restores the previous values after. */
function inProduction(fn) {
  const saved = { regMode: state.regMode, poolViewDivision: state.poolViewDivision };
  setStoreStrict(false);
  try { return fn(); } finally {
    setStoreStrict(true);
    dispatch(actions.registrationTabChanged(saved.regMode));
    dispatch(actions.poolViewDivisionChanged(saved.poolViewDivision));
  }
}

test('the device slice starts with the defaults state had, and its two actions set one field each', () => {
  const s = createKsmStore();
  assert.equal(s.getState().device.regMode, 'individual');
  assert.equal(s.getState().device.poolViewDivision, 'Women’s Open');
  assert.equal(actions.registrationTabChanged.type, 'device/registrationTabChanged');
  assert.equal(actions.poolViewDivisionChanged.type, 'device/poolViewDivisionChanged');
  s.dispatch(actions.registrationTabChanged('pools'));
  s.dispatch(actions.poolViewDivisionChanged('Open'));
  assert.equal(s.getState().device.regMode, 'pools');
  assert.equal(s.getState().device.poolViewDivision, 'Open');
  assert.equal(rootReducer(undefined, { type: '@@init' }).device.regMode, 'individual');
});

test('state.regMode and state.poolViewDivision are enumerable store getters that keep their place in Object.keys', () => {
  for (const key of KEYS) {
    assert.deepEqual(storeFieldPath(key), ['device', key]);
    const d = Object.getOwnPropertyDescriptor(state, key);
    assert.ok(d.enumerable && !d.configurable && d.get && d.set);
  }
  const keys = Object.keys(state);
  assert.ok(keys.indexOf('currentDivision') + 1 === keys.indexOf('poolViewDivision'), 'poolViewDivision stays after currentDivision');
  assert.ok(keys.indexOf('courtActiveDivision') + 1 === keys.indexOf('regMode'), 'regMode stays after courtActiveDivision');
  assert.deepEqual(JSON.parse(JSON.stringify(state)).regMode, 'individual', 'the snapshot still carries both');
  assert.equal(JSON.parse(JSON.stringify(state)).poolViewDivision, 'Women’s Open');
});

test('reads follow the actions; the Pools division helper dispatches', () => {
  dispatch(actions.registrationTabChanged('team'));
  assert.equal(state.regMode, 'team');
  ksmSetPoolViewDivision('Juniors');
  assert.equal(state.poolViewDivision, 'Juniors');
  assert.equal(getState().device.poolViewDivision, 'Juniors');
  dispatch(actions.registrationTabChanged('individual'));
  dispatch(actions.poolViewDivisionChanged('Women’s Open'));
});

test('strict: assigning either field throws and changes nothing', () => {
  for (const key of KEYS) {
    const before = state[key];
    assert.throws(() => { state[key] = 'x'; }, TypeError);
    assert.equal(state[key], before);
  }
});

test('production: a stray assignment is logged, dispatches legacy/fieldAssigned and is applied', () => {
  inProduction(() => {
    const reports = [];
    setStrayStoreWriteReporter(w => reports.push(w));
    state.regMode = 'exhibition';
    state.poolViewDivision = 'Seniors';
    assert.equal(state.regMode, 'exhibition');
    assert.equal(getState().device.regMode, 'exhibition');
    assert.equal(state.poolViewDivision, 'Seniors');
    assert.deepEqual(reports.map(r => [r.field, r.path]), [['regMode', 'device.regMode'], ['poolViewDivision', 'device.poolViewDivision']]);
  });
  setStrayStoreWriteReporter(w => console.warn('[KSM Store] A store field was assigned outside an action', w));
});

test('a load keeps this device: replaceState ignores a payload regMode / poolViewDivision, and a missing one is not cleared', () => {
  dispatch(actions.registrationTabChanged('pools'));
  dispatch(actions.poolViewDivisionChanged('Open'));
  const own = { ...JSON.parse(JSON.stringify(state)) };
  replaceState({ ...own, regMode: 'team', poolViewDivision: 'Other' });
  assert.equal(state.regMode, 'pools');
  assert.equal(state.poolViewDivision, 'Open');
  const { regMode, poolViewDivision, ...without } = own;
  replaceState(without);
  assert.equal(state.regMode, 'pools');
  assert.equal(state.poolViewDivision, 'Open');
  assert.deepEqual(Object.keys(state).filter(k => KEYS.includes(k)), ['poolViewDivision', 'regMode'], 'both stay in the snapshot');
  dispatch(actions.registrationTabChanged('individual'));
  dispatch(actions.poolViewDivisionChanged('Women’s Open'));
});
