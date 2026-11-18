// #15 PR 13c-1 (docs/STORE.md section 3 item 13): every write to `allMatches` goes through one module,
// app/modules/court/match-writes.js. `allMatches` is still a plain field and the helpers write it in place (no behaviour
// change); PR 13c-2 moves it into the store by changing only their bodies. Here: the helpers' rules on a plain object, the
// test hooks around each write on the live `state`, and the source check (no other app code assigns, deletes or mutates
// `allMatches`, a division's list or a match in it). The browser half (every match, list and the map frozen between the
// helpers' writes while tournaments are played, loaded, rebased, undone and redone) is tests/match-identity-copy-test.py
// and tests/match-writes-store-test.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { state } from '../../app/modules/app-state.js';
import * as MW from '../../app/modules/court/match-writes.js';
import * as KSMEngine from '../../app/engine/index.ts';

const read = file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const json = v => JSON.parse(JSON.stringify(v));
const bout = (id, extra = {}) => ({ id, white: `W${id}`, red: `R${id}`, done: false, ...extra });

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

test('no write when nothing changes (#206 review M1): the same entries, the same order', () => {
  const calls = [];
  const saved = state.allMatches;
  globalThis.KSMTestMatchWrite = where => calls.push(where);
  try {
    state.allMatches = { D: [bout(1), bout(2)] };
    const list = state.allMatches.D;
    MW.ksmSetDivisionMatches('D', [...list]);
    assert.equal(state.allMatches.D, list, 'a new list with the same entries: nothing written');
    MW.ksmSortDivisionMatches('D', (a, b) => a.id - b.id);
    MW.ksmDeleteDivisionMatches('Nope');
    assert.deepEqual(calls, []);
    MW.ksmSortDivisionMatches('D', (a, b) => b.id - a.id);
    assert.deepEqual(list.map(m => m.id), [2, 1]);
    MW.ksmSetDivisionMatches('D', [list[0]]);
    MW.ksmSetDivisionMatches('E', []);
    MW.ksmSetDivisionMatches('E', []);
    assert.deepEqual(calls, Array(3).fill(['before', 'after']).flat(), 'a changed order, a changed list and a new division write once each');
  } finally { delete globalThis.KSMTestMatchWrite; state.allMatches = saved; }
});

test('ksmWriteMatchPaths(): one write, in order, each look-up by identity seeing the writes before it (#206 review M2)', () => {
  const id = n => `pool:D:${n}`;
  const b = n => ({ ...bout(n), syncId: id(n) });
  const root = { allMatches: { D: [b(1), b(2), b(3)] } };
  // matchSyncIdentity() of these test bouts: the engine's, by fields; use what it gives for each
  const ident = m => KSMEngine.matchSyncIdentity(m);
  const [i1, i2, i3] = root.allMatches.D.map(ident);
  assert.ok(i1 && i2 && i3 && new Set([i1, i2, i3]).size === 3, 'the test bouts have distinct identities');
  const results = MW.ksmWriteMatchPaths([
    { remove: 'D', id: i1 },
    { division: 'D', ids: [i3], rest: ['done'], value: true, missing: false, how: 'history' },
    { insert: 'D', after: i2, match: b(4) },
    { insert: 'D', after: i2, match: b(4) },
    { insert: 'D', after: null, match: b(5) },
    { division: 'D', ids: ['gone', i2], rest: ['wp'], value: ['M'], missing: false, how: 'replay', clone: true },
    { division: 'D', ids: ['gone'], rest: ['wp'], value: ['M'], missing: false, how: 'replay' },
    { path: ['allMatches', 'D', 9], value: b(9), missing: false, how: 'replay' },
    { remove: 'Nope', id: i1 }, { insert: 'Nope', after: null, match: b(6) },
  ], root);
  assert.deepEqual(root.allMatches.D.map(m => m.id), [5, 2, 4, 3]);
  assert.deepEqual(results.map(r => r.applied), [true, true, true, false, true, true, false, false, false, false]);
  assert.deepEqual(results[1].path, ['allMatches', 'D', 1, 'done'], 'bout 3 found where the removal left it');
  assert.deepEqual(results[5].path, ['allMatches', 'D', 1, 'wp'], 'bout 2 found after the inserts');
  assert.equal(root.allMatches.D[3].done, true);
  assert.ok(!('Nope' in root.allMatches), 'an insert never creates a list');
  const calls = [];
  globalThis.KSMTestMatchWrite = where => calls.push(where);
  const saved = state.allMatches;
  try {
    state.allMatches = { D: [b(1)] };
    MW.ksmWriteMatchPaths([{ path: ['allMatches', 'D', 0, 'done'], value: true, how: 'history' }, { path: ['allMatches', 'D', 0, 'wp'], value: ['M'], how: 'history' }]);
    assert.deepEqual(calls, ['before', 'after'], 'the batch is one write');
  } finally { delete globalThis.KSMTestMatchWrite; state.allMatches = saved; }
});

test('ksmWriteMatchPath(): the Undo/Redo walk (history) and the rebase walk (replay), as writeHistoryValue() / applyPatchToStateObject()', () => {
  const root = { allMatches: { D: [bout(1), bout(2)] } };
  // history: missing parents created, an index at or past the end inserted
  assert.equal(MW.ksmWriteMatchPath(['allMatches', 'D', 0, 'wp', 0], 'M', false, 'history', root), true);
  assert.deepEqual(root.allMatches.D[0].wp, ['M']);
  MW.ksmWriteMatchPath(['allMatches', 'D', 5], bout(3), false, 'history', root);
  assert.deepEqual(root.allMatches.D.map(m => m.id), [1, 2, 3], 'past the end: spliced in (at the end)');
  MW.ksmWriteMatchPath(['allMatches', 'D', 1], undefined, true, 'history', root);
  assert.deepEqual(root.allMatches.D.map(m => m.id), [1, 3]);
  MW.ksmWriteMatchPath(['allMatches', 'New', 0, 'done'], true, false, 'history', root);
  assert.deepEqual(root.allMatches.New, [{ done: true }]);
  MW.ksmWriteMatchPath(['allMatches', 'New'], undefined, true, 'history', root);
  assert.ok(!('New' in root.allMatches));
  // replay: never a sparse list, past the end refused, at the end appended
  assert.equal(MW.ksmWriteMatchPath(['allMatches', 'D', 4, 'done'], true, false, 'replay', root), false);
  assert.equal(MW.ksmWriteMatchPath(['allMatches', 'D', 4], bout(9), false, 'replay', root), false);
  assert.equal(MW.ksmWriteMatchPath(['allMatches', 'D', 2], bout(4), false, 'replay', root), true);
  assert.deepEqual(root.allMatches.D.map(m => m.id), [1, 3, 4]);
  assert.equal(MW.ksmWriteMatchPath(['allMatches', 'D', 0, 'done'], undefined, true, 'replay', root), true);
  assert.ok(!('done' in root.allMatches.D[0]));
  assert.equal(MW.ksmWriteMatchPath(['allMatches', 'D', 3], undefined, true, 'replay', root), false);
  assert.throws(() => MW.ksmWriteMatchPath(['pools', 'D'], [], false, 'history', root), /not an allMatches path/);
});

test('the test hooks: one before / after pair around each write on the live state, none on a payload copy', () => {
  const calls = [];
  globalThis.KSMTestMatchWrite = where => calls.push(where);
  const saved = state.allMatches;
  try {
    state.allMatches = { D: [bout(1)] };
    // The hook may replace the objects (the guard thaws them before and freezes copies after): each helper reads the
    // list after 'before' and returns what is there after 'after'.
    globalThis.KSMTestMatchWrite = where => { calls.push(where); state.allMatches = { D: state.allMatches.D.map(m => ({ ...m })) }; };
    const was = state.allMatches.D[0];
    const after = MW.ksmUpdateMatch('D', 0, { done: true });
    assert.notEqual(after, was);
    assert.equal(after, state.allMatches.D[0], 'the bout as it is after the write, read again');
    assert.equal(after.done, true);
    assert.equal(was.done, false, 'the object read before keeps its values when the hook copies');
    MW.ksmAppendMatches('D', [bout(2)]); MW.ksmSortDivisionMatches('D', (a, b) => b.id - a.id); MW.ksmSetDivisionMatches('E', []);
    MW.ksmWriteMatchPath(['allMatches', 'D', 0, 'wp'], ['M'], false, 'history');
    assert.deepEqual(calls, Array(5).fill(['before', 'after']).flat());
    calls.length = 0;
    MW.ksmUpdateMatch('D', 0, { done: true }, [], { allMatches: { D: [bout(1)] } });
    MW.ksmUpdateMatches('D', []);
    assert.deepEqual(calls, [], 'a payload copy, or nothing to write: no hook');
  } finally { delete globalThis.KSMTestMatchWrite; state.allMatches = saved; }
});

// The source check (#206 review L1). A regex reads lines, not scopes: it finds the write forms below, by field name or
// through a name bound from `allMatches` / `state.matches` in the same file. What it cannot see (an alias passed through a
// function, a computed field name) the frozen pages find at run time: tests/match-identity-copy-test.py and
// tests/match-writes-store-test.py run the app with every bout, list and the map frozen between the helpers' writes.
const FIELDS = 'wp|rp|wt|rt|done|completedResult|white|red|wdojo|rdojo|teamWhite|teamRed|hansoku|ready|bracketSlot|elimNodeId|champNodeId|teamNodeId|teamPair';
const LIST = 'push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin';
const OP = '(?:[-+*/%|&^]|\\*\\*|<<|>>>?|&&|\\|\\||\\?\\?)?=(?![=>])|\\+\\+|--';
// a bout's field assigned, compounded, incremented, or its point list mutated, on any receiver (`m`, `x`, `rows[i]`, …)
const fieldWrite = new RegExp(`\\.(?:${FIELDS})\\s*(?:${OP})|\\.(?:wp|rp)\\.(?:${LIST})\\(|(?:\\+\\+|--)\\s*[\\w$.\\]\\[]*\\.(?:${FIELDS})\\b|Object\\.assign\\((?:m|match|bout|live|arr\\[[^\\]]*\\]|list\\[[^\\]]*\\])\\s*,`);
// `allMatches` or `state.matches` (on any object) assigned below, deleted, or a list method on it
const mapWrite = new RegExp(`(?:allMatches|(?<![\\w$])state\\.matches)(?:\\?\\.|\\.)?(?:\\[[^\\]]*\\]|\\.[A-Za-z_$][\\w$]*)*\\s*(?:${OP}|\\.(?:${LIST})\\()|delete\\s+[\\w$.?[\\]'"]*allMatches|Object\\.assign\\([\\w$.?]*(?:allMatches|state\\.matches)`);
/** The 1-based lines of `text` that write a bout, a list or the map outside match-writes.js. */
function violations(text) {
  const lines = text.split('\n'), names = new Set();
  for (const l of lines) {
    // a name bound from allMatches / state.matches (`const arr=state.allMatches[div]||[]`, `all=(state.allMatches?.[d]||[])`, `{[div]:L}=state.allMatches`)
    for (const m of l.matchAll(/([A-Za-z_$][\w$]*)\s*=(?![=>])\s*\(?\s*(?:[\w$]+\.)*(?:allMatches|matches)\b/g)) names.add(m[1]);
    for (const m of l.matchAll(/(?:\{|,)\s*\[?[^:{}]*\]?\s*:\s*([A-Za-z_$][\w$]*)\s*\}\s*=\s*[\w$.?]*allMatches/g)) names.add(m[1]);
  }
  names.delete('matches'); names.delete('allMatches');
  const alias = names.size ? new RegExp(`(?<![\\w$.])(?:${[...names].join('|')})(?:\\[[^\\]]*\\])*(?:\\.(?:${LIST})\\(|\\[[^\\]]*\\]\\s*(?:${OP})|\\[[^\\]]*\\]\\.[A-Za-z_$][\\w$]*\\s*(?:${OP}))`) : null;
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
  ];
  for (const probe of probes) assert.ok(violations(probe).length, probe);
  for (const read of ['const done=m.done', 'if(m.done===true)x++', 'const arr=state.allMatches[div]||[];\nconst n=arr.length', 'set.white===m.white', 'arr.map(m=>m.wp)', 'node.winner=w', 'pool.players.push(p)'])
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
  // Every helper that writes the live state calls the test hook (13c-2's dispatch points).
  const source = read(own);
  for (const name of ['ksmSetAllMatches', 'ksmSetDivisionMatches', 'ksmDeleteDivisionMatches', 'ksmUpdateMatches', 'ksmInsertMatches', 'ksmAppendMatches', 'ksmRemoveMatches', 'ksmSortDivisionMatches', 'ksmWriteMatchPath', 'ksmWriteMatchPaths']) {
    const body = source.slice(source.indexOf(`export function ${name}(`)).split('\n}\n')[0];
    assert.match(body, /ksmMatchWrite\(root,/, `${name} writes through ksmMatchWrite()`);
  }
});
