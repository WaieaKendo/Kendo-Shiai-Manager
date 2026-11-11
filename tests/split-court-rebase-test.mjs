// Two courts saving at once (HTTP 409 rebase) with team divisions on both courts.
//
// Reported 2026-11-10 (ATKT, kachinuki team divisions on both courts): the court screens showed
// one team's names with another team's lineups, and bouts went missing or repeated:
//   * every kachinuki bout of a pairing had the same sync identity, so a court's next bout (a
//     Next Match that adds it) was replayed onto the pairing's first bout: the first bout was
//     overwritten and the new one never added;
//   * a court action also records its changes on `matches` (the device's open division) by
//     index; the rebase replayed them onto whatever division the server copy had open, so a kids'
//     bout's red player and lineups landed on an adult bout (the rebase leaves `matches` out; checked here);
//   * found with the e2e: each kachinuki Next Match recorded ~145 KB of index patches (every later bout
//     "changed" into its neighbour), and the courts' history made the tournament too big to save.
// Runs the app's rebaseLocalPayloadOnRecord() in a vm on hand-made payloads; the court actions
// are recorded through the app's own performCourtAction(). e2e-split-court-teams-test.py plays the
// same through the real app and server.
import vm from 'node:vm';
import { extractFunction, html, engine } from './lib/ksm-source.mjs';

let failed = false, count = 0;
const check = (ok, name) => { count++; if (!ok) { console.log(`FAIL ${name}`); failed = true; } };
const clone = v => JSON.parse(JSON.stringify(v));

const constant = name => html.match(new RegExp(`const ${name}=[^\\n]*`))[0];
const code = [engine, constant('KSM_LOCAL_VIEW_STATE_KEYS'), constant('KSM_UNDO_LOG_LIMIT'), constant('KSM_TAB_ID'),
  ...['normalizeCourt', 'cloneJson', 'isValidMatchObject', 'matchSyncIdentity', 'legacyTiebreakSyncIdentity', 'matchHasSyncIdentity',
    'individualMatchReady', 'matchBelongsToCourtInState', 'nextReadyIndexInState', 'preserveOwnedCourtRuntimeState', 'applyPatchToStateObject',
    'resolveRebasePatch', 'mergeHistoryEntries', 'historyEntryIdentity', 'pendingLocalCourtActionsForRebase', 'undoLogEntryIdentity',
    'pendingLocalUndoLogForRebase', 'replayPendingCourtHistory', 'replayCourtMatchOps', 'mergeCourtHistoryStacks', 'ksmTeamDivisionPayload',
    'rebaseLocalPayloadOnRecord', 'ksmCarryGrandChampionDraws', 'ksmOwnHistoryEntry', 'ksmOtherRebaseCourts',
    'isIndividualPoolTiebreakMatch', 'reindexPointersAfterMatchReorder', 'normalizeIndividualPoolTiebreakOrderInState', 'normalizeAllIndividualPoolTiebreakOrder',
    'historyPathParent', 'applyHistoryPatch', 'cloneHistoryValue', 'historyComparableState', 'historyValuesEqual', 'buildHistoryPatches',
    'currentHistoryCourt', 'stampHistoryPatchMatchIdentity', 'ensureCourtHistory', 'performCourtAction', 'withCourtHistoryIdentity',
    'historyIndexDivision', 'historyIndexRef', 'withCourtMatchOps', 'courtUndoMatchesBefore', 'courtUndoMatchOps', 'compactCourtActionEntry',
    'applyHistoryValues', 'recordCourtUndoLog', 'undo', 'redo', 'resolveHistoryIndexRef', 'invertCourtMatchOps', 'applyCourtHistoryEntry',
    'courtHistoryAppliedEntry', 'courtHistorySkippedNote'].map(n => extractFunction(html, n))].join('\n')
  + ['KSM_HISTORY_LIMIT', 'KSM_HISTORY_KEYS', 'KSM_HISTORY_MISSING', 'KSM_GC_STRUCTURE_KEYS'].map(constant).join('\n');
const context = {
  console,
  cloudSession: { clientId: 'court-b', court: 'B', revision: 10 },
  state: { currentCourt: 'B' },
  pinnedCourt: () => 'B',
  sanitizeLoadedTournamentState() {}, repairCompletedMatchResults() {},
  applyCourtState() {}, renderAll() {}, updateUndoButton() {}, updateSaveStatus() {}, criticalAutoSave() {},
  writeCloudDiagnosticsState() {}, showKsmToast() {}, noteMergeConflicts() {}, replayStructuralEdit: () => false, mergeLocalEditsThreeWay: () => [],
  rebaseDivisionRenamesForMerge: (rebased, local, base, server) => ({ local, base, server, refused: [], blocked: [] }), noteDivisionRenamesRefused() {},
  noteStructuralEditBlockedByRename() {}, dropOrphanedDivisionStructure() {},
};
vm.createContext(context);
vm.runInContext(code, context);

// A kachinuki pairing's bout, as teamPairMatchObjects() and the continuation (app/engine/kachinuki.ts) make them.
const lineups = {
  'Kids A': ['Lucas', 'Carter', 'Kenzen'], 'Kids B': ['Jack', 'William', 'Myles'],
  'Men': ['Keenan', 'Yoshiaki', 'Braxton'], 'Kenshikan B': ['Shu', 'Hyun', 'Sang'],
  'Women': ['Nicole', 'Tina', 'Megan'], 'Lihue': ['Joshua', 'Gavin', 'Gabriel'],
};
const bout = (division, node, white, red, wIndex = 0, rIndex = 0, court = 'B') => ({
  division, pool: 'Quarterfinal', white: lineups[white][wIndex], red: lineups[red][rIndex], wdojo: white, rdojo: red, teamWhite: white, teamRed: red,
  position: 'Kachinuki', teamPair: `node-${node}`, done: false, wp: [], rp: [], type: 'kachinuki', court,
  lineupW: lineups[white], lineupR: lineups[red], wIndex, rIndex, teamNodeId: node, bracketSlot: 0, origin: wIndex || rIndex ? 'TEMPLATE_CONTINUATION' : 'TEMPLATE',
});
const tournament = ({ open, kids, adult }) => {
  const s = {
    allMatches: { Kids: kids, Adult: adult },
    currentDivision: open, current: 0, currentCourt: 'B', currentByDivision: { Kids: 0, Adult: 0 },
    courtState: { A: { division: 'Adult', index: 0 }, B: { division: 'Kids', index: 0 } }, courtActiveDivision: { A: 'Adult', B: 'Kids' },
    courtActionHistory: { A: [], B: [] }, courtRedoHistory: { A: [], B: [] }, courtUndoLog: { A: [], B: [] },
  };
  s.matches = s.allMatches[open];
  return s;
};
const rebase = (device, server) => context.rebaseLocalPayloadOnRecord({ setup: {}, state: clone(device) }, { revision: 11, payload: { setup: {}, state: clone(server) } }, 10, null).state;
const names = arr => arr.map(m => `${m.teamWhite}:${m.white}(${m.wIndex}) v ${m.teamRed}:${m.red}(${m.rIndex})${m.done ? ' done' : ''}${m.wp.length || m.rp.length ? ` ${m.wp.join('')}-${m.rp.join('')}` : ''}`).join(' | ');

// Court B (Kids) scores Kids A's first bout and presses Next Match: the bout is done and the next
// bout (Kids A's second member on) is added after it, as maybeCreateKachinukiNext() does.
const courtBNextBout = device => {
  context.state = device;
  context.performCourtAction('White M', () => {
    const arr = device.allMatches.Kids, first = arr[0];
    first.wp.push('M'); first.wp.push('M'); first.done = true;
    arr.splice(1, 0, bout('Kids', 'QF3', 'Kids B', 'Kids A', 0, 1));
    device.current = 1; device.courtState.B.index = 1; device.currentByDivision.Kids = 1;
  });
};

// 1. Kachinuki: Court A saved first (a point on the adult bout). Court B's next bout is added after
// the first one; before the fix it was written over the first bout (identity collision), so the
// first bout became the second one and the pairing lost a bout.
{
  const kids = () => [bout('Kids', 'QF3', 'Kids B', 'Kids A'), bout('Kids', 'QF4', 'Women', 'Lihue')];
  const adult = () => [bout('Adult', 'P6', 'Men', 'Kenshikan B', 0, 0, 'A')];
  const device = tournament({ open: 'Kids', kids: kids(), adult: adult() });
  courtBNextBout(device);
  const server = tournament({ open: 'Adult', kids: kids(), adult: adult() });
  server.allMatches.Adult[0].rp = ['K'];
  const r = rebase(device, server);
  check(names(r.allMatches.Kids) === 'Kids B:Jack(0) v Kids A:Lucas(0) done MM- | Kids B:Jack(0) v Kids A:Carter(1) | Women:Nicole(0) v Lihue:Joshua(0)',
    `1: the first bout is scored and the next bout added after it (${names(r.allMatches.Kids)})`);
  check(JSON.stringify(r.allMatches.Adult[0].rp) === '["K"]', '1: Court A\'s point kept');
}

// 2. The same, then the next bout scored too (a second action): the score goes on the second bout,
// not on the first one (same identity before the fix).
{
  const kids = () => [bout('Kids', 'QF3', 'Kids B', 'Kids A')];
  const adult = () => [bout('Adult', 'P6', 'Men', 'Kenshikan B', 0, 0, 'A')];
  const device = tournament({ open: 'Kids', kids: kids(), adult: adult() });
  courtBNextBout(device);
  context.performCourtAction('Red K', () => { device.allMatches.Kids[1].rp.push('K'); });
  const r = rebase(device, tournament({ open: 'Adult', kids: kids(), adult: adult() }));
  check(names(r.allMatches.Kids) === 'Kids B:Jack(0) v Kids A:Lucas(0) done MM- | Kids B:Jack(0) v Kids A:Carter(1) -K',
    `2: each bout keeps its own score (${names(r.allMatches.Kids)})`);
}

// 3. The server copy has another division open (the adult one, saved by Court A): Court B's kids
// changes, recorded on `matches` too, must not land on the adult bouts. Before the fix the adult
// bout got the kids' red player and lineups (the screen showed "Men v Kenshikan B" with kids).
{
  const kids = () => [bout('Kids', 'QF3', 'Kids B', 'Kids A'), bout('Kids', 'QF4', 'Women', 'Lihue')];
  const adult = () => [bout('Adult', 'P5', 'Women', 'Lihue', 0, 0, 'A'), bout('Adult', 'P6', 'Men', 'Kenshikan B', 0, 0, 'A')];
  const device = tournament({ open: 'Kids', kids: kids(), adult: adult() });
  courtBNextBout(device);
  const server = tournament({ open: 'Adult', kids: kids(), adult: adult() });
  const r = rebase(device, server);
  check(names(r.allMatches.Adult) === names(adult()), `3: the adult bouts are untouched (${names(r.allMatches.Adult)})`);
  check(JSON.stringify(r.matches) === JSON.stringify(r.allMatches[r.currentDivision]),
    `3: \`matches\` is the open division's list (${r.currentDivision}: ${names(r.matches)})`);
  check(names(r.allMatches.Kids).startsWith('Kids B:Jack(0) v Kids A:Lucas(0) done MM- | Kids B:Jack(0) v Kids A:Carter(1)'), `3: the kids' bouts are Court B's (${names(r.allMatches.Kids)})`);
}

// 4. Size (found with e2e-split-court-teams-test.py: SQLITE_TOOBIG): a Next Match that adds a bout in
// the middle of a division keeps the insert by identity (matchOps) and leaves out the index patches
// that "changed" every later bout into its neighbour (on allMatches and on `matches`). Before, a
// 14-team adult division's Next Match recorded ~580 patches (~145 KB) and the courts' history made
// the tournament too big to save.
{
  const later = Array.from({ length: 30 }, (_, i) => bout('Kids', `R${i}`, i % 2 ? 'Women' : 'Kids B', i % 2 ? 'Lihue' : 'Kids A', i % 3, (i + 1) % 3));
  const device = tournament({ open: 'Kids', kids: [bout('Kids', 'QF3', 'Kids B', 'Kids A'), ...later], adult: [] });
  courtBNextBout(device);
  const entry = device.courtActionHistory.B.at(-1);
  check(!entry.patches.some(p => p.path[0] === 'matches' || (p.path[0] === 'allMatches' && p.path[1] === 'Kids')),
    `4: no index patches for the division (${entry.patches.map(p => p.path.slice(0, 3).join('.')).join(', ')})`);
  check(entry.matchOps?.Kids?.insert?.length === 1, '4: the inserted bout kept by identity');
  check(JSON.stringify(entry).length < 6000, `4: the action is small (${JSON.stringify(entry).length} bytes)`);
  // Undo and Redo on the device apply it from matchOps: the bout goes and comes back, the first bout's result too.
  const after = names(device.allMatches.Kids);
  context.undo();
  check(names(device.allMatches.Kids) === names([bout('Kids', 'QF3', 'Kids B', 'Kids A'), ...later]), `4: Undo takes the bout and the result off (${names(device.allMatches.Kids).slice(0, 120)})`);
  context.redo();
  check(names(device.allMatches.Kids) === after, `4: Redo puts them back (${names(device.allMatches.Kids).slice(0, 120)})`);
  // And a rebase replays it the same (the server copy has the other court's division open).
  const r = rebase(device, tournament({ open: 'Adult', kids: [bout('Kids', 'QF3', 'Kids B', 'Kids A'), ...later], adult: [] }));
  check(names(r.allMatches.Kids) === after, `4: a rebase replays it from matchOps (${names(r.allMatches.Kids).slice(0, 120)})`);
}

if (failed) process.exit(1);
console.log(`PASS two courts saving at once with kachinuki team divisions: ${count} checks`);
