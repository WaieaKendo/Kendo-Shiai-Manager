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

// 13-engine-standings-and-tiebreaks.js
export const initialPoolStandings = /** @type {typeof globalThis.initialPoolStandings} */ ((...args) => w.initialPoolStandings(...args));
export const pendingTiebreak = /** @type {typeof globalThis.pendingTiebreak} */ ((...args) => w.pendingTiebreak(...args));

// 14-engine-championship.js
export const poolPositionsResolved = /** @type {typeof globalThis.poolPositionsResolved} */ ((...args) => w.poolPositionsResolved(...args));

// 15-engine-pool-standings.js
export const poolStandings = /** @type {typeof globalThis.poolStandings} */ ((...args) => w.poolStandings(...args));

// 18-sync-state-and-rebase.js
export const noteLocalMutation = /** @type {typeof globalThis.noteLocalMutation} */ ((...args) => w.noteLocalMutation(...args));

// 20-cloud-session-and-autosave.js
export const criticalAutoSave = /** @type {typeof globalThis.criticalAutoSave} */ ((...args) => w.criticalAutoSave(...args));
export const saveAuto = /** @type {typeof globalThis.saveAuto} */ ((...args) => w.saveAuto(...args));
export const scheduleAutoSave = /** @type {typeof globalThis.scheduleAutoSave} */ ((...args) => w.scheduleAutoSave(...args));
