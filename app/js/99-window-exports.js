// Step 3c of #136: /app.js is ONE ES module (app/js/*.js concatenated, loaded with <script type="module">),
// so a top-level `function`/`var`/`let`/`const` is no longer a property of `window`. This file, the LAST of
// the concatenation, puts back on `window` exactly the names that code OUTSIDE the module reaches:
//   - inline on*="..." handlers (app/index.html, HTML strings in app/js and app/react)
//   - window.NAME and the legacy() / LegacyGlobals reads of app/react
//   - the bare names tests/lib/ksm-test-api.js (KSMTest) uses
// tests/window-exports-test.mjs keeps it complete (every name reached from outside is listed) and honest
// (every name is a top-level declaration of app/js). Names are sorted, grouped by the file that declares them.
// Step 3d (splitting app/js into real modules) replaces this list with imports and shrinks it.
//
// First block: by value (the binding is never assigned after its declaration).
Object.assign(window, {
  // 00-path-urls.js
  ksmHeaderLogo, ksmLinkUrl, ksmReplaceUrl, ksmTournamentHomeUrl,
  // 00-react-bridge.js
  ksmLegacyCloudSession, ksmLegacyState, ksmLegacyStateVersion,
  // 01-grand-champion.js
  ksmAddGrandChampion, ksmDecideGrandChampion, ksmGrandChampion, ksmGrandChampionChoose, ksmGrandChampions, ksmMoveGrandChampion,
  ksmOpenGrandChampionWithdraw, ksmRemoveGrandChampion, ksmToggleGrandChampionSource, ksmUpdateGrandChampion,
  // 01-state-and-setup.js
  addCustomDivision, renderDivisionSetup, setDivisionFormat, state, toggleDivision,
  // 01-team-divisions.js
  ksmAddTeamDivision, ksmAssignTeamDivision, ksmDivisionName, ksmMoveTeamDivision, ksmNewTeamRows, ksmRemoveTeamDivision,
  ksmRenderTeamDivisions, ksmTeamDivisions, ksmTeamSettings, ksmUpdateTeamDivision,
  // 02-court-match-order.js
  applyCourtState, findNextForCourt, individualMatchReady, initCourtStates, isTeamMatch, renderDivisions,
  sortIndividualDivisionMatches, sortTeamMatches,
  // 03-registration-and-validation.js
  addAutoTeam, addExhibitionRow, addRow, addTeamRow, clearCompetitors, clearExhibitions,
  clearTeams, closeManagementModal, continueRegenerateDivision, cycleCompetitorStatus, cycleTeamStatus, ksmDangerRegenerate,
  ksmSyncDangerZone, loadFullTournament, loadSamples, loadTeamSamples, openRegenerateDivisionDialog, renderExhibitions,
  renderReg, renderTeams, renderTournamentStatus, requestTournamentGeneration, validateTournament,
  // 04-engine-pools.js
  buildPoolMatches, championshipCourtFor, divisionCourtMode, eligibleIndividuals, eligibleTeams, isTeamDivision,
  poolMatchPairs, poolPlayerSlot, poolPlayerSlotLetter,
  // 05-engine-team-matches.js
  nodePairId, teamSlots,
  // 06-engine-single-elim.js
  dedupeSingleElimMatches, maybeAdvanceIndividualSingleElim, sideLabelGeneric, specificMatchSideLabel,
  // 07-engine-team-bracket.js
  teamBracketNodesForCount,
  // 08-engine-generation.js
  applyIndividualNoShow, eliminationFinalDone, generateDivisionState, generatePools, matchBelongsToCourt, regenerateSingleDivision,
  renderPools, selectScorekeeperDivision,
  // 09-results-and-awards.js
  canModifyRepresentative, divisionComplete, exportCSV, setRepresentative, teamRoster,
  // 10-court-scoring-and-history.js
  hansoku, matchRequiresWinner, nextMatch, point, redo, undo,
  updateUndoButton,
  // 11-court-queue-and-views.js
  activeScoreArrays, courtCurrentMatch, showCompProfile, teamSideLabel,
  // 12-engine-result-integrity.js
  winnerOf,
  // 13-engine-standings-and-tiebreaks.js
  appendApprovedDynamicMatches, APPROVED_DYNAMIC_MATCH_TYPES, isTeamRoundRobinDivision, makeTiebreakMatch, maybeCreateTiebreaks, teamPairSummary,
  teamRoundRobinProgress, teamStandings, tiebreakMatchesForGroup, unresolvedRequiredTiebreakGroup,
  // 14-engine-championship.js
  buildChampionshipTemplateMatches, championshipLabels, championshipTemplateForTotal, champMatchBySlot, enforceUniqueIndividualMatches, expectedRoundCount,
  firstRoundName, individualLogicalMatchKey, maybeAdvanceChampionship, maybeCreateChampionship, poolSeedResolution, previousRoundName,
  recomputeChampionshipAdvancement, roundSequenceFromFirst, seedNameForLabel, sourceLabelForRound, syncChampionshipTemplate,
  // 16-court-context-and-pool-editing.js
  dragPoolPlayer, dropPoolPlayer, insertPoolPlayer, jsArg, saveEditedPools, toggleEditPools,
  // 17-print.js
  previewAllDivisionSheets, previewFullPrintPacket, previewResultsSheet, previewSelectedDivisionSheet, printDivisionSheet,
  // 18-sync-state-and-rebase.js
  applyCourtSides, isValidMatchObject, KSM_CLOUD_OUTBOX_KEY, KSM_CLOUD_SESSION_KEY, KSM_MERGE_LABELS, KSM_SAVE_KEY,
  localChangesPending, mergeLocalEditsThreeWay, normalizeCourt, pinCourtLocally, rebaseLocalPayloadOnRecord, rememberLocalCourtDivision,
  // 18-two-tabs.js
  KSM_TAB_ID, ksmOutboxKey, ksmReleaseReplaceBackups, ksmWriterId,
  // 19-cloud-diagnostics.js
  downloadActionHistorySample, downloadSnapshotAnalysis, readCloudDiagnosticsState, writeCloudDiagnosticsState,
  // 20-cloud-session-and-autosave.js
  applySetupSnapshot, clearOutbox, cloudSession, downloadRecoveryFile, getSetupSnapshot, KSM_AUTOSAVE_CLOUD_ID,
  markLocalSave, persistCloudSession, readOutbox, renderPersistentSaveStatus, saveNow, setConnectionStatus,
  tournamentPayload, tournamentSettings, updateSaveStatus, writeOutbox,
  // 21-cloud-realtime-save-and-load.js
  applyRemoteCloudRecord, applyTournamentPayload, closeCloudModal, cloudDiagnostics, confirmTournamentFileLoad, copyTextValue,
  copyTournamentId, disconnectCloudSocket, flushCloudOutbox, ksmCancelReplace, ksmReplaceAnyway, ksmSendCourtClock,
  ksmSendTieFlash, ksmTieFlashConnected, loadRecoveryFile, loadTournamentFromFile, manualSaveTournament, reconnectTvRealtime,
  renderCloudPresence, replaceTournamentFromFile, retryQueuedCloudSave, saveTournamentToCloudWithReason, showKsmToast, tournamentFilePayload,
  triggerLoadRecoveryFile, triggerLoadTournament, tvLink,
  // 22-scorekeeper-screen.js
  closeFusenDialog, confirmFusen, openFusenDialog, updateScoreTournamentName,
  // 23-navigation.js
  chooseCourt, closeNavMenus, exportResultsAwards, exportTournamentBrackets, navigateTo, openRegistrationTab,
  regTab, toggleNavMenu,
  // 24-court-queue-and-context.js
  normalizeQueueGroupLabel, setCourtSupportMode,
  // 25-live-scores.js
  audienceMeta, launchTvDisplay, renderPublic, tvAssignedCourt, tvIndividualSideLabel, tvUpcomingMatches,
  // 26-tv-display.js
  buildTV3ViewModel, renderTvDisplay,
  // 27-results-screen.js
  addResultAward, closeResultsBracket, openResultsBracket, removeResultAward, renderResultsDashboard, resultPlacements,
  // 30-setup-header-and-director.js
  courtSummaryFor, directorDivisionProgress, directorSingleElimTotal, renderDirector, syncSetupHeader, tournamentSummary,
  // 31-spectator-refinements.js
  poolDisplayComplete,
  // 32-split-court-templates.js
  contextDivisionForCourt, renderContext, renderQueue, setCourtCompletePresentation, syncIndividualSingleElim,
  // 33-friendly-links.js
  ksmEditTournamentSlug, ksmRenameTournamentSlug, ksmSaveShortUrl,
  // 33-staff-session-and-library.js
  createNewTournament, initializeCloudRoleFromUrl, installRoleBanner, isReadOnlySession, KSM_STAFF_TOURNAMENT, KSM_V316_STAFF_SESSION,
  ksmKeepStaffOutbox, openTournamentAccess, openTournamentFromHome, rememberTournament, sessionKey, showHomePage,
  v316StaffPassword,
  // 33-stream-overlay-links.js
  copyStreamOverlayLink,
  // 33-tournament-switcher.js
  KSM_DETACHED_DRAFT_KEY, ksmShowLibrary,
  // 35-match-timer.js
  ksmMatchTimerInput, ksmNormalizeTimerSettings, ksmSaveTimerSettings, ksmSetCourtTimerEnabled, ksmSetCourtTimerSound,
  // 35-react-court.js
  ksmAlignedRow, ksmBracket, ksmDaihyosenLabel, ksmDivisionCompleteInput, ksmFinalResults, ksmHansokuCounts,
  ksmIsRoundRobinDaihyosen, ksmKachinukiSheet, ksmNextCourtDivision, ksmOpenCourtSetup, ksmPlaceholderRow, ksmPoolStandingRows,
  ksmSetCourtRedSide, ksmSetCourtTvRedSide, ksmSingleElimContext, ksmSingleElimRoundCard, ksmTeamResults, ksmTeamSheet,
  ksmText,
  // 36-react-live-scores.js
  ksmBetweenMatches, ksmUpNext,
  // 38-react-results.js
  ksmSetResultAward,
  // 40-react-library.js
  ksmAuthorizeLibraryTournament, ksmDeleteLibraryTournament, ksmDiscardLocalDraft, ksmDownloadDeleteBackup, ksmExportLibraryTournament, ksmLibraryAuthorizedIds,
  ksmOpenLocalDraft, ksmReadLocalDraft, ksmReturnFromLibrary,
  // 41-react-pools.js
  ksmPoolEditPools,
  // 42-react-setup.js
  ksmDivisionPresetNames, ksmDivisionRemoveBlocked, ksmDivisionRenameBlocked, ksmMoveSetupDivision, ksmRemoveSetupDivision, ksmRenameSetupDivision,
  ksmRestoreStandardDivisions,
  // 43-react-registration.js
  ksmBindRegistrationEntry, ksmBindRegistrationRow, ksmBlurRedrawn, ksmCycleExhibitionStatus, ksmExhibitionsEnabled, ksmHtmlText,
  ksmImportCSV, ksmImportCSVFile, ksmPasteHelp, ksmRemoveCompetitor, ksmRemoveExhibition, ksmRemoveTeam,
  ksmSetExhibitionField, ksmSetTeamField, ksmTournamentGenerated, ksmUpdateCompetitor,
  // 44-react-shell.js
  ksmConfirmDeleteTournament, ksmConfirmValidation, ksmOpenDeleteTournament, ksmPersistentSaveStatusText, ksmRegeneratePoolDivision, ksmSetActiveNav,
  ksmSetTestTools, ksmShellDialogsState, ksmShellHeaderState, ksmToggleTestTools,
});

// Second block: live accessors, for names that are assigned after their declaration (a wrapped function,
// a timer, a flag) or written from outside (a test spy, React's stale flags). `window.NAME` reads and writes the
// module's binding, as it did when app.js was a classic script.
{
  const live = (get, set) => ({ get, set, enumerable: true, configurable: true });
  Object.defineProperties(window, {
    // 00-path-urls.js
    ksmRouteLoading: live(() => ksmRouteLoading, v => { ksmRouteLoading = v; }),
    // 01-state-and-setup.js
    saveSetup: live(() => saveSetup, v => { saveSetup = v; }),
    setDivisionCourt: live(() => setDivisionCourt, v => { setDivisionCourt = v; }),
    show: live(() => show, v => { show = v; }),
    // 11-court-queue-and-views.js
    showDojoProfile: live(() => showDojoProfile, v => { showDojoProfile = v; }),
    // 13-engine-standings-and-tiebreaks.js
    initialPoolStandings: live(() => initialPoolStandings, v => { initialPoolStandings = v; }),
    pendingTiebreak: live(() => pendingTiebreak, v => { pendingTiebreak = v; }),
    poolFinished: live(() => poolFinished, v => { poolFinished = v; }),
    resolveTiebreakBaseGroup: live(() => resolveTiebreakBaseGroup, v => { resolveTiebreakBaseGroup = v; }),
    // 14-engine-championship.js
    poolPositionsResolved: live(() => poolPositionsResolved, v => { poolPositionsResolved = v; }),
    // 15-engine-pool-standings.js
    poolStandings: live(() => poolStandings, v => { poolStandings = v; }),
    // 16-court-context-and-pool-editing.js
    renderAll: live(() => renderAll, v => { renderAll = v; }),
    // 18-sync-state-and-rebase.js
    ksmApplyingRemoteSnapshot: live(() => ksmApplyingRemoteSnapshot, v => { ksmApplyingRemoteSnapshot = v; }),
    ksmCloudReconnectTimer: live(() => ksmCloudReconnectTimer, v => { ksmCloudReconnectTimer = v; }),
    ksmCloudSaveInFlight: live(() => ksmCloudSaveInFlight, v => { ksmCloudSaveInFlight = v; }),
    ksmCloudSavePending: live(() => ksmCloudSavePending, v => { ksmCloudSavePending = v; }),
    ksmCloudSocket: live(() => ksmCloudSocket, v => { ksmCloudSocket = v; }),
    ksmCloudTimer: live(() => ksmCloudTimer, v => { ksmCloudTimer = v; }),
    ksmConfirmedMutationVersion: live(() => ksmConfirmedMutationVersion, v => { ksmConfirmedMutationVersion = v; }),
    ksmDeferredSyncRecord: live(() => ksmDeferredSyncRecord, v => { ksmDeferredSyncRecord = v; }),
    ksmLastSuccessfulSaveAt: live(() => ksmLastSuccessfulSaveAt, v => { ksmLastSuccessfulSaveAt = v; }),
    ksmLocalMutationVersion: live(() => ksmLocalMutationVersion, v => { ksmLocalMutationVersion = v; }),
    ksmSaveStatusMode: live(() => ksmSaveStatusMode, v => { ksmSaveStatusMode = v; }),
    ksmSaveTimer: live(() => ksmSaveTimer, v => { ksmSaveTimer = v; }),
    noteLocalMutation: live(() => noteLocalMutation, v => { noteLocalMutation = v; }),
    // 20-cloud-session-and-autosave.js
    criticalAutoSave: live(() => criticalAutoSave, v => { criticalAutoSave = v; }),
    ksmSessionRole: live(() => ksmSessionRole, v => { ksmSessionRole = v; }),
    saveAuto: live(() => saveAuto, v => { saveAuto = v; }),
    scheduleAutoSave: live(() => scheduleAutoSave, v => { scheduleAutoSave = v; }),
    // 21-cloud-realtime-save-and-load.js
    connectCloudSocket: live(() => connectCloudSocket, v => { connectCloudSocket = v; }),
    ksmDeferredRemoteRecord: live(() => ksmDeferredRemoteRecord, v => { ksmDeferredRemoteRecord = v; }),
    ksmFileReplace: live(() => ksmFileReplace, v => { ksmFileReplace = v; }),
    ksmPendingTournamentFile: live(() => ksmPendingTournamentFile, v => { ksmPendingTournamentFile = v; }),
    ksmQueuedSaveRetryTimer: live(() => ksmQueuedSaveRetryTimer, v => { ksmQueuedSaveRetryTimer = v; }),
    loadTournamentFileAsNew: live(() => loadTournamentFileAsNew, v => { loadTournamentFileAsNew = v; }),
    // 22-scorekeeper-screen.js
    renderScore: live(() => renderScore, v => { renderScore = v; }),
    // 33-friendly-links.js
    ksmFetchTournament: live(() => ksmFetchTournament, v => { ksmFetchTournament = v; }),
    ksmPendingSlug: live(() => ksmPendingSlug, v => { ksmPendingSlug = v; }),
    // 33-staff-session-and-library.js
    renderHomeTournamentLibrary: live(() => renderHomeTournamentLibrary, v => { renderHomeTournamentLibrary = v; }),
    setSessionRole: live(() => setSessionRole, v => { setSessionRole = v; }),
    toggleStaffSession: live(() => toggleStaffSession, v => { toggleStaffSession = v; }),
    // 33-tournament-switcher.js
    ksmStartupHasCache: live(() => ksmStartupHasCache, v => { ksmStartupHasCache = v; }),
    ksmTournamentTransition: live(() => ksmTournamentTransition, v => { ksmTournamentTransition = v; }),
    // 40-react-library.js
    ksmDecorateLibraryInput: live(() => ksmDecorateLibraryInput, v => { ksmDecorateLibraryInput = v; }),
    // 43-react-registration.js
    ksmExhibitionsStale: live(() => ksmExhibitionsStale, v => { ksmExhibitionsStale = v; }),
    ksmRegistrationRowsStale: live(() => ksmRegistrationRowsStale, v => { ksmRegistrationRowsStale = v; }),
    ksmTeamsStale: live(() => ksmTeamsStale, v => { ksmTeamsStale = v; }),
    // 44-react-shell.js
    ksmNavActive: live(() => ksmNavActive, v => { ksmNavActive = v; }),
    ksmNavMenuStyle: live(() => ksmNavMenuStyle, v => { ksmNavMenuStyle = v; }),
    ksmNavOpenMenu: live(() => ksmNavOpenMenu, v => { ksmNavOpenMenu = v; }),
    ksmShellDialogs: live(() => ksmShellDialogs, v => { ksmShellDialogs = v; }),
  });
}
