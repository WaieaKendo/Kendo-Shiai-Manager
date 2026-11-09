// @ts-check
// The rest of the standings and tiebreak code is in app/modules/engine/engine-standings-and-tiebreaks.js. These stay: tests
// replace them (KSMTest.app.NAME = ...), so they are live accessors in 99-window-exports.js; modules call them through legacy.js.
/**
 * All regular bouts of the pool are done (tiebreaks aside); 0 when the pool has no bouts.
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {boolean|number}
 */
function poolFinished(poolLabel,div=state.currentDivision){
  return KSMEngine.poolFinished(state.allMatches[div]||[],poolLabel);
}
/**
 * @param {string} poolLabel
 * @param {string} div
 * @returns {boolean}
 */
function pendingTiebreak(poolLabel,div){
  return KSMEngine.pendingTiebreak(state.allMatches[div]||[],poolLabel);
}
/**
 * Pool record only (wins, then points, then name).
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {PoolStandingRow[]}
 */
function initialPoolStandings(poolLabel,div=state.currentDivision){
  return KSMEngine.initialPoolStandings((state.pools[div]||[]).find(p=>p.label===poolLabel),state.allMatches[div]||[]);
}
/**
 * Orders a tied group by its tiebreak series, one series after another.
 * @param {string} poolLabel
 * @param {string} div
 * @param {TiedGroup} target
 * @returns {{locked: TiebreakStatsRow[], unresolved: PoolStandingRow[], ordered: (PoolStandingRow|TiebreakStatsRow)[], lastStats: TiebreakStatsRow[]}}
 */
function resolveTiebreakBaseGroup(poolLabel,div,target){
  return KSMEngine.resolveTiebreakBaseGroup(state.allMatches[div]||[],poolLabel,target);
}
// The Setup field: its inline handler has set state.teamAwardMode; the document's change listener
// has scheduled the autosave, which then carries the new bouts with the new mode.
document.getElementById('teamAwardMode')?.addEventListener('change',()=>{if(ksmAddDaihyosenForTeamAwards().length)renderAll()});