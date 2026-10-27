// @ts-check
/**
 * @param {Match} m
 * @param {string} winner
 * @returns {boolean}
 */
function completedResultWinnerValid(m,winner){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.completedResultWinnerValid(m,winner);
  /* ksm:post-split-end */
}
/**
 * @param {Match} m
 * @param {CompletedResult} [snapshot]
 * @returns {boolean}
 */
function completedResultSnapshotValid(m,snapshot){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.completedResultSnapshotValid(m,snapshot);
  /* ksm:post-split-end */
}
/**
 * Winner's name from the points, or 'Hikiwake'.
 * @param {Match} m
 * @returns {string}
 */
function scoreWinnerOf(m){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.scoreWinnerOf(m);
  /* ksm:post-split-end */
}
/**
 * @param {Match} m
 * @param {'W'|'R'} side
 * @returns {PointLetter[]}
 */
function pointsFor(m,side){/* ksm:post-split-begin engine-bridge */return KSMEngine.pointsFor(m,side);// moved to app/engine/bracket-helpers.ts
  /* ksm:post-split-end */}
/**
 * Winner's name (the saved result when it is valid), or 'Hikiwake'.
 * @param {Match} m
 * @returns {string}
 */
function winnerOf(m){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.winnerOf(m);
  /* ksm:post-split-end */
}
/**
 * @param {Match} m
 * @returns {CompletedResult}
 */
function completedResultSnapshot(m){
  /* ksm:post-split-begin engine-bridge */return /** @type {CompletedResult} */(KSMEngine.completedResultSnapshot(m,new Date().toISOString()));
  /* ksm:post-split-end */
}
/**
 * @param {TournamentState} [targetState]
 * @param {string} [source]
 * @returns {{restored: number, created: number, reopened: number}}
 */
function repairCompletedMatchResults(targetState=state,source='load'){
  /* ksm:post-split-begin engine-bridge */const plan=KSMEngine.planCompletedResultRepairs(targetState?.allMatches,new Date().toISOString());
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
  /* ksm:post-split-end */
}

