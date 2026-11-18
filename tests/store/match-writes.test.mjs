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
  assert.equal(MW.ksmUpdateMatch('D', 9, { done: true }, [], root), null, 'no bout at the index: nothing written');
  // several bouts in one write
  MW.ksmUpdateMatches('D', [{ index: 1, set: { court: 'B' } }, { index: 2, set: { court: 'A' } }, { index: 7, set: { court: 'A' } }], root);
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
  assert.ok(!('D' in root.allMatches));
  MW.ksmSetAllMatches({}, root); assert.deepEqual(root.allMatches, {});
  MW.ksmSetAllMatches(undefined, root); assert.ok(!('allMatches' in root));
  MW.ksmSetDivisionMatches('G', [], root); assert.deepEqual(root.allMatches, { G: [] }, 'a missing map is created');
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
    MW.ksmSortDivisionMatches('D', () => 0); MW.ksmAppendMatches('D', [bout(2)]); MW.ksmSetDivisionMatches('E', []);
    MW.ksmWriteMatchPath(['allMatches', 'D', 0, 'wp'], ['M'], false, 'history');
    assert.deepEqual(calls, Array(5).fill(['before', 'after']).flat());
    calls.length = 0;
    MW.ksmUpdateMatch('D', 0, { done: true }, [], { allMatches: { D: [bout(1)] } });
    MW.ksmUpdateMatches('D', [], undefined);
    assert.deepEqual(calls, [], 'a payload copy, or nothing to write: no hook');
  } finally { delete globalThis.KSMTestMatchWrite; state.allMatches = saved; }
});

test('source: no app code outside match-writes.js assigns, deletes or mutates allMatches, a division\'s list or a match in it', () => {
  const list = dir => fs.readdirSync(new URL(`../../${dir}`, import.meta.url), { recursive: true })
    .filter(f => /\.(js|ts|tsx)$/.test(f)).map(f => `${dir}/${f}`);
  const files = ['app/main.js', ...list('app/modules'), ...list('app/react'), ...list('app/engine')];
  const own = 'app/modules/court/match-writes.js';
  // `allMatches` (on any object: `state`, a payload copy, an alias) assigned, deleted, or its lists mutated.
  const map = /allMatches(\?\.|\.)?(\[[^\]]*\]|\.[A-Za-z_$][\w$]*)*\s*(=(?![=>])|\.(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)\()|delete\s+[\w$.?[\]'"]*allMatches|Object\.assign\([\w$.?]*allMatches/;
  // The old forms by name: a held bout's result / point / name / court fields, a held list's push / splice / sort
  // (`arr` / `all` / `list` read from allMatches), Object.assign on a bout (the result repairs, the engine syncs' plans).
  const held = /(?<![\w$.])(m|match|live|bout|matches\[[^\]]*\]|arr\[[^\]]*\])\.(wp|rp|wt|rt|done|completedResult|white|red|wdojo|rdojo|court|ready|position|bracketSlot)\s*=(?![=>])|(?<![\w$.])(arr|all)\.(push|splice|sort|unshift|pop|shift|reverse)\(|Object\.assign\((m|arr\[[^\]]*\]|match),/;
  // Lists and bouts that are not the live state's (an engine plan, a draft, a payload copy being built): allowed by place.
  const allowed = new Set([
    // engine: plans and new lists built on copies (pure; the app writes them through the helpers)
    ...files.filter(f => f.startsWith('app/engine/')),
  ]);
  const bad = [];
  for (const file of files.filter(f => f !== own)) {
    read(file).split('\n').forEach((line, i) => {
      if (/^\s*(\*|\/\/)/.test(line)) return;
      if (map.test(line)) bad.push(`${file}:${i + 1}: ${line.trim().slice(0, 140)}`);
      else if (held.test(line) && !allowed.has(file) && !file.startsWith('app/react/')) bad.push(`${file}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  assert.deepEqual(bad, []);
  // The helpers are the only writers of the live map; replaceState() / assignState() (app-state.js) replace `state`'s
  // keys wholesale (a load, a switch), as for every other key (docs/STORE.md section 2 point 3).
  assert.match(read(own), /export function ksmSetAllMatches/);
  // Every helper that writes the live state calls the test hook (13c-2's dispatch points).
  const source = read(own);
  for (const name of ['ksmSetAllMatches', 'ksmSetDivisionMatches', 'ksmUpdateMatches', 'ksmInsertMatches', 'ksmAppendMatches', 'ksmRemoveMatches', 'ksmSortDivisionMatches', 'ksmWriteMatchPath']) {
    const body = source.slice(source.indexOf(`export function ${name}(`)).split('\n}\n')[0];
    assert.match(body, /ksmMatchWrite\(root,/, `${name} writes through ksmMatchWrite()`);
  }
});
