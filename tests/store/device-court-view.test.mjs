// #15 PR 6 (docs/STORE.md section 3 item 6): the court view in the store's `device` slice. state.currentCourt,
// state.publicCourt and state.currentDivision are store getters written only through device/courtChosen,
// device/publicCourtChanged and device/divisionShown; the division a court device chose per court
// (ksmLocalCourtDivision) is device.localCourtDivision. A load (replaceState) keeps all of them; the snapshot still
// carries the three `state` fields with their values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKsmStore, deviceSlice, dispatch, getState, setStoreStrict } from '../../app/store/index.ts';
import {
  ksmSetCurrentCourt, ksmSetPublicCourt, ksmShowDivision, replaceState, setStrayStoreWriteReporter, state, storeFieldPath,
} from '../../app/modules/app-state.js';

const actions = deviceSlice.actions;
const KEYS = ['currentCourt', 'publicCourt', 'currentDivision'];
const DEFAULTS = { currentCourt: 'A', publicCourt: 'A', currentDivision: 'Women’s Open' };
const reset = () => { dispatch(actions.courtChosen('A')); dispatch(actions.publicCourtChanged('A')); dispatch(actions.divisionShown('Women’s Open')); dispatch(actions.localCourtDivisionsCleared()); };

test('the slice: defaults as state had them, one action per field', () => {
  const s = createKsmStore();
  for (const [k, v] of Object.entries(DEFAULTS)) assert.equal(s.getState().device[k], v);
  assert.deepEqual(s.getState().device.localCourtDivision, { A: null, B: null });
  assert.deepEqual([actions.courtChosen, actions.publicCourtChanged, actions.divisionShown, actions.localCourtDivisionChosen, actions.localCourtDivisionsCleared].map(a => a.type),
    ['device/courtChosen', 'device/publicCourtChanged', 'device/divisionShown', 'device/localCourtDivisionChosen', 'device/localCourtDivisionsCleared']);
  s.dispatch(actions.courtChosen('B'));
  s.dispatch(actions.publicCourtChanged('B'));
  s.dispatch(actions.divisionShown(null));
  s.dispatch(actions.localCourtDivisionChosen({ court: 'B', division: 'Kids' }));
  assert.deepEqual([s.getState().device.currentCourt, s.getState().device.publicCourt, s.getState().device.currentDivision], ['B', 'B', null]);
  assert.deepEqual(s.getState().device.localCourtDivision, { A: null, B: 'Kids' });
  s.dispatch(actions.localCourtDivisionsCleared());
  assert.deepEqual(s.getState().device.localCourtDivision, { A: null, B: null });
});

test('the three fields are enumerable store getters in their old place; the snapshot carries their values', () => {
  const keys = Object.keys(state);
  for (const key of KEYS) {
    assert.deepEqual(storeFieldPath(key), ['device', key]);
    const d = Object.getOwnPropertyDescriptor(state, key);
    assert.ok(d.enumerable && !d.configurable && d.get && d.set, key);
  }
  assert.ok(keys.indexOf('history') + 1 === keys.indexOf('currentDivision') && keys.indexOf('poolViewDivision') + 1 === keys.indexOf('currentCourt')
    && keys.indexOf('currentCourt') + 1 === keys.indexOf('publicCourt'), 'the literal\'s order');
  ksmSetCurrentCourt('B'); ksmSetPublicCourt('B'); ksmShowDivision('Kids');
  const saved = JSON.parse(JSON.stringify(state));
  assert.deepEqual([saved.currentCourt, saved.publicCourt, saved.currentDivision], ['B', 'B', 'Kids']);
  assert.ok(!('localCourtDivision' in saved), 'the per-court choice is not in the snapshot (it never was)');
  reset();
});

test('the helpers dispatch; an unchanged value dispatches nothing', () => {
  const seen = [];
  const s = getState();
  ksmSetCurrentCourt('A'); ksmSetPublicCourt('A'); ksmShowDivision('Women’s Open');
  assert.equal(getState(), s, 'no action for the same value');
  ksmSetCurrentCourt('B'); seen.push(getState().device.currentCourt);
  ksmSetPublicCourt('B'); seen.push(getState().device.publicCourt);
  ksmShowDivision(null); seen.push(getState().device.currentDivision);
  assert.deepEqual(seen, ['B', 'B', null]);
  assert.deepEqual([state.currentCourt, state.publicCourt, state.currentDivision], ['B', 'B', null]);
  reset();
});

test('strict (tests): assigning any of the three throws and changes nothing', () => {
  for (const key of KEYS) {
    const before = state[key];
    assert.throws(() => { state[key] = 'B'; }, TypeError, key);
    assert.equal(state[key], before);
  }
});

test('production: a stray assignment is logged, dispatches legacy/fieldAssigned and is applied', () => {
  const reports = [];
  setStoreStrict(false);
  setStrayStoreWriteReporter(w => reports.push(w));
  try {
    state.currentCourt = 'B'; state.publicCourt = 'B'; state.currentDivision = 'Seniors';
    assert.deepEqual([getState().device.currentCourt, getState().device.publicCourt, getState().device.currentDivision], ['B', 'B', 'Seniors']);
    assert.deepEqual(reports.map(r => [r.field, r.path]), KEYS.map(k => [k, `device.${k}`]));
  } finally {
    setStoreStrict(true);
    setStrayStoreWriteReporter(w => console.warn('[KSM Store] A store field was assigned outside an action', w));
    reset();
  }
});

test('a load keeps this device\'s court, public court, division and per-court choice', () => {
  ksmSetCurrentCourt('B'); ksmSetPublicCourt('B'); ksmShowDivision('Juniors');
  dispatch(actions.localCourtDivisionChosen({ court: 'B', division: 'Juniors' }));
  const own = JSON.parse(JSON.stringify(state));
  // Another device's payload (remote apply, reload, first load, file load, tournament switch all go through replaceState).
  replaceState({ ...own, currentCourt: 'A', publicCourt: 'A', currentDivision: 'Open' });
  assert.deepEqual([state.currentCourt, state.publicCourt, state.currentDivision], ['B', 'B', 'Juniors']);
  assert.deepEqual(getState().device.localCourtDivision, { A: null, B: 'Juniors' });
  // A payload without the fields (an old file) does not clear them.
  const { currentCourt, publicCourt, currentDivision, ...without } = own;
  replaceState(without);
  assert.deepEqual([state.currentCourt, state.publicCourt, state.currentDivision], ['B', 'B', 'Juniors']);
  assert.ok(KEYS.every(k => Object.keys(state).includes(k)), 'still in the snapshot');
  reset();
});
