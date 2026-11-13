// Split courts, two scorekeepers saving at once (ATKT Final on dev, 2026-11-13: "it has a hard time
// syncing the info between the two devices"). Two ways a court's result was lost:
//
// 1. A point or Next Match pressed while this court's previous save was in flight is stamped with the
//    revision before that save; its own save goes out on the newer base. When the other court had saved
//    first (409), the rebase replayed only actions stamped at or after that newer base, so the action was
//    dropped and the bout came back unfinished. The cutoff is now the oldest unconfirmed change's revision.
// 2. A rebase that used up its attempts left cloudSession.revision on the server's revision while this
//    device's copy did not have the server's changes. Its next save looked current, was accepted, and
//    overwrote the other court's newer results. The device now goes back to the revision its copy is on.
import vm from 'node:vm';
import { extractFunction, withDependencies, html } from './lib/ksm-source.mjs';

let failed = false;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed = true; };

const action = (label, revision, when) => ({
  format: 'patch-v1', label, court: 'A', when, clientId: 'court-a-client', revision,
  patches: [{ path: ['allMatches', 'A', 'score'], before: 0, after: 1 }]
});
const stateWith = (bScore, historyA = []) => ({
  allMatches: { A: { score: 0 }, B: { score: bScore } },
  courtActionHistory: { A: historyA, B: [] },
  courtRedoHistory: { A: [], B: [] }
});

const snippets = [
  "const KSM_LOCAL_VIEW_STATE_KEYS=new Set(['currentCourt','publicCourt','currentDivision','matches','current','score']);",
  "function normalizeCourt(value){return String(value||'').toUpperCase()==='B'?'B':'A'}",
  "function cloneJson(value){return JSON.parse(JSON.stringify(value))}",
  'let ksmLocalMutationVersion=0;let ksmConfirmedMutationVersion=0;',
  extractFunction(html, 'applyPatchToStateObject'),
  extractFunction(html, 'mergeHistoryEntries'),
  extractFunction(html, 'historyEntryIdentity'),
  extractFunction(html, 'noteLocalMutation'),
  extractFunction(html, 'pendingLocalCourtActionsForRebase'),
  extractFunction(html, 'rebaseLocalPayloadOnRecord'),
  extractFunction(html, 'performCloudSave')
];
// The wrapper that follows performCloudSave (33-staff-session-and-library.js, conflict-base).
const wrapStart = html.indexOf('const ksmPerformCloudSaveOnce=performCloudSave;');
const wrapEnd = html.indexOf('\n};', wrapStart);
check(wrapStart >= 0 && wrapEnd > wrapStart, 'performCloudSave is wrapped to restore the base revision');
const wrapper = html.slice(wrapStart, wrapEnd + 3).replace('const ksmPerformCloudSaveOnce', 'var ksmPerformCloudSaveOnce');

function makeContext(fetchImpl, revision) {
  const outboxBases = [];
  const context = {
    console, Blob,
    cloudSession: { tournamentId: 't1', revision, updatedAt: null, clientId: 'court-a-client', court: 'A' },
    state: { currentCourt: 'A' },
    pinnedCourt: () => 'A',
    cloudEnvelope: payload => ({ tournamentId: 't1', payload }),
    cloudHeaders: () => ({ 'content-type': 'application/json' }),
    analyzeTournamentSnapshot: () => ({ totalBytes: 1 }),
    writeCloudDiagnosticsState: () => ({}),
    v316StaffPassword: () => 'staffpass', promptNewStaffPassword: () => 'staffpass',
    sessionStorage: { setItem() {}, removeItem() {} },
    setSessionRole() {}, persistCloudSession() {}, rememberTournament() {}, clearOutbox() {},
    setConnectionStatus() {}, renderPersistentSaveStatus() {}, connectCloudSocket() {}, showKsmToast() {},
    preserveRecovery() {},
    writeOutbox() { outboxBases.push(context.cloudSession.revision); },
    ksmCloudAttemptCounter: 0, ksmLastSuccessfulSaveAt: null, ksmSaveStatusMode: 'idle', ksmCloudSocket: {},
    ksmTournamentEpoch: 0, ksmPendingSlug: '',
    fetch: fetchImpl
  };
  vm.createContext(context);
  vm.runInContext(withDependencies(html, snippets.join('\n'), { exclude: Object.keys(context) }), context);
  vm.runInContext(wrapper, context);
  return { context, outboxBases };
}
const conflict = record => ({ status: 409, ok: false, text: async () => JSON.stringify({ error: 'Revision conflict', record }) });

// 1. An action pressed while the previous save was in flight (stamped 3) survives a 409 on base 5.
{
  const { context } = makeContext(async () => { throw new Error('unused'); }, 3);
  vm.runInContext('noteLocalMutation()', context);   // the action, while the device was on revision 3
  context.cloudSession.revision = 5;                  // the earlier save came back as revision 5
  const pressed = action('Next Match: Kai Edwards vs Sang Oh', 3, '2026-11-13T10:00:00.000Z');
  const local = { schemaVersion: '1.1', state: stateWith(0, [pressed]) };
  const server6 = { tournamentId: 't1', revision: 6, payload: { schemaVersion: '1.1', state: stateWith(1) } };
  const replayed = context.pendingLocalCourtActionsForRebase(local, server6, 5);
  check(replayed.length === 1 && replayed[0].label === pressed.label, 'an unconfirmed action stamped before the save base is replayed');
  const rebased = context.rebaseLocalPayloadOnRecord(local, server6, 5);
  check(rebased.state.allMatches.A.score === 1 && rebased.state.allMatches.B.score === 1, "the rebase keeps this court's action and the other court's save");
  vm.runInContext('ksmConfirmedMutationVersion=ksmLocalMutationVersion', context);  // now saved
  check(context.pendingLocalCourtActionsForRebase(local, server6, 5).length === 0, 'once confirmed, an action older than the base is not replayed again');
}

// 2. Attempts used up: the device goes back to the revision its copy is on, and the outbox says so.
{
  let rev = 49;
  const sent = [];
  const { context, outboxBases } = makeContext(async (_url, opts) => {
    sent.push(JSON.parse(opts.body).revision); rev += 1;
    return conflict({ tournamentId: 't1', revision: rev, updatedAt: 'x', payload: { schemaVersion: '1.1', state: stateWith(rev) } });
  }, 48);
  const local = { schemaVersion: '1.1', state: stateWith(0, [action('White M', 48, '2026-11-13T10:00:01.000Z')]) };
  let error = null;
  try { await context.performCloudSave(local, 48); } catch (err) { error = err; }
  check(String(error?.message).includes('conflict'), `gives up after the rebase attempts (sent on ${sent.join(',')})`);
  check(context.cloudSession.revision === 48, `back on its own base after giving up (revision ${context.cloudSession.revision})`);
  check(outboxBases.length === 1 && outboxBases[0] === 48, `the queued copy keeps its own base (${outboxBases.join(',')})`);
}

// 3. A rebased save that fails on the network also leaves the device on its own base.
{
  let call = 0;
  const { context } = makeContext(async () => {
    call += 1;
    if (call === 1) return conflict({ tournamentId: 't1', revision: 50, updatedAt: 'x', payload: { schemaVersion: '1.1', state: stateWith(1) } });
    throw new TypeError('Failed to fetch');
  }, 48);
  const local = { schemaVersion: '1.1', state: stateWith(0, [action('White M', 48, '2026-11-13T10:00:02.000Z')]) };
  let error = null;
  try { await context.performCloudSave(local, 48); } catch (err) { error = err; }
  check(error instanceof Error && context.cloudSession.revision === 48, `a failed rebased save leaves revision 48 (now ${context.cloudSession.revision})`);
}

if (failed) process.exit(1);
console.log('PASS split-court sync regressions');
