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
function pointsFor(m,side){
  const snapshot=m?.done&&completedResultSnapshotValid(m,m.completedResult)?m.completedResult:null;
  const saved=side==='W'?snapshot?.wp:snapshot?.rp;
  return Array.isArray(saved)?saved:((side==='W'?m?.wp:m?.rp)||[]);
}
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
  const winner=scoreWinnerOf(m);
  return {winner,wp:[...(m?.wp||[])],rp:[...(m?.rp||[])],wt:Number(m?.wt||0),rt:Number(m?.rt||0),recordedAt:new Date().toISOString()};
}
/**
 * @param {TournamentState} [targetState]
 * @param {string} [source]
 * @returns {{restored: number, created: number, reopened: number}}
 */
function repairCompletedMatchResults(targetState=state,source='load'){
  const all=targetState?.allMatches;if(!all||typeof all!=='object')return {restored:0,created:0,reopened:0};
  let restored=0,created=0,reopened=0;
  for(const [div,arr] of Object.entries(all)){
    if(!Array.isArray(arr))continue;
    arr.forEach((m,index)=>{
      if(!m||typeof m!=='object'||!m.done)return;
      const snapshot=m.completedResult;
      if(snapshot&&completedResultSnapshotValid(m,snapshot)){
        if(Array.isArray(snapshot.wp)){m.wp=[...snapshot.wp];restored++;}
        if(Array.isArray(snapshot.rp))m.rp=[...snapshot.rp];
        if(Number.isFinite(Number(snapshot.wt)))m.wt=Number(snapshot.wt);
        if(Number.isFinite(Number(snapshot.rt)))m.rt=Number(snapshot.rt);
        return;
      }
      const computed=scoreWinnerOf(m);
      if(matchRequiresWinner(m)&&computed==='Hikiwake'){
        // A completed elimination match without an identifiable winner is unsafe.
        // Re-open the feeder instead of allowing the literal word Hikiwake to
        // advance into a semifinal/final and freeze the bracket.
        m.done=false;delete m.completedResult;
        if(m.templateNode)m.ready=!!(m.white&&m.red);
        reopened++;
        console.warn('[KSM Result Integrity] Re-opened completed winner-required match with no winner',{source,division:div,index,position:m.position,white:m.white,red:m.red});
        return;
      }
      m.completedResult={winner:computed,wp:[...(m.wp||[])],rp:[...(m.rp||[])],wt:Number(m.wt||0),rt:Number(m.rt||0),recordedAt:new Date().toISOString()};
      created++;
    });
  }
  if(restored||created||reopened)console.info('[KSM Result Integrity] Normalized completed match results',{source,restored,created,reopened});
  return {restored,created,reopened};
}

