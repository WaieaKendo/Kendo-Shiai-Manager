// #15 PR 13b (docs/STORE.md section 3 item 13): the court history (`courtActionHistory`, `courtRedoHistory`,
// `courtUndoLog`) is the `tournament` slice's. `state` reads it through enumerable getters (the snapshot keeps every key,
// value, type and order); every write is a court/… action (app/modules/court/court-history-store.js, `meta.court`) or a
// load. An entry is store data, so an in-place edit throws in tests and is applied in production. An Undo/Redo is one
// court/undo or court/redo carrying the store-owned keys its patches change. The browser half (points, hansoku, Next
// Match, Undo/Redo on both courts, a bracket, a tiebreak, the limits, a remote apply, a 4.0 save, four save conflicts,
// the grand champion, the reset and a switch, against the code before this PR) is tests/court-history-store-test.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { applyStoreWrites, courtActions, courtHistoryActions, createKsmStore, getState, legacyStateAssigned, legacyStateReplaced, setStoreStrict } from '../../app/store/index.ts';
import { replaceState, setStrayStoreWriteReporter, state, storeFieldPath, storeWrites } from '../../app/modules/app-state.js';
import { extractFunction, html } from '../lib/ksm-source.mjs';

const t = s => s.getState().tournament;
const json = v => JSON.parse(JSON.stringify(v));
const read = file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const KEYS = ['courtActionHistory', 'courtRedoHistory', 'courtUndoLog'];
const entry = (label, extra = {}) => ({ format: 'patch-v1', label, court: 'A', when: '2026-11-17T10:00:00.000Z', clientId: 'c', tabId: 't', revision: 1, patches: [{ path: ['allMatches', 'Open', 0, 'wp'], before: [], after: ['M'] }], ...extra });

test('the three fields are enumerable store getters at the literal\'s places; the Undo log\'s comes last, absent from the snapshot', () => {
  for (const key of KEYS) {
    assert.deepEqual(storeFieldPath(key), ['tournament', key]);
    const d = Object.getOwnPropertyDescriptor(state, key);
    assert.ok(d.enumerable && !d.configurable && d.get && d.set, key);
  }
  const snap = json(state);
  assert.deepEqual([snap.courtActionHistory, snap.courtRedoHistory], [{ A: [], B: [] }, { A: [], B: [] }]);
  assert.ok(!('courtUndoLog' in snap), 'no Undo log until the first Undo/Redo, as before');
  const keys = Object.keys(state);
  assert.deepEqual(keys.slice(keys.indexOf('managementRevision'), keys.indexOf('managementRevision') + 3), ['managementRevision', 'courtActionHistory', 'courtRedoHistory']);
  assert.equal(keys.at(-1), 'courtUndoLog');
});

test('a unit test per history action: court/…, meta.court, its writes applied in one dispatch, the rest kept', () => {
  const s = createKsmStore();
  for (const type of ['actionRecorded', 'undo', 'redo', 'historyNormalized', 'historyForgotten']) {
    const action = courtHistoryActions[type]({ writes: [] }, { device: 'test', court: 'b' });
    assert.equal(action.type, `court/${type}`);
    assert.equal(action.meta.court, 'B');
    assert.equal(action.meta.device, 'test');
  }
  const before = t(s), a1 = entry('White M'), a2 = entry('Red K');
  const w = (key, value) => ({ path: ['tournament', ...key.split('.')], value });
  // actionRecorded: the entry pushed, the court's Redo list cleared, the other court's lists kept (same objects)
  s.dispatch(courtHistoryActions.actionRecorded({ writes: [w('courtActionHistory.A', [a1]), w('courtRedoHistory.A', [])] }, { court: 'A' }));
  s.dispatch(courtHistoryActions.actionRecorded({ writes: [w('courtActionHistory.A', [a1, a2]), w('courtRedoHistory.A', [])] }, { court: 'A' }));
  assert.deepEqual(json(t(s).courtActionHistory), { A: [a1, a2], B: [] });
  assert.equal(t(s).courtActionHistory.B, before.courtActionHistory.B, 'the other court keeps its list');
  assert.equal(t(s).settings, before.settings, 'the rest of the store keeps its objects');
  assert.ok(Object.isFrozen(t(s).courtActionHistory) && Object.isFrozen(t(s).courtActionHistory.A[1].patches[0]), 'strict: the new values frozen, as Immer froze them');
  // undo: the entry moved, the log created as {A: [], B: []} with this court's entry, the store-owned keys written in the same dispatch
  const log = { format: 'history-op-v1', kind: 'UNDO', court: 'A', target: 'x', label: 'Red K', patches: [] };
  let heard = 0;
  const off = s.subscribe(() => { heard++; });
  s.dispatch(courtHistoryActions.undo({ writes: [w('courtActionHistory.A', [a1]), w('courtRedoHistory.A', [a2]), w('courtUndoLog', { A: [], B: [] }), w('courtUndoLog.A', [log]),
    w('singleElimNodes', { Open: [{ id: 'QF1', winner: null }] }), w('courtState', { A: { division: 'Open', index: 0 }, B: { division: null, index: 0 } })] }, { court: 'A' }));
  off();
  assert.equal(heard, 1, 'one notification: the history, the nodes and the pointer together');
  assert.deepEqual(json(t(s).courtRedoHistory.A), [a2]);
  assert.deepEqual(json(t(s).courtUndoLog), { A: [log], B: [] });
  assert.deepEqual(json(t(s).singleElimNodes), { Open: [{ id: 'QF1', winner: null }] });
  assert.deepEqual(json(t(s).courtState.A), { division: 'Open', index: 0 });
  // redo: back; a device path in the writes (an old entry's regMode patch) lands there too, as assignState() put it
  s.dispatch(courtHistoryActions.redo({ writes: [w('courtRedoHistory.A', []), w('courtActionHistory.A', [a1, a2]), w('courtUndoLog.A', [log, { ...log, kind: 'REDO' }]),
    { path: ['device', 'regMode'], value: 'teams' }] }, { court: 'A' }));
  assert.deepEqual(json(t(s).courtActionHistory.A), [a1, a2]);
  assert.equal(t(s).courtUndoLog.A.length, 2);
  assert.equal(s.getState().device.regMode, 'teams');
  // historyNormalized / historyForgotten: whole maps
  s.dispatch(courtHistoryActions.historyForgotten({ writes: [w('courtActionHistory', { A: [a1], B: [] })] }, {}));
  assert.deepEqual(json(t(s).courtActionHistory), { A: [a1], B: [] });
  const bare = createKsmStore({ tournament: { ...before, courtActionHistory: undefined, courtRedoHistory: undefined } });
  bare.dispatch(courtHistoryActions.historyNormalized({ writes: [w('courtActionHistory', { A: [], B: [] }), w('courtRedoHistory', { A: [], B: [] })] }, {}));
  assert.deepEqual([t(bare).courtActionHistory, t(bare).courtRedoHistory], [{ A: [], B: [] }, { A: [], B: [] }], 'a missing map is created');
});

test('applyStoreWrites(): a path copy as Immer\'s update was (same values, key order, structural sharing, no change for the same value)', () => {
  const root = { a: { x: [1, 2], y: { z: 1 } }, b: { k: 1 } };
  const same = applyStoreWrites(root, [{ path: ['a', 'y'], value: root.a.y }]);
  assert.equal(same, root, 'the value already there: the same root');
  const next = applyStoreWrites(root, [{ path: ['a', 'x', '1'], value: 3 }, { path: ['a', 'w', 'v'], value: 4 }, { path: ['a', 'y'], value: undefined }, { path: ['c'], value: 5 }]);
  assert.deepEqual(next, { a: { x: [1, 3], y: undefined, w: { v: 4 } }, b: { k: 1 }, c: 5 });
  assert.ok(Array.isArray(next.a.x), 'an array stays an array');
  assert.equal(next.b, root.b, 'untouched branches shared');
  assert.deepEqual(root, { a: { x: [1, 2], y: { z: 1 } }, b: { k: 1 } }, 'the old state unchanged');
  assert.deepEqual(Object.keys(next.a), ['x', 'y', 'w'], 'a written key keeps its place, a new one comes last');
  assert.throws(() => applyStoreWrites(root, [{ path: [], value: 1 }]), /needs a path/);
});

test('only the store-write actions carry payload.writes (the root reducer applies any action\'s writes)', () => {
  const store = read('app/store/store.ts');
  assert.match(store, /const writes = \(action as \{ payload\?: \{ writes\?: StoreWrite\[\] \} \}\)\.payload\?\.writes;/);
  for (const action of [legacyStateReplaced({ writes: [] }), legacyStateAssigned({ writes: [] }), ...Object.values(courtHistoryActions).map(a => a({ writes: [] }))]) assert.ok(Array.isArray(action.payload.writes));
  // Every other action creator's payload type has no `writes`: the sources name it only for these.
  const sources = ['app/store/slices/tournament.ts', 'app/store/slices/device.ts', 'app/store/legacy.ts'].map(read).join('\n');
  assert.equal(sources.match(/writes: StoreWrite\[\]/g).length, 3, 'legacyStateReplaced, legacyStateAssigned and HistoryWrites (the court history actions)');
  assert.equal(courtActions.pointerMoved({ courtState: {} }).payload.writes, undefined);
});

// The module's own helpers, in a vm whose `state` reads the test store, with the store's dispatch.
function helpers(initial) {
  const s = createKsmStore({ tournament: { ...getState().tournament, ...initial } }), dispatched = [];
  const st = {};
  for (const k of KEYS) Object.defineProperty(st, k, { enumerable: true, get: () => s.getState().tournament[k] });
  const ctx = vm.createContext({ state: st, courtHistoryActions, settingsMeta: () => ({ device: 'c/t' }), storeWrites: values => storeWrites(values, state),
    dispatch: a => { dispatched.push(a); return s.dispatch(a); } });
  vm.runInContext(['KSM_HISTORY_LIMIT', 'KSM_UNDO_LOG_LIMIT'].map(n => html.match(new RegExp(`const ${n}=[^\\n]*`))[0]).join('\n') + '\n'
    + ['meta', 'listOf', 'courtList', 'pushed'].map(n => html.match(new RegExp(`const ${n}=[^\\n]*`))[0]).join('\n') + '\n'
    + ['ksmRecordCourtAction', 'ksmMoveCourtHistory', 'ksmSetCourtHistories'].map(n => extractFunction(html, n)).join('\n'), ctx);
  return { ctx, s, dispatched };
}

test('the helpers: a court action pushed and trimmed to 100 with Redo cleared; an Undo / Redo moved with its log (trimmed to 40) and its keys', () => {
  const many = Array.from({ length: 100 }, (_, i) => entry(`P ${i}`));
  const { ctx, s, dispatched } = helpers({ courtActionHistory: { A: many, B: [] }, courtRedoHistory: { A: [entry('R')], B: [] }, courtUndoLog: undefined });
  ctx.ksmRecordCourtAction('A', entry('new'));
  assert.equal(dispatched.length, 1);
  assert.deepEqual([dispatched[0].type, dispatched[0].meta.court, dispatched[0].meta.device], ['court/actionRecorded', 'A', 'c/t']);
  assert.equal(t(s).courtActionHistory.A.length, 100);
  assert.deepEqual([t(s).courtActionHistory.A[0].label, t(s).courtActionHistory.A.at(-1).label], ['P 1', 'new'], 'the oldest dropped');
  assert.deepEqual(json(t(s).courtRedoHistory), { A: [], B: [] });
  const top = t(s).courtActionHistory.A.at(-1);
  ctx.ksmMoveCourtHistory('undo', 'A', { kind: 'UNDO' }, { singleElimNodes: { Open: [] } });
  assert.equal(t(s).courtRedoHistory.A[0], top, 'the same entry object moved');
  assert.equal(t(s).courtActionHistory.A.length, 99);
  assert.deepEqual(json(t(s).courtUndoLog), { A: [{ kind: 'UNDO' }], B: [] }, 'the log map created as {A: [], B: []}');
  assert.deepEqual(json(t(s).singleElimNodes), { Open: [] });
  assert.deepEqual(dispatched.at(-1).payload.writes.at(-1), { path: ['tournament', 'singleElimNodes'], value: { Open: [] } }, 'the store keys last, after the history');
  for (let i = 0; i < 45; i++) ctx.ksmMoveCourtHistory(i % 2 ? 'undo' : 'redo', 'A', { kind: i }, {});
  assert.equal(t(s).courtUndoLog.A.length, 40);
  assert.equal(t(s).courtUndoLog.A.at(-1).kind, 44);
  // A map missing a court list: created at the end, as `log[court]=[]` did.
  const b = helpers({ courtUndoLog: { A: [] }, courtActionHistory: { A: [], B: [entry('b')] }, courtRedoHistory: { A: [], B: [] } });
  b.ctx.ksmMoveCourtHistory('undo', 'B', { kind: 'UNDO' }, {});
  assert.deepEqual(Object.keys(t(b.s).courtUndoLog), ['A', 'B']);
  const n = b.dispatched.length;
  b.ctx.ksmSetCourtHistories('historyNormalized', {});
  assert.equal(b.dispatched.length, n, 'no map named: nothing dispatched');
});

test('ensureCourtHistory(): one court/historyNormalized when a map is missing or holds an old entry, none otherwise (the render runs it)', () => {
  const fn = extractFunction(html, 'ensureCourtHistory'), calls = [];
  const run = st => { calls.length = 0; vm.runInContext(fn + '\nensureCourtHistory();', vm.createContext({ state: st, ksmSetCourtHistories: (type, lists) => { if (Object.keys(lists).length) calls.push([type, json(lists)]); } })); return calls; };
  assert.deepEqual(run({ courtActionHistory: { A: [entry('a')], B: [] }, courtRedoHistory: { A: [], B: [] } }), []);
  assert.deepEqual(run({ courtActionHistory: { A: [{ format: 'snapshot' }, entry('a')], B: [] }, courtRedoHistory: { A: [], B: [] } }),
    [['historyNormalized', { courtActionHistory: { A: [entry('a')], B: [] } }]]);
  assert.deepEqual(run({}), [['historyNormalized', { courtActionHistory: { A: [], B: [] }, courtRedoHistory: { A: [], B: [] } }]]);
  assert.deepEqual(run({ courtActionHistory: { B: [] }, courtRedoHistory: { A: 'x', B: [] } }),
    [['historyNormalized', { courtActionHistory: { B: [], A: [] }, courtRedoHistory: { A: [], B: [] } }]], 'a missing court is added at the end; a non-list replaced in place');
});

test('strict mode: a map, a court\'s list, a list method or an entry written in place throws', () => {
  const saved = json(state);
  replaceState({ ...saved, courtActionHistory: { A: [entry('a')], B: [] }, courtUndoLog: { A: [{ kind: 'UNDO' }], B: [] } });
  try {
    for (const write of [() => { state.courtActionHistory = {}; }, () => { state.courtActionHistory.A = []; }, () => { state.courtActionHistory.A.push(entry('b')); },
      () => { state.courtActionHistory.A.pop(); }, () => { state.courtActionHistory.A.splice(0, 1); }, () => { state.courtActionHistory.A[0].label = 'x'; },
      () => { state.courtActionHistory.A[0].patches.push({}); }, () => { delete state.courtActionHistory.B; }, () => { state.courtRedoHistory.A.push(entry('c')); },
      () => { state.courtRedoHistory = { A: [], B: [] }; }, () => { state.courtUndoLog.A.shift(); }, () => { state.courtUndoLog = undefined; }]) {
      assert.throws(write, TypeError, String(write));
    }
    assert.equal(state.courtActionHistory.A.length, 1);
  } finally { replaceState(saved); }
});

test('production: a stray assignment is logged and applied', () => {
  const logged = [], saved = json(state);
  setStrayStoreWriteReporter(w => logged.push(w));
  setStoreStrict(false);
  try {
    state.courtRedoHistory = { A: [entry('x')], B: [] };
    assert.deepEqual(json(getState().tournament.courtRedoHistory), { A: [entry('x')], B: [] });
    assert.deepEqual([logged.at(-1).field, logged.at(-1).path], ['courtRedoHistory', 'tournament.courtRedoHistory']);
  } finally {
    setStoreStrict(true);
    setStrayStoreWriteReporter(w => console.warn(w));
    replaceState(saved);
  }
});

test('replaceState() puts the history in the store as the payload has it; a save without the Undo log leaves it out of the snapshot', () => {
  const saved = json(state);
  const loaded = { ...saved, courtActionHistory: { B: [entry('b')], A: [] }, courtUndoLog: { A: [{ kind: 'REDO' }], B: [] } };
  replaceState(loaded);
  assert.deepEqual(json(state).courtActionHistory, loaded.courtActionHistory);
  assert.deepEqual(Object.keys(state.courtActionHistory), ['B', 'A']);
  assert.deepEqual(json(state).courtUndoLog, loaded.courtUndoLog);
  replaceState(saved);
  assert.ok(!('courtUndoLog' in json(state)));
  assert.deepEqual(json(state), saved);
});

test('source: every write to the history is an action (no assignment, delete, list method or in-place edit of the live state in app code)', () => {
  const files = ['app/main.js', ...fs.readdirSync(new URL('../../app/modules', import.meta.url), { recursive: true })
    .filter(f => f.endsWith('.js')).map(f => `app/modules/${f}`)];
  const F = '(courtActionHistory|courtRedoHistory|courtUndoLog)';
  const write = new RegExp(`(?<![\\w.])state(\\[key\\]|\\.${F})(\\??\\.?\\[[^\\]]*\\])*\\s*(=(?!=)|\\.(push|pop|shift|unshift|splice|sort|reverse)\\()|delete\\s+state\\.${F}|Object\\.assign\\(state\\.${F}`);
  const bad = [];
  for (const file of files.filter(f => f !== 'app/modules/app-state.js')) {
    read(file).split('\n').forEach((line, i) => { if (!/^\s*(\*|\/\/)/.test(line) && write.test(line)) bad.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`); });
  }
  assert.deepEqual(bad, []);
  // The old in-place writes, by name.
  const history = read('app/modules/court/court-scoring-and-history.js');
  assert.doesNotMatch(history, /stack\.(pop|push)\(|state\.courtUndoLog=|log\.push\(/);
  // Only court-history-store.js dispatches the history actions.
  for (const file of files.filter(f => f !== 'app/modules/court/court-history-store.js')) assert.doesNotMatch(read(file), /courtHistoryActions\b/, file);
});

test('Undo/Redo: the plain keys first, then one dispatch with every store-owned key; the view rebuilt after it', () => {
  const move = extractFunction(html, 'moveCourtHistory');
  assert.match(move, /values=applyHistoryValues\(action,[^)]*\);\s*ksmMoveCourtHistory\(kind,court,courtUndoLogEntry\([^;]*\),values\|\|\{\}\);\s*if\(values\)rebuildCourtViewAfterHistory\(\);/);
  const patch = extractFunction(html, 'applyHistoryPatch');
  assert.match(patch, /if\(!storeFieldPath\(key,state\)\)\{writeHistoryValue\(state,path,value,missing\);return\}/, 'a plain key is written in place');
  assert.match(patch, /if\(!ksmHistoryStoreValues\)assignState\(values,state\);/, 'a store key goes to the entry\'s dispatch (or assignState() on its own)');
});
