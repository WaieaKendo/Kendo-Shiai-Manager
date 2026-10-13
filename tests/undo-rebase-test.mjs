// F30: an Undo or Redo survives a save conflict (HTTP 409 rebase).
//
// Runs the app's rebaseLocalPayloadOnRecord() in a vm on hand-made payloads: a Court A device
// whose save (based on revision 10) meets a newer server copy (another court saved meanwhile).
// The rebase replays this device's court actions and its Undo/Redo log (recordCourtUndoLog(),
// 10-) in the order they happened:
//   * a saved point undone: the point is gone after the rebase, and stays in the Redo stack;
//   * a point undone before it was ever saved: nothing to undo on the server copy;
//   * undo then redo of a saved point, and of an unsaved one: the point is there exactly once;
//   * a redo of a point whose undo was already saved: the point comes back;
//   * an Undo/Redo already in the server copy is not replayed again;
//   * the Undo log itself is merged (both copies' entries, by identity).
// edit-conflicts-test.py races the same through the real app and server (Undo, then Redo).
import vm from 'node:vm';
import { extractFunction, html, engine } from './lib/ksm-source.mjs';

let failed = false, count = 0;
const check = (ok, name) => { count++; if (!ok) { console.log(`FAIL ${name}`); failed = true; } };
const clone = v => JSON.parse(JSON.stringify(v));

// The rebase and the sync helpers it calls (the engine clean-ups and the F4/F10 merges are stubbed below).
const constant = name => html.match(new RegExp(`const ${name}=[^\\n]*`))[0];
const code = [engine, constant('KSM_LOCAL_VIEW_STATE_KEYS'), constant('KSM_UNDO_LOG_LIMIT'),
  ...['normalizeCourt', 'cloneJson', 'isValidMatchObject', 'matchSyncIdentity', 'legacyTiebreakSyncIdentity', 'matchHasSyncIdentity',
    'individualMatchReady', 'matchBelongsToCourtInState', 'nextReadyIndexInState', 'preserveOwnedCourtRuntimeState', 'applyPatchToStateObject',
    'resolveRebasePatch', 'mergeHistoryEntries', 'historyEntryIdentity', 'pendingLocalCourtActionsForRebase', 'undoLogEntryIdentity',
    'pendingLocalUndoLogForRebase', 'replayPendingCourtHistory', 'mergeCourtHistoryStacks', 'rebaseLocalPayloadOnRecord'].map(n => extractFunction(html, n))].join('\n');
const context = {
  console,
  cloudSession: { clientId: 'court-a', court: 'A', revision: 10 },
  state: { currentCourt: 'A' },
  pinnedCourt: () => 'A',
  sanitizeLoadedTournamentState() {}, normalizeAllIndividualPoolTiebreakOrder() {}, repairCompletedMatchResults() {},
  writeCloudDiagnosticsState() {}, showKsmToast() {}, noteMergeConflicts() {}, replayStructuralEdit: () => false, mergeLocalEditsThreeWay: () => [],
};
vm.createContext(context);
vm.runInContext(code, context);
check(typeof context.replayPendingCourtHistory === 'function', 'the rebase replays the Undo log (replayPendingCourtHistory)');

const MISSING = { __ksmMissing: true };
const match = wp => ({ division: 'Open', pool: 'A', white: 'P 1', red: 'P 2', wdojo: '', rdojo: '', done: false, wp, rp: [], type: 'individual', court: 'A' });
const id = context.matchSyncIdentity(match([]));
const t = n => `2026-10-12T10:00:0${n}.000Z`;
// Court action "White K" (the second point of the match when `at` = 1).
const action = (label, at, when, revision, letter = 'K') => ({ format: 'patch-v1', label, court: 'A', when, clientId: 'court-a', revision,
  patches: [{ path: ['allMatches', 'Open', 0, 'wp', at], before: MISSING, after: letter, matchIdentity: id }] });
const K = action('White K', 0, t(1), 10);
const logEntry = (kind, of, when, revision = 10) => ({ format: 'history-op-v1', kind, court: 'A', when, clientId: 'court-a', revision,
  target: [of.clientId, of.when, of.court, of.label].join('|'), label: of.label, patches: clone(of.patches) });
const st = ({ wp, done = [], undone = [], log = [], other = [] }) => ({
  allMatches: { Open: [match(wp)], Kids: [{ ...match(other), division: 'Kids', court: 'B' }] },
  courtState: { A: { division: 'Open', index: 0 }, B: { division: 'Kids', index: 0 } },
  courtActionHistory: { A: clone(done), B: [] }, courtRedoHistory: { A: clone(undone), B: [] }, courtUndoLog: { A: clone(log), B: [] },
});
// Court B's point, saved first: the server copy at revision 11.
const rebase = (local, server) => {
  const out = context.rebaseLocalPayloadOnRecord({ setup: {}, state: local }, { revision: 11, payload: { setup: {}, state: server } }, 10, null);
  check(JSON.stringify(out.state.allMatches.Kids[0].rp) === '[]' && JSON.stringify(out.state.allMatches.Kids[0].wp) === '["M"]', 'Court B\'s point kept');
  return out.state;
};
const wp = s => JSON.stringify(s.allMatches.Open[0].wp);
const labels = list => (list || []).map(e => e.label).join(',');

// 1. A saved K undone; Court B saved first. Before F30 the K came back from the server copy.
let r = rebase(st({ wp: [], undone: [K], log: [logEntry('UNDO', K, t(2))] }), st({ wp: ['K'], done: [K], other: ['M'] }));
check(wp(r) === '[]', `1: the undone K stays undone (${wp(r)})`);
check(labels(r.courtActionHistory.A) === '' && labels(r.courtRedoHistory.A) === 'White K', `1: K in the Redo stack only (${labels(r.courtActionHistory.A)} / ${labels(r.courtRedoHistory.A)})`);
check(r.courtUndoLog.A.length === 1 && r.courtUndoLog.A[0].kind === 'UNDO', '1: the Undo log is saved with it');

// 2. A K undone before it was ever saved: the server copy never had it.
r = rebase(st({ wp: [], undone: [K], log: [logEntry('UNDO', K, t(2))] }), st({ wp: [], other: ['M'] }));
check(wp(r) === '[]', `2: nothing undone on the server copy (${wp(r)})`);

// 3. A saved K undone and redone: there once.
r = rebase(st({ wp: ['K'], done: [K], log: [logEntry('UNDO', K, t(2)), logEntry('REDO', K, t(3))] }), st({ wp: ['K'], done: [K], other: ['M'] }));
check(wp(r) === '["K"]', `3: undo + redo of a saved K: K once (${wp(r)})`);
check(labels(r.courtActionHistory.A) === 'White K' && labels(r.courtRedoHistory.A) === '', '3: K back in the Undo stack');

// 4. An unsaved K undone and redone: there once (replayed as the action, undo and redo cancel).
r = rebase(st({ wp: ['K'], done: [K], log: [logEntry('UNDO', K, t(2)), logEntry('REDO', K, t(3))] }), st({ wp: [], other: ['M'] }));
check(wp(r) === '["K"]', `4: undo + redo of an unsaved K: K once (${wp(r)})`);

// 5. The undo was saved already (server: K undone); the redo is new.
const undoSaved = logEntry('UNDO', K, t(2));
r = rebase(st({ wp: ['K'], done: [K], log: [undoSaved, logEntry('REDO', K, t(3))] }), st({ wp: [], undone: [K], log: [undoSaved], other: ['M'] }));
check(wp(r) === '["K"]', `5: redo after a saved undo: K back (${wp(r)})`);
check(r.courtUndoLog.A.length === 2, '5: both log entries kept once');

// 6. Undo already on the server, then a new point M: the undo is not replayed again.
const M = action('White M', 0, t(4), 11, 'M');
r = rebase(st({ wp: ['M'], done: [M], undone: [K], log: [undoSaved] }), st({ wp: [], undone: [K], log: [undoSaved], other: ['M'] }));
check(wp(r) === '["M"]', `6: a saved undo is not replayed, the new point is (${wp(r)})`);

// 7. A K and an M saved, then Undo M and Undo K (two undos), Court B saved first: both gone, in order.
const M2 = action('White M', 1, t(2), 10, 'M');
r = rebase(st({ wp: [], undone: [M2, K], log: [logEntry('UNDO', M2, t(3)), logEntry('UNDO', K, t(4))] }), st({ wp: ['K', 'M'], done: [K, M2], other: ['M'] }));
check(wp(r) === '[]', `7: two undos replayed in order (${wp(r)})`);

if (failed) process.exit(1);
console.log(`PASS F30 undo/redo through a save conflict: ${count} checks`);
