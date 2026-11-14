// The app's ONE entry file (step 4d of #136): /app.js is the rolldown bundle of this file and the modules it imports
// (app/modules, app/engine), loaded as ONE ES module (<script type="module">). All the code is in the modules; what is
// left here, in this order, is:
//   1. the imports (one single-line `import {a,b} from '...';` per module)
//   2. the load-time calls of the modules, in the order their files used to load: the path-URL rewrite first, then the
//      init...() calls, the autosave listeners and timers, the Auth0 reveal
//   3. the window exports, last
// Functions that tests replace after load (KSMTest.app.NAME = ..., the goldens' window wrappers) are not here: their
// modules make them replaceable (app/modules/replaceable.js) and define window.NAME themselves.

import * as KSMEngine from './engine/index.ts';
import {setStoreStrict,store as KSMStore} from './store/index.ts';
import {ksmSetCurrentCourt,ksmSetPoolViewDivision,ksmSetPublicCourt,ksmSetScore,ksmShowDivision,ksmShowMatch,setStrayStoreWriteReporter,state} from './modules/app-state.js';
import {cloudHeaders,connectCloudSocket,initAuth0Access,ksmAuthReady,ksmCacheTournament,ksmFetchTournament,ksmReadHeaders,ksmRevealReadyUi,ksmUsesAccountAuth,loadTournamentFileAsNew,loadTournamentFromCloud,renderHomeTournamentLibrary,setSessionRole,toggleStaffSession} from './modules/auth/auth0-access.js';
import {initBootstrap,initFirstRender,ksmBootstrapInitialization} from './modules/boot.js';
import {dragPoolPlayer,dropPoolPlayer,initPasteFromExcel,insertPoolPlayer,renderAll,saveEditedPools,toggleEditPools} from './modules/court/court-context-and-pool-editing.js';
import {applyCourtState,findNextForCourt,individualMatchReady,initCourtStates,isTeamMatch,renderDivisions,sortIndividualDivisionMatches,sortTeamMatches} from './modules/court/court-match-order.js';
import {normalizeQueueGroupLabel,setCourtSupportMode} from './modules/court/court-queue-and-context.js';
import {activeScoreArrays,courtCurrentMatch,setShowDojoProfile,showCompProfile,showDojoProfile,teamSideLabel} from './modules/court/court-queue-and-views.js';
import {hansoku,matchRequiresWinner,nextMatch,point,redo,undo,updateUndoButton} from './modules/court/court-scoring-and-history.js';
import {ksmMatchTimerInput,ksmNormalizeTimerSettings,ksmSaveTimerSettings,ksmSetCourtTimerEnabled,ksmSetCourtTimerSound} from './modules/court/match-timer.js';
import {closeFusenDialog,confirmFusen,openFusenDialog,renderScore,updateScoreTournamentName} from './modules/court/scorekeeper-screen.js';
import {contextDivisionForCourt,renderContext,renderQueue,setCourtCompletePresentation,syncIndividualSingleElim} from './modules/court/split-court-templates.js';
import {buildChampionshipTemplateMatches,champMatchBySlot,championshipLabels,championshipTemplateForTotal,enforceUniqueIndividualMatches,expectedRoundCount,firstRoundName,individualLogicalMatchKey,maybeAdvanceChampionship,maybeCreateChampionship,poolSeedResolution,previousRoundName,recomputeChampionshipAdvancement,requiredSeedPlaces,roundSequenceFromFirst,seedNameForLabel,sourceLabelForRound,syncChampionshipTemplate} from './modules/engine/engine-championship.js';
import {applyIndividualNoShow,applyWholeTeamNoShow,eliminationFinalDone,generateDivisionState,generatePools,matchBelongsToCourt,regenerateSingleDivision,renderPools,selectScorekeeperDivision,setActiveDivision} from './modules/engine/engine-generation.js';
import {buildPoolMatches,championshipCourtFor,divisionCourtMode,eligibleIndividuals,eligibleTeams,isTeamDivision,poolMatchPairs,poolPlayerSlot,poolPlayerSlotLetter} from './modules/engine/engine-pools.js';
import {winnerOf} from './modules/engine/engine-result-integrity.js';
import {dedupeSingleElimMatches,maybeAdvanceIndividualSingleElim,sideLabelGeneric,specificMatchSideLabel} from './modules/engine/engine-single-elim.js';
import {APPROVED_DYNAMIC_MATCH_TYPES,appendApprovedDynamicMatches,isTeamRoundRobinDivision,ksmAddDaihyosenForTeamAwards,makeTiebreakMatch,maybeCreateTeamTiebreak,maybeCreateTiebreaks,teamPairSummary,teamRoundRobinProgress,teamStandings,tiebreakMatchesForGroup,unresolvedRequiredTiebreakGroup} from './modules/engine/engine-standings-and-tiebreaks.js';
import {maybeAdvanceTeamBracket,teamBracketNodesForCount} from './modules/engine/engine-team-bracket.js';
import {nodePairId,teamSlots} from './modules/engine/engine-team-matches.js';
import {jsArg} from './modules/html-text.js';
import {initFriendlyLinks,ksmEditTournamentSlug,ksmPendingSlug,ksmRenameTournamentSlug,ksmSaveShortUrl} from './modules/links/friendly-links.js';
import {initPathUrls,ksmHeaderLogo,ksmIsExplicitSpectatorUrl,ksmLinkParams,ksmLinkUrl,ksmRecordScreenPath,ksmReplaceUrl,ksmResolveSlug,ksmResolvedUrl,ksmShowRequestedScreen,ksmTournamentHomeUrl} from './modules/links/path-urls.js';
import {copyStreamOverlayLink} from './modules/links/stream-overlay-links.js';
import {chooseCourt,closeNavMenus,exportResultsAwards,exportTournamentBrackets,initNavigation,navigateTo,openRegistrationTab,regTab,renderProgress,show,toggleNavMenu} from './modules/navigation.js';
import {ksmAlignedRow,ksmBracket,ksmDaihyosenLabel,ksmDivisionCompleteInput,ksmFinalResults,ksmHansokuCounts,ksmIsRoundRobinDaihyosen,ksmKachinukiSheet,ksmNextCourtDivision,ksmOpenCourtSetup,ksmPlaceholderRow,ksmPoolStandingRows,ksmSetCourtRedSide,ksmSetCourtTvRedSide,ksmSignalCourtActions,ksmSignalCourtHeader,ksmSingleElimContext,ksmSingleElimRoundCard,ksmTeamResults,ksmTeamSheet,ksmText} from './modules/react-bridges/court.js';
import {initReactBridges} from './modules/react-bridges/index.js';
import {ksmAuthorizeLibraryTournament,ksmDecorateLibraryInput,ksmDeleteLibraryTournament,ksmDiscardLocalDraft,ksmDownloadDeleteBackup,ksmExportLibraryTournament,ksmLibraryAuthorizedIds,ksmOpenLocalDraft,ksmReadLocalDraft,ksmRenderLibrary,ksmReturnFromLibrary} from './modules/react-bridges/library.js';
import {ksmBetweenMatches,ksmRenderLiveScores,ksmUpNext} from './modules/react-bridges/live-scores.js';
import {ksmRenderOverview} from './modules/react-bridges/overview.js';
import {ksmPoolEditPools,ksmPoolEditToSave,ksmPoolEditorClick,ksmRenderPoolEditor} from './modules/react-bridges/pools.js';
import {ksmBindRegistrationEntry,ksmBindRegistrationRow,ksmBlurRedrawn,ksmConfirmNoShow,ksmCycleExhibitionStatus,ksmExhibitionsEnabled,ksmExhibitionsStale,ksmHtmlText,ksmImportCSV,ksmImportCSVFile,ksmPasteHelp,ksmRegistrationRowsStale,ksmRemoveCompetitor,ksmRemoveExhibition,ksmRemoveTeam,ksmRenderExhibitions,ksmRenderRegistration,ksmRenderTeams,ksmRenderTournamentStatus,ksmSetExhibitionField,ksmSetTeamField,ksmTeamsStale,ksmTournamentGenerated,ksmUpdateCompetitor,setKsmExhibitionsStale,setKsmRegistrationRowsStale,setKsmTeamsStale} from './modules/react-bridges/registration.js';
import {ksmRenderResults,ksmRenderResultsBracket,ksmSetResultAward} from './modules/react-bridges/results.js';
import {ksmDivisionPresetNames,ksmDivisionRemoveBlocked,ksmDivisionRenameBlocked,ksmMoveSetupDivision,ksmPublishSetup,ksmRemoveSetupDivision,ksmRenameSetupDivision,ksmRenderSetupDivisions,ksmRenderSetupHeader,ksmRestoreStandardDivisions} from './modules/react-bridges/setup.js';
import {ksmCanDeleteTournament,ksmCloseCloudModal,ksmCloseShellDialog,ksmCloudModalOpen,ksmConfirmDeleteTournament,ksmConfirmValidation,ksmContinueRegenerateDivision,ksmNavActive,ksmNavMenuStyle,ksmNavOpenMenu,ksmOpenCloudModal,ksmOpenDeleteTournament,ksmOpenDiagnostics,ksmOpenFileLoadModal,ksmOpenRegenerateDialog,ksmOpenTournamentAccess,ksmPersistentSaveStatusText,ksmPublishHeader,ksmRegeneratePoolDivision,ksmRenderConnectionStatus,ksmRenderPresence,ksmRenderSaveStatus,ksmRenderSessionRole,ksmSetActiveNav,ksmSetFusenOpen,ksmSetTestTools,ksmShellDialogs,ksmShellDialogsState,ksmShellHeaderState,ksmShowValidationDialog,ksmToggleTestTools,setKsmForgotTournament} from './modules/react-bridges/shell.js';
import {ksmLegacyCloudSession,ksmLegacyState,ksmLegacyStateVersion,ksmNotifyStateChanged} from './modules/react-bridges/state-bridge.js';
import {ksmRenderTv} from './modules/react-bridges/tv.js';
import {ksmAddGrandChampion,ksmDecideGrandChampion,ksmGrandChampion,ksmGrandChampionChoose,ksmGrandChampions,ksmMoveGrandChampion,ksmOpenGrandChampionWithdraw,ksmRemoveGrandChampion,ksmSyncGrandChampions,ksmToggleGrandChampionSource,ksmUpdateGrandChampion} from './modules/registration/grand-champion.js';
import {addAutoTeam,addExhibitionRow,addRow,addTeamRow,clearCompetitors,clearExhibitions,clearTeams,closeManagementModal,continueRegenerateDivision,cycleCompetitorStatus,cycleTeamStatus,loadFullTournament,loadSamples,loadTeamSamples,openRegenerateDivisionDialog,renderExhibitions,renderReg,renderTeams} from './modules/registration/registration.js';
import {ksmAddTeamDivision,ksmAssignTeamDivision,ksmDivisionName,ksmMoveTeamDivision,ksmNewTeamRows,ksmRemoveTeamDivision,ksmRenderTeamDivisions,ksmSetTeamCourt,ksmTeamDivisions,ksmTeamSettings,ksmUpdateTeamDivision} from './modules/registration/team-divisions.js';
import {renderTournamentStatus,requestTournamentGeneration,validateTournament} from './modules/registration/validation.js';
import {audienceMeta,initTvAssignedCourt,launchTvDisplay,poolDisplayComplete,renderPublic,tvAssignedCourt,tvIndividualSideLabel,tvUpcomingMatches} from './modules/results/live-scores.js';
import {previewAllDivisionSheets,previewFullPrintPacket,previewResultsSheet,previewSelectedDivisionSheet,printDivisionSheet} from './modules/results/print.js';
import {canModifyRepresentative,divisionComplete,exportCSV,setRepresentative,teamRoster} from './modules/results/results-and-awards.js';
import {addResultAward,closeResultsBracket,initResultsScreen,openResultsBracket,removeResultAward,renderResultsDashboard,resultPlacements} from './modules/results/results-screen.js';
import {buildTV3ViewModel,renderTvDisplay} from './modules/results/tv-display.js';
import {KSM_STAFF_TOURNAMENT,KSM_V316_STAFF_SESSION,canCloudWrite,createNewTournament,initializeCloudRoleFromUrl,installRoleBanner,isReadOnlySession,ksmKeepStaffOutbox,ksmRouteLoading,openTournamentAccess,openTournamentFromHome,performCloudSave,promptNewStaffPassword,rememberTournament,sessionKey,setKsmRouteLoading,showHomePage,spectatorLink,v316StaffPassword} from './modules/session/staff-session-and-library.js';
import {KSM_DETACHED_DRAFT_KEY,initEmptySetup,initEmptyState,initTournamentSwitcher,ksmEmptySetup,ksmEmptyState,ksmRefreshTournamentChip,ksmShowLibrary,ksmStartupHasCache,ksmStartupLoadFailed,ksmTournamentTransition,setKsmStartupHasCache,setKsmTournamentTransition} from './modules/session/tournament-switcher.js';
import {ksmDangerRegenerate,ksmSyncDangerZone} from './modules/setup/danger-zone.js';
import {courtSummaryFor,directorDivisionProgress,directorSingleElimTotal,initDirectorRefresh,ksmDirectorRefreshTimer,renderDirector,setDirectorRefreshTimer,tournamentSummary} from './modules/setup/director-progress.js';
import {addCustomDivision,initSetupHeader,renderDivisionSetup,saveSetup,setDivisionCourt,setDivisionFormat,setSetDivisionCourt,syncSetupHeader,toggleDivision} from './modules/setup/division-setup.js';
import {downloadActionHistorySample,downloadSnapshotAnalysis,readCloudDiagnosticsState,resetLegacyTournamentDataOnce,writeCloudDiagnosticsState} from './modules/sync/cloud-diagnostics.js';
import {applyRemoteCloudRecord,applyTournamentPayload,closeCloudModal,cloudDiagnostics,confirmTournamentFileLoad,copyTextValue,copyTournamentId,disconnectCloudSocket,flushCloudOutbox,initCloudRealtime,isTvSession,ksmApplyingRemoteSnapshot,ksmCancelReplace,ksmCloudReconnectTimer,ksmCloudSaveInFlight,ksmCloudSavePending,ksmCloudSocket,ksmCloudTimer,ksmConfirmedMutationVersion,ksmDeferredRemoteRecord,ksmFileReplace,ksmLastSuccessfulSaveAt,ksmLocalMutationVersion,ksmPendingTournamentFile,ksmQueuedSaveRetryTimer,ksmReplaceAnyway,ksmSaveStatusMode,ksmSaveTimer,ksmSendCourtClock,ksmSendTieFlash,ksmTieFlashConnected,loadRecoveryFile,loadTournamentFromFile,manualSaveTournament,queueUnsyncedStaffWorkBeforeUnload,reconnectTvRealtime,renderCloudPresence,replaceTournamentFromFile,retryQueuedCloudSave,saveTournamentToCloudWithReason,setKsmApplyingRemoteSnapshot,setKsmCloudReconnectTimer,setKsmCloudSaveInFlight,setKsmCloudSavePending,setKsmCloudSocket,setKsmCloudTimer,setKsmConfirmedMutationVersion,setKsmDeferredRemoteRecord,setKsmLastSuccessfulSaveAt,setKsmLocalMutationVersion,setKsmPendingTournamentFile,setKsmSaveStatusMode,setKsmSaveTimer,showKsmToast,tournamentFilePayload,triggerLoadRecoveryFile,triggerLoadTournament,tvLink} from './modules/sync/cloud-realtime-save-and-load.js';
import {applySetupSnapshot,autoSaveTournament,clearOutbox,cloudSession,downloadRecoveryFile,getSetupSnapshot,initCloudSession,initSetupSettings,ksmSetSetting,ksmSetting,ksmSessionRole,markLocalSave,persistCloudSession,readOutbox,renderPersistentSaveStatus,saveNow,setConnectionStatus,setKsmSessionRole,tournamentPayload,tournamentSettings,updateSaveStatus,writeOutbox} from './modules/sync/cloud-session-and-autosave.js';
import {KSM_AUTOSAVE_CLOUD_ID,KSM_CLOUD_OUTBOX_KEY,KSM_CLOUD_SESSION_KEY,KSM_MERGE_LABELS,KSM_SAVE_KEY,applyCourtSides,cloneJson,historyEntryIdentity,isValidMatchObject,ksmDeferredSyncRecord,ksmKeepRestoreRecovery,ksmRestoreRecoveries,localChangesPending,localCourtDivision,matchBelongsToCourtInState,matchHasSyncIdentity,matchSyncIdentity,mergeLocalEditsThreeWay,nextReadyIndexInState,normalizeCourt,pinCourtLocally,rebaseLocalPayloadOnRecord,redOnLeftForCourt,rememberLocalCourtDivision,replayCourtMatchOps,setKsmDeferredSyncRecord} from './modules/sync/sync-state-and-rebase.js';
import {KSM_TAB_ID,initTwoTabs,ksmOutboxKey,ksmReleaseReplaceBackups,ksmWriterId} from './modules/sync/two-tabs.js';
import {initUndoRegenerate,ksmRefreshRestorePoint,ksmRenderUndoRegenerate,ksmUndoRegenerateOffered} from './modules/sync/undo-regenerate.js';
import {scheduleAutoSave,scheduleAutoSaveOriginal} from './modules/sync/cloud-session-and-autosave.js';

// ---------- Load-time calls, in their old order ----------

// Path URLs (app/modules/links/path-urls.js, step 4a of #136). This runs first in the entry, after the imports:
// the address rewrite and the explicit-spectator flag are taken before any other load-time code reads the address.
initPathUrls();

// The store (app/store, #15; docs/STORE.md section 2, point 8). app.js is the production build: a write the
// conversion missed is applied and an assignment logged to the cloud diagnostics, never thrown. The browser tests
// (window.KSM_STRICT_STORE, tests/lib/ksm-test-api.js) run strict, as the Node tests do, so such a write fails there.
if(window.KSM_STRICT_STORE===true)setStoreStrict(true);
setStrayStoreWriteReporter(write=>{console.warn('[KSM Store] A store field was assigned outside an action',write);writeCloudDiagnosticsState({storeStrayWrite:{...write,at:new Date().toISOString()}})});

// The Setup form (tournament.settings, #15 PR 8): the store takes the values the inputs opened with, and the edit
// listener goes first among the document's listeners, so the autosave's listener and each field's own handler read the
// edited value from the store.
initSetupSettings();

// show() is in app/modules/navigation.js, saveSetup() and setDivisionCourt() in app/modules/setup/division-setup.js
// (step 4a of #136). The empty state is taken here, where this file used to load.
initEmptyState();

// #129 part 3: Undo regenerate lives in app/modules/sync/undo-regenerate.js (step 3d of #136). Its listeners are
// added here, where this file used to load, so they keep their place among the app's other listeners.
initUndoRegenerate();

// The Setup field: the document's capture listener has dispatched the new value (state.teamAwardMode is a getter over it,
// #15 PR 8b) and its inline handler has run saveSetup(); the document's change listener has scheduled the autosave, which then carries the new bouts with the new mode.
document.getElementById('teamAwardMode')?.addEventListener('change',()=>{if(ksmAddDaihyosenForTeamAwards().length)renderAll()});

// renderAll() is in app/modules/court/court-context-and-pool-editing.js (step 4a of #136). The paste listener is added here, where this file used to load.
initPasteFromExcel();

// F36 (two tabs) lives in app/modules/sync/two-tabs.js (step 3d of #136). Its load-time side effects (the
// beforeunload/pagehide/pageshow/visibilitychange listeners, the heartbeat, the clean-ups) run here, where this
// file used to load.
initTwoTabs();

// Cloud diagnostics live in app/modules/sync/cloud-diagnostics.js (step 3d of #136). The one-time reset of
// v3.17.3 runs here, where this file used to load: before 20-'s initCloudSession() reads the stored session.
resetLegacyTournamentDataOnce();

// The cloud session, outbox and autosave live in app/modules/sync/cloud-session-and-autosave.js (step 3d of #136).
// cloudSession is read from localStorage here (after the reset above).
initCloudSession();

// Live sync, cloud saves and tournament files live in app/modules/sync/cloud-realtime-save-and-load.js: its load-time side
// effects (initCloudRealtime(), then the save listeners and timers below, in their old order). The document listeners hold
// the original scheduleAutoSave in `input` and `change`, as before step 4d (a test's replacement of window.scheduleAutoSave
// has never seen those two; the goldens' approved saves lists depend on it); the click listener calls the name, so it
// goes through the replaceable one, as it did.
initCloudRealtime();
window.addEventListener('beforeunload', queueUnsyncedStaffWorkBeforeUnload);
window.addEventListener('beforeunload', autoSaveTournament);
document.addEventListener('input', scheduleAutoSaveOriginal, true);
document.addEventListener('change', scheduleAutoSaveOriginal, true);
document.addEventListener('click', function(e){ if(e.target.closest('button,.status,.search-item,.tab,.seg,.x')&&!e.target.closest('[data-testid="nav-toggle"],.mobile-nav-close')&&!ksmPoolEditorClick(e.target)&&!e.target.closest('.tie-flash-action')&&!e.target.closest('.match-timer')) scheduleAutoSave(e); }, true);
setInterval(()=>autoSaveTournament('10-minute safety autosave'),600000);
setInterval(renderPersistentSaveStatus,60000);

// The modules' load-time side effects, in the order they ran when each module was its own file (step 4a of #136), so every
// listener, timer and read keeps its place among the app's others.

// Navigation (app/modules/navigation.js).
initNavigation();
// The TV's assigned court, read from the address (app/modules/results/live-scores.js).
initTvAssignedCourt();
// The Results screen's Escape key (app/modules/results/results-screen.js).
initResultsScreen();
// The setup name listener and the Overview timer's visibility listener (app/modules/setup/division-setup.js,
// app/modules/setup/director-progress.js).
initSetupHeader();
initDirectorRefresh();
// The empty setup, then the first render of the page (app/modules/session/tournament-switcher.js, app/modules/boot.js).
initEmptySetup();
initFirstRender();
// Friendly links (the tournament short name, the cached records) live in app/modules/links/friendly-links.js and
// the stream overlay links in app/modules/links/stream-overlay-links.js; staff sessions, the role and the Tournament
// Library in app/modules/session/staff-session-and-library.js (step 3d of #136). The pending short name is read
// from sessionStorage here, where this file used to load.
initFriendlyLinks();
// Switching tournaments lives in app/modules/session/tournament-switcher.js (step 3d of #136). Its load-time side
// effects (the open tournament's address, the popstate listener) run here, where this file used to load.
initTournamentSwitcher();
// Boot (app/modules/boot.js) and the React bridges (app/modules/react-bridges/) load here (step 3d of #136):
// the bootstrap first, then each bridge's load-time listeners, in the order their files used to load (35- to 44-).
initBootstrap();
initReactBridges();

// Auth0 accounts live in app/modules/auth/auth0-access.js (step 3d of #136). Here, where this file used to load:
// its load-time side effects (initAuth0Access(): the auth-ready promise, window.ksmAuthBridge) and the ready-UI reveal,
// which waits for ksmBootstrapInitialization (app/modules/boot.js). The account rules of ksmCanDeleteTournament (shell),
// ksmCanManageLibraryTournament and ksmDecorateLibraryInput (library) are the final functions of app/modules/react-bridges.
initAuth0Access();
Promise.all([ksmBootstrapInitialization,ksmAuthReady]).then(ksmRevealReadyUi,ksmRevealReadyUi);
// Preserve the existing module-load failure notices when the account module cannot run.
document.addEventListener('DOMContentLoaded',()=>{if(!window.ksmShellMounted)ksmRevealReadyUi()});

// ---------- Window exports, last ----------

// /app.js is ONE ES module, so a top-level `function`/`var`/`let`/`const` is no longer a property of `window`. This
// section, the LAST of the entry, puts on `window` exactly the names that code OUTSIDE the module reaches:
//   - inline on*="..." handlers (app/index.html, HTML strings in app/modules and app/react)
//   - window.NAME and the legacy() / LegacyGlobals reads of app/react
//   - the bare names tests/lib/ksm-test-api.js (KSMTest) uses
// tests/window-exports-test.mjs keeps it complete (every name reached from outside is listed) and honest
// (every name is an import or declaration of this file). Names are sorted, grouped by the module that declares them.
// The functions tests replace (replaceable(), app/modules/replaceable.js) put themselves on window.
//
// First block: by value (the binding is never assigned after its declaration).
Object.assign(window, {
  // The engine namespace imported above: app code imports it, window.KSMEngine stays for tests and anything outside (step 4b of #136).
  KSMEngine,
  // The store (app/store): the React islands are a separate bundle and read this one instance (docs/STORE.md section 4).
  KSMStore,
  // app/modules/app-state.js: the Pools division select's inline handler; the court view's setters (tests/lib/ksm-test-api.js)
  ksmSetPoolViewDivision, ksmSetCurrentCourt, ksmSetPublicCourt, ksmSetScore, ksmShowDivision, ksmShowMatch,
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
  ksmRenderTeamDivisions, ksmSetTeamCourt, ksmTeamDivisions, ksmTeamSettings, ksmUpdateTeamDivision,
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
  // app/modules/engine/engine-pools.js
  buildPoolMatches, championshipCourtFor, divisionCourtMode, eligibleIndividuals, eligibleTeams, poolMatchPairs, poolPlayerSlot,
  poolPlayerSlotLetter,
  // app/modules/engine/engine-team-matches.js
  teamSlots,
  // app/modules/engine/engine-team-matches.js
  nodePairId,
  // app/modules/engine/engine-single-elim.js
  dedupeSingleElimMatches, maybeAdvanceIndividualSingleElim, sideLabelGeneric,
  // app/modules/engine/engine-single-elim.js
  specificMatchSideLabel,
  // app/modules/engine/engine-team-bracket.js
  maybeAdvanceTeamBracket,
  // app/modules/engine/engine-team-bracket.js
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
  // app/modules/engine/engine-result-integrity.js
  winnerOf,
  // app/modules/engine/engine-standings-and-tiebreaks.js
  appendApprovedDynamicMatches, isTeamRoundRobinDivision, ksmAddDaihyosenForTeamAwards, maybeCreateTeamTiebreak,
  maybeCreateTiebreaks, teamStandings,
  // app/modules/engine/engine-standings-and-tiebreaks.js
  APPROVED_DYNAMIC_MATCH_TYPES, makeTiebreakMatch, teamPairSummary, teamRoundRobinProgress, tiebreakMatchesForGroup,
  unresolvedRequiredTiebreakGroup,
  // app/modules/engine/engine-championship.js
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
  applySetupSnapshot, clearOutbox, downloadRecoveryFile, getSetupSnapshot, ksmSetSetting, ksmSetting, markLocalSave, persistCloudSession,
  readOutbox, renderPersistentSaveStatus, saveNow, setConnectionStatus, tournamentPayload, tournamentSettings, updateSaveStatus, writeOutbox,
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
    // app/modules/sync/cloud-session-and-autosave.js
    cloudSession: live(() => cloudSession),
    ksmSessionRole: live(() => ksmSessionRole, v => { setKsmSessionRole(v); }),
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
