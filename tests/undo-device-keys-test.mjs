// #15 PR 3 (docs/STORE.md section 2 point 6, section 3 item 3): Undo/Redo stop writing device keys.
//
// applyHistoryPatch() (app/modules/court/court-scoring-and-history.js) skips patches on KSM_LOCAL_VIEW_STATE_KEYS
// (currentCourt, publicCourt, currentDivision, matches, current, score), the set the rebase already skips, and the
// court view is rebuilt after the entry by applyHistoryValues() (applyCourtState() reloads score from the match).
// Entries are still recorded with those patches (historyComparableState() is unchanged), so every entry here is one
// as 4.0 saves it, and the test checks that it carries score / matches / current / currentDivision patches.
//
// Each case runs the app's own performCourtAction() / undo() / redo() / applyCourtState() twice, in two vm contexts:
// one with applyHistoryPatch() / historyPathParent() as they were before this PR (git show of the base commit), one
// with the new code, and compares the whole `state` (tournament data, the court view, the three history stores):
//   * a point, a hansoku, a Next Match, a court division change: Undo, Redo after Undo, Undo again;
//   * Undo after a reload (state from JSON: `matches` no longer the alias), with and without the rehydrate;
//   * Undo after a remote apply (the other court's point arrived in the payload);
//   * the one difference: after the court was switched to another division (not a court action), 4.0 wrote the
//     entry's `matches` patches by index into that other division's matches; now only allMatches is written;
//   * a top-level patch on a key moveToStore() owns (a getter): 4.0 threw (delete / assignment on the getter, strict
//     mode); now it goes through the store (assignState), for a value and for a missing one.
import vm from 'node:vm';
import { extractFunction, html, withDependencies } from './lib/ksm-source.mjs';
import { gitShow } from './lib/git-show.mjs';
import { assignState, moveToStore, storeFieldPath } from '../app/modules/app-state.js';
import { getState } from '../app/store/index.ts';

const BASE = 'f8240cae77b991285f4a5be53620f1076f17c6ea'; // next/4.1 before this PR (#173 merged)
const FILE = 'app/modules/court/court-scoring-and-history.js';
let failed = false, count = 0;
const check = (ok, name) => { count++; if (!ok) { console.log(`FAIL ${name}`); failed = true; } };
const json = v => JSON.stringify(v);

const STUBS = ['applyCourtSides', 'renderAll', 'updateUndoButton', 'updateSaveStatus', 'criticalAutoSave', 'showKsmToast', 'ksmNotifyStateChanged',
  'ksmSignalCourtActions', 'storeFieldPath', 'assignState', 'renderScore', 'renderPools', 'renderProgress', 'renderPublic', 'writeCloudDiagnosticsState', 'KSM_TAB_ID',
  // The court view's store helpers (#15 PR 6): here they write the context's plain `state`; this device is Court A's scorekeeper.
  'ksmSetCurrentCourt', 'ksmSetPublicCourt', 'ksmShowDivision', 'canCloudWrite', 'isTvSession'];
const entry = ['undo', 'redo', 'performCourtAction', 'applyCourtState', 'loadScoreFromMatch'].map(n => extractFunction(html, n)).join('\n');
const newCode = '"use strict";\n' + withDependencies(html, entry, { exclude: STUBS }) + '\nlet ksmLastHistoryOutcome=null,ksmLastHistorySkipped=0;';
const oldSource = gitShow(BASE, FILE);
let oldCode = null;
if (oldSource) {
  oldCode = newCode;
  for (const name of ['applyHistoryPatch', 'historyPathParent']) {
    const now = extractFunction(html, name);
    check(oldCode.includes(now), `${name} is in the code under test`);
    oldCode = oldCode.replace(now, () => extractFunction(oldSource, name));
  }
  check(oldCode !== newCode && !/KSM_LOCAL_VIEW_STATE_KEYS\.has/.test(extractFunction(oldSource, 'applyHistoryPatch')), 'the 4.0 applyHistoryPatch is the old one');
}
check(/KSM_LOCAL_VIEW_STATE_KEYS\.has\(path\[0\]\)/.test(extractFunction(html, 'applyHistoryPatch')), 'applyHistoryPatch skips the rebase\'s device keys (one set, not a copy)');
check((html.match(/new Set\(\['currentCourt','publicCourt','currentDivision','matches','current','score'\]\)/g) || []).length === 1, 'the device keys are defined once');

const FIXED = Date.parse('2026-11-13T10:00:00.000Z');
function makeContext(code) {
  let tick = 0;
  class FixedDate extends Date { constructor(...a) { super(...(a.length ? a : [FIXED + 1000 * tick++])); } static now() { return FIXED + 1000 * tick++; } }
  const context = {
    console, Date: FixedDate, KSM_TAB_ID: 'tab-a', cloudSession: { clientId: 'court-a', court: 'A', revision: 10 },
    window: { dispatchEvent() {} }, Event: class {},
    applyCourtSides() {}, renderAll() {}, updateUndoButton() {}, updateSaveStatus() {}, criticalAutoSave() {}, showKsmToast() {}, ksmNotifyStateChanged() {},
    ksmSignalCourtActions() {}, renderScore() {}, renderPools() {}, renderProgress() {}, renderPublic() {}, writeCloudDiagnosticsState() {},
    storeFieldPath: () => null, assignState() { throw new Error('no store-owned key in this case'); },
    canCloudWrite: () => true, isTvSession: () => false,
    ksmSetCurrentCourt(c) { context.state.currentCourt = c; }, ksmSetPublicCourt(c) { context.state.publicCourt = c; }, ksmShowDivision(d) { context.state.currentDivision = d; },
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

// A tournament: Open on Court A (three bouts), Kids on Court B (two bouts, one point already).
const bout = (division, n, court, wp = []) => ({ division, pool: 'A', white: `${division} ${n}`, red: `${division} ${n + 1}`, wdojo: '', rdojo: '', done: false, wp, rp: [], wt: 0, rt: 0, type: 'individual', court });
function tournament() {
  const allMatches = { Open: [bout('Open', 1, 'A'), bout('Open', 3, 'A'), bout('Open', 5, 'A')], Kids: [bout('Kids', 1, 'B', ['M']), bout('Kids', 3, 'B')] };
  return {
    divisions: ['Open', 'Kids'], divisionCourts: { Open: 'A', Kids: 'B' }, allMatches,
    courtState: { A: { division: 'Open', index: 0 }, B: { division: 'Kids', index: 0 } }, courtActiveDivision: { A: 'Open', B: 'Kids' }, currentByDivision: { Open: 0, Kids: 0 },
    matches: allMatches.Open, current: 0, score: { W: [], R: [], WT: 0, RT: 0 }, history: [], currentDivision: 'Open', currentCourt: 'A', publicCourt: 'A',
    courtActionHistory: { A: [], B: [] }, courtRedoHistory: { A: [], B: [] },
  };
}
// The court actions as the app does them (point(), hansoku(), nextMatch()'s state effect, a division chosen on the court).
const ACTIONS = {
  point: c => c.performCourtAction('White K', () => { c.state.score.W.push('K'); const m = c.state.matches[c.state.current]; m.wp = [...c.state.score.W]; }),
  point2: c => c.performCourtAction('Red M', () => { c.state.score.R.push('M'); const m = c.state.matches[c.state.current]; m.rp = [...c.state.score.R]; }),
  hansoku: c => c.performCourtAction('Red Hansoku', () => { c.state.score.RT++; c.state.matches[c.state.current].rt = c.state.score.RT; }),
  next: c => c.performCourtAction('Next Match', () => {
    const m = c.state.matches[c.state.current]; m.wp = [...c.state.score.W]; m.rp = [...c.state.score.R]; m.done = true;
    c.applyCourtState('A', { division: c.state.currentDivision, index: c.state.current + 1 }, false);
  }),
  toKids: c => c.performCourtAction('Court A: Kids', () => c.applyCourtState('A', { division: 'Kids', index: 1 }, true)),
};
/** Runs `steps` (names of ACTIONS, 'undo', 'redo', or functions of the context) on a fresh tournament in `code`'s context. */
function run(code, steps) {
  const c = makeContext(code);
  c.state = tournament();
  const errors = [];
  for (const step of steps) {
    try {
      if (typeof step === 'function') step(c);
      else if (step === 'undo' || step === 'redo') c[step]();
      else ACTIONS[step](c);
    } catch (e) { errors.push(`${typeof step === 'string' ? step : 'step'}: ${e.message}`); }
  }
  return { c, state: c.state, errors };
}
// The functions read the context's global `state` (c.state).
const NEW = newCode, OLD = oldCode;

/** The device-key paths an entry's patches touch. */
const deviceKeysOf = e => [...new Set(e.patches.map(p => p.path[0]).filter(k => ['score', 'matches', 'current', 'currentDivision', 'currentCourt', 'publicCourt'].includes(k)))].sort();
// A reload: the state from its JSON (matches is a copy, no longer the alias), then the rehydrate (applyCourtState) or not.
const reload = rehydrate => c => {
  const loaded = JSON.parse(JSON.stringify(c.state));
  for (const k of Object.keys(c.state)) delete c.state[k];
  Object.assign(c.state, loaded);
  if (rehydrate) c.applyCourtState(c.state.currentCourt, c.state.courtState[c.state.currentCourt], true);
};
// A remote apply: the other court's point on Kids arrives in the payload (this court's histories come with it).
const remoteApply = c => {
  const loaded = JSON.parse(JSON.stringify(c.state));
  loaded.allMatches.Kids[0].wp.push('D');
  for (const k of Object.keys(c.state)) delete c.state[k];
  Object.assign(c.state, loaded);
  c.applyCourtState('A', c.state.courtState.A, true);
};

// 1. The entries carry device-key patches, as 4.0 saves them.
{
  const { state } = run(NEW, ['point', 'hansoku', 'next', 'toKids']);
  const [p, h, n, k] = state.courtActionHistory.A;
  check(json(deviceKeysOf(p)) === json(['matches', 'score']), `a point records score and matches patches (${deviceKeysOf(p)})`);
  check(json(deviceKeysOf(h)) === json(['matches', 'score']), `a hansoku records score and matches patches (${deviceKeysOf(h)})`);
  check(json(deviceKeysOf(n)) === json(['current', 'matches', 'score']), `a Next Match records current, matches and score patches (${deviceKeysOf(n)})`);
  check(json(deviceKeysOf(k)) === json(['currentDivision', 'matches']), `a division change records currentDivision and matches patches (${deviceKeysOf(k)})`);
}

// 2. The same result as before this PR: tournament data, court view, histories and the Undo log.
const CASES = {
  'point: undo': ['point', 'undo'],
  'point: undo, redo': ['point', 'undo', 'redo'],
  'two points: undo, undo, redo, redo': ['point', 'point2', 'undo', 'undo', 'redo', 'redo'],
  'hansoku: undo, redo, undo': ['hansoku', 'undo', 'redo', 'undo'],
  'Next Match: undo': ['point', 'next', 'undo'],
  'Next Match: undo, redo': ['point', 'next', 'undo', 'redo'],
  'Next Match: undo, undo (the point too), redo, redo': ['point', 'next', 'undo', 'undo', 'redo', 'redo'],
  'undo after a reload (rehydrated)': ['point', 'next', 'point2', reload(true), 'undo', 'undo', 'redo'],
  'undo after a reload (not rehydrated: matches is a copy)': ['point', 'next', reload(false), 'undo', 'redo'],
  'undo after a remote apply': ['point', 'point2', remoteApply, 'undo', 'redo', 'undo', 'undo'],
  'redo after undo after a remote apply': ['point', 'next', 'undo', remoteApply, 'redo'],
};
if (OLD) {
  for (const [name, steps] of Object.entries(CASES)) {
    const before = run(OLD, steps), after = run(NEW, steps);
    check(!before.errors.length && !after.errors.length, `${name}: no error (${[...before.errors, ...after.errors].join('; ')})`);
    check(json(after.state) === json(before.state), `${name}: the same state as before this PR\n  before: ${json(before.state)}\n  after:  ${json(after.state)}`);
    check(after.state.matches === after.state.allMatches[after.state.currentDivision], `${name}: matches is the alias of the court's division`);
  }
}
// The same results, spelled out (so the check does not depend on the old code alone).
{
  let { state } = run(NEW, ['point', 'undo']);
  check(json(state.allMatches.Open[0].wp) === '[]' && json(state.score.W) === '[]', 'point undone: gone from the match and the score pad');
  ({ state } = run(NEW, ['point', 'undo', 'redo']));
  check(json(state.allMatches.Open[0].wp) === '["K"]' && json(state.score.W) === '["K"]', 'point redone: back in the match and the score pad');
  ({ state } = run(NEW, ['point', 'next', 'undo']));
  check(state.current === 0 && state.courtState.A.index === 0 && !state.allMatches.Open[0].done && json(state.score.W) === '["K"]', 'Next Match undone: the court is back on bout 1 with its K');
  ({ state } = run(NEW, ['point', 'toKids', 'undo']));
  check(state.currentDivision === 'Open' && state.matches === state.allMatches.Open && json(state.score.W) === '["K"]', 'division change undone: Open again, with its score');
  ({ state } = run(NEW, ['point', 'point2', remoteApply, 'undo']));
  check(json(state.allMatches.Kids[0].wp) === '["M","D"]' && json(state.allMatches.Open[0].rp) === '[]' && json(state.allMatches.Open[0].wp) === '["K"]', 'undo after a remote apply keeps the other court\'s point');
}

// 3. The one difference: the court was switched to Kids (a view choice, not a court action), then the Open point undone.
{
  const view = c => c.applyCourtState('A', { division: 'Kids', index: 0 }, true);
  const after = run(NEW, ['point', view, 'undo']);
  check(json(after.state.allMatches.Open[0].wp) === '[]', 'switched division: the Open point is undone');
  check(json(after.state.allMatches.Kids[0].wp) === '["M"]', `switched division: Kids is untouched (${json(after.state.allMatches.Kids[0].wp)})`);
  check(json(after.state.score.W) === '["M"]' && after.state.currentDivision === 'Kids', 'switched division: the court still shows Kids with its score');
  // A court action that changes the court's division (not reachable through Next Match, which stays in its division,
  // but an entry can hold it): 4.0's Undo wrote the Open list into Kids by index (matches was the alias of Kids), and
  // its Redo wrote Kids into Open. Now both lists stay as they are and only the court view moves.
  const moved = run(NEW, ['point', 'toKids', 'undo', 'redo', 'undo']);
  check(!moved.errors.length && moved.state.allMatches.Open.every(m => m.division === 'Open') && moved.state.allMatches.Kids.every(m => m.division === 'Kids'), 'division change undone and redone: both match lists intact');
  check(moved.state.currentDivision === 'Open' && moved.state.matches === moved.state.allMatches.Open && json(moved.state.score.W) === '["K"]', 'division change undone: the court shows Open with its K');
  if (OLD) {
    const was = run(OLD, ['point', 'toKids', 'undo']);
    check(was.state.allMatches.Kids.some(m => m.division === 'Open'), '4.0 wrote Open\'s bouts into Kids on the Undo of a division change; this PR fixes that');
    const before = run(OLD, ['point', view, 'undo']);
    check(json(before.state.allMatches.Kids[0].wp) === '[]', `4.0 wrote the Open entry's matches patch into Kids (${json(before.state.allMatches.Kids[0].wp)}); this PR fixes that`);
  }
}

// 4. A top-level patch on a store-owned key (a getter, as moveToStore() makes it): through the store, never delete/assign.
{
  const storeContext = code => {
    const c = makeContext(code);
    c.state = tournament();
    c.storeFieldPath = storeFieldPath;
    c.assignState = assignState;
    return c;
  };
  const MISSING = { __ksmMissing: true };
  const probe = { at: Date.now() };
  const fixture = (key) => ({ format: 'patch-v1', label: 'Probe', court: 'A', when: '2026-11-13T10:00:00.000Z', clientId: 'court-a', revision: 10,
    patches: [{ path: [key], before: MISSING, after: probe }, { path: ['allMatches', 'Open', 0, 'wp', 0], before: MISSING, after: 'K' }] });
  const c = storeContext(newCode);
  moveToStore('undoProbe', ['tournament', 'undoProbe'], c.state);
  c.state.courtRedoHistory.A.push(fixture('undoProbe'));
  let error = null;
  try { c.redo(); } catch (e) { error = e; }
  check(!error, `redo of a store-owned top-level key: no throw (${error?.message})`);
  check(json(getState().tournament.undoProbe) === json(probe) && json(c.state.undoProbe) === json(probe), 'redo: the value went through the store');
  check(json(c.state.allMatches.Open[0].wp) === '["K"]', 'redo: the rest of the entry applied');
  error = null;
  try { c.undo(); } catch (e) { error = e; }
  check(!error, `undo (a missing value, today a delete) of a store-owned top-level key: no throw (${error?.message})`);
  check(getState().tournament.undoProbe === undefined && c.state.undoProbe === undefined && Object.hasOwn(c.state, 'undoProbe'), 'undo: the store holds undefined, the getter stays');
  check(json(c.state.allMatches.Open[0].wp) === '[]', 'undo: the rest of the entry applied');
  // A nested path under a store-owned key that is missing: the empty parent is created through the store too.
  moveToStore('undoProbeParent', ['tournament', 'undoProbeParent'], c.state);
  let created = null;
  try { vm.runInContext('historyPathParent(["undoProbeParent","x"])', c); created = getState().tournament.undoProbeParent; } catch (e) { error = e; }
  check(json(created) === '{}', `a missing store-owned parent is created through the store (${error?.message || json(created)})`);
  if (OLD) {
    const o = storeContext(oldCode);
    moveToStore('undoProbeOld', ['tournament', 'undoProbeOld'], o.state);
    o.state.courtRedoHistory.A.push(fixture('undoProbeOld'));
    let threw = null;
    try { o.redo(); } catch (e) { threw = e; }
    check(threw instanceof TypeError, `4.0 threw on a store-owned top-level key in strict mode (${threw})`);
  }
}

if (failed) process.exit(1);
console.log(`PASS undo/redo without device keys: ${count} checks${OLD ? '' : ' (4.0 comparison skipped)'}`);
