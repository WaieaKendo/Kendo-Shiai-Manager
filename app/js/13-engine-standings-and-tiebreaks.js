// @ts-check
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
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {boolean}
 */
function topSeedsResolved(poolLabel,div=state.currentDivision){return poolPositionsResolved(poolLabel,div);}
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
/**
 * @param {TournamentState} targetState
 * @param {string} div
 * @param {Match[]} beforeArr
 * @param {Match[]} afterArr
 */
function reindexPointersAfterMatchReorder(targetState,div,beforeArr,afterArr){
  if(!targetState||!Array.isArray(beforeArr)||!Array.isArray(afterArr))return;
  const findMovedIndex=(oldIndex,court)=>{
    const n=Number(oldIndex);
    const oldMatch=Number.isFinite(n)&&n>=0&&n<beforeArr.length?beforeArr[n]:null;
    const identity=matchSyncIdentity(oldMatch);
    let idx=identity?afterArr.findIndex(match=>matchHasSyncIdentity(match,identity)):-1;
    if(idx<0||!individualMatchReady(afterArr[idx])||!matchBelongsToCourtInState(targetState,afterArr[idx],court))idx=nextReadyIndexInState(targetState,div,court);
    return idx;
  };
  targetState.courtState=targetState.courtState||/** @type {ByCourt<CourtState>} */({});
  targetState.courtActiveDivision=targetState.courtActiveDivision||/** @type {ByCourt<string|null>} */({});
  for(const court of ['A','B']){
    const cs=targetState.courtState[court];
    if(cs?.division===div)cs.index=findMovedIndex(cs.index,court);
  }
  if(targetState.currentDivision===div){
    const court=String(targetState.currentCourt||'A').toUpperCase()==='B'?'B':'A';
    const currentIndex=findMovedIndex(targetState.current,court);
    targetState.current=currentIndex;
    targetState.currentByDivision=targetState.currentByDivision||{};
    targetState.currentByDivision[div]=currentIndex;
  }
}
/**
 * @param {TournamentState} targetState
 * @param {string} div
 * @param {string} [source]
 */
function normalizeIndividualPoolTiebreakOrderInState(targetState,div,source='tiebreak order repair'){
  const arr=targetState?.allMatches?.[div];
  if(!Array.isArray(arr)||!arr.some(isIndividualPoolTiebreakMatch))return false;
  const before=[...arr];
  const decorated=before.map((match,index)=>({match,index}));
  const tiebreaks=decorated.filter(item=>isIndividualPoolTiebreakMatch(item.match));
  const rebuilt=decorated.filter(item=>!isIndividualPoolTiebreakMatch(item.match)).map(item=>item.match);
  const labels=[];
  (targetState?.pools?.[div]||[]).forEach(pool=>{if(pool?.label&&!labels.includes(pool.label))labels.push(pool.label)});
  tiebreaks.forEach(item=>{const label=item.match.pool;if(label&&!labels.includes(label))labels.push(label)});
  labels.forEach(pool=>{
    const group=tiebreaks.filter(item=>item.match.pool===pool).sort((a,b)=>{
      const seriesDiff=Number(a.match.tiebreakSeries||1)-Number(b.match.tiebreakSeries||1);
      if(seriesDiff)return seriesDiff;
      const indexDiff=Number(a.match.tiebreakIndex??0)-Number(b.match.tiebreakIndex??0);
      return indexDiff||a.index-b.index;
    }).map(item=>item.match);
    if(!group.length)return;
    let anchor=-1;
    rebuilt.forEach((match,index)=>{if(match&&match.type==='individual'&&!match.championship&&!match.tiebreak&&match.pool===pool)anchor=index});
    if(anchor<0){
      const firstChamp=rebuilt.findIndex(match=>match?.championship);
      anchor=firstChamp>=0?firstChamp-1:rebuilt.length-1;
    }
    rebuilt.splice(anchor+1,0,...group);
  });
  const changed=rebuilt.length!==before.length||rebuilt.some((match,index)=>match!==before[index]);
  if(!changed)return false;
  targetState.allMatches[div]=rebuilt;
  reindexPointersAfterMatchReorder(targetState,div,before,rebuilt);
  console.info('[KSM Tiebreak Order] Repaired pool-local tiebreak placement',{source,division:div});
  return true;
}
/**
 * @param {TournamentState} targetState
 * @param {string} [source]
 */
function normalizeAllIndividualPoolTiebreakOrder(targetState,source='tiebreak order repair'){
  let repaired=0;
  Object.keys(targetState?.allMatches||{}).forEach(div=>{if(normalizeIndividualPoolTiebreakOrderInState(targetState,div,source))repaired++});
  return repaired;
}
/**
 * Inserts tiebreak/representative matches after `afterMatch`; only APPROVED_DYNAMIC_MATCH_TYPES.
 * @param {string} div
 * @param {Match} afterMatch
 * @param {Match|Match[]} matches
 * @param {DynamicMatchType} dynamicType
 */
function appendApprovedDynamicMatches(div,afterMatch,matches,dynamicType){
  if(!APPROVED_DYNAMIC_MATCH_TYPES.has(dynamicType))throw new Error('Unauthorized dynamic Match Object type: '+dynamicType);
  const arr=state.allMatches[div]||[];
  const list=(Array.isArray(matches)?matches:[matches]).filter(Boolean);
  list.forEach(m=>{m.origin='TIEBREAK';m.dynamicType=dynamicType;});
  if(dynamicType==='INDIVIDUAL_POOL_TIEBREAK'){
    // Pool tiebreaks are part of that pool's timeline, not generic appended matches.
    // Add them safely, then canonicalize by pool so object-identity changes or a
    // cloud rebase can never strand Pool A's playoff after Pool D.
    arr.push(...list);state.allMatches[div]=arr;
    normalizeIndividualPoolTiebreakOrderInState(state,div,'dynamic tiebreak creation');
    return list;
  }
  const afterIdentity=matchSyncIdentity(afterMatch);
  const idx=afterMatch?arr.findIndex(match=>match===afterMatch||(afterIdentity&&matchHasSyncIdentity(match,afterIdentity))):-1;
  arr.splice(idx>=0?idx+1:arr.length,0,...list);
  state.allMatches[div]=arr;
  return list;
}
/**
 * After a pool bout: creates tiebreak matches for ties that decide a needed place.
 * @param {Match} m
 */
function maybeCreateTiebreaks(m){
  if(!m || m.type!=='individual') return;
  let div=m.division, arr=state.allMatches[div]||state.matches;
  let originalDone=(arr.filter(x=>x.pool===m.pool&&x.type==='individual'&&!x.tiebreak&&!x.championship).every(x=>x.done));
  if(!originalDone) return;
  if(pendingTiebreak(m.pool,div)) return;
  let base=initialPoolStandings(m.pool,div);
  let reqSeed=(requiredSeedPlaces(div)[m.pool]||2);
  let groups=[];
  for(let i=0;i<base.length;){let j=i+1;while(j<base.length&&base[j].wins===base[i].wins&&base[j].pts===base[i].pts)j++;groups.push({start:i+1,end:j,players:base.slice(i,j)});i=j;}
  for(let target of groups){
    if(target.players.length<=1 || target.start>reqSeed) continue;
    let unresolved=unresolvedRequiredTiebreakGroup(m.pool,div,target,reqSeed);
    if(!unresolved || unresolved.length<=1) continue;
    let newMatches=tiebreakMatchesForGroup(div,m.pool,unresolved);
    if(newMatches.length){appendApprovedDynamicMatches(div,m,newMatches,'INDIVIDUAL_POOL_TIEBREAK');return;}
  }
}
/**
 * @param {string} [div]
 */
function teamRoundRobinPlacements(div='Team Tournament'){
  return KSMEngine.teamRoundRobinPlacements(!!divisionComplete(div),state.allMatches[div]||[],eligibleTeams(div)||[],KSMEngine.teamRoundRobinCountedPlaces(ksmTeamSettings(div).teamAwardMode));
}
// Found in external PR review (#35): the places a daihyosen decides follow Setup's team award mode
// (D2), and the mode can change after a team round robin has ended. Changing it to more places
// (e.g. "Champion only" -> "Champion + Runner-up" with three teams level for 2nd) adds the
// daihyosen the newly awarded places need, judged from the whole division; until it is played
// the place stays undecided (KSMEngine.teamRoundRobinPlacements(), never the alphabetical first).
// Run on the Setup change and after any tournament load or live/rebased update on a device that
// saves (a merge that kept the new mode but not the bouts, or a mode changed on an older
// version). Idempotent: none while a daihyosen is unplayed, and the bouts are the same on every
// device (a rebase keeps the server's). Changing to fewer places keeps a daihyosen already
// created: it is played as scheduled and only no longer changes an award.
/** Adds the daihyosen the team award mode now needs; returns the divisions that got one. */
function ksmAddDaihyosenForTeamAwards(){
  if(typeof isReadOnlySession==='function'&&isReadOnlySession())return [];
  const added=[];
  Object.keys(state.allMatches||{}).forEach(div=>{
    if(!isTeamRoundRobinDivision(div))return;
    const rr=KSMEngine.teamRoundRobinMissingDaihyosen(state.allMatches[div]||[],eligibleTeams(div)||[],ksmTeamSettings(div).teamFormat,KSMEngine.teamRoundRobinCountedPlaces(ksmTeamSettings(div).teamAwardMode));
    if(!rr)return;
    appendApprovedDynamicMatches(div,rr.anchor,/** @type {Match[]} */(rr.bouts),rr.dynamicType);
    added.push(div);
  });
  return added;
}
// The Setup field: its inline handler has set state.teamAwardMode; the document's change listener
// has scheduled the autosave, which then carries the new bouts with the new mode.
document.getElementById('teamAwardMode')?.addEventListener('change',()=>{if(ksmAddDaihyosenForTeamAwards().length)renderAll()});