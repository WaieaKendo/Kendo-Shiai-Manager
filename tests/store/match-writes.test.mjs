// #15 PR 13c-1 and 13c-2 (docs/STORE.md section 3 item 13): every write to `allMatches` goes through one module,
// app/modules/court/match-writes.js. Since 13c-2 `allMatches` is the `tournament` slice's: on the live `state` each helper
// call is one action (matchActions) carrying the new map as a path copy; a payload copy is written in place, as before.
// Here: the helpers' rules on a plain object, the live state (one dispatch per call, nothing when nothing changes, only
// the written path copied, the old objects as they were, frozen in tests, applied in production), a unit test per
// action, the Undo/Redo batch planned without a dispatch, and the source check (no other app code assigns, deletes or
// mutates `allMatches`, a division's list or a match in it). The browser half (the store's frozen data while tournaments
// are played, loaded, rebased, undone and redone) is tests/match-identity-copy-test.py and tests/match-writes-store-test.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ksmLoadTournamentState, setStrayStoreWriteReporter, state, storeFieldPath } from '../../app/modules/app-state.js';
import { createKsmStore, dispatch, getState, matchActions, setStoreStrict, store } from '../../app/store/index.ts';
import * as KSMEngine from '../../app/engine/index.ts';

const read = file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const json = v => JSON.parse(JSON.stringify(v));
const bout = (id, extra = {}) => ({ id, white: `W${id}`, red: `R${id}`, done: false, ...extra });
// The module itself, run in this realm with the app's `state` and store (importing it would load the whole sync layer for
// settingsMeta()): its imports become these arguments.
const NAMES = ['ksmSetAllMatches', 'ksmSetDivisionMatches', 'ksmDeleteDivisionMatches', 'ksmUpdateMatches', 'ksmUpdateMatch', 'ksmInsertMatches', 'ksmAppendMatches',
  'ksmRemoveMatches', 'ksmSortDivisionMatches', 'ksmWriteMatchPath', 'ksmWriteMatchPaths', 'ksmPlanMatchPaths'];
const MW = new Function('state', 'dispatch', 'matchActions', 'settingsMeta', 'KSMEngine',
  `${read('app/modules/court/match-writes.js').replace(/^import .*$/gm, '').replace(/^export /gm, '')}\nreturn {${NAMES.join(',')}};`,
)(state, a => dispatch(a), matchActions, () => ({ device: 'c-1/t-1' }), KSMEngine);
test('each helper writes a plain root in place, as the code it replaced did', () => {
  const root = { allMatches: { D: [bout(1), bout(2), bout(3)] } };
  const list = root.allMatches.D, first = list[0];
  // one bout: the keys in their order, then the removed keys; the bout as it is after, read again
  const after = MW.ksmUpdateMatch('D', 0, { wp: ['M'], rp: [], wt: 0, rt: 1, completedResult: { winner: 'W1' }, done: true }, [], root);
  assert.equal(after, first, 'in place (13c-1)');
  assert.deepEqual(Object.keys(first), ['id', 'white', 'red', 'done', 'wp', 'rp', 'wt', 'rt', 'completedResult'], 'Object.assign order: an existing key keeps its place');
  MW.ksmUpdateMatch('D', 0, { done: false }, ['completedResult'], root);
  assert.ok(!('completedResult' in first));
  assert.throws(() => MW.ksmUpdateMatch('D', 9, { done: true }, [], root), TypeError, 'no bout at the index throws, as Object.assign did (#206 L4)');
  assert.throws(() => MW.ksmUpdateMatches('Nope', [{ index: 0, set: { done: true } }], root), TypeError);
  // several bouts in one write
  MW.ksmUpdateMatches('D', [{ index: 1, set: { court: 'B' } }, { index: 2, set: { court: 'A' } }], root);
  assert.deepEqual(list.map(m => m.court), [undefined, 'B', 'A']);
  // insert, append, remove: the same list, the same order
  MW.ksmInsertMatches('D', 1, [bout(4), bout(5)], root);
  MW.ksmAppendMatches('D', [bout(6)], root);
  MW.ksmRemoveMatches('D', 0, 1, root);
  assert.equal(root.allMatches.D, list);
  assert.deepEqual(list.map(m => m.id), [4, 5, 2, 3, 6]);
  MW.ksmInsertMatches('E', 0, [bout(7)], root); MW.ksmAppendMatches('F', [bout(8)], root);
  assert.deepEqual(json(root.allMatches.E), [bout(7)], 'a division without a list gets one');
  // a stable sort in place
  const sorted = MW.ksmSortDivisionMatches('D', (a, b) => (a.id % 2) - (b.id % 2), root);
  assert.equal(sorted, list);
  assert.deepEqual(list.map(m => m.id), [4, 2, 6, 5, 3]);
  assert.deepEqual(MW.ksmSortDivisionMatches('Z', () => 0, root), [], 'no list: none made');
  assert.ok(!('Z' in root.allMatches));
  // a division's list and the whole map
  const next = [bout(9)];
  MW.ksmSetDivisionMatches('D', next, root);
  assert.equal(root.allMatches.D, next, 'the list given is stored as it is');
  MW.ksmSetDivisionMatches('D', undefined, root);
  assert.ok(Object.hasOwn(root.allMatches, 'D') && root.allMatches.D === undefined, 'undefined is stored, as the old assignment stored it (#206 L3)');
  MW.ksmDeleteDivisionMatches('D', root);
  assert.ok(!('D' in root.allMatches), 'a delete removes the key');
  MW.ksmSetAllMatches({}, root); assert.deepEqual(root.allMatches, {});
  MW.ksmSetAllMatches(undefined, root); assert.ok(Object.hasOwn(root, 'allMatches') && root.allMatches === undefined);
  MW.ksmSetDivisionMatches('G', [], root); assert.deepEqual(root.allMatches, { G: [] }, 'a missing map is created');
});

/** The match actions dispatched while `fn` runs, and the map's identity after each. */
function dispatched(fn) {
  const seen = [], was = store.dispatch;
  store.dispatch = action => { seen.push(action); return was(action); };
  try { fn(); } finally { store.dispatch = was; }
  return seen;
}
const reset = () => ksmLoadTournamentState({ ...json(state), allMatches: {} });

test('the field: an enumerable store getter at the literal\'s place; the slice starts with {}', () => {
  assert.deepEqual(storeFieldPath('allMatches'), ['tournament', 'allMatches']);
  const d = Object.getOwnPropertyDescriptor(state, 'allMatches');
  assert.ok(d.enumerable && !d.configurable && d.get && d.set);
  const keys = Object.keys(state);
  assert.deepEqual(keys.slice(keys.indexOf('teamPools'), keys.indexOf('teamPools') + 3), ['teamPools', 'allMatches', 'currentByDivision'], 'the literal\'s order: the snapshot keeps it');
  assert.deepEqual(createKsmStore().getState().tournament.allMatches, {});
});

test('a unit test per match action: its type, meta, and the writes applied in one dispatch, the rest of the slice kept', () => {
  const s = createKsmStore(), before = s.getState().tournament;
  const types = Object.fromEntries(Object.entries(matchActions).map(([k, a]) => [k, a.type]));
  assert.deepEqual(types, {
    matchUpdated: 'court/matchUpdated', allMatchesSet: 'tournament/allMatchesSet', divisionMatchesSet: 'tournament/divisionMatchesSet',
    matchesUpdated: 'tournament/matchesUpdated', matchesAdded: 'tournament/matchesAdded', matchesRemoved: 'tournament/matchesRemoved',
    matchesSorted: 'tournament/matchesSorted', matchesPatched: 'tournament/matchesPatched',
  });
  let n = 0;
  for (const [key, create] of Object.entries(matchActions)) {
    const map = { D: [bout(++n)] };
    const action = create({ writes: [{ path: ['tournament', 'allMatches'], value: map }] }, { device: 'c/t', court: key === 'matchUpdated' ? 'b' : null });
    assert.deepEqual([action.meta.court, action.meta.device], [key === 'matchUpdated' ? 'B' : null, 'c/t'], key);
    let notified = 0; const off = s.subscribe(() => notified++);
    s.dispatch(action); off();
    assert.equal(notified, 1, key);
    assert.equal(s.getState().tournament.allMatches, map, `${key}: the map given is the store's`);
    assert.ok(Object.isFrozen(map.D[0]), `${key}: frozen in the tests`);
    for (const k of ['settings', 'courtState', 'courtActionHistory', 'pools']) assert.equal(s.getState().tournament[k], before[k], `${key}: ${k} kept`);
  }
});

test('the live state: one action per call, only the written path copied, the old objects as they were', () => {
  reset();
  let seen = dispatched(() => MW.ksmSetAllMatches({ D: [bout(1), bout(2), bout(3)], E: [bout(9)] }));
  assert.deepEqual(seen.map(a => a.type), ['tournament/allMatchesSet']);
  assert.deepEqual(seen[0].payload.writes.map(w => w.path), [['tournament', 'allMatches']]);
  const map = state.allMatches, list = map.D, e = map.E, [b1, b2] = list;
  assert.equal(map, getState().tournament.allMatches);
  assert.ok(Object.isFrozen(map) && Object.isFrozen(list) && Object.isFrozen(b1), 'store data: frozen in the tests');
  // one bout: a court action with meta.court; only the map, the list and the bout are new
  seen = dispatched(() => MW.ksmUpdateMatch('D', 0, { wp: ['M'], done: true }));
  assert.deepEqual(seen.map(a => [a.type, a.meta.court, a.meta.device]), [['court/matchUpdated', 'A', 'c-1/t-1']]);
  const after = state.allMatches.D[0];
  assert.ok(state.allMatches !== map && state.allMatches.D !== list && after !== b1);
  assert.equal(state.allMatches.E, e, 'another division: the same list');
  assert.equal(state.allMatches.D[1], b2, 'another bout: the same object');
  assert.deepEqual([b1.done, b1.wp, after.done, after.wp], [false, undefined, true, ['M']], 'the bout read before keeps its values');
  assert.deepEqual(Object.keys(after), ['id', 'white', 'red', 'done', 'wp'], 'Object.assign order');
  // every helper: one action each, its type
  seen = dispatched(() => {
    MW.ksmUpdateMatches('D', [{ index: 1, set: { court: 'B' } }, { index: 2, set: { court: 'A' } }]);
    MW.ksmInsertMatches('D', 1, [bout(4)]); MW.ksmAppendMatches('F', [bout(5)]); MW.ksmRemoveMatches('D', 0, 1);
    MW.ksmSortDivisionMatches('D', (a, b) => a.id - b.id); MW.ksmSetDivisionMatches('G', []); MW.ksmDeleteDivisionMatches('G');
    MW.ksmWriteMatchPath(['allMatches', 'D', 0, 'rp'], ['K'], false, 'history');
    MW.ksmWriteMatchPaths([{ path: ['allMatches', 'D', 0, 'done'], value: true, how: 'history' }, { path: ['allMatches', 'D', 1, 'done'], value: true, how: 'history' }]);
  });
  assert.deepEqual(seen.map(a => a.type), ['tournament/matchesUpdated', 'tournament/matchesAdded', 'tournament/matchesAdded', 'tournament/matchesRemoved',
    'tournament/matchesSorted', 'tournament/divisionMatchesSet', 'tournament/divisionMatchesSet', 'tournament/matchesPatched', 'tournament/matchesPatched'], 'a batch is one action');
  assert.deepEqual(json(state.allMatches), { D: [{ ...bout(2), court: 'B', rp: ['K'], done: true }, { ...bout(3), court: 'A', done: true }, bout(4)], E: [bout(9)], F: [bout(5)] });
  assert.ok(!('G' in state.allMatches), 'a delete removes the key');
  // a throw writes nothing (#206 L4: an index without a bout throws, as Object.assign did)
  const now = state.allMatches;
  seen = dispatched(() => {
    assert.throws(() => MW.ksmUpdateMatches('D', [{ index: 0, set: { court: 'X' } }, { index: 9, set: { done: true } }]), TypeError);
    assert.throws(() => MW.ksmUpdateMatch('Nope', 0, { done: true }), TypeError);
  });
  assert.deepEqual([seen.length, state.allMatches === now, state.allMatches.D[0].court], [0, true, 'B'], 'nothing written, not even the first update');
  reset();
});

test('no write when nothing changes (#206 review M1): the same entries, the same order, no dispatch', () => {
  reset();
  MW.ksmSetAllMatches({ D: [bout(1), bout(2)] });
  const list = state.allMatches.D;
  let seen = dispatched(() => {
    MW.ksmSetDivisionMatches('D', [...list]);
    MW.ksmSortDivisionMatches('D', (a, b) => a.id - b.id);
    MW.ksmDeleteDivisionMatches('Nope');
    MW.ksmUpdateMatches('D', []); MW.ksmInsertMatches('D', 0, []); MW.ksmAppendMatches('D', []); MW.ksmWriteMatchPaths([]);
    MW.ksmSetAllMatches(state.allMatches);
    // fields that already hold the values (a repair or a sync finding the bouts as it wants them): no dispatch
    MW.ksmUpdateMatch('D', 0, { done: false, white: 'W1' }); MW.ksmUpdateMatch('D', 1, { id: 2 }, ['nope']);
    MW.ksmUpdateMatches('D', [{ index: 0, set: { red: 'R1' } }, { index: 1, set: { done: false } }]);
    MW.ksmWriteMatchPaths([{ remove: 'D', id: 'none' }, { division: 'D', ids: ['none'], rest: ['done'], value: true, how: 'replay' }]);
    // #207 review L1: writes that copy on their way and then write nothing (an index past the end, a replay that stops,
    // a removal past the end, a missing field deleted) send nothing
    MW.ksmWriteMatchPath(['allMatches', 'D', 5, 'done'], true, false, 'replay');
    MW.ksmWriteMatchPath(['allMatches', 'D', 9], undefined, true, 'history');
    MW.ksmWriteMatchPath(['allMatches', 'D', 0, 'nope'], undefined, true, 'history');
    MW.ksmWriteMatchPaths([{ path: ['allMatches', 'D', 7], value: bout(7), how: 'replay' }, { path: ['allMatches', 'D', 0, 'gone'], missing: true, how: 'replay' }]);
    MW.ksmRemoveMatches('D', 5, 1);
    assert.equal(MW.ksmPlanMatchPaths([{ path: ['allMatches', 'D', 5, 'done'], value: true, how: 'replay' }]).allMatches, state.allMatches,
      'a planned batch that wrote nothing gives the store\'s own map (an Undo carries no new allMatches)');
  });
  assert.deepEqual(seen, []);
  assert.equal(state.allMatches.D, list);
  seen = dispatched(() => {
    assert.deepEqual(MW.ksmSortDivisionMatches('D', (a, b) => b.id - a.id).map(m => m.id), [2, 1], 'the list read again');
    MW.ksmSetDivisionMatches('D', [state.allMatches.D[0]]);
    MW.ksmSetDivisionMatches('E', []);
    MW.ksmSetDivisionMatches('E', []);
  });
  assert.equal(seen.length, 3, 'a changed order, a changed list and a new division dispatch once each');
  seen = dispatched(() => {
    MW.ksmUpdateMatches('D', [{ index: 0, set: { done: false } }, { index: 0, set: { wp: [] } }]);
    MW.ksmUpdateMatch('D', 0, { wp: [] });
    MW.ksmUpdateMatch('D', 0, { done: false }, ['wp']);
  });
  assert.deepEqual(seen.map(a => a.payload.writes[0].value.D[0]), [{ ...bout(2), wp: [] }, bout(2)].map(json),
    'only the changing updates: a new field, then a removed one (an equal array is the same value)');
  assert.deepEqual(list.map(m => m.id), [1, 2], 'the old list as it was');
  reset();
});

test('an Undo/Redo\'s batch is planned without a dispatch: the results and the map as it will be (#15 PR 13c-2)', () => {
  reset();
  const b = n => ({ ...bout(n), syncId: `pool:D:${n}` });
  MW.ksmSetAllMatches({ D: [b(1), b(2)] });
  const map = state.allMatches, ids = map.D.map(m => KSMEngine.matchSyncIdentity(m));
  let planned;
  const seen = dispatched(() => {
    planned = MW.ksmPlanMatchPaths([{ remove: 'D', id: ids[0] }, { division: 'D', ids: [ids[1]], rest: ['done'], value: true, how: 'history', clone: true }]);
  });
  assert.deepEqual(seen, []);
  assert.equal(state.allMatches, map, 'the store unchanged');
  assert.deepEqual(planned.results.map(r => r.applied), [true, true]);
  assert.deepEqual(planned.results[1].path, ['allMatches', 'D', 0, 'done']);
  assert.deepEqual(json(planned.allMatches), { D: [{ ...b(2), done: true }] });
  assert.equal(MW.ksmPlanMatchPaths([]).allMatches, map, 'nothing to write: the store\'s own map');
  reset();
});

test('#206 re-review L-c: a refused path write never builds its value (clone only on a write)', () => {
  const root = { allMatches: { D: [bout(1)] } };
  // value undefined with clone: JSON.parse(undefined) would throw if it were cloned before the walk
  assert.deepEqual(MW.ksmWriteMatchPaths([{ path: ['allMatches', 'D', 4, 'done'], value: undefined, missing: false, how: 'replay', clone: true }], root).map(r => r.applied), [false]);
  assert.deepEqual(MW.ksmWriteMatchPaths([{ path: ['allMatches', 'D', 3], value: undefined, missing: false, how: 'replay', clone: true }], root).map(r => r.applied), [false]);
  const source = read('app/modules/sync/sync-state-and-rebase.js');
  assert.doesNotMatch(source, /ksmWriteMatchPath\(resolved\.path,[^)]*cloneJson\(/, 'the rebase\'s replay clones inside the walk');
});

test('a stray write: strict (tests) throws; production logs an assignment and applies it, and a bout edited in place lands in place', () => {
  reset();
  MW.ksmSetAllMatches({ D: [bout(1)] });
  assert.throws(() => { state.allMatches = {}; }, TypeError);
  assert.throws(() => { state.allMatches.D[0].done = true; }, TypeError);
  assert.throws(() => { state.allMatches.D.push(bout(2)); }, TypeError);
  const logged = [];
  setStrayStoreWriteReporter(w => logged.push(w));
  setStoreStrict(false);
  try {
    MW.ksmSetAllMatches({ D: [bout(1)] });
    state.allMatches = { X: [bout(7)] };
    assert.deepEqual(json(getState().tournament.allMatches), { X: [bout(7)] });
    assert.deepEqual([logged.at(-1).field, logged.at(-1).path], ['allMatches', 'tournament.allMatches']);
    state.allMatches.X[0].done = true;
    assert.equal(getState().tournament.allMatches.X[0].done, true, 'not frozen in production: the write is in the store\'s object (docs/STORE.md point 8)');
    // (Put back before the next dispatch: in Node RTK's immutability check would report it there, as section 2 point 8 says.)
    state.allMatches.X[0].done = false;
  } finally {
    setStoreStrict(true);
    setStrayStoreWriteReporter(w => console.warn(w));
    reset();
  }
});

// The source check (#206 review L1). A regex reads lines, not scopes: it finds the write forms below, by field name or
// through a name bound from `allMatches` / `state.matches` in the same file. What it cannot see (an alias passed through a
// function, a computed field name) the frozen pages find at run time: tests/match-identity-copy-test.py and
// tests/match-writes-store-test.py run the app with every bout, list and the map frozen between the helpers' writes.
const FIELDS = 'wp|rp|wt|rt|done|completedResult|white|red|wdojo|rdojo|teamWhite|teamRed|hansoku|ready|bracketSlot|elimNodeId|champNodeId|teamNodeId|teamPair';
const LIST = 'push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin';
const OP = '(?:[-+*/%|&^]|\\*\\*|<<|>>>?|&&|\\|\\||\\?\\?)?=(?![=>])|\\+\\+|--';
// a bout's field assigned, compounded, incremented, or its point list mutated, on any receiver (`m`, `x`, `rows[i]`, …);
// `court` / `position` too, except on the objects that have their own (#206 re-review L-b: `cloudSession.court`, a pool's
// court, an engine plan's `set`); a field in an Object.assign() source or written by its quoted name (`m['done']=`)
const OWN_COURT = '(?<!(?:^|[^\\w$])(?:cloudSession|pool|set))';
const fieldWrite = new RegExp(`\\.(?:${FIELDS})\\s*(?:${OP})|${OWN_COURT}\\.(?:court|position)\\s*(?:${OP})|\\.(?:wp|rp)(?:\\?\\.|\\.)(?:${LIST})\\(|(?:\\+\\+|--)\\s*[\\w$.\\]\\[]*\\.(?:${FIELDS})\\b|Object\\.assign\\((?:m|match|bout|live|arr\\[[^\\]]*\\]|list\\[[^\\]]*\\])\\s*,|Object\\.assign\\([^,()]+,\\s*\\{[^}]*\\b(?:${FIELDS})\\s*:|\\[\\s*['"](?:${FIELDS}|court|position)['"]\\s*\\]\\s*(?:${OP})`);
// `allMatches` or `state.matches` (on any object) assigned below, deleted, or a list method on it (`?.` anywhere on the way)
const STEP = `(?:(?:\\?\\.|\\.)?\\[[^\\]]*\\]|(?:\\?\\.|\\.)[A-Za-z_$][\\w$]*)`;
const mapWrite = new RegExp(`(?:allMatches|(?<![\\w$])state\\.matches)${STEP}*\\s*(?:${OP}|(?:\\?\\.|\\.)(?:${LIST})\\()|delete\\s+[\\w$.?[\\]'"]*allMatches|Object\\.assign\\([\\w$.?]*(?:allMatches|state\\.matches)`);
/** The 1-based lines of `text` that write a bout, a list or the map outside match-writes.js. */
function violations(text) {
  const lines = text.split('\n'), names = new Set();
  for (const l of lines) {
    // a name bound from allMatches / state.matches (`const arr=state.allMatches[div]||[]`, `all=(state.allMatches?.[d]||[])`, `{[div]:L}=state.allMatches`)
    for (const m of l.matchAll(/([A-Za-z_$][\w$]*)\s*=(?![=>])\s*\(?\s*(?:[\w$]+\.)*(?:allMatches|matches)\b/g)) names.add(m[1]);
    for (const m of l.matchAll(/(?:\{|,)\s*\[?[^:{}]*\]?\s*:\s*([A-Za-z_$][\w$]*)\s*\}\s*=\s*[\w$.?]*allMatches/g)) names.add(m[1]);
  }
  names.delete('matches'); names.delete('allMatches');
  // (a list method, `.length =`, an entry assigned, or a field of an entry, with `?.` anywhere on the way)
  const alias = names.size ? new RegExp(`(?<![\\w$.])(?:${[...names].join('|')})(?:(?:\\?\\.)?\\[[^\\]]*\\])*(?:(?:\\?\\.|\\.)(?:${LIST})\\(|\\.length\\s*(?:${OP})|(?:\\?\\.)?\\[[^\\]]*\\]\\s*(?:${OP})|(?:\\?\\.)?\\[[^\\]]*\\](?:\\?\\.|\\.)[A-Za-z_$][\\w$]*\\s*(?:${OP}))`) : null;
  const out = [];
  lines.forEach((l, i) => { if (/^\s*(\*|\/\/)/.test(l)) return; if (mapWrite.test(l) || fieldWrite.test(l) || (alias && alias.test(l))) out.push(i + 1); });
  return out;
}

test('source check: the write forms it finds (the review\'s probes)', () => {
  const probes = [
    'm.white=1', 'state.allMatches[div][i]={}', 'const rows=state.allMatches[div]||[];\nrows.push({})', 'const {[div]:L}=state.allMatches;\nL.push(x)',
    'state.matches[0].wp=[]', "m.wp.push('M')", 'm.hansoku=1', 'x.done=true', 'm.wt+=1', 'm.wt++', '++m.rt', 'rows[i].done=true',
    'let all=(state.allMatches?.[d]||[]);\nall[2]=x', 'const arr=state.allMatches[div];\narr[0].court=\'B\'', 'Object.assign(m,{done:true})',
    'delete state.allMatches[div]', 'state.allMatches={}', 'target.allMatches[div]=list', 'state.allMatches[div].sort(f)', 'state.matches.push(x)',
    // #206 re-review L-b
    "m.court='B'", "m.position='Final'", 'x.court??=c', 'state.allMatches?.[div]?.push(x)', 'state.allMatches[div]?.splice(0,1)', 'state.matches?.sort(f)',
    'const arr=state.allMatches[div]||[];\narr?.push(x)', 'const arr=state.allMatches[div]||[];\narr.length=0', 'const arr=state.allMatches[div];\narr?.[0].done=true',
    'Object.assign(x,{done:true})', 'Object.assign(row, {wp: [], rp: []})', "m['done']=true", 'm["court"]="A"', "m.wp?.push('M')",
  ];
  for (const probe of probes) assert.ok(violations(probe).length, probe);
  for (const read of ['const done=m.done', 'if(m.done===true)x++', 'const arr=state.allMatches[div]||[];\nconst n=arr.length', 'set.white===m.white', 'arr.map(m=>m.wp)', 'node.winner=w', 'pool.players.push(p)',
    "cloudSession.court='A'", "pool.court='B'", 'set.court=c', 'if(m.court===c)x()', 'const c=m.court||"A"', "Object.assign({}, m)", "m['done']===true"])
    assert.deepEqual(violations(read), [], read);
});

test('source: no app code outside match-writes.js assigns, deletes or mutates allMatches, a division\'s list or a bout', () => {
  const list = dir => fs.readdirSync(new URL(`../../${dir}`, import.meta.url), { recursive: true })
    .filter(f => /\.(js|ts|tsx)$/.test(f)).map(f => `${dir}/${f}`);
  const files = ['app/main.js', ...list('app/modules'), ...list('app/react'), ...list('app/engine')];
  const own = 'app/modules/court/match-writes.js';
  // Plan objects in the engine (pure: the app writes them through the helpers), allowed by their exact line.
  const allowed = {
    'app/engine/integrity.ts': ['set.wp = [...snapshot.wp]', 'set.rp = [...snapshot.rp]', 'set.wt = Number(totals.wt)', 'set.rt = Number(totals.rt)'], // a repair plan's `set`
    'app/engine/single-elim.ts': ['set.ready = false', 'set.bracketSlot = node.slot', "set.red = red?.name || ''", "set.white = white?.name || ''", 'set.ready = !!(red && white)'], // a sync plan's `set`
    'app/engine/teams.ts': ['bouts.forEach(x => { x.teamNodeId = node.id; x.bracketSlot = node.slot || 0; })'], // new bouts, before the plan returns them
    // An Undo/Redo's values for its one court/undo or court/redo (a plain object of new values, not the store's map).
    'app/modules/court/court-scoring-and-history.js': ['historyStoreValues().allMatches=planned.allMatches;'],
  };
  const bad = [];
  for (const file of files.filter(f => f !== own)) {
    const lines = read(file).split('\n');
    for (const n of violations(read(file))) {
      const line = lines[n - 1];
      if ((allowed[file] || []).some(a => line.includes(a))) continue;
      bad.push(`${file}:${n}: ${line.trim().slice(0, 140)}`);
    }
  }
  assert.deepEqual(bad, []);
  // Every helper writes through ksmMatchWrite(), the one place that dispatches (one action per call).
  const source = read(own);
  for (const name of ['ksmSetAllMatches', 'ksmSetDivisionMatches', 'ksmDeleteDivisionMatches', 'ksmUpdateMatches', 'ksmInsertMatches', 'ksmAppendMatches', 'ksmRemoveMatches', 'ksmSortDivisionMatches', 'ksmWriteMatchPath', 'ksmWriteMatchPaths']) {
    const body = source.slice(source.indexOf(`export function ${name}(`)).split('\n}\n')[0];
    assert.match(body, /ksmMatchWrite\(root,'|ksmWriteUpdates\(div,/, `${name} writes through ksmMatchWrite() (one action)`);
  }
});
