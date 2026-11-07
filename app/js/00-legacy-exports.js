// Step 3d of #136: the court modules (app/modules) call app/js functions that have not moved yet through
// app/modules/legacy.js, which reads window.NAME at call time. The entry's own load-time code (the first renderAll()
// of 32-split-court-templates.js, the bootstrap files) already runs court code before 99-window-exports.js, the last
// file, has put anything on window. So the names legacy.js wraps are put on window HERE, first: they are all
// function declarations, which are hoisted, so they exist before any file runs. 99-window-exports.js lists them too
// (it still exports everything outside code reaches) and, for the ones that are reassigned, replaces these accessors
// with its own, which do the same. tests/window-exports-test.mjs keeps this list equal to the legacy.js wrappers.
// Delete a name here with its wrapper when its area moves into a module.
Object.assign(window, {
  appendApprovedDynamicMatches, applyCourtSides, cloneJson, eliminationFinalDone, getSetupSnapshot, historyEntryIdentity, isReadOnlySession,
  isTeamDivision, isTvSession, ksmDivisionName, ksmLegacyCloudSession, ksmNotifyStateChanged, ksmPoolEditPools, ksmPoolEditToSave,
  ksmRenderPoolEditor, ksmSetFusenOpen, ksmSignalCourtActions, ksmSignalCourtHeader, ksmTabId, ksmTeamDivisions, localCourtDivision,
  matchBelongsToCourt, matchHasSyncIdentity, matchSyncIdentity, maybeAdvanceChampionship, maybeAdvanceTeamBracket, maybeCreateChampionship,
  maybeCreateTeamTiebreak, maybeCreateTiebreaks, pinCourtLocally, redOnLeftForCourt, rememberLocalCourtDivision, renderPools, renderProgress,
  renderPublic, replayCourtMatchOps, setActiveDivision, showKsmToast, syncChampionshipTemplate, updateSaveStatus,
});
{
  // Reassigned later by app/js (wrapped by tests, React or the later files): a live accessor, like 99-window-exports.js.
  const live = (get, set) => ({ get, set, enumerable: true, configurable: true });
  Object.defineProperties(window, {
    criticalAutoSave: live(() => criticalAutoSave, v => { criticalAutoSave = v; }),
    renderAll: live(() => renderAll, v => { renderAll = v; }),
    renderScore: live(() => renderScore, v => { renderScore = v; }),
    saveSetup: live(() => saveSetup, v => { saveSetup = v; }),
    scheduleAutoSave: live(() => scheduleAutoSave, v => { scheduleAutoSave = v; }),
    show: live(() => show, v => { show = v; }),
  });
}
