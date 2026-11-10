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
  // app/modules/links/path-urls.js
  ksmHeaderLogo, ksmIsExplicitSpectatorUrl, ksmLinkParams, ksmLinkUrl, ksmRecordScreenPath, ksmReplaceUrl, ksmResolvedUrl, ksmResolveSlug,
  ksmShowRequestedScreen, ksmTournamentHomeUrl,
  // app/modules/react-bridges/state-bridge.js
  ksmLegacyCloudSession, ksmLegacyState, ksmLegacyStateVersion, ksmNotifyStateChanged,
  // app/modules/registration/grand-champion.js
  ksmAddGrandChampion, ksmDecideGrandChampion, ksmGrandChampion, ksmGrandChampionChoose, ksmGrandChampions, ksmMoveGrandChampion,
  ksmOpenGrandChampionWithdraw, ksmRemoveGrandChampion, ksmToggleGrandChampionSource, ksmUpdateGrandChampion,
  // app/modules/setup/division-setup.js
  saveSetup, addCustomDivision, renderDivisionSetup, setDivisionFormat, syncSetupHeader, toggleDivision,
  // app/modules/session/tournament-switcher.js, app/modules/app-state.js
  ksmEmptyState, state,
  // app/modules/registration/team-divisions.js
  ksmAddTeamDivision, ksmAssignTeamDivision, ksmDivisionName, ksmMoveTeamDivision, ksmNewTeamRows, ksmRemoveTeamDivision,
  ksmRenderTeamDivisions, ksmTeamDivisions, ksmTeamSettings, ksmUpdateTeamDivision,
  // app/modules/court/court-match-order.js
  applyCourtState, findNextForCourt, individualMatchReady, initCourtStates, isTeamMatch, renderDivisions,
  sortIndividualDivisionMatches, sortTeamMatches,
  // app/modules/registration/registration.js
  addAutoTeam, addExhibitionRow, addRow, addTeamRow, clearCompetitors, clearExhibitions, clearTeams, closeManagementModal,
  continueRegenerateDivision, cycleCompetitorStatus, cycleTeamStatus, loadFullTournament, loadSamples, loadTeamSamples,
  openRegenerateDivisionDialog, renderExhibitions, renderReg, renderTeams,
  // app/modules/setup/danger-zone.js
  ksmDangerRegenerate, ksmSyncDangerZone,
  // app/modules/registration/validation.js
  renderTournamentStatus, requestTournamentGeneration, validateTournament,
  // app/modules/engine/engine-pools.js
  isTeamDivision,
  // 04-engine-pools.js
  buildPoolMatches, championshipCourtFor, divisionCourtMode, eligibleIndividuals, eligibleTeams, poolMatchPairs, poolPlayerSlot,
  poolPlayerSlotLetter,
  // app/modules/engine/engine-team-matches.js
  teamSlots,
  // 05-engine-team-matches.js
  nodePairId,
  // 06-engine-single-elim.js
  dedupeSingleElimMatches, maybeAdvanceIndividualSingleElim, sideLabelGeneric,
  // app/modules/engine/engine-single-elim.js
  specificMatchSideLabel,
  // app/modules/engine/engine-team-bracket.js
  maybeAdvanceTeamBracket,
  // 07-engine-team-bracket.js
  teamBracketNodesForCount,
  // app/modules/engine/engine-generation.js
  applyIndividualNoShow, applyWholeTeamNoShow, eliminationFinalDone, generateDivisionState, generatePools, matchBelongsToCourt,
  regenerateSingleDivision, renderPools, selectScorekeeperDivision, setActiveDivision,
  // app/modules/results/results-and-awards.js
  canModifyRepresentative, divisionComplete, exportCSV, setRepresentative, teamRoster,
  // app/modules/court/court-scoring-and-history.js
  hansoku, matchRequiresWinner, nextMatch, point, redo, undo,
  updateUndoButton,
  // app/modules/court/court-queue-and-views.js
  activeScoreArrays, courtCurrentMatch, showCompProfile, teamSideLabel,
  // 12-engine-result-integrity.js
  winnerOf,
  // app/modules/engine/engine-standings-and-tiebreaks.js
  appendApprovedDynamicMatches, isTeamRoundRobinDivision, ksmAddDaihyosenForTeamAwards, maybeCreateTeamTiebreak,
  maybeCreateTiebreaks, teamStandings,
  // 13-engine-standings-and-tiebreaks.js
  APPROVED_DYNAMIC_MATCH_TYPES, makeTiebreakMatch, teamPairSummary, teamRoundRobinProgress, tiebreakMatchesForGroup,
  unresolvedRequiredTiebreakGroup,
  // 14-engine-championship.js
  buildChampionshipTemplateMatches, championshipLabels, championshipTemplateForTotal, champMatchBySlot,
  enforceUniqueIndividualMatches, expectedRoundCount, firstRoundName, individualLogicalMatchKey, previousRoundName,
  roundSequenceFromFirst, sourceLabelForRound,
  // app/modules/engine/engine-championship.js
  maybeAdvanceChampionship, maybeCreateChampionship, poolSeedResolution, recomputeChampionshipAdvancement, seedNameForLabel,
  syncChampionshipTemplate,
  // app/modules/court/court-context-and-pool-editing.js (renderAll() is one final function)
  renderAll, dragPoolPlayer, dropPoolPlayer, insertPoolPlayer, jsArg, saveEditedPools, toggleEditPools,
  // app/modules/results/print.js
  previewAllDivisionSheets, previewFullPrintPacket, previewResultsSheet, previewSelectedDivisionSheet, printDivisionSheet,
  // app/modules/sync/sync-state-and-rebase.js
  applyCourtSides, cloneJson, historyEntryIdentity, isValidMatchObject, KSM_AUTOSAVE_CLOUD_ID, KSM_CLOUD_OUTBOX_KEY, KSM_CLOUD_SESSION_KEY,
  KSM_MERGE_LABELS, KSM_SAVE_KEY, ksmKeepRestoreRecovery, ksmRestoreRecoveries, localChangesPending, localCourtDivision, matchBelongsToCourtInState, matchHasSyncIdentity,
  matchSyncIdentity, mergeLocalEditsThreeWay, nextReadyIndexInState, normalizeCourt, pinCourtLocally, rebaseLocalPayloadOnRecord,
  redOnLeftForCourt, rememberLocalCourtDivision, replayCourtMatchOps,
  // app/modules/sync/two-tabs.js
  KSM_TAB_ID, ksmOutboxKey, ksmReleaseReplaceBackups, ksmWriterId,
  // app/modules/sync/cloud-diagnostics.js
  downloadActionHistorySample, downloadSnapshotAnalysis, readCloudDiagnosticsState, writeCloudDiagnosticsState,
  // app/modules/sync/cloud-session-and-autosave.js
  applySetupSnapshot, clearOutbox, downloadRecoveryFile, getSetupSnapshot, markLocalSave, persistCloudSession, readOutbox,
  renderPersistentSaveStatus, saveNow, setConnectionStatus, tournamentPayload, tournamentSettings, updateSaveStatus, writeOutbox,
  // app/modules/sync/cloud-realtime-save-and-load.js
  applyRemoteCloudRecord, applyTournamentPayload, closeCloudModal, cloudDiagnostics, confirmTournamentFileLoad, copyTextValue,
  copyTournamentId, disconnectCloudSocket, flushCloudOutbox, isTvSession, ksmCancelReplace, ksmReplaceAnyway, ksmSendCourtClock,
  ksmSendTieFlash, ksmTieFlashConnected, loadRecoveryFile, loadTournamentFromFile, manualSaveTournament, reconnectTvRealtime,
  renderCloudPresence, replaceTournamentFromFile, retryQueuedCloudSave, saveTournamentToCloudWithReason, showKsmToast,
  tournamentFilePayload, triggerLoadRecoveryFile, triggerLoadTournament, tvLink,
  // app/modules/court/scorekeeper-screen.js (renderScore() is one final function)
  renderScore, closeFusenDialog, confirmFusen, openFusenDialog, updateScoreTournamentName,
  // app/modules/navigation.js (show() is one final function; it replaced the live accessor)
  show, chooseCourt, closeNavMenus, exportResultsAwards, exportTournamentBrackets, navigateTo, openRegistrationTab, regTab, renderProgress, toggleNavMenu,
  // app/modules/court/court-queue-and-context.js
  normalizeQueueGroupLabel, setCourtSupportMode,
  // app/modules/results/live-scores.js
  tvAssignedCourt,
  // app/modules/results/live-scores.js
  audienceMeta, launchTvDisplay, renderPublic, tvIndividualSideLabel, tvUpcomingMatches,
  // app/modules/results/tv-display.js
  buildTV3ViewModel, renderTvDisplay,
  // app/modules/results/results-screen.js
  addResultAward, closeResultsBracket, openResultsBracket, removeResultAward, renderResultsDashboard, resultPlacements,
  // app/modules/setup/director-progress.js
  courtSummaryFor, directorDivisionProgress, directorSingleElimTotal, renderDirector, tournamentSummary,
  // app/modules/results/live-scores.js
  poolDisplayComplete,
  // app/modules/setup/director-progress.js
  ksmDirectorRefreshTimer, setDirectorRefreshTimer,
  // app/modules/court/split-court-templates.js
  contextDivisionForCourt, renderContext, renderQueue, setCourtCompletePresentation, syncIndividualSingleElim,
  // app/modules/session/tournament-switcher.js
  ksmEmptySetup,
  // app/modules/links/friendly-links.js
  ksmEditTournamentSlug, ksmRenameTournamentSlug, ksmSaveShortUrl,
  // app/modules/session/staff-session-and-library.js
  canCloudWrite, createNewTournament, initializeCloudRoleFromUrl, installRoleBanner, isReadOnlySession, KSM_STAFF_TOURNAMENT,
  KSM_V316_STAFF_SESSION, ksmKeepStaffOutbox, openTournamentAccess, openTournamentFromHome, performCloudSave,
  promptNewStaffPassword, rememberTournament, sessionKey, showHomePage, spectatorLink, v316StaffPassword,
  // app/modules/links/stream-overlay-links.js
  copyStreamOverlayLink,
  // app/modules/session/tournament-switcher.js
  ksmRefreshTournamentChip, ksmShowLibrary,
  // app/modules/court/match-timer.js
  ksmMatchTimerInput, ksmNormalizeTimerSettings, ksmSaveTimerSettings, ksmSetCourtTimerEnabled, ksmSetCourtTimerSound,
  // app/modules/react-bridges/court.js
  ksmAlignedRow, ksmBracket, ksmDaihyosenLabel, ksmDivisionCompleteInput, ksmFinalResults, ksmHansokuCounts, ksmIsRoundRobinDaihyosen,
  ksmKachinukiSheet, ksmNextCourtDivision, ksmOpenCourtSetup, ksmPlaceholderRow, ksmPoolStandingRows, ksmSetCourtRedSide, ksmSetCourtTvRedSide,
  ksmSignalCourtActions, ksmSignalCourtHeader, ksmSingleElimContext, ksmSingleElimRoundCard, ksmTeamResults, ksmTeamSheet, ksmText,
  // app/modules/react-bridges/live-scores.js
  ksmBetweenMatches, ksmRenderLiveScores, ksmUpNext,
  // app/modules/react-bridges/results.js
  ksmRenderResults, ksmRenderResultsBracket, ksmSetResultAward,
  // app/modules/react-bridges/library.js
  ksmAuthorizeLibraryTournament, ksmDecorateLibraryInput, ksmDeleteLibraryTournament, ksmDiscardLocalDraft, ksmDownloadDeleteBackup, ksmExportLibraryTournament, ksmLibraryAuthorizedIds,
  ksmOpenLocalDraft, ksmReadLocalDraft, ksmRenderLibrary, ksmReturnFromLibrary,
  // app/modules/react-bridges/pools.js
  ksmPoolEditPools, ksmPoolEditToSave, ksmRenderPoolEditor,
  // app/modules/react-bridges/setup.js
  ksmDivisionPresetNames, ksmDivisionRemoveBlocked, ksmDivisionRenameBlocked, ksmMoveSetupDivision, ksmPublishSetup, ksmRemoveSetupDivision,
  ksmRenameSetupDivision, ksmRenderSetupDivisions, ksmRenderSetupHeader, ksmRestoreStandardDivisions,
  // app/modules/react-bridges/registration.js
  ksmBindRegistrationEntry, ksmBindRegistrationRow, ksmBlurRedrawn, ksmConfirmNoShow, ksmCycleExhibitionStatus, ksmExhibitionsEnabled,
  ksmHtmlText, ksmImportCSV, ksmImportCSVFile, ksmPasteHelp, ksmRemoveCompetitor, ksmRemoveExhibition, ksmRemoveTeam, ksmRenderExhibitions,
  ksmRenderRegistration, ksmRenderTeams, ksmRenderTournamentStatus, ksmSetExhibitionField, ksmSetTeamField, ksmTournamentGenerated,
  ksmUpdateCompetitor,
  // app/modules/react-bridges/shell.js
  ksmCanDeleteTournament, ksmCloseCloudModal, ksmCloseShellDialog, ksmCloudModalOpen, ksmConfirmDeleteTournament, ksmConfirmValidation,
  ksmContinueRegenerateDivision, ksmOpenCloudModal, ksmOpenDeleteTournament, ksmOpenDiagnostics, ksmOpenFileLoadModal,
  ksmOpenRegenerateDialog, ksmOpenTournamentAccess, ksmPersistentSaveStatusText, ksmPublishHeader, ksmRegeneratePoolDivision,
  ksmRenderConnectionStatus, ksmRenderPresence, ksmRenderSaveStatus, ksmRenderSessionRole, ksmSetActiveNav, ksmSetFusenOpen,
  ksmSetTestTools, ksmShellDialogsState, ksmShellHeaderState, ksmShowValidationDialog, ksmToggleTestTools, setKsmForgotTournament,
  // app/modules/sync/undo-regenerate.js
  ksmRefreshRestorePoint, ksmRenderUndoRegenerate, ksmUndoRegenerateOffered,
  // app/modules/react-bridges/overview.js
  ksmRenderOverview,
  // app/modules/react-bridges/tv.js
  ksmRenderTv,
  // app/modules/auth/auth0-access.js
  cloudHeaders, connectCloudSocket, ksmCacheTournament, ksmFetchTournament, ksmReadHeaders, ksmUsesAccountAuth, loadTournamentFileAsNew,
  loadTournamentFromCloud, renderHomeTournamentLibrary, setSessionRole, toggleStaffSession,
});

// Second block: live accessors, for names that are assigned after their declaration (a wrapped function,
// a timer, a flag) or written from outside (a test spy, React's stale flags). `window.NAME` reads and writes the
// module's binding, as it did when app.js was a classic script.
{
  const live = (get, set) => ({ get, set, enumerable: true, configurable: true });
  Object.defineProperties(window, {
    // app/modules/setup/division-setup.js: a test replaces the window name an inline handler calls
    setDivisionCourt: live(() => setDivisionCourt, v => { setSetDivisionCourt(v); }),
    // app/modules/court/court-queue-and-views.js
    showDojoProfile: live(() => showDojoProfile, v => { setShowDojoProfile(v); }),
    // 13-engine-standings-and-tiebreaks.js
    initialPoolStandings: live(() => initialPoolStandings, v => { initialPoolStandings = v; }),
    pendingTiebreak: live(() => pendingTiebreak, v => { pendingTiebreak = v; }),
    poolFinished: live(() => poolFinished, v => { poolFinished = v; }),
    resolveTiebreakBaseGroup: live(() => resolveTiebreakBaseGroup, v => { resolveTiebreakBaseGroup = v; }),
    // 14-engine-championship.js
    poolPositionsResolved: live(() => poolPositionsResolved, v => { poolPositionsResolved = v; }),
    // 15-engine-pool-standings.js
    poolStandings: live(() => poolStandings, v => { poolStandings = v; }),
    // app/modules/sync/cloud-realtime-save-and-load.js
    ksmApplyingRemoteSnapshot: live(() => ksmApplyingRemoteSnapshot, v => { setKsmApplyingRemoteSnapshot(v); }),
    ksmCloudReconnectTimer: live(() => ksmCloudReconnectTimer, v => { setKsmCloudReconnectTimer(v); }),
    ksmCloudSaveInFlight: live(() => ksmCloudSaveInFlight, v => { setKsmCloudSaveInFlight(v); }),
    ksmCloudSavePending: live(() => ksmCloudSavePending, v => { setKsmCloudSavePending(v); }),
    ksmCloudSocket: live(() => ksmCloudSocket, v => { setKsmCloudSocket(v); }),
    ksmCloudTimer: live(() => ksmCloudTimer, v => { setKsmCloudTimer(v); }),
    ksmConfirmedMutationVersion: live(() => ksmConfirmedMutationVersion, v => { setKsmConfirmedMutationVersion(v); }),
    ksmDeferredRemoteRecord: live(() => ksmDeferredRemoteRecord, v => { setKsmDeferredRemoteRecord(v); }),
    ksmFileReplace: live(() => ksmFileReplace),
    ksmLastSuccessfulSaveAt: live(() => ksmLastSuccessfulSaveAt, v => { setKsmLastSuccessfulSaveAt(v); }),
    ksmLocalMutationVersion: live(() => ksmLocalMutationVersion, v => { setKsmLocalMutationVersion(v); }),
    ksmPendingTournamentFile: live(() => ksmPendingTournamentFile, v => { setKsmPendingTournamentFile(v); }),
    ksmQueuedSaveRetryTimer: live(() => ksmQueuedSaveRetryTimer),
    ksmSaveStatusMode: live(() => ksmSaveStatusMode, v => { setKsmSaveStatusMode(v); }),
    ksmSaveTimer: live(() => ksmSaveTimer, v => { setKsmSaveTimer(v); }),
    // app/modules/sync/sync-state-and-rebase.js
    ksmDeferredSyncRecord: live(() => ksmDeferredSyncRecord, v => { setKsmDeferredSyncRecord(v); }),
    // 18-sync-state-and-rebase.js
    noteLocalMutation: live(() => noteLocalMutation, v => { noteLocalMutation = v; }),
    // app/modules/sync/cloud-session-and-autosave.js
    cloudSession: live(() => cloudSession),
    ksmSessionRole: live(() => ksmSessionRole, v => { setKsmSessionRole(v); }),
    // 20-cloud-session-and-autosave.js
    criticalAutoSave: live(() => criticalAutoSave, v => { criticalAutoSave = v; }),
    saveAuto: live(() => saveAuto, v => { saveAuto = v; }),
    scheduleAutoSave: live(() => scheduleAutoSave, v => { scheduleAutoSave = v; }),
    // app/modules/links/friendly-links.js
    ksmPendingSlug: live(() => ksmPendingSlug),
    // app/modules/session/staff-session-and-library.js
    ksmRouteLoading: live(() => ksmRouteLoading, v => { setKsmRouteLoading(v); }),
    // app/modules/session/tournament-switcher.js
    KSM_DETACHED_DRAFT_KEY: live(() => KSM_DETACHED_DRAFT_KEY),
    ksmStartupHasCache: live(() => ksmStartupHasCache, v => { setKsmStartupHasCache(v); }),
    ksmTournamentTransition: live(() => ksmTournamentTransition, v => { setKsmTournamentTransition(v); }),
    // app/modules/react-bridges/registration.js
    ksmExhibitionsStale: live(() => ksmExhibitionsStale, v => { setKsmExhibitionsStale(v); }),
    ksmRegistrationRowsStale: live(() => ksmRegistrationRowsStale, v => { setKsmRegistrationRowsStale(v); }),
    ksmTeamsStale: live(() => ksmTeamsStale, v => { setKsmTeamsStale(v); }),
    // app/modules/react-bridges/shell.js
    ksmNavActive: live(() => ksmNavActive),
    ksmNavMenuStyle: live(() => ksmNavMenuStyle),
    ksmNavOpenMenu: live(() => ksmNavOpenMenu),
    ksmShellDialogs: live(() => ksmShellDialogs),
  });
}
