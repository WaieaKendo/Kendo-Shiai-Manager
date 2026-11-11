// #15 PR 2 (docs/STORE.md section 2, point 4): applyTournamentPayload() runs sanitizeLoadedTournamentState() and
// normalizeAllIndividualPoolTiebreakOrder() on the loaded copy BEFORE it replaces `state` (replaceState()), where it
// used to run them on the live `state` after `delete` + Object.assign. This test runs both orders, the app's own
// functions (as they are in app/modules, in a vm with their dependencies), on payloads built from every engine golden
// plus payloads that need each repair, while `state` still holds another tournament, and asserts the same `state` and
// the same console output.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { extractFunction, html, withDependencies } from '../lib/ksm-source.mjs';
import { replaceState } from '../../app/modules/app-state.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE = 'live sync';

// The two functions as they are in the app (the call site passes options.source||'tournament load').
const loadSource = fs.readFileSync(path.join(ROOT, 'app/modules/sync/cloud-realtime-save-and-load.js'), 'utf8');
const applyFn = extractFunction(loadSource, 'applyTournamentPayload');
test('applyTournamentPayload repairs the loaded copy, then replaces state', () => {
  const at = s => { const i = applyFn.indexOf(s); assert.ok(i >= 0, `applyTournamentPayload calls ${s}`); return i; };
  assert.ok(at("sanitizeLoadedTournamentState(loaded,") < at("normalizeAllIndividualPoolTiebreakOrder(loaded,"));
  assert.ok(at("normalizeAllIndividualPoolTiebreakOrder(loaded,") < at('replaceState(loaded);'));
  assert.doesNotMatch(applyFn, /delete state\[|Object\.assign\(state/, 'no whole-object write to state outside replaceState()');
});

const logs = [];
const record = kind => (...args) => logs.push([kind, JSON.stringify(args)]);
const context = vm.createContext({ console: { log: record('log'), info: record('info'), warn: record('warn'), error: record('error') } });
vm.runInContext(withDependencies(html, [
  extractFunction(html, 'sanitizeLoadedTournamentState'),
  extractFunction(html, 'normalizeAllIndividualPoolTiebreakOrder'),
].join('\n'), { exclude: ['state', 'console'] }), context);
const clone = value => JSON.parse(JSON.stringify(value));

// Old order: the live object is emptied and gets the loaded keys, then the repairs run on it.
function oldOrder(previous, loaded) {
  logs.length = 0;
  const live = context.state = clone(previous);
  Object.keys(live).forEach(k => delete live[k]);
  Object.assign(live, loaded);
  context.sanitizeLoadedTournamentState(live, SOURCE);
  context.normalizeAllIndividualPoolTiebreakOrder(live, SOURCE);
  return { json: JSON.stringify(live), logs: [...logs] };
}
// New order: the repairs run on the loaded copy while the live object still holds the previous tournament.
function newOrder(previous, loaded) {
  logs.length = 0;
  const live = context.state = clone(previous);
  context.sanitizeLoadedTournamentState(loaded, SOURCE);
  context.normalizeAllIndividualPoolTiebreakOrder(loaded, SOURCE);
  replaceState(loaded, live);
  return { json: JSON.stringify(live), logs: [...logs] };
}

// --- payloads ---
const goldenDir = path.join(ROOT, 'tests/golden/engine');
function goldenState(file) {
  const golden = JSON.parse(fs.readFileSync(path.join(goldenDir, file), 'utf8'));
  const st = { divisions: [], divisionTypes: {}, divisionCourts: {}, pools: {}, allMatches: {}, currentByDivision: {},
    courtState: { A: { division: null, index: 0 }, B: { division: null, index: 0 } }, courtActiveDivision: { A: null, B: null },
    matches: [], current: 0, currentDivision: null, currentCourt: 'A', publicCourt: 'A', generated: true };
  for (const div of golden.setup || []) { st.divisions.push(div.name); st.divisionTypes[div.name] = div.format; st.divisionCourts[div.name] = div.court === 'Both' ? 'split' : div.court; }
  for (const [div, gen] of Object.entries(golden.generated || {})) {
    st.allMatches[div] = (gen.matches || []).map((m, i) => ({ division: div, poolOrder: i, ...m }));
    if (gen.pools) st.pools[div] = gen.pools;
  }
  const divs = Object.keys(st.allMatches);
  divs.forEach((div, i) => { st.currentByDivision[div] = Math.min(2, st.allMatches[div].length); if (i < 2) { const c = i ? 'B' : 'A'; st.courtState[c] = { division: div, index: Math.min(1 + i, st.allMatches[div].length) }; st.courtActiveDivision[c] = div; } });
  if (divs[0]) { st.currentDivision = divs[0]; st.current = st.courtState.A.index; st.matches = clone(st.allMatches[divs[0]]); }
  return st;
}
// Invalid entries (removed by sanitizeLoadedTournamentState, pointers moved down).
function withInvalidEntries(st) {
  const out = clone(st);
  for (const div of Object.keys(out.allMatches)) {
    const arr = out.allMatches[div];
    arr.splice(0, 0, null);
    arr.splice(Math.min(2, arr.length), 0, 'not a match', 42);
    arr.push([]);
  }
  return out;
}
// Pool tiebreaks after the championship (moved back into their pool by normalizeAllIndividualPoolTiebreakOrder).
function withMisplacedTiebreaks(st) {
  const out = clone(st);
  for (const [div, arr] of Object.entries(out.allMatches)) {
    const pools = [...new Set(arr.filter(m => m && m.type === 'individual' && m.pool && !m.championship).map(m => m.pool))];
    pools.forEach((pool, i) => arr.push({ division: div, pool, type: 'individual', tiebreak: true, done: false, court: out.divisionCourts[div] === 'B' ? 'B' : 'A',
      white: `${pool}-tb-w`, red: `${pool}-tb-r`, tiebreakSeries: 1, tiebreakIndex: pools.length - i, origin: 'TIEBREAK', dynamicType: 'INDIVIDUAL_POOL_TIEBREAK' }));
  }
  return out;
}
// The v3.17.20 case: four pools, a quarterfinal template, Pool A's tiebreaks at the end (wrong series order too).
function fourPools() {
  const arr = [];
  for (const pool of ['A', 'B', 'C', 'D']) for (let n = 1; n <= 3; n++) arr.push({ division: 'D', pool, type: 'individual', done: true, white: `${pool}${n}W`, red: `${pool}${n}R`, court: 'A', poolOrder: n - 1 });
  arr.push({ division: 'D', type: 'individual', championship: true, position: 'Quarterfinal', white: 'TBD', red: 'TBD', done: false, templateNode: true, ready: false, court: 'A' });
  arr.push({ division: 'D', pool: 'A', type: 'individual', tiebreak: true, done: false, white: 'A1W', red: 'A2W', court: 'A', tiebreakSeries: 2, tiebreakIndex: 0 });
  arr.push(null);
  arr.push({ division: 'D', pool: 'A', type: 'individual', tiebreak: true, done: false, white: 'A1W', red: 'A3W', court: 'A', tiebreakSeries: 1, tiebreakIndex: 0 });
  return { pools: { D: ['A', 'B', 'C', 'D'].map(label => ({ label })) }, allMatches: { D: arr }, divisionCourts: { D: 'A' },
    courtState: { A: { division: 'D', index: 15 }, B: { division: null, index: 0 } }, courtActiveDivision: { A: 'D', B: null },
    currentDivision: 'D', currentCourt: 'A', current: 15, currentByDivision: { D: 15 }, matches: [] };
}

const goldens = fs.readdirSync(goldenDir).filter(f => f.endsWith('.json')).sort();
const payloads = [['four pools, misplaced tiebreaks and a null', fourPools()], ['empty state', {}], ['no allMatches', { divisions: ['X'], allMatches: null }]];
for (const file of goldens) {
  const st = goldenState(file);
  payloads.push([file, st], [`${file} + invalid entries`, withInvalidEntries(st)], [`${file} + misplaced tiebreaks`, withMisplacedTiebreaks(st)],
    [`${file} + both`, withInvalidEntries(withMisplacedTiebreaks(st))]);
}
// What `state` holds before the load: another tournament, with its own divisions, pointers and court view.
const previous = { ...goldenState(goldens[goldens.length - 1]), regMode: 'team', currentCourt: 'B', publicCourt: 'B', extraOldKey: { x: 1 } };

test(`both orders give the same state and the same console output (${payloads.length} payloads from ${goldens.length} engine goldens)`, () => {
  let repaired = 0, reordered = 0;
  for (const [name, payload] of payloads) {
    const before = oldOrder(previous, clone(payload));
    const after = newOrder(previous, clone(payload));
    assert.equal(after.json, before.json, `${name}: state differs`);
    assert.deepEqual(after.logs, before.logs, `${name}: console output differs`);
    if (before.logs.some(([, a]) => a.includes('State Integrity'))) repaired++;
    if (before.logs.some(([, a]) => a.includes('Tiebreak Order'))) reordered++;
  }
  // The payloads exercise both repairs, not only the no-op path.
  assert.ok(repaired >= goldens.length, `invalid entries were removed in ${repaired} payloads`);
  assert.ok(reordered >= 10, `tiebreaks were moved in ${reordered} payloads`);
});
