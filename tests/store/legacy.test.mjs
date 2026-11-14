// #15 PR 2 (docs/STORE.md section 2): legacy `state` next to the store. moveToStore() (strict: throws; production:
// logs and dispatches legacy/fieldAssigned), replaceState() / assignState(), every `state` key a plain property or a
// store getter, what a stray nested write does in production (Immer's auto-freeze off, point 8), and that only
// moveToStore() dispatches legacy/fieldAssigned.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSelector } from '@reduxjs/toolkit';
import {
  createKsmStore, getState, legacyFieldAssigned, legacyStateAssigned, setStoreStrict, storeIsStrict, subscribe, PRODUCTION_BUILD,
} from '../../app/store/index.ts';
import { assignState, moveToStore, replaceState, setStrayStoreWriteReporter, state, stateFieldIsDerived, storeFieldPath } from '../../app/modules/app-state.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** Runs `fn` with the store in production mode (not strict, auto-freeze off), as app.js does. */
function inProduction(fn) {
  setStoreStrict(false);
  try { return fn(); } finally { setStoreStrict(true); }
}
/** A store as app.js has it: the app's own factory without RTK's development checks (app.js's build leaves them out; here
 * the immutability check would report the mutation itself). tests/store-bundle-test.mjs runs the same case on the real bundle. */
const productionStore = () => createKsmStore(undefined, { developmentChecks: false });
/** The keys of `target` that are neither a plain data property nor a getter moveToStore() or deriveInState() (PR 7) made. */
function stateKeyProblems(target) {
  const problems = [];
  for (const key of Reflect.ownKeys(target)) {
    const d = Object.getOwnPropertyDescriptor(target, key);
    const name = String(key);
    if (typeof key === 'symbol') problems.push(`${name}: a symbol key`);
    else if ('value' in d) { if (!d.writable || !d.enumerable || !d.configurable) problems.push(`${name}: a data property that is not writable, enumerable and configurable`); }
    else if (!storeFieldPath(key, target) && !stateFieldIsDerived(key, target)) problems.push(`${name}: an accessor moveToStore() did not make`);
    else if (!d.enumerable || d.configurable || !d.get || !d.set) problems.push(`${name}: a store getter that is not enumerable, non-configurable, with get and set`);
  }
  return problems;
}

test('the Node tests run strict, not the production build', () => {
  assert.equal(PRODUCTION_BUILD, false);
  assert.equal(storeIsStrict(), true);
});

test('every key of the app state is a plain property or a store getter', () => {
  assert.deepEqual(stateKeyProblems(state), []);
  assert.ok(Object.keys(state).length > 30, 'the app state has its fields');
  // The check itself: a store getter passes, any other accessor or a frozen property does not.
  const t = { plain: 1 };
  moveToStore('moved', ['device', 'sliceVersion'], t);
  assert.deepEqual(stateKeyProblems(t), []);
  Object.defineProperty(t, 'rogue', { enumerable: true, configurable: true, get: () => 1 });
  Object.defineProperty(t, 'fixed', { enumerable: true, value: 2 });
  assert.deepEqual(stateKeyProblems(t), ['rogue: an accessor moveToStore() did not make', 'fixed: a data property that is not writable, enumerable and configurable']);
});

test('moveToStore: an enumerable, non-configurable getter over the store, seen by JSON and Object.keys', () => {
  const t = { before: 1 };
  moveToStore('version', ['device', 'sliceVersion'], t);
  t.after = 2;
  assert.equal(t.version, getState().device.sliceVersion);
  assert.deepEqual(Object.keys(t), ['before', 'version', 'after']);
  assert.equal(JSON.stringify(t), `{"before":1,"version":${getState().device.sliceVersion},"after":2}`);
  assert.deepEqual(storeFieldPath('version', t), ['device', 'sliceVersion']);
  assert.equal(storeFieldPath('before', t), null);
  assert.throws(() => { delete t.version; }, TypeError, 'a getter cannot be deleted');
  assert.throws(() => moveToStore('version', ['device', 'x'], t), /already in the store/);
  assert.throws(() => moveToStore('bad', [], t), /store path/);
});

test('moveToStore, strict (Node tests, browser tests): an assignment throws and changes nothing', () => {
  const t = {};
  moveToStore('probe', ['device', 'strictProbe'], t);
  let reported = 0;
  setStrayStoreWriteReporter(() => { reported++; });
  const before = getState();
  assert.throws(() => { t.probe = 5; }, /state\.probe is in the store \(device\.strictProbe\): dispatch an action/);
  assert.equal(getState(), before, 'no action');
  assert.equal(reported, 0, 'nothing logged: the test fails instead');
});

test('moveToStore, production: an assignment is logged (cloud diagnostics) and dispatches legacy/fieldAssigned', () => {
  const t = {};
  moveToStore('regModeProbe', ['device', 'regModeProbe'], t);
  const reports = [], actions = [];
  setStrayStoreWriteReporter(write => reports.push(write));
  const off = subscribe(() => actions.push(getState().device.regModeProbe));
  inProduction(() => { t.regModeProbe = 'team'; });
  off();
  assert.equal(t.regModeProbe, 'team', 'the value lands in the store');
  assert.equal(getState().device.regModeProbe, 'team');
  assert.deepEqual(actions, ['team'], 'one dispatch: subscribers are notified');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].field, 'regModeProbe');
  assert.equal(reports[0].path, 'device.regModeProbe');
  assert.match(reports[0].stack, /legacy\.test\.mjs/, 'the stack says where the write came from');
  // app/main.js sends what is reported to the cloud diagnostics.
  const main = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
  assert.match(main, /setStrayStoreWriteReporter\(write=>\{[^\n]*writeCloudDiagnosticsState\(\{storeStrayWrite:/);
});

test('replaceState with no store field: exactly delete + Object.assign (keys, order, identity)', () => {
  const nested = { a: [1] };
  const loaded = { z: 1, nested, a: undefined, m: 'x' };
  const viaHelper = { old: 1, z: 0, keep: 2 };
  const viaOld = { old: 1, z: 0, keep: 2 };
  replaceState(loaded, viaHelper);
  Object.keys(viaOld).forEach(k => delete viaOld[k]); Object.assign(viaOld, loaded);
  assert.deepEqual(Reflect.ownKeys(viaHelper), Reflect.ownKeys(viaOld));
  assert.deepEqual(Reflect.ownKeys(viaHelper), ['z', 'nested', 'a', 'm']);
  assert.equal(viaHelper.nested, nested, 'values are assigned, not copied');
  assert.ok(Object.hasOwn(viaHelper, 'a'));
});

test('assignState with no store field: exactly Object.assign', () => {
  const partial = { divisions: ['B'], divisionRenames: [{ from: 'A', to: 'B' }], gone: undefined };
  const viaHelper = { divisions: ['A'], other: 1 };
  const viaOld = { divisions: ['A'], other: 1 };
  assignState(partial, viaHelper);
  Object.assign(viaOld, partial);
  assert.deepEqual(Reflect.ownKeys(viaHelper), Reflect.ownKeys(viaOld));
  assert.equal(viaHelper.divisionRenames, partial.divisionRenames);
  assert.equal(JSON.stringify(viaHelper), JSON.stringify(viaOld));
});

test('replaceState / assignState with store fields: one action for the store keys, the rest assigned', () => {
  const t = { plain: 1 };
  moveToStore('a', ['tournament', 'helperA'], t);
  moveToStore('b', ['tournament', 'helperB'], t);
  const types = [];
  const off = subscribe(() => types.push(getState().tournament.helperA));
  replaceState({ a: 'A1', plain: 2, other: 3 }, t);
  assert.deepEqual(types, ['A1'], 'one dispatch');
  assert.equal(t.a, 'A1');
  assert.equal(t.b, undefined, 'a store key missing from the loaded copy is cleared');
  assert.deepEqual(Object.keys(t), ['a', 'b', 'plain', 'other'], 'the getters keep their place; plain keys follow in loaded order');
  assignState({ b: { n: 1 }, plain: 9 }, t);
  off();
  assert.equal(types.length, 2);
  assert.deepEqual(t.b, { n: 1 });
  assert.equal(t.plain, 9);
  assert.ok(Object.isFrozen(getState().tournament.helperB), 'strict: what the store holds is frozen');
  assert.throws(() => { t.b.n = 2; }, TypeError, 'strict: a nested write into store data throws');
});

test('replaceState keeps a device field: a payload never overwrites it, a missing one is not cleared', () => {
  const t = { plain: 1 };
  moveToStore('view', ['device', 'helperView'], t);
  moveToStore('data', ['tournament', 'helperData'], t);
  assignState({ view: 'court' }, t); // a local write still reaches the device slice
  assert.equal(getState().device.helperView, 'court');
  replaceState({ view: 'tv', data: 'D', plain: 2 }, t);
  assert.equal(t.view, 'court', 'the payload value of a device field is ignored');
  assert.equal(t.data, 'D');
  replaceState({ plain: 3 }, t);
  assert.equal(t.view, 'court', 'a device field absent from the payload is not cleared');
  assert.equal(t.data, undefined, 'a tournament field absent from the payload still is');
  assert.deepEqual(Object.keys(t), ['view', 'data', 'plain']);
});

test('production, a nested write into store data (Immer auto-freeze off): applied, seen by the next snapshot, no notification', () => {
  inProduction(() => {
    const s = productionStore();
    s.dispatch(legacyStateAssigned({ writes: [{ path: ['tournament', 'awards'], value: [{ place: 1, name: 'A' }] }, { path: ['device', 'view'], value: 'court' }] }));
    let notified = 0;
    s.subscribe(() => { notified++; });
    const names = createSelector([st => st.tournament.awards], awards => awards.map(a => a.name));
    const older = s.getState();
    assert.deepEqual(names(older), ['A']);
    assert.ok(!Object.isFrozen(older.tournament.awards[0]), 'production does not freeze');

    // The stray write: what `state.awards[0].name = 'B'` does once awards are a store getter.
    older.tournament.awards[0].name = 'B';
    assert.equal(notified, 0, 'no dispatch, so no subscriber hears of it');
    assert.equal(s.getState(), older, 'the store state is the same object');
    assert.match(JSON.stringify(s.getState()), /"name":"B"/, 'the next snapshot (JSON of state) carries it');
    assert.deepEqual(names(s.getState()), ['A'], 'a memoized selector keeps its old result: its input did not change');

    // The next dispatch: subscribers run (they run on every dispatch) and read the new value directly,
    s.dispatch(legacyStateAssigned({ writes: [{ path: ['device', 'view'], value: 'tv' }] }));
    assert.equal(notified, 1);
    assert.equal(s.getState().tournament.awards[0].name, 'B');
    // but structural sharing keeps the awards array, so the selector stays stale until the awards themselves change,
    assert.deepEqual(names(s.getState()), ['A']);
    // and the older state, which shares the object, changed too.
    assert.equal(older.tournament.awards[0].name, 'B');
    s.dispatch(legacyStateAssigned({ writes: [{ path: ['tournament', 'awards', '1'], value: { place: 2, name: 'C' } }] }));
    assert.deepEqual(names(s.getState()), ['B', 'C'], 'recomputed once the awards change through an action');
  });
  // The same write in strict mode (the tests) throws, so the tests find it; RTK's development immutability check (the
  // Node tests' default store) would also report it at the next dispatch.
  const s = createKsmStore();
  s.dispatch(legacyStateAssigned({ writes: [{ path: ['tournament', 'awards'], value: [{ place: 1, name: 'A' }] }] }));
  assert.throws(() => { s.getState().tournament.awards[0].name = 'B'; }, TypeError);
});

test('only moveToStore() dispatches legacy/fieldAssigned', () => {
  const files = ['app/main.js', 'app/modules', 'app/store', 'app/react', 'app/engine'].flatMap(p => {
    const full = path.join(ROOT, p);
    return fs.statSync(full).isDirectory()
      ? fs.readdirSync(full, { recursive: true }).filter(f => /\.(js|mjs|ts|tsx)$/.test(f)).map(f => path.join(p, f))
      : [p];
  });
  const problems = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/['"`]legacy\/fieldAssigned['"`]/.test(text) && file !== 'app/store/legacy.ts') problems.push(`${file}: names the legacy/fieldAssigned type`);
    for (const m of text.matchAll(/legacyFieldAssigned\s*\(/g)) {
      if (file === 'app/store/legacy.ts' && /createAction/.test(text.slice(Math.max(0, m.index - 80), m.index))) continue;
      if (file === 'app/modules/app-state.js') {
        const start = text.indexOf('export function moveToStore(');
        const end = text.indexOf('\nexport function', start + 1);
        if (start >= 0 && m.index > start && (end < 0 || m.index < end)) continue;
      }
      problems.push(`${file}: dispatches legacyFieldAssigned outside moveToStore()`);
    }
  }
  assert.deepEqual(problems, []);
  // and moveToStore() dispatches it only from the setter's production branch.
  const appState = fs.readFileSync(path.join(ROOT, 'app/modules/app-state.js'), 'utf8');
  assert.equal(appState.match(/legacyFieldAssigned\(/g)?.length, 1);
  assert.match(appState, /if\(storeIsStrict\(\)\)throw new TypeError[^\n]*\n[^\n]*reportStrayStoreWrite\([^\n]*\n\s*dispatch\(legacyFieldAssigned\(/);
});

test('the legacy actions are plain JSON with a path', () => {
  const action = legacyFieldAssigned({ key: 'regMode', path: ['device', 'regMode'], value: 'team' });
  assert.deepEqual(JSON.parse(JSON.stringify(action)), action);
});
