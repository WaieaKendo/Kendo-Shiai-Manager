// @ts-check
// Step 3d of #136: the calls the moved code makes OUT of a module INTO app/js code that has not moved yet.
// One small wrapper per such function, calling it through `window` at call time. That is what keeps the
// wrappers honest: a test (or React) that replaces window.NAME is seen by the module's own calls, as the live
// accessors of app/js/99-window-exports.js promise, and nothing is read when this file loads (the entry has not
// run yet then). Calls between modules are ordinary imports; use this file only for app/js.
//
// EVERY wrapper here is removed when the area that declares its function moves into a module (its users then
// import it directly). tests/window-exports-test.mjs fails when a wrapper names a function that
// app/js/99-window-exports.js does not export (or that app/js no longer declares), so a stale wrapper cannot hide.
// One shape only: `export const NAME = (...args) => w.NAME(...args)`. A const of app/js is reached through a small
// getter function declared next to it (cloudSession: ksmLegacyCloudSession(), KSM_TAB_ID: ksmTabId()): its value
// cannot be read when this file loads.
const w = /** @type {any} */ (window);

// 00-react-bridge.js
export const ksmLegacyCloudSession = /** @type {typeof globalThis.ksmLegacyCloudSession} */ ((...args) => w.ksmLegacyCloudSession(...args));
export const ksmNotifyStateChanged = /** @type {typeof globalThis.ksmNotifyStateChanged} */ ((...args) => w.ksmNotifyStateChanged(...args));

// 01-state-and-setup.js
export const saveSetup = /** @type {typeof globalThis.saveSetup} */ ((...args) => w.saveSetup(...args));
export const show = /** @type {typeof globalThis.show} */ ((...args) => w.show(...args));

// 03-undo-regenerate.js
export const ksmRefreshRestorePoint = /** @type {typeof globalThis.ksmRefreshRestorePoint} */ ((...args) => w.ksmRefreshRestorePoint(...args));
export const ksmRenderUndoRegenerate = /** @type {typeof globalThis.ksmRenderUndoRegenerate} */ ((...args) => w.ksmRenderUndoRegenerate(...args));
export const ksmUndoRegenerateOffered = /** @type {typeof globalThis.ksmUndoRegenerateOffered} */ ((...args) => w.ksmUndoRegenerateOffered(...args));

// 08-engine-generation.js
export const applyIndividualNoShow = /** @type {typeof globalThis.applyIndividualNoShow} */ ((...args) => w.applyIndividualNoShow(...args));
export const applyWholeTeamNoShow = /** @type {typeof globalThis.applyWholeTeamNoShow} */ ((...args) => w.applyWholeTeamNoShow(...args));
export const eliminationFinalDone = /** @type {typeof globalThis.eliminationFinalDone} */ ((...args) => w.eliminationFinalDone(...args));
export const generateDivisionState = /** @type {typeof globalThis.generateDivisionState} */ ((...args) => w.generateDivisionState(...args));
export const generatePools = /** @type {typeof globalThis.generatePools} */ ((...args) => w.generatePools(...args));
export const matchBelongsToCourt = /** @type {typeof globalThis.matchBelongsToCourt} */ ((...args) => w.matchBelongsToCourt(...args));
export const renderPools = /** @type {typeof globalThis.renderPools} */ ((...args) => w.renderPools(...args));
export const setActiveDivision = /** @type {typeof globalThis.setActiveDivision} */ ((...args) => w.setActiveDivision(...args));

// 13-engine-standings-and-tiebreaks.js
export const initialPoolStandings = /** @type {typeof globalThis.initialPoolStandings} */ ((...args) => w.initialPoolStandings(...args));
export const pendingTiebreak = /** @type {typeof globalThis.pendingTiebreak} */ ((...args) => w.pendingTiebreak(...args));

// 14-engine-championship.js
export const poolPositionsResolved = /** @type {typeof globalThis.poolPositionsResolved} */ ((...args) => w.poolPositionsResolved(...args));

// 15-engine-pool-standings.js
export const poolStandings = /** @type {typeof globalThis.poolStandings} */ ((...args) => w.poolStandings(...args));

// 16-court-context-and-pool-editing.js
export const renderAll = /** @type {typeof globalThis.renderAll} */ ((...args) => w.renderAll(...args));

// 18-sync-state-and-rebase.js
export const applyCourtSides = /** @type {typeof globalThis.applyCourtSides} */ ((...args) => w.applyCourtSides(...args));
export const cloneJson = /** @type {typeof globalThis.cloneJson} */ ((...args) => w.cloneJson(...args));
export const historyEntryIdentity = /** @type {typeof globalThis.historyEntryIdentity} */ ((...args) => w.historyEntryIdentity(...args));
export const isValidMatchObject = /** @type {typeof globalThis.isValidMatchObject} */ ((...args) => w.isValidMatchObject(...args));
export const ksmIsApplyingRemoteSnapshot = /** @type {typeof globalThis.ksmIsApplyingRemoteSnapshot} */ ((...args) => w.ksmIsApplyingRemoteSnapshot(...args));
export const localCourtDivision = /** @type {typeof globalThis.localCourtDivision} */ ((...args) => w.localCourtDivision(...args));
export const matchBelongsToCourtInState = /** @type {typeof globalThis.matchBelongsToCourtInState} */ ((...args) => w.matchBelongsToCourtInState(...args));
export const matchHasSyncIdentity = /** @type {typeof globalThis.matchHasSyncIdentity} */ ((...args) => w.matchHasSyncIdentity(...args));
export const matchSyncIdentity = /** @type {typeof globalThis.matchSyncIdentity} */ ((...args) => w.matchSyncIdentity(...args));
export const nextReadyIndexInState = /** @type {typeof globalThis.nextReadyIndexInState} */ ((...args) => w.nextReadyIndexInState(...args));
export const pinCourtLocally = /** @type {typeof globalThis.pinCourtLocally} */ ((...args) => w.pinCourtLocally(...args));
export const redOnLeftForCourt = /** @type {typeof globalThis.redOnLeftForCourt} */ ((...args) => w.redOnLeftForCourt(...args));
export const rememberLocalCourtDivision = /** @type {typeof globalThis.rememberLocalCourtDivision} */ ((...args) => w.rememberLocalCourtDivision(...args));
export const replayCourtMatchOps = /** @type {typeof globalThis.replayCourtMatchOps} */ ((...args) => w.replayCourtMatchOps(...args));

// 18-two-tabs.js
export const ksmTabId = /** @type {typeof globalThis.ksmTabId} */ ((...args) => w.ksmTabId(...args));

// 19-cloud-diagnostics.js
export const writeCloudDiagnosticsState = /** @type {typeof globalThis.writeCloudDiagnosticsState} */ ((...args) => w.writeCloudDiagnosticsState(...args));

// 20-cloud-session-and-autosave.js
export const criticalAutoSave = /** @type {typeof globalThis.criticalAutoSave} */ ((...args) => w.criticalAutoSave(...args));
export const getSetupSnapshot = /** @type {typeof globalThis.getSetupSnapshot} */ ((...args) => w.getSetupSnapshot(...args));
export const ksmCurrentSessionRole = /** @type {typeof globalThis.ksmCurrentSessionRole} */ ((...args) => w.ksmCurrentSessionRole(...args));
export const saveAuto = /** @type {typeof globalThis.saveAuto} */ ((...args) => w.saveAuto(...args));
export const saveNow = /** @type {typeof globalThis.saveNow} */ ((...args) => w.saveNow(...args));
export const scheduleAutoSave = /** @type {typeof globalThis.scheduleAutoSave} */ ((...args) => w.scheduleAutoSave(...args));
export const tournamentPayload = /** @type {typeof globalThis.tournamentPayload} */ ((...args) => w.tournamentPayload(...args));
export const tournamentSettings = /** @type {typeof globalThis.tournamentSettings} */ ((...args) => w.tournamentSettings(...args));
export const updateSaveStatus = /** @type {typeof globalThis.updateSaveStatus} */ ((...args) => w.updateSaveStatus(...args));

// 21-cloud-realtime-save-and-load.js
export const isTvSession = /** @type {typeof globalThis.isTvSession} */ ((...args) => w.isTvSession(...args));
export const manualSaveTournament = /** @type {typeof globalThis.manualSaveTournament} */ ((...args) => w.manualSaveTournament(...args));
export const showKsmToast = /** @type {typeof globalThis.showKsmToast} */ ((...args) => w.showKsmToast(...args));
export const tvLink = /** @type {typeof globalThis.tvLink} */ ((...args) => w.tvLink(...args));

// 22-scorekeeper-screen.js
export const renderScore = /** @type {typeof globalThis.renderScore} */ ((...args) => w.renderScore(...args));

// 23-navigation.js
export const closeNavMenus = /** @type {typeof globalThis.closeNavMenus} */ ((...args) => w.closeNavMenus(...args));
export const renderProgress = /** @type {typeof globalThis.renderProgress} */ ((...args) => w.renderProgress(...args));

// 33-staff-session-and-library.js
export const isReadOnlySession = /** @type {typeof globalThis.isReadOnlySession} */ ((...args) => w.isReadOnlySession(...args));

// 33-tournament-switcher.js
export const ksmRefreshTournamentChip = /** @type {typeof globalThis.ksmRefreshTournamentChip} */ ((...args) => w.ksmRefreshTournamentChip(...args));

// 35-react-court.js
export const ksmSignalCourtActions = /** @type {typeof globalThis.ksmSignalCourtActions} */ ((...args) => w.ksmSignalCourtActions(...args));
export const ksmSignalCourtHeader = /** @type {typeof globalThis.ksmSignalCourtHeader} */ ((...args) => w.ksmSignalCourtHeader(...args));

// 36-react-live-scores.js
export const ksmRenderLiveScores = /** @type {typeof globalThis.ksmRenderLiveScores} */ ((...args) => w.ksmRenderLiveScores(...args));

// 37-react-tv.js
export const ksmRenderTv = /** @type {typeof globalThis.ksmRenderTv} */ ((...args) => w.ksmRenderTv(...args));

// 38-react-results.js
export const ksmRenderResults = /** @type {typeof globalThis.ksmRenderResults} */ ((...args) => w.ksmRenderResults(...args));
export const ksmRenderResultsBracket = /** @type {typeof globalThis.ksmRenderResultsBracket} */ ((...args) => w.ksmRenderResultsBracket(...args));

// 39-react-overview.js
export const ksmRenderOverview = /** @type {typeof globalThis.ksmRenderOverview} */ ((...args) => w.ksmRenderOverview(...args));

// 41-react-pools.js
export const ksmPoolEditPools = /** @type {typeof globalThis.ksmPoolEditPools} */ ((...args) => w.ksmPoolEditPools(...args));
export const ksmPoolEditToSave = /** @type {typeof globalThis.ksmPoolEditToSave} */ ((...args) => w.ksmPoolEditToSave(...args));
export const ksmRenderPoolEditor = /** @type {typeof globalThis.ksmRenderPoolEditor} */ ((...args) => w.ksmRenderPoolEditor(...args));

// 42-react-setup.js
export const ksmPublishSetup = /** @type {typeof globalThis.ksmPublishSetup} */ ((...args) => w.ksmPublishSetup(...args));
export const ksmRenderSetupDivisions = /** @type {typeof globalThis.ksmRenderSetupDivisions} */ ((...args) => w.ksmRenderSetupDivisions(...args));
export const ksmRenderSetupHeader = /** @type {typeof globalThis.ksmRenderSetupHeader} */ ((...args) => w.ksmRenderSetupHeader(...args));

// 43-react-registration.js
export const ksmConfirmNoShow = /** @type {typeof globalThis.ksmConfirmNoShow} */ ((...args) => w.ksmConfirmNoShow(...args));
export const ksmRenderExhibitions = /** @type {typeof globalThis.ksmRenderExhibitions} */ ((...args) => w.ksmRenderExhibitions(...args));
export const ksmRenderRegistration = /** @type {typeof globalThis.ksmRenderRegistration} */ ((...args) => w.ksmRenderRegistration(...args));
export const ksmRenderTeams = /** @type {typeof globalThis.ksmRenderTeams} */ ((...args) => w.ksmRenderTeams(...args));
export const ksmRenderTournamentStatus = /** @type {typeof globalThis.ksmRenderTournamentStatus} */ ((...args) => w.ksmRenderTournamentStatus(...args));

// 44-react-shell.js
export const ksmCanDeleteTournament = /** @type {typeof globalThis.ksmCanDeleteTournament} */ ((...args) => w.ksmCanDeleteTournament(...args));
export const ksmCloseCloudModal = /** @type {typeof globalThis.ksmCloseCloudModal} */ ((...args) => w.ksmCloseCloudModal(...args));
export const ksmCloseShellDialog = /** @type {typeof globalThis.ksmCloseShellDialog} */ ((...args) => w.ksmCloseShellDialog(...args));
export const ksmCloudModalOpen = /** @type {typeof globalThis.ksmCloudModalOpen} */ ((...args) => w.ksmCloudModalOpen(...args));
export const ksmContinueRegenerateDivision = /** @type {typeof globalThis.ksmContinueRegenerateDivision} */ ((...args) => w.ksmContinueRegenerateDivision(...args));
export const ksmOpenCloudModal = /** @type {typeof globalThis.ksmOpenCloudModal} */ ((...args) => w.ksmOpenCloudModal(...args));
export const ksmOpenRegenerateDialog = /** @type {typeof globalThis.ksmOpenRegenerateDialog} */ ((...args) => w.ksmOpenRegenerateDialog(...args));
export const ksmSetFusenOpen = /** @type {typeof globalThis.ksmSetFusenOpen} */ ((...args) => w.ksmSetFusenOpen(...args));
export const ksmShowValidationDialog = /** @type {typeof globalThis.ksmShowValidationDialog} */ ((...args) => w.ksmShowValidationDialog(...args));
