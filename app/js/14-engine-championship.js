// @ts-check
// The rest of the championship code is in app/modules/engine/engine-championship.js. This stays: tests replace it
// (KSMTest.app.poolPositionsResolved = ...), so it is a live accessor in 99-window-exports.js.
/**
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {boolean}
 */
function poolPositionsResolved(poolLabel,div=state.currentDivision){return poolSeedResolution(poolLabel,div).complete;}
