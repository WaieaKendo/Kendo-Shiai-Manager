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

// 01-team-divisions.js
export const ksmDivisionName = /** @type {typeof globalThis.ksmDivisionName} */ ((...args) => w.ksmDivisionName(...args));
export const ksmTeamDivisions = /** @type {typeof globalThis.ksmTeamDivisions} */ ((...args) => w.ksmTeamDivisions(...args));

// 04-engine-pools.js
export const isTeamDivision = /** @type {typeof globalThis.isTeamDivision} */ ((...args) => w.isTeamDivision(...args));

// 07-engine-team-bracket.js
export const maybeAdvanceTeamBracket = /** @type {typeof globalThis.maybeAdvanceTeamBracket} */ ((...args) => w.maybeAdvanceTeamBracket(...args));

// 08-engine-generation.js
export const eliminationFinalDone = /** @type {typeof globalThis.eliminationFinalDone} */ ((...args) => w.eliminationFinalDone(...args));
export const matchBelongsToCourt = /** @type {typeof globalThis.matchBelongsToCourt} */ ((...args) => w.matchBelongsToCourt(...args));
export const renderPools = /** @type {typeof globalThis.renderPools} */ ((...args) => w.renderPools(...args));
export const setActiveDivision = /** @type {typeof globalThis.setActiveDivision} */ ((...args) => w.setActiveDivision(...args));

// 13-engine-standings-and-tiebreaks.js
export const appendApprovedDynamicMatches = /** @type {typeof globalThis.appendApprovedDynamicMatches} */ ((...args) => w.appendApprovedDynamicMatches(...args));
export const maybeCreateTeamTiebreak = /** @type {typeof globalThis.maybeCreateTeamTiebreak} */ ((...args) => w.maybeCreateTeamTiebreak(...args));
export const maybeCreateTiebreaks = /** @type {typeof globalThis.maybeCreateTiebreaks} */ ((...args) => w.maybeCreateTiebreaks(...args));

// 14-engine-championship.js
export const maybeAdvanceChampionship = /** @type {typeof globalThis.maybeAdvanceChampionship} */ ((...args) => w.maybeAdvanceChampionship(...args));
export const maybeCreateChampionship = /** @type {typeof globalThis.maybeCreateChampionship} */ ((...args) => w.maybeCreateChampionship(...args));
export const syncChampionshipTemplate = /** @type {typeof globalThis.syncChampionshipTemplate} */ ((...args) => w.syncChampionshipTemplate(...args));

// 16-court-context-and-pool-editing.js
export const renderAll = /** @type {typeof globalThis.renderAll} */ ((...args) => w.renderAll(...args));

// 18-sync-state-and-rebase.js
export const applyCourtSides = /** @type {typeof globalThis.applyCourtSides} */ ((...args) => w.applyCourtSides(...args));
export const cloneJson = /** @type {typeof globalThis.cloneJson} */ ((...args) => w.cloneJson(...args));
export const historyEntryIdentity = /** @type {typeof globalThis.historyEntryIdentity} */ ((...args) => w.historyEntryIdentity(...args));
export const localCourtDivision = /** @type {typeof globalThis.localCourtDivision} */ ((...args) => w.localCourtDivision(...args));
export const matchHasSyncIdentity = /** @type {typeof globalThis.matchHasSyncIdentity} */ ((...args) => w.matchHasSyncIdentity(...args));
export const matchSyncIdentity = /** @type {typeof globalThis.matchSyncIdentity} */ ((...args) => w.matchSyncIdentity(...args));
export const pinCourtLocally = /** @type {typeof globalThis.pinCourtLocally} */ ((...args) => w.pinCourtLocally(...args));
export const redOnLeftForCourt = /** @type {typeof globalThis.redOnLeftForCourt} */ ((...args) => w.redOnLeftForCourt(...args));
export const rememberLocalCourtDivision = /** @type {typeof globalThis.rememberLocalCourtDivision} */ ((...args) => w.rememberLocalCourtDivision(...args));
export const replayCourtMatchOps = /** @type {typeof globalThis.replayCourtMatchOps} */ ((...args) => w.replayCourtMatchOps(...args));

// 18-two-tabs.js
export const ksmTabId = /** @type {typeof globalThis.ksmTabId} */ ((...args) => w.ksmTabId(...args));

// 20-cloud-session-and-autosave.js
export const criticalAutoSave = /** @type {typeof globalThis.criticalAutoSave} */ ((...args) => w.criticalAutoSave(...args));
export const getSetupSnapshot = /** @type {typeof globalThis.getSetupSnapshot} */ ((...args) => w.getSetupSnapshot(...args));
export const scheduleAutoSave = /** @type {typeof globalThis.scheduleAutoSave} */ ((...args) => w.scheduleAutoSave(...args));
export const updateSaveStatus = /** @type {typeof globalThis.updateSaveStatus} */ ((...args) => w.updateSaveStatus(...args));

// 21-cloud-realtime-save-and-load.js
export const isTvSession = /** @type {typeof globalThis.isTvSession} */ ((...args) => w.isTvSession(...args));
export const showKsmToast = /** @type {typeof globalThis.showKsmToast} */ ((...args) => w.showKsmToast(...args));

// 22-scorekeeper-screen.js
export const renderScore = /** @type {typeof globalThis.renderScore} */ ((...args) => w.renderScore(...args));

// 23-navigation.js
export const renderProgress = /** @type {typeof globalThis.renderProgress} */ ((...args) => w.renderProgress(...args));

// 25-live-scores.js
export const renderPublic = /** @type {typeof globalThis.renderPublic} */ ((...args) => w.renderPublic(...args));

// 33-staff-session-and-library.js
export const isReadOnlySession = /** @type {typeof globalThis.isReadOnlySession} */ ((...args) => w.isReadOnlySession(...args));

// 35-react-court.js
export const ksmSignalCourtActions = /** @type {typeof globalThis.ksmSignalCourtActions} */ ((...args) => w.ksmSignalCourtActions(...args));
export const ksmSignalCourtHeader = /** @type {typeof globalThis.ksmSignalCourtHeader} */ ((...args) => w.ksmSignalCourtHeader(...args));

// 41-react-pools.js
export const ksmPoolEditPools = /** @type {typeof globalThis.ksmPoolEditPools} */ ((...args) => w.ksmPoolEditPools(...args));
export const ksmPoolEditToSave = /** @type {typeof globalThis.ksmPoolEditToSave} */ ((...args) => w.ksmPoolEditToSave(...args));
export const ksmRenderPoolEditor = /** @type {typeof globalThis.ksmRenderPoolEditor} */ ((...args) => w.ksmRenderPoolEditor(...args));

// 44-react-shell.js
export const ksmSetFusenOpen = /** @type {typeof globalThis.ksmSetFusenOpen} */ ((...args) => w.ksmSetFusenOpen(...args));
