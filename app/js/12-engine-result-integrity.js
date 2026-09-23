// @ts-check
/**
 * @param {Match} m
 * @param {string} winner
 * @returns {boolean}
 */
function completedResultWinnerValid(m,winner){
  if(!m||!winner)return false;
  if(winner===m.white||winner===m.red)return true;
  return winner==='Hikiwake'&&!matchRequiresWinner(m);
}
/**
 * @param {Match} m
 * @param {CompletedResult} [snapshot]
 * @returns {boolean}
 */
function completedResultSnapshotValid(m,snapshot){
  if(!snapshot||!completedResultWinnerValid(m,snapshot.winner)||!Array.isArray(snapshot.wp)||!Array.isArray(snapshot.rp))return false;
  const wp=snapshot.wp.length,rp=snapshot.rp.length;
  if(snapshot.winner===m.white)return wp>rp;
  if(snapshot.winner===m.red)return rp>wp;
  return snapshot.winner==='Hikiwake'&&wp===rp;
}
/**
 * Winner's name from the points, or 'Hikiwake'.
 * @param {Match} m
 * @returns {string}
 */
function scoreWinnerOf(m){
  if(!m)return 'Hikiwake';
  const wp=(m.wp||[]).length,rp=(m.rp||[]).length;
  if(wp>rp)return m.white;if(rp>wp)return m.red;return 'Hikiwake';
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
  const snapshot=m?.done?m.completedResult:null;
  if(completedResultSnapshotValid(m,snapshot))return snapshot.winner;
  return scoreWinnerOf(m);
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

