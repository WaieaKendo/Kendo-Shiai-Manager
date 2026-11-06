// @ts-check
import {state} from '../app-state.js';
/**
 * @param {Match} m
 * @param {string} winner
 * @returns {boolean}
 */
function completedResultWinnerValid(m,winner){
  return KSMEngine.completedResultWinnerValid(m,winner);
}
/**
 * @param {Match} m
 * @param {CompletedResult} [snapshot]
 * @returns {boolean}
 */
function completedResultSnapshotValid(m,snapshot){
  return KSMEngine.completedResultSnapshotValid(m,snapshot);
}
/**
 * Winner's name from the points, or 'Hikiwake'.
 * @param {Match} m
 * @returns {string}
 */
function scoreWinnerOf(m){
  return KSMEngine.scoreWinnerOf(m);
}
/**
 * @param {Match} m
 * @param {'W'|'R'} side
 * @returns {PointLetter[]}
 */
function pointsFor(m,side){return KSMEngine.pointsFor(m,side);// moved to app/engine/bracket-helpers.ts
  }
/**
 * Winner's name (the saved result when it is valid), or 'Hikiwake'.
 * @param {Match} m
 * @returns {string}
 */
export function winnerOf(m){
  return KSMEngine.winnerOf(m);
}
/**
 * @param {Match} m
 * @returns {CompletedResult}
 */
export function completedResultSnapshot(m){
  return /** @type {CompletedResult} */(KSMEngine.completedResultSnapshot(m,new Date().toISOString()));
}
/**
 * @param {TournamentState} [targetState]
 * @param {string} [source]
 * @returns {{restored: number, created: number, reopened: number}}
 */
export function repairCompletedMatchResults(targetState=state,source='load'){
  const plan=KSMEngine.planCompletedResultRepairs(targetState?.allMatches,new Date().toISOString());
  const all=/** @type {Record<string, Match[]>} */(targetState?.allMatches);
  plan.repairs.forEach(r=>{
    const m=all[r.division][r.index];
    if(r.action==='reopen'){
      // A completed elimination match without an identifiable winner is unsafe.
      // Re-open the feeder instead of allowing the literal word Hikiwake to
      // advance into a semifinal/final and freeze the bracket.
      Object.assign(m,r.set);delete m.completedResult;
      console.warn('[KSM Result Integrity] Re-opened completed winner-required match with no winner',{source,division:r.division,index:r.index,position:m.position,white:m.white,red:m.red});
    }else Object.assign(m,r.set);
  });
  const {restored,created,reopened}=plan;
  if(restored||created||reopened)console.info('[KSM Result Integrity] Normalized completed match results',{source,restored,created,reopened});
  return {restored,created,reopened};
}
