// #15 PR 7 (docs/STORE.md section 3 item 7): state.matches is derived (allMatches[currentDivision], the live list),
// state.current is this device's shown index (device/matchShown) and state.score its court's pad (device/scoreChanged).
// Every writer that assigned them before now calls a helper (ksmShowMatch(), ksmSetScore()) or nothing.
//
// Each role runs the app's own court functions twice, in two vm contexts: with the writers as #180 merged them (git show
// of PR6 below: applyCourtState(), setActiveDivision(), ensureScorableCurrentMatch(), loadScoreFromMatch(), point(),
// hansoku(), fusen(), enforceUniqueIndividualMatches(), syncOwnCourtPointer()), on a plain `state` whose `matches` is a
// plain property they assign, and with the new code on a `state` whose `matches` is derived (tests/lib/derived-matches.mjs).
// After every step it compares what the court screen shows (division, current, score, the list `matches` holds) and the
// tournament data (allMatches, the court pointers), and checks that `matches` is the live list of the shown division.
// Roles: Court A's scorekeeper (points, hansoku, fusen, Next Match with a tiebreak list rebuilt, Undo, Redo, a division
// picked), a director pinned to Court A picking Court B's division and drawing Court B, a TV following Court B, a
// spectator pinned to Court B.
import vm from 'node:vm';
import { extractFunction, html, withDependencies } from './lib/ksm-source.mjs';
import { gitShow } from './lib/git-show.mjs';
import { deriveMatches, viewHelpers } from './lib/derived-matches.mjs';

const PR6 = '37b48d0'; // next/4.1 before this PR (#180 merged)
const CHANGED = {
  'app/modules/court/court-match-order.js': ['applyCourtState', 'syncOwnCourtPointer'],
  'app/modules/court/scorekeeper-screen.js': ['ensureScorableCurrentMatch'],
  'app/modules/court/court-scoring-and-history.js': ['loadScoreFromMatch', 'point', 'hansoku', 'fusen'],
  'app/modules/engine/engine-generation.js': ['setActiveDivision'],
  'app/modules/engine/engine-championship.js': ['enforceUniqueIndividualMatches'],
};
let failed = false, count = 0;
const check = (ok, name) => { count++; if (!ok) { console.log(`FAIL ${name}`); failed = true; } };
const json = v => JSON.stringify(v);

const STUBS = ['renderDivisions', 'renderScore', 'renderPools', 'renderProgress', 'renderContext', 'renderPublic', 'renderAll', 'renderQueue', 'applyCourtSides',
  'criticalAutoSave', 'scheduleAutoSave', 'updateUndoButton', 'updateSaveStatus', 'showKsmToast', 'ksmNotifyStateChanged', 'ksmSignalCourtActions', 'ksmSignalCourtHeader',
  'ksmSignalCourtScoreboard', 'setCourtCompletePresentation', 'divisionComplete', 'writeCloudDiagnosticsState', 'KSM_TAB_ID', 'storeFieldPath', 'assignState',
  'isReadOnlySession', 'canCloudWrite', 'isTvSession', 'ksmSetCurrentCourt', 'ksmSetPublicCourt', 'ksmShowDivision', 'setLocalCourtDivision', 'ksmLocalCourtDivision',
  'pinCourtLocally', 'localCourtDivision', 'rememberLocalCourtDivision', 'show', 'alert', 'maybeCreateTiebreaks', 'maybeCreateTeamTiebreak', 'maybeCreateKachinukiNext',
  'maybeAdvanceTeamBracket', 'maybeCreateChampionship', 'maybeAdvanceChampionship', 'maybeAdvanceIndividualSingleElim', 'completedResultSnapshot', 'cloudSession',
  'ksmShowMatch', 'ksmSetScore', 'ksmEmptyScore', 'ksmResetCourtPads'];
const ENTRY = ['openCourt', 'applyCourtState', 'setActiveDivision', 'selectScorekeeperDivision', 'courtCurrentMatch', 'ensureScorableCurrentMatch', 'syncOwnCourtPointer',
  'point', 'hansoku', 'fusen', 'nextMatch', 'undo', 'redo', 'performCourtAction'];
const newCode = '"use strict";\n' + withDependencies(html, ENTRY.map(n => extractFunction(html, n)).join('\n'), { exclude: STUBS }) + '\nlet ksmLastHistoryOutcome=null,ksmLastHistorySkipped=0;';
let oldCode = newCode;
for (const [file, names] of Object.entries(CHANGED)) {
  const source = gitShow(PR6, file);
  if (!source) { oldCode = null; break; }
  for (const name of names) {
    const now = extractFunction(html, name);
    check(oldCode.includes(now), `${name} is in the code under test`);
    oldCode = oldCode.replace(now, () => extractFunction(source, name));
  }
}
if (!oldCode) {
  console.error(`\n*** SKIP: ${PR6} is not in this clone (shallow?): the before/after comparisons of this test are NOT run. ***\n`);
  if (process.env.CI) { console.log('FAIL the base commit is missing on CI (checkout needs fetch-depth: 0)'); process.exit(1); }
}
check(!/state\.(matches|current|score)\s*=[^=]/.test(newCode), 'the new code never assigns state.matches, state.current or state.score');

const FIXED = Date.parse('2026-11-14T10:00:00.000Z');
const bout = (division, n, court, extra = {}) => ({ division, pool: 'A', white: `${division} ${n}`, red: `${division} ${n + 1}`, wdojo: '', rdojo: '', done: false, wp: [], rp: [], wt: 0, rt: 0, type: 'individual', court, poolOrder: n, ...extra });
// Open on Court A (bout 2 has a men already), Kids (bout 1 done) and Juniors on Court B. Court B runs Kids bout 2.
function tournament() {
  const allMatches = {
    Open: [bout('Open', 1, 'A'), bout('Open', 3, 'A', { wp: ['M'] }), bout('Open', 5, 'A')],
    Kids: [bout('Kids', 1, 'B', { done: true }), bout('Kids', 3, 'B', { rp: ['K'] }), bout('Kids', 5, 'B')],
    Juniors: [bout('Juniors', 1, 'B'), bout('Juniors', 3, 'B')],
  };
  return {
    divisions: ['Open', 'Kids', 'Juniors'], divisionTypes: {}, divisionCourts: { Open: 'A', Kids: 'B', Juniors: 'B' }, allMatches, teams: [], competitors: [],
    courtState: { A: { division: 'Open', index: 0 }, B: { division: 'Kids', index: 1 } }, courtActiveDivision: { A: 'Open', B: 'Kids' },
    currentByDivision: { Open: 0, Kids: 1 }, history: [], matches: allMatches.Open, current: 0, score: { W: [], R: [], WT: 0, RT: 0 },
    currentDivision: 'Open', currentCourt: 'A', publicCourt: 'A', courtActionHistory: { A: [], B: [] }, courtRedoHistory: { A: [], B: [] },
  };
}
function device(code, derived, { staff = true, tv = false, court = 'A' }) {
  const local = { A: null, B: null };
  let tick = 0;
  class FixedDate extends Date { constructor(...a) { super(...(a.length ? a : [FIXED + 1000 * tick++])); } static now() { return FIXED + 1000 * tick++; } }
  const context = {
    console, Date: FixedDate, window: { dispatchEvent() {} }, Event: class {}, KSM_TAB_ID: 'tab', cloudSession: { clientId: 'dev', court, revision: 1 }, ksmLocalCourtDivision: local,
    renderDivisions() {}, renderScore() {}, renderPools() {}, renderProgress() {}, renderContext() {}, renderPublic() {}, renderAll() {}, renderQueue() {}, applyCourtSides() {},
    criticalAutoSave() {}, scheduleAutoSave() {}, updateUndoButton() {}, updateSaveStatus() {}, showKsmToast() {}, ksmNotifyStateChanged() {}, ksmSignalCourtActions() {},
    ksmSignalCourtHeader() {}, ksmSignalCourtScoreboard() {}, setCourtCompletePresentation() {}, divisionComplete: () => false, writeCloudDiagnosticsState() {}, alert() {},
    storeFieldPath: () => null, assignState() { throw new Error('no store-owned key here'); }, show() {},
    isReadOnlySession: () => !staff, canCloudWrite: () => staff, isTvSession: () => tv, pinCourtLocally: c => c,
    localCourtDivision: c => local[c], rememberLocalCourtDivision(c, d) { local[c] = d; }, setLocalCourtDivision(c, d) { local[c] = d; },
    ksmSetCurrentCourt(c) { context.state.currentCourt = c; }, ksmSetPublicCourt(c) { context.state.publicCourt = c; }, ksmShowDivision(d) { context.state.currentDivision = d; },
    maybeCreateTiebreaks() {}, maybeCreateTeamTiebreak() {}, maybeCreateKachinukiNext() {}, maybeAdvanceTeamBracket() {}, maybeCreateChampionship() {}, maybeAdvanceChampionship() {},
    maybeAdvanceIndividualSingleElim() {}, completedResultSnapshot: m => ({ winner: m.wp.length > m.rp.length ? m.white : m.wp.length < m.rp.length ? m.red : 'Hikiwake', wp: [...m.wp], rp: [...m.rp] }),
  };
  Object.assign(context, viewHelpers(context));
  vm.createContext(context);
  vm.runInContext(code, context);
  context.state = tournament();
  context.state.currentCourt = court;
  if (derived) deriveMatches(context.state);
  return context;
}
/** What the court screen shows and the tournament data, after a step. */
const view = s => ({ court: s.currentCourt, division: s.currentDivision, current: s.current, score: s.score, matches: s.matches });
const data = s => ({ allMatches: s.allMatches, courtState: s.courtState, courtActiveDivision: s.courtActiveDivision, currentByDivision: s.currentByDivision });

const ROLES = {
  'Court A\'s scorekeeper': [{ court: 'A' }, [
    d => d.openCourt('A'), d => d.point('W', 'M'), d => d.hansoku('R'), d => d.hansoku('R'), d => d.point('R', 'K'), d => d.point('W', 'K'), d => d.nextMatch(),
    d => d.point('W', 'D'), d => d.fusen('W'), d => d.undo(), d => d.undo(), d => d.redo(), d => d.nextMatch(), d => d.ensureScorableCurrentMatch(),
    d => d.setActiveDivision('Open'), d => d.syncOwnCourtPointer()]],
  'Court B\'s scorekeeper (a division picked, the pad on a started bout)': [{ court: 'B' }, [
    d => d.openCourt('B'), d => d.point('W', 'T'), d => d.selectScorekeeperDivision('Juniors'), d => d.point('R', 'M'), d => d.selectScorekeeperDivision('Kids'), d => d.nextMatch()]],
  'director pinned to Court A viewing Court B\'s division': [{ court: 'A' }, [
    d => d.openCourt('A'), d => d.point('W', 'M'), d => d.setActiveDivision('Kids'), d => d.courtCurrentMatch('B'), d => d.ensureScorableCurrentMatch(),
    d => { d.state.allMatches.Kids[1].done = true; }, d => d.courtCurrentMatch('B'), d => d.ensureScorableCurrentMatch(), d => d.setActiveDivision('Open')]],
  'TV following Court B': [{ staff: false, tv: true, court: 'B' }, [
    d => d.applyCourtState('B', d.state.courtState.B, true), d => d.courtCurrentMatch('B'),
    // Court B's scorekeeper finished bout 2 and moved on (arriving in a payload): the TV follows the pointer.
    d => { d.state.allMatches.Kids[1].done = true; d.state.courtState.B = { division: 'Kids', index: 2 }; }, d => d.applyCourtState('B', d.state.courtState.B, true),
    d => d.ensureScorableCurrentMatch(), d => d.setActiveDivision('Juniors')]],
  'spectator pinned to Court B': [{ staff: false, court: 'B' }, [
    d => d.openCourt('B'), d => d.setActiveDivision('Juniors'), d => d.ensureScorableCurrentMatch(), d => d.selectScorekeeperDivision('Kids'), d => d.courtCurrentMatch('B')]],
};
for (const [role, [opts, steps]] of Object.entries(ROLES)) {
  const after = device(newCode, true, opts), before = oldCode && device(oldCode, false, opts);
  steps.forEach((step, i) => {
    const label = `${role}, step ${i + 1}`;
    let error = null;
    try { step(after); } catch (e) { error = e; }
    check(!error, `${label}: no error (${error?.stack})`);
    const s = after.state;
    check(s.matches === (s.allMatches[s.currentDivision] || s.matches) && Array.isArray(s.matches), `${label}: state.matches is the live list of the shown division`);
    if (!before) return;
    step(before);
    check(json(view(s)) === json(view(before.state)), `${label}: the court screen shows what it showed before PR 7\n  before: ${json(view(before.state))}\n  after:  ${json(view(s))}`);
    check(json(data(s)) === json(data(before.state)), `${label}: the tournament data is what it was before PR 7\n  before: ${json(data(before.state))}\n  after:  ${json(data(s))}`);
    check(json(s.courtActionHistory) === json(before.state.courtActionHistory) && json(s.courtRedoHistory) === json(before.state.courtRedoHistory),
      `${label}: the Undo/Redo entries are recorded as before (matches, current and score patches included)\n  before: ${json(before.state.courtActionHistory)}\n  after:  ${json(s.courtActionHistory)}`);
  });
}
// In-place writes through state.matches land in allMatches (the same array object, never a copy).
{
  const d = device(newCode, true, { court: 'A' });
  d.openCourt('A');
  const list = d.state.allMatches.Open;
  d.state.matches[1].wp = ['K', 'K'];
  d.state.matches.push(bout('Open', 7, 'A'));
  check(d.state.matches === list && list[1].wp.length === 2 && list.length === 4, 'a write through state.matches[i] and a push land in allMatches.Open');
  d.state.allMatches.Open = [...list].reverse();
  check(d.state.matches === d.state.allMatches.Open, 'a replaced list (a sort, a tiebreak repair) is followed at once');
  d.setActiveDivision('Kids');
  check(d.state.matches === d.state.allMatches.Kids, 'a division shown: its list');
  delete d.state.allMatches.Kids;
  check(Array.isArray(d.state.matches) && d.state.matches.length === 0, 'a division with no list: []');
}

if (failed) process.exit(1);
console.log(`PASS derived court view: matches / current / score as before PR 7 for every role: ${count} checks`);
