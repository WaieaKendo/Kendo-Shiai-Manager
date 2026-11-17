// #15 PR 13a (docs/STORE.md section 3 item 13): the court pointers (`courtState`, `courtActiveDivision`,
// `currentByDivision`) are the `tournament` slice's. `state` reads them through enumerable getters (the snapshot keeps every
// key, value, type and order); every write is a court/… action (app/modules/court/court-pointers-store.js, `meta.court`), a
// division's draw (its queue position) or the rename. A pointer is store data, so an in-place edit throws in tests and is
// applied in production. The browser half (Next Match through pools and brackets on both courts, a director, a spectator,
// a TV, Staff Login's catch-up, Undo/Redo, a tiebreak, Edit Pool, a regenerate, 4.0 loads, two save conflicts, the reset
// and a switch, against the code before this PR) is tests/court-pointers-store-test.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { courtActions, createKsmStore, getState, setStoreStrict, tournamentSlice } from '../../app/store/index.ts';
import { replaceState, setStrayStoreWriteReporter, state, storeFieldPath } from '../../app/modules/app-state.js';
import { extractFunction, html } from '../lib/ksm-source.mjs';

const A = tournamentSlice.actions;
const meta = { device: 'test' };
const t = s => s.getState().tournament;
const json = v => JSON.parse(JSON.stringify(v));
const read = file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const KEYS = ['currentByDivision', 'courtState', 'courtActiveDivision'];

test('the three fields are enumerable store getters at the literal\'s places, with the literal\'s values', () => {
  for (const key of KEYS) {
    assert.deepEqual(storeFieldPath(key), ['tournament', key]);
    const d = Object.getOwnPropertyDescriptor(state, key);
    assert.ok(d.enumerable && !d.configurable && d.get && d.set, key);
  }
  const snap = json(state);
  assert.deepEqual(KEYS.map(k => snap[k]), [{}, { A: { division: null, index: 0 }, B: { division: null, index: 0 } }, { A: null, B: null }]);
  // The literal's order (app-state.js): …, allMatches, currentByDivision, courtState, matches, …, publicCourt, courtActiveDivision, regMode, …
  const keys = Object.keys(state);
  assert.deepEqual(keys.slice(keys.indexOf('allMatches'), keys.indexOf('allMatches') + 4), ['allMatches', 'currentByDivision', 'courtState', 'matches']);
  assert.deepEqual(keys.slice(keys.indexOf('publicCourt'), keys.indexOf('publicCourt') + 3), ['publicCourt', 'courtActiveDivision', 'regMode']);
});

test('a unit test per court action: court/…, meta.court, the entries it names set, the rest kept', () => {
  const s = createKsmStore();
  for (const type of ['divisionSelected', 'pointerMoved', 'pointersResolved']) {
    const action = courtActions[type]({ courtState: {} }, { ...meta, court: 'b' });
    assert.equal(action.type, `court/${type}`);
    assert.equal(action.meta.court, 'B');
    assert.equal(action.meta.device, 'test');
  }
  assert.equal(courtActions.pointersResolved({}, meta).meta.court, null, 'a structural edit is no court\'s');
  const before = t(s);
  // divisionSelected: Court B's scorekeeper picks Kids; its queue position goes with it
  s.dispatch(courtActions.divisionSelected({ courtState: { B: { division: 'Kids', index: 2 } }, courtActiveDivision: { B: 'Kids' }, currentByDivision: { Kids: 2 } }, { court: 'B' }));
  assert.deepEqual(json(t(s).courtState), { A: { division: null, index: 0 }, B: { division: 'Kids', index: 2 } });
  assert.equal(t(s).courtState.A, before.courtState.A, 'the other court keeps its object');
  assert.deepEqual(t(s).courtActiveDivision, { A: null, B: 'Kids' });
  assert.deepEqual(t(s).currentByDivision, { Kids: 2 });
  // pointerMoved: Next Match on Court A; a pointer with more keys (a load's) is stored as it is
  s.dispatch(courtActions.pointerMoved({ courtState: { A: { division: 'Open', index: 3, extra: 1 } }, courtActiveDivision: { A: 'Open' }, currentByDivision: { Open: 3 } }, { court: 'A' }));
  assert.deepEqual(json(t(s).courtState.A), { division: 'Open', index: 3, extra: 1 });
  assert.deepEqual(Object.keys(t(s).currentByDivision), ['Kids', 'Open'], 'a new entry at the end, as an assignment');
  // pointersResolved: both courts; an existing entry keeps its place
  s.dispatch(courtActions.pointersResolved({ courtState: { B: { division: 'Open', index: 4 }, A: { division: 'Open', index: 3 } }, courtActiveDivision: { B: 'Open', A: 'Open' }, currentByDivision: { Kids: 0 } }, meta));
  assert.deepEqual(Object.keys(t(s).courtState), ['A', 'B']);
  assert.deepEqual(t(s).currentByDivision, { Kids: 0, Open: 3 });
  // A missing map (a 4.0 save without it) is created, as `state.courtState=state.courtState||{}` did.
  const bare = createKsmStore({ tournament: { ...before, courtState: undefined, courtActiveDivision: undefined } });
  bare.dispatch(courtActions.pointerMoved({ courtState: { B: { division: 'X', index: 0 } }, courtActiveDivision: { B: 'X' } }, { court: 'B' }));
  assert.deepEqual(json(t(bare).courtState), { B: { division: 'X', index: 0 } });
  assert.deepEqual(t(bare).courtActiveDivision, { B: 'X' });
  bare.dispatch(courtActions.pointersResolved({ courtState: {} }, meta));
  assert.deepEqual(json(t(bare).courtState), { B: { division: 'X', index: 0 } }, 'an empty entry list changes nothing');
});

test('a division drawn starts its queue position in its draw action; Generate Tournament\'s reset empties the map', () => {
  const s = createKsmStore();
  s.dispatch(A.divisionGenerated({ pools: { Open: [] }, currentByDivision: { Open: 0 } }, meta));
  s.dispatch(A.divisionGenerated({ pools: { Open: [], Kids: [] }, currentByDivision: { Open: 0, Kids: 0 } }, meta));
  assert.deepEqual(t(s).currentByDivision, { Open: 0, Kids: 0 });
  s.dispatch(A.drawReset({ currentByDivision: {}, pools: {} }, meta));
  assert.deepEqual(t(s).currentByDivision, {});
});

test('the rename is one tournament/divisionRenamed: the courts\' pointers move with the division lists', async () => {
  const KSMEngine = await import('../../app/engine/index.ts');
  const s = createKsmStore();
  s.dispatch(A.divisionAdded(KSMEngine.addedDivision(t(s), 'Kids', 'Round Robin', 'B'), meta));
  s.dispatch(courtActions.divisionSelected({ courtState: { B: { division: 'Kids', index: 0 } }, courtActiveDivision: { B: 'Kids' } }, { court: 'B' }));
  const before = t(s);
  const renamed = KSMEngine.renamedDivisionState(json(before), 'Kids', 'Under 12', { id: 'r1', from: 'Kids', to: 'Under 12' });
  const keys = ['divisions', 'divisionTypes', 'divisionCourts', 'hiddenPresets', 'divisionRenames', 'competitors', 'grandChampions', 'courtState', 'courtActiveDivision'];
  assert.match(read('app/modules/setup/divisions-store.js'), /KSM_RENAMED_STATE_KEYS=Object\.freeze\(\[\.\.\.KSM_DIVISION_STATE_KEYS,'competitors','grandChampions','courtState','courtActiveDivision'\]\);/);
  let heard = 0;
  const off = s.subscribe(() => { heard++; });
  s.dispatch(A.divisionRenamed(Object.fromEntries(keys.filter(k => Object.hasOwn(renamed, k)).map(k => [k, renamed[k]])), meta));
  off();
  assert.equal(heard, 1, 'one action, one notification: no subscriber sees a court on a division that is gone');
  assert.deepEqual(json(t(s).courtState.B), { division: 'Under 12', index: 0 });
  assert.equal(t(s).courtActiveDivision.B, 'Under 12');
  assert.ok(t(s).divisions.includes('Under 12'));
});

// The module's own helpers, in a vm with the store's reducer on a plain object standing in for `state` and the dispatch.
function helpers(initial) {
  const s = createKsmStore({ tournament: { ...getState().tournament, ...initial } }), dispatched = [];
  const st = {};
  for (const k of KEYS) Object.defineProperty(st, k, { enumerable: true, get: () => s.getState().tournament[k] });
  const ctx = vm.createContext({ state: st, courtActions, settingsMeta: () => ({ device: 'c/t' }), dispatch: a => { dispatched.push(a); return s.dispatch(a); } });
  vm.runInContext(`const KSM_POINTER_KEYS=Object.freeze(['currentByDivision','courtState','courtActiveDivision']);
${extractFunction(html, 'ksmMoveCourtPointers')}
${extractFunction(html, 'ksmCourtPointer')}
${extractFunction(html, 'ksmResolveCourts')}`, ctx);
  return { ctx, s, dispatched };
}

test('ksmMoveCourtPointers(): only the entries that change, one action, none when nothing does; a missing map is created', () => {
  const { ctx, s, dispatched } = helpers({ courtState: { A: { division: 'Open', index: 1 }, B: { division: null, index: 0 } }, courtActiveDivision: { A: 'Open', B: null }, currentByDivision: { Open: 1 } });
  ctx.ksmMoveCourtPointers('pointerMoved', ctx.ksmCourtPointer('A', { division: 'Open', index: 1 }, 1), 'A');
  assert.equal(dispatched.length, 0, 'a self-heal that lands where the court already is notifies no one');
  ctx.ksmMoveCourtPointers('pointerMoved', ctx.ksmCourtPointer('A', { division: 'Open', index: 2 }, 2), 'A');
  assert.equal(dispatched.length, 1);
  assert.deepEqual(json(dispatched[0].payload), { currentByDivision: { Open: 2 }, courtState: { A: { division: 'Open', index: 2 } } }, 'the unchanged division is left out');
  assert.deepEqual([dispatched[0].type, dispatched[0].meta.court, dispatched[0].meta.device], ['court/pointerMoved', 'A', 'c/t']);
  ctx.ksmMoveCourtPointers('divisionSelected', ctx.ksmCourtPointer('B', { division: null, index: 0 }, 0), 'B');
  assert.deepEqual(json(dispatched[1].payload), { currentByDivision: { null: 0 } }, 'a null division keys its position as "null", as `currentByDivision[null]=…` did');
  // ksmResolveCourts(): each court computed first, one court/pointersResolved, the queue reset with it
  ctx.ksmResolveCourts(['A', 'B'], c => ({ division: 'Kids', index: c === 'A' ? 0 : 1 }), { Kids: 0 });
  assert.equal(dispatched.at(-1).type, 'court/pointersResolved');
  assert.equal(dispatched.at(-1).meta.court, null);
  assert.deepEqual(json(s.getState().tournament.courtState), { A: { division: 'Kids', index: 0 }, B: { division: 'Kids', index: 1 } });
  assert.deepEqual(s.getState().tournament.courtActiveDivision, { A: 'Kids', B: 'Kids' });
  const n = dispatched.length;
  ctx.ksmResolveCourts([], () => { throw new Error('not called'); });
  assert.equal(dispatched.length, n, 'no court, no queue: nothing');
  ctx.ksmResolveCourts([], () => null, { Juniors: 0 });
  assert.deepEqual(json(dispatched.at(-1).payload), { currentByDivision: { Juniors: 0 } }, 'Edit Pool with no court on the division: the queue position alone');
  const bare = helpers({ courtState: undefined, courtActiveDivision: undefined });
  bare.ctx.ksmMoveCourtPointers('pointersResolved', { courtState: {}, courtActiveDivision: {} });
  assert.deepEqual([bare.s.getState().tournament.courtState, bare.s.getState().tournament.courtActiveDivision], [{}, {}], 'a missing map is created even with no entry (the tiebreak repair)');
});

test('strict mode: a map, a court\'s entry or its index written in place throws', () => {
  replaceState({ ...json(state), courtState: { A: { division: 'Open', index: 1 }, B: { division: null, index: 0 } }, currentByDivision: { Open: 1 } });
  try {
    for (const write of [() => { state.courtState = {}; }, () => { state.courtState.A = { division: null, index: 0 }; }, () => { state.courtState.A.index++; },
      () => { state.courtState.B.division = 'x'; }, () => { delete state.courtState.B; }, () => { state.courtActiveDivision = {}; },
      () => { state.courtActiveDivision.A = 'x'; }, () => { state.currentByDivision = {}; }, () => { state.currentByDivision.Open = 2; },
      () => { delete state.currentByDivision.Open; }, () => { Object.assign(state.courtState, { C: null }); }]) {
      assert.throws(write, TypeError, String(write));
    }
    assert.deepEqual(json(state.courtState.A), { division: 'Open', index: 1 });
  } finally { replaceState({ ...json(state), courtState: { A: { division: null, index: 0 }, B: { division: null, index: 0 } }, currentByDivision: {} }); }
});

test('production: a stray assignment is logged and applied', () => {
  const logged = [];
  setStrayStoreWriteReporter(w => logged.push(w));
  setStoreStrict(false);
  try {
    state.courtState = { A: { division: 'X', index: 0 } };
    assert.deepEqual(json(getState().tournament.courtState), { A: { division: 'X', index: 0 } });
    assert.deepEqual([logged.at(-1).field, logged.at(-1).path], ['courtState', 'tournament.courtState']);
    state.currentByDivision = { X: 4 };
    assert.deepEqual(getState().tournament.currentByDivision, { X: 4 });
  } finally {
    setStoreStrict(true);
    setStrayStoreWriteReporter(w => console.warn(w));
    replaceState({ ...json(state), courtState: { A: { division: null, index: 0 }, B: { division: null, index: 0 } }, currentByDivision: {} });
  }
});

test('replaceState() puts the pointers in the store in the payload\'s order; a 4.0 save without courtActiveDivision leaves it undefined', () => {
  const saved = json(state);
  const loaded = { ...saved, courtState: { B: { division: 'Kids', index: 2 }, A: { division: 'Open', index: 0 } }, courtActiveDivision: { B: 'Kids', A: 'Open' }, currentByDivision: { Kids: 2, Open: 0 } };
  replaceState(loaded);
  assert.deepEqual(json(state).courtState, loaded.courtState);
  assert.deepEqual(Object.keys(state.courtState), ['B', 'A']);
  const { courtActiveDivision, ...old } = loaded;
  replaceState(old);
  assert.ok(!('courtActiveDivision' in json(state)), 'not in the snapshot, as when the payload lacked it');
  replaceState(saved);
  assert.deepEqual(json(state), saved);
});

test('source: every write to the pointers is an action (no assignment, delete or in-place edit of the live state in app code)', () => {
  const files = ['app/main.js', ...fs.readdirSync(new URL('../../app/modules', import.meta.url), { recursive: true })
    .filter(f => f.endsWith('.js')).map(f => `app/modules/${f}`)];
  const F = '(courtState|courtActiveDivision|currentByDivision)';
  const write = new RegExp(`(?<![\\w.])state\\.${F}\\b(\\??\\.?\\[[^\\]]*\\](\\.\\w+|\\[[^\\]]*\\])?)?\\s*(=(?!=)|\\+\\+|\\+=)|delete\\s+state\\.${F}\\b|Object\\.assign\\(state\\.${F}`);
  const bad = [];
  for (const file of files.filter(f => f !== 'app/modules/app-state.js')) {
    read(file).split('\n').forEach((line, i) => { if (write.test(line)) bad.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`); });
  }
  assert.deepEqual(bad, []);
  // The old in-place writes, by name.
  assert.doesNotMatch(read('app/modules/court/court-match-order.js'), /state\.courtState=state\.courtState\|\||state\.currentByDivision\[[^\]]+\]=/);
  assert.match(extractFunction(html, 'reindexPointersAfterMatchReorder'), /if\(live\)moved\.courtState\[court\]=\{\.\.\.cs,index\};else cs\.index=index;/, 'the live state gets a new pointer; a payload copy is written in place');
  // Only court-pointers-store.js dispatches the court actions.
  for (const file of files.filter(f => f !== 'app/modules/court/court-pointers-store.js')) assert.doesNotMatch(read(file), /courtActions\b/, file);
});
