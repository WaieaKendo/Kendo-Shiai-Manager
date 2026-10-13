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
//   * the Undo log itself is merged (both copies' entries, by identity);
//   * external PR #33 review: Redo twice after two Undos brings back both points (the Redo stack
//     keeps this device's Undo order); an entry this device took off its stacks is not offered again.
//   * external PR #33 review: Undo of a Next Match that inserted a playoff in the middle of the
//     list removes the playoff (also when the server's list has shifted), Redo puts it back once;
//     the action and the Undo/Redo are pressed through the app's own performCourtAction()/undo()/redo();
//   * found with it: a pending Next Match that inserted a playoff (also a Redo of it after a saved
//     Undo, which the rebase replays as the action) keeps the other court's point on the last bout.
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
    'pendingLocalUndoLogForRebase', 'replayPendingCourtHistory', 'replayCourtMatchOps', 'mergeCourtHistoryStacks', 'rebaseLocalPayloadOnRecord',
    'isIndividualPoolTiebreakMatch', 'reindexPointersAfterMatchReorder', 'normalizeIndividualPoolTiebreakOrderInState', 'normalizeAllIndividualPoolTiebreakOrder',
    // the court's own actions and Undo/Redo (10-), to press them on the device's copy and the rebased copy
    'historyPathParent', 'applyHistoryPatch', 'cloneHistoryValue', 'historyComparableState', 'historyValuesEqual', 'buildHistoryPatches',
    'currentHistoryCourt', 'stampHistoryPatchMatchIdentity', 'ensureCourtHistory', 'performCourtAction', 'applyHistoryValues',
    'courtUndoMatchesBefore', 'courtUndoMatchOps', 'withCourtMatchOps', 'recordCourtUndoLog', 'undo', 'redo'].map(n => extractFunction(html, n))].join('\n')
  + ['KSM_HISTORY_LIMIT', 'KSM_HISTORY_KEYS', 'KSM_HISTORY_MISSING'].map(constant).join('\n');
const context = {
  console,
  cloudSession: { clientId: 'court-a', court: 'A', revision: 10 },
  state: { currentCourt: 'A' },
  pinnedCourt: () => 'A',
  sanitizeLoadedTournamentState() {}, repairCompletedMatchResults() {},
  // the screen side of undo()/redo() (10-)
  applyCourtState() {}, renderAll() {}, updateUndoButton() {}, updateSaveStatus() {}, criticalAutoSave() {},
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

// Undo / Redo pressed on the rebased copy, as undo()/redo() in 10- do (the stack's last entry, its patches applied).
const press = (s, kind) => {
  context.state = s;
  const action = (kind === 'REDO' ? s.courtRedoHistory : s.courtActionHistory).A.pop();
  if (!action) return;
  if (kind === 'REDO') { action.patches.forEach(p => context.applyHistoryPatch(p, 'after')); s.courtActionHistory.A.push(action); }
  else { [...action.patches].reverse().forEach(p => context.applyHistoryPatch(p, 'before')); s.courtRedoHistory.A.push(action); }
};

// 8. External review of PR #33: K then M scored and saved, Undo twice (M, then K), the save meets a
// conflict, then Redo twice: K and M come back in that order. The Redo stack is a stack in Undo
// order (the last undone on top), not in the order the points were scored: sorting it by the
// action time put M on top, so the first Redo wrote M at index 1 of an empty list (index 0) and
// the second Redo's K overwrote it.
r = rebase(st({ wp: [], undone: [M2, K], log: [logEntry('UNDO', M2, t(3)), logEntry('UNDO', K, t(4))] }), st({ wp: ['K', 'M'], done: [K, M2], other: ['M'] }));
check(labels(r.courtRedoHistory.A) === 'White M,White K', `8: the Redo stack keeps this device's Undo order (${labels(r.courtRedoHistory.A)})`);
press(r, 'REDO'); press(r, 'REDO');
check(wp(r) === '["K","M"]', `8: Redo twice after the conflict brings back K and M (${wp(r)})`);
check(labels(r.courtActionHistory.A) === 'White K,White M' && labels(r.courtRedoHistory.A) === '', `8: both back in the Undo stack (${labels(r.courtActionHistory.A)})`);
press(r, 'UNDO'); press(r, 'UNDO');
check(wp(r) === '[]', `8: and Undo twice takes both away again (${wp(r)})`);

// 9. Interleaved: K and M saved, Undo M, Undo K, Redo K (unsaved), conflict, Redo M: K then M.
r = rebase(st({ wp: ['K'], done: [K], undone: [M2], log: [logEntry('UNDO', M2, t(3)), logEntry('UNDO', K, t(4)), logEntry('REDO', K, t(5))] }),
  st({ wp: ['K', 'M'], done: [K, M2], other: ['M'] }));
check(wp(r) === '["K"]' && labels(r.courtActionHistory.A) === 'White K' && labels(r.courtRedoHistory.A) === 'White M', `9: K redone, M still undone (${wp(r)})`);
press(r, 'REDO');
check(wp(r) === '["K","M"]', `9: Redo M after the conflict (${wp(r)})`);

// 10. The Undo stack: a saved K undone, then a new point M (which empties the Redo stack), conflict.
// The server copy still lists K in its Undo stack (its last save had it), but this device undid it:
// K must not be offered for Undo again (a second Undo would take away the M at index 0).
const Mnew = action('White M', 0, t(3), 10, 'M');
r = rebase(st({ wp: ['M'], done: [Mnew], log: [logEntry('UNDO', K, t(2))] }), st({ wp: ['K'], done: [K], other: ['M'] }));
check(wp(r) === '["M"]', `10: K undone, M scored (${wp(r)})`);
check(labels(r.courtActionHistory.A) === 'White M' && labels(r.courtRedoHistory.A) === '', `10: only M offered for Undo, nothing for Redo (${labels(r.courtActionHistory.A)} / ${labels(r.courtRedoHistory.A)})`);
press(r, 'UNDO'); press(r, 'UNDO');
check(wp(r) === '[]' && labels(r.courtRedoHistory.A) === 'White M', `10: Undo twice: M undone, nothing else (${wp(r)} / ${labels(r.courtRedoHistory.A)})`);

// 11. Another device's entries for the same court (a replaced tablet) stay offered: below this
// device's Redo entries (a Redo first redoes this device's last Undo), by time in the Undo stack.
const other = { ...action('White D', 0, t(0), 9, 'D'), clientId: 'old-tablet' };
r = rebase(st({ wp: [], undone: [M2, K], log: [logEntry('UNDO', M2, t(3)), logEntry('UNDO', K, t(4))] }),
  st({ wp: ['K', 'M'], done: [K, M2], undone: [other], other: ['M'] }));
check(labels(r.courtRedoHistory.A) === 'White D,White M,White K', `11: the other device's Redo entry below this device's (${labels(r.courtRedoHistory.A)})`);

// 12. External review of PR #33: Undo of a Next Match that created a playoff. Division Open is split:
// pool A on Court A, pool B on Court B, in that order in the match list. Court A's Next Match ends
// pool A in a tie, so the playoff (a pool tiebreak) is inserted after pool A's last bout, in the
// middle of the list. It is saved; Court A presses Undo while Court B scores and saves first.
// After the rebase the server copy must be the list before the Next Match plus Court B's point:
// pool A's last bout open again and no playoff. Before the fix the action's index patches were
// replayed backwards by match identity: the playoff stayed (its fields overwritten by pool B's
// first bout), pool B's last bout was removed and its first bout got the last one's values.
const bout = (pool, order, white, red, court, extra = {}) => ({ division: 'Open', pool, poolOrder: order, whitePoolSlot: 'A', redPoolSlot: 'B',
  white, red, wdojo: '', rdojo: '', done: false, wp: [], rp: [], type: 'individual', court, ...extra });
const playoff = (pool, white, red, court) => {
  const m = bout(pool, 0, white, red, court, { tiebreak: true, tiebreakSeries: 1, tiebreakIndex: 0, requiresWinner: true, origin: 'TIEBREAK', dynamicType: 'INDIVIDUAL_POOL_TIEBREAK' });
  delete m.poolOrder; return m;
};
const deviceState = matches => ({ currentCourt: 'A', allMatches: { Open: matches, Kids: [{ ...match([]), division: 'Kids', court: 'B' }] },
  courtState: { A: { division: 'Open', index: 1 }, B: { division: 'Open', index: 2 } }, courtActiveDivision: { A: 'Open', B: 'Open' }, currentByDivision: { Open: 1 },
  courtActionHistory: { A: [], B: [] }, courtRedoHistory: { A: [], B: [] }, courtUndoLog: { A: [], B: [] } });
// Court A's Next Match on pool A's last bout (index `at`): the bout done, the playoff inserted after it.
const nextMatchWithPlayoff = (s, at, tb) => {
  context.state = s;
  context.performCourtAction('Next Match: A 3 vs A 4', () => {
    const m = s.allMatches.Open[at];
    m.done = true; m.completedResult = { winner: '', hikiwake: true };
    s.allMatches.Open.splice(at + 1, 0, clone(tb));
    s.courtState.A = { division: 'Open', index: at + 1 }; s.currentByDivision.Open = at + 1;
  });
};
const describe = s => s.allMatches.Open.map(m => `${m.tiebreak ? 'playoff ' : ''}${m.white}-${m.red}${m.done ? ' done' : ''}${m.wp.length ? ' ' + m.wp.join('') : ''}`).join(', ');
const rebaseOnto = (local, server) => context.rebaseLocalPayloadOnRecord({ setup: {}, state: local }, { revision: 11, payload: { setup: {}, state: server } }, 10, null).state;
const poolA = () => [bout('A', 0, 'A 1', 'A 2', 'A', { done: true, wp: ['M'] }), bout('A', 1, 'A 3', 'A 4', 'A')];
const poolB = () => [bout('B', 0, 'B 1', 'B 2', 'B'), bout('B', 1, 'B 3', 'B 4', 'B')];
const TA = playoff('A', 'A 1', 'A 3', 'A');

let device = deviceState([...poolA(), ...poolB()]);
nextMatchWithPlayoff(device, 1, TA);
let server = clone(device);                       // the Next Match is saved (revision 10)
server.allMatches.Open[3].wp = ['K'];             // Court B scores on B 1 - B 2 and saves first (revision 11)
context.undo();                                   // Court A's Undo, held
check(describe(device) === 'A 1-A 2 done M, A 3-A 4, B 1-B 2, B 3-B 4', `12: the Undo on Court A's copy (${describe(device)})`);
r = rebaseOnto(clone(device), server);
check(describe(r) === 'A 1-A 2 done M, A 3-A 4, B 1-B 2 K, B 3-B 4', `12: Undo of a Next Match with a playoff through a conflict: the playoff is removed (${describe(r)})`);
check(labels(r.courtActionHistory.A) === '' && labels(r.courtRedoHistory.A) === 'Next Match: A 3 vs A 4', '12: the Next Match offered for Redo');

// 13. The same with the server copy's list shifted: pool Z (Court B) comes first, and Court B's own
// Next Match inserted pool Z's playoff before pool A while Court A's Undo was held.
const poolZ = () => [bout('Z', 0, 'Z 1', 'Z 2', 'B', { done: true }), bout('Z', 1, 'Z 3', 'Z 4', 'B')];
device = deviceState([...poolZ(), ...poolA(), ...poolB()]);
nextMatchWithPlayoff(device, 3, TA);
server = clone(device);
server.allMatches.Open[1].done = true;
server.allMatches.Open.splice(2, 0, playoff('Z', 'Z 1', 'Z 3', 'B'));
server.allMatches.Open[6].wp = ['K'];
context.undo();
r = rebaseOnto(clone(device), server);
check(describe(r) === 'Z 1-Z 2 done, Z 3-Z 4 done, playoff Z 1-Z 3, A 1-A 2 done M, A 3-A 4, B 1-B 2 K, B 3-B 4',
  `13: the same with the server's list shifted by Court B's playoff (${describe(r)})`);

// 14. The Redo, racing the other court the same way: the playoff comes back once, after pool A.
device = deviceState([...poolA(), ...poolB()]);
nextMatchWithPlayoff(device, 1, TA);
context.undo();
server = clone(device);                           // the Undo is saved
server.allMatches.Open[2].wp = ['K'];
context.redo();                                   // the Redo, held
r = rebaseOnto(clone(device), server);
check(describe(r) === 'A 1-A 2 done M, A 3-A 4 done, playoff A 1-A 3, B 1-B 2 K, B 3-B 4', `14: Redo of the Next Match through a conflict: the playoff once (${describe(r)})`);

// 15. Undo and Redo both held (the server copy has the Next Match): unchanged list, playoff once.
device = deviceState([...poolA(), ...poolB()]);
nextMatchWithPlayoff(device, 1, TA);
server = clone(device);
server.allMatches.Open[3].wp = ['K'];
context.undo(); context.redo();
r = rebaseOnto(clone(device), server);
check(describe(r) === 'A 1-A 2 done M, A 3-A 4 done, playoff A 1-A 3, B 1-B 2 K, B 3-B 4', `15: Undo + Redo of the Next Match through a conflict (${describe(r)})`);

// 16. Found while fixing 12-15: a Next Match that inserts a playoff, not saved yet, while Court B
// scores on the division's LAST bout and saves first. The action's index patches end with a whole
// match at the old last index (the last bout, moved one place on); replayed by identity it put the
// last bout back as it was when the Next Match was pressed: Court B's point was lost. Replayed by
// identity (the action's matchOps) only the playoff is inserted and the finished bout changed.
device = deviceState([...poolA(), ...poolB()]);
server = clone(device); server.allMatches.Open[3].wp = ['K'];
nextMatchWithPlayoff(device, 1, TA);
r = rebaseOnto(clone(device), server);
check(describe(r) === 'A 1-A 2 done M, A 3-A 4 done, playoff A 1-A 3, B 1-B 2, B 3-B 4 K', `16: a pending Next Match with a playoff keeps Court B's point on the last bout (${describe(r)})`);

// 17. The Redo of 14 with Court B's point on the last bout (the Undo saved; the Redo replays the action).
device = deviceState([...poolA(), ...poolB()]);
nextMatchWithPlayoff(device, 1, TA);
context.undo();
server = clone(device); server.allMatches.Open[3].wp = ['K'];
context.redo();
r = rebaseOnto(clone(device), server);
check(describe(r) === 'A 1-A 2 done M, A 3-A 4 done, playoff A 1-A 3, B 1-B 2, B 3-B 4 K', `17: Redo of the Next Match keeps Court B's point on the last bout (${describe(r)})`);

// 18. 16 with the server's list shifted by Court B's own playoff (pool Z first).
device = deviceState([...poolZ(), ...poolA(), ...poolB()]);
server = clone(device);
server.allMatches.Open[1].done = true;
server.allMatches.Open.splice(2, 0, playoff('Z', 'Z 1', 'Z 3', 'B'));
server.allMatches.Open[6].wp = ['K'];
nextMatchWithPlayoff(device, 3, TA);
r = rebaseOnto(clone(device), server);
check(describe(r) === 'Z 1-Z 2 done, Z 3-Z 4 done, playoff Z 1-Z 3, A 1-A 2 done M, A 3-A 4 done, playoff A 1-A 3, B 1-B 2, B 3-B 4 K',
  `18: the same with the server's list shifted by Court B's playoff (${describe(r)})`);

if (failed) process.exit(1);
console.log(`PASS F30 undo/redo through a save conflict: ${count} checks`);
