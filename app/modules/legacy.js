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

// 00-path-urls.js
export const ksmIsExplicitSpectatorUrl = /** @type {typeof globalThis.ksmIsExplicitSpectatorUrl} */ ((...args) => w.ksmIsExplicitSpectatorUrl(...args));
export const ksmLinkParams = /** @type {typeof globalThis.ksmLinkParams} */ ((...args) => w.ksmLinkParams(...args));
export const ksmLinkUrl = /** @type {typeof globalThis.ksmLinkUrl} */ ((...args) => w.ksmLinkUrl(...args));
export const ksmRecordScreenPath = /** @type {typeof globalThis.ksmRecordScreenPath} */ ((...args) => w.ksmRecordScreenPath(...args));
export const ksmReplaceUrl = /** @type {typeof globalThis.ksmReplaceUrl} */ ((...args) => w.ksmReplaceUrl(...args));
export const ksmResolveSlug = /** @type {typeof globalThis.ksmResolveSlug} */ ((...args) => w.ksmResolveSlug(...args));
export const ksmResolvedUrl = /** @type {typeof globalThis.ksmResolvedUrl} */ ((...args) => w.ksmResolvedUrl(...args));
export const ksmShowRequestedScreen = /** @type {typeof globalThis.ksmShowRequestedScreen} */ ((...args) => w.ksmShowRequestedScreen(...args));

// 00-react-bridge.js
export const ksmNotifyStateChanged = /** @type {typeof globalThis.ksmNotifyStateChanged} */ ((...args) => w.ksmNotifyStateChanged(...args));

// 01-state-and-setup.js
export const ksmEmptyState = /** @type {typeof globalThis.ksmEmptyState} */ ((...args) => w.ksmEmptyState(...args));
export const saveSetup = /** @type {typeof globalThis.saveSetup} */ ((...args) => w.saveSetup(...args));
export const show = /** @type {typeof globalThis.show} */ ((...args) => w.show(...args));

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
export const noteLocalMutation = /** @type {typeof globalThis.noteLocalMutation} */ ((...args) => w.noteLocalMutation(...args));

// 20-cloud-session-and-autosave.js
export const criticalAutoSave = /** @type {typeof globalThis.criticalAutoSave} */ ((...args) => w.criticalAutoSave(...args));
export const saveAuto = /** @type {typeof globalThis.saveAuto} */ ((...args) => w.saveAuto(...args));
export const scheduleAutoSave = /** @type {typeof globalThis.scheduleAutoSave} */ ((...args) => w.scheduleAutoSave(...args));

// 22-scorekeeper-screen.js
export const renderScore = /** @type {typeof globalThis.renderScore} */ ((...args) => w.renderScore(...args));

// 23-navigation.js
export const closeNavMenus = /** @type {typeof globalThis.closeNavMenus} */ ((...args) => w.closeNavMenus(...args));
export const navigateTo = /** @type {typeof globalThis.navigateTo} */ ((...args) => w.navigateTo(...args));
export const renderProgress = /** @type {typeof globalThis.renderProgress} */ ((...args) => w.renderProgress(...args));

// 25-live-scores.js
export const tvAssignedCourt = /** @type {typeof globalThis.tvAssignedCourt} */ ((...args) => w.tvAssignedCourt(...args));

// 30-setup-header-and-director.js
export const ksmDirectorRefreshTimer = /** @type {typeof globalThis.ksmDirectorRefreshTimer} */ ((...args) => w.ksmDirectorRefreshTimer(...args));
export const setDirectorRefreshTimer = /** @type {typeof globalThis.setDirectorRefreshTimer} */ ((...args) => w.setDirectorRefreshTimer(...args));

// 32-split-court-templates.js
export const ksmEmptySetup = /** @type {typeof globalThis.ksmEmptySetup} */ ((...args) => w.ksmEmptySetup(...args));

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

// 40-react-library.js
export const ksmRenderLibrary = /** @type {typeof globalThis.ksmRenderLibrary} */ ((...args) => w.ksmRenderLibrary(...args));

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
export const ksmHtmlText = /** @type {typeof globalThis.ksmHtmlText} */ ((...args) => w.ksmHtmlText(...args));
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
export const ksmOpenDiagnostics = /** @type {typeof globalThis.ksmOpenDiagnostics} */ ((...args) => w.ksmOpenDiagnostics(...args));
export const ksmOpenFileLoadModal = /** @type {typeof globalThis.ksmOpenFileLoadModal} */ ((...args) => w.ksmOpenFileLoadModal(...args));
export const ksmOpenRegenerateDialog = /** @type {typeof globalThis.ksmOpenRegenerateDialog} */ ((...args) => w.ksmOpenRegenerateDialog(...args));
export const ksmOpenTournamentAccess = /** @type {typeof globalThis.ksmOpenTournamentAccess} */ ((...args) => w.ksmOpenTournamentAccess(...args));
export const ksmPersistentSaveStatusText = /** @type {typeof globalThis.ksmPersistentSaveStatusText} */ ((...args) => w.ksmPersistentSaveStatusText(...args));
export const ksmPublishHeader = /** @type {typeof globalThis.ksmPublishHeader} */ ((...args) => w.ksmPublishHeader(...args));
export const ksmRenderConnectionStatus = /** @type {typeof globalThis.ksmRenderConnectionStatus} */ ((...args) => w.ksmRenderConnectionStatus(...args));
export const ksmRenderPresence = /** @type {typeof globalThis.ksmRenderPresence} */ ((...args) => w.ksmRenderPresence(...args));
export const ksmRenderSaveStatus = /** @type {typeof globalThis.ksmRenderSaveStatus} */ ((...args) => w.ksmRenderSaveStatus(...args));
export const ksmRenderSessionRole = /** @type {typeof globalThis.ksmRenderSessionRole} */ ((...args) => w.ksmRenderSessionRole(...args));
export const ksmSetFusenOpen = /** @type {typeof globalThis.ksmSetFusenOpen} */ ((...args) => w.ksmSetFusenOpen(...args));
export const ksmShowValidationDialog = /** @type {typeof globalThis.ksmShowValidationDialog} */ ((...args) => w.ksmShowValidationDialog(...args));
export const setKsmForgotTournament = /** @type {typeof globalThis.setKsmForgotTournament} */ ((...args) => w.setKsmForgotTournament(...args));
