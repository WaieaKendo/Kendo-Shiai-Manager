// Issue #136 step 1c: a third batch of pure helpers moved from app/js into app/engine/.
// Each must give the same answer as its pre-move legacy declaration in the last single-file
// version (def5010), and app/js must now delegate to KSMEngine.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { validationIssue } from '../../app/engine/registration.ts';
import { esc, jsArg, printSheet, printNameBlock } from '../../app/engine/html-text.ts';
import { cloneJson, mergeHistoryEntries, stampHistoryPatchMatchIdentity, nextReadyIndexInState } from '../../app/engine/sync-helpers.ts';
import { bracketPairsFromSeeds, poolRowsStillTied, indivNodeHasMatch, canonicalSingleElimMatch, pointsFor } from '../../app/engine/bracket-helpers.ts';
import { html, extractFunction, withDependencies } from '../lib/ksm-source.mjs';
import { gitShow } from '../lib/git-show.mjs';

const MOVED = {
  validationIssue, esc, jsArg, cloneJson, mergeHistoryEntries, stampHistoryPatchMatchIdentity, nextReadyIndexInState,
  bracketPairsFromSeeds, poolRowsStillTied, indivNodeHasMatch, canonicalSingleElimMatch, pointsFor, printSheet, printNameBlock,
};

// Builders so every case gets fresh objects (several helpers mutate their arguments).
const mk = (...xs) => () => xs.map(x => JSON.parse(JSON.stringify(x === undefined ? null : x)));
const ESC_INPUTS = [undefined, null, '', 'plain', '&', '<', '>', '"', "'", '`', '<a href="x">O\'Neil & Co</a>', '&amp;', 0, 1, 12.5, NaN,
  true, false, [], ['a', '<b>'], {}, 'multi\nline', 'tab\there', 'é日本', '${x}', 'a\\b'];
const ENTRY = (over = {}) => ({ format: 'patch-v1', clientId: 'c', when: '2026-01-02T00:00:00Z', court: 'A', label: 'l', ...over });
const MATCH_ARRS = [
  [], [{ type: 'individual', singleElim: true, elimNodeId: 'n1', done: false }],
  [{ type: 'individual', singleElim: true, elimNodeId: 'n1', done: true }, { type: 'individual', singleElim: true, elimNodeId: 'n1' }],
  [{ type: 'individual', singleElim: true, elimNodeId: 'n1' }, { type: 'individual', singleElim: true, elimNodeId: 'n1', done: true }, { type: 'individual', singleElim: true, elimNodeId: 'n2' }],
  [{ type: 'individual', singleElim: true, position: 'Final', bracketSlot: 0 }], [{ type: 'individual', championship: true, position: 'Final' }],
  [{ type: 'teamPosition' }], [{ singleElim: true, elimNodeId: 'n1' }],
];
const NODES = [{ id: 'n1' }, { id: 'n2' }, { id: 'Final:0' }, { id: undefined }, {}];
const STATES = [null, undefined, {}, { allMatches: {} },
  { allMatches: { D: [{ type: 'individual', white: 'a', red: 'b', done: true }, { type: 'individual', white: 'a', red: 'b', court: 'B' }, { type: 'individual', white: 'a', red: 'b' }] } },
  { allMatches: { D: [{ type: 'individual', white: 'a', red: 'b' }] }, divisionCourts: { D: 'B' } },
  { allMatches: { D: [{ type: 'individual', white: 'a', red: 'b' }] }, divisionCourts: { D: 'split' } }];
const PATCH_STATES = [undefined, null, {}, { allMatches: { D: [{ division: 'D', type: 'individual', white: 'a', red: 'b' }] } },
  { allMatches: { D: [{ division: 'D', type: 'individual', champNodeId: 'x' }] } }, { allMatches: { D: ['x'] } }, { allMatches: { D: [[]] } }];
const RESULT_MATCHES = [undefined, null, {}, { done: false, wp: ['M'], rp: ['K'] }, { done: true, wp: ['M'], rp: ['K'] },
  { done: true, white: 'a', red: 'b', wp: ['M', 'K'], rp: [], completedResult: { winner: 'a', wp: ['M', 'K'], rp: [] } },
  { done: true, white: 'a', red: 'b', wp: ['M'], rp: ['D'], completedResult: { winner: 'a', wp: ['D'], rp: ['M', 'K'] } },
  { done: true, white: 'a', red: 'b', wp: ['M'], rp: [], completedResult: { winner: 'b', wp: ['T'], rp: ['H'] } },
  { done: true, white: 'a', red: 'b', type: 'individual', wp: ['M'], rp: [], completedResult: { winner: 'a', wp: ['T'], rp: [] } },
  { done: true, wp: 'M', rp: 5 }, { wp: undefined, rp: undefined }];
const ROW = (wins, pts, tbWins, tbPts) => ({ wins, pts, tbWins, tbPts });
const ROWS = [null, undefined, {}, ROW(1, 2), ROW(1, 2, 1, 0), ROW(1, 2, 0, 0), ROW(1, 3), ROW(2, 2), ROW(1, 2, undefined, 1),
  ROW(1, 2, 'x', 'y'), ROW(1, 2, 2, 3), ROW(1, 2, 2, 4), ROW(0, 0, 0, 0), ROW(NaN, 1), ROW(1, 2, NaN, 0)];
const pair = xs => xs.flatMap(a => xs.map(b => [a, b]));

// Each case is a builder returning fresh args; the result AND the args afterwards (mutation) are compared.
const CASES = {
  validationIssue: [[], ['error', 'c', 'D', 'm'], ['warn', 'c', 'D', 'm', 'do'], ['a', undefined, null, 0, ''], [undefined, undefined, undefined, undefined, undefined]].map(a => () => a),
  esc: ESC_INPUTS.map(v => () => [v]),
  jsArg: [...ESC_INPUTS, '</script>', '"onclick="x"'].map(v => () => [v]),
  cloneJson: [{ a: 1 }, [1, [2]], 'x', 0, null, true, { d: { e: [] } }, [], {}, { u: undefined, n: null }].map(v => mk(v)),
  mergeHistoryEntries: [
    () => [], () => [undefined, undefined], () => [[], []], () => [[ENTRY()], []], () => [[], [ENTRY()]],
    () => [[ENTRY()], [ENTRY()]], () => [[ENTRY({ when: 'b' }), ENTRY({ when: 'a', label: 'x' })], [ENTRY({ when: 'c' })]],
    () => [[null, undefined, {}, { format: 'other' }, ENTRY()], [ENTRY({ clientId: undefined, when: undefined })]],
    () => [Array.from({ length: 100 }, (_, i) => ENTRY({ when: String(1000 + i).padStart(5, '0'), label: 'L' + i })), []],
    () => [[ENTRY({ when: 5 })], [ENTRY({ when: '5' })]], () => [null, []], () => [[], null],
  ],
  stampHistoryPatchMatchIdentity: PATCH_STATES.flatMap(b => PATCH_STATES.flatMap(a => [
    { path: ['allMatches', 'D', 0], k: 1 }, { path: ['allMatches', 'D', 'x'] }, { path: ['state'] }, { path: [] }, {}, null, undefined,
  ].map(p => mk(p, b, a)))),
  nextReadyIndexInState: STATES.flatMap(s => ['D', 'Z'].flatMap(d => ['A', 'B', undefined].map(c => mk(s, d, c)))),
  bracketPairsFromSeeds: [[], [[1, 2]], null, undefined, 'x', { a: 1 }].map(v => mk(v)),
  poolRowsStillTied: pair(ROWS).map(([a, b]) => mk(a, b)),
  indivNodeHasMatch: MATCH_ARRS.flatMap(arr => NODES.map(n => mk(arr, n))),
  canonicalSingleElimMatch: MATCH_ARRS.flatMap(arr => NODES.map(n => mk('D', n, arr))),
  pointsFor: RESULT_MATCHES.flatMap(m => ['W', 'R', 'x', undefined].map(s => mk(m, s))),
  printSheet: [
    mk('T', 'S', '<p>b</p>'), mk('<T>', '&S', ''), mk(undefined, undefined, ''), mk('T', 'S', 'b', 'K'), mk('T', 'S', 'b', undefined),
    mk('T', 'S', 'b', null), mk('T', 'S', 'b', '<k>'), mk(0, 0, 'b', 0), mk('T', null, 'b'),
  ],
  printNameBlock: [['Sam', 'Dojo'], ['Sam', ''], ['', 'Dojo'], [undefined, undefined], [null, null], ['<b>', '"d"'], [0, 0], ['Sam', undefined], ['A&B', "O'D"]].map(a => mk(...a)),
};

// Equality that treats NaN/undefined the way the legacy vm values do, and sees through vm realms.
const norm = v => {
  if (typeof v === 'number' && Number.isNaN(v)) return 'NaN';
  if (v === undefined) return '__undefined__';
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return Array.from(v, norm);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)]));
};
// Runs one call and reports result, arguments afterwards (mutations) or the throw.
const outcome = (fn, args) => {
  try { const result = fn(...args); return { result: norm(result), args: norm(args) }; }
  catch (e) { return { threw: e?.name ?? String(e) }; }
};

test('app/js delegates each moved helper to KSMEngine', () => {
  for (const name of Object.keys(MOVED)) {
    assert.match(extractFunction(html, name), new RegExp(`KSMEngine\\.${name}\\(`), name);
  }
});

test('every moved helper has a table of cases', () => {
  assert.deepEqual(Object.keys(CASES).sort(), Object.keys(MOVED).sort());
});

test('esc and jsArg cover & < > " \' and backtick, non-strings, null/undefined and numbers', () => {
  assert.equal(esc('&<>"\'`'), '&amp;&lt;&gt;&quot;&#39;`');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '');
  assert.equal(esc(5), '5');
  assert.equal(esc([1, 2]), '1,2');
  assert.equal(jsArg(undefined), '&quot;&quot;');
  assert.equal(jsArg(null), '&quot;&quot;');
  assert.equal(jsArg(0), '&quot;0&quot;');
  assert.equal(jsArg('a"b'), '&quot;a\\&quot;b&quot;');
});

test('moved helpers match the pre-move legacy code', t => {
  const old = gitShow('def5010', 'public/index.html');
  if (!old) { t.skip('def5010 not in this clone'); return; }
  const legacy = {};
  for (const name of Object.keys(MOVED)) {
    const text = extractFunction(old, name);
    assert.ok(!/KSMEngine/.test(text), `${name}: old code is pre-move`);
    legacy[name] = withDependencies(old, text);
    assert.ok(!/KSMEngine/.test(legacy[name]), `${name}: old dependencies are pre-move`);
  }
  for (const [name, fn] of Object.entries(MOVED)) {
    const ctx = vm.createContext({});
    vm.runInContext(legacy[name], ctx);
    for (const build of CASES[name]) {
      const label = `${name}(${JSON.stringify(norm(build()))})`;
      assert.deepEqual(outcome(fn, build()), outcome(ctx[name], build()), label);
    }
  }
});
