// @ts-check
/**
 * All regular bouts of the pool are done (tiebreaks aside); 0 when the pool has no bouts.
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {boolean|number}
 */
function poolFinished(poolLabel,div=state.currentDivision){let base=(state.allMatches[div]||[]).filter(m=>m.pool===poolLabel&&!m.tiebreak&&!m.championship);return base.length && base.every(m=>m.done)}
/**
 * @param {string} poolLabel
 * @param {string} div
 * @returns {boolean}
 */
function pendingTiebreak(poolLabel,div){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.pendingTiebreak(state.allMatches[div]||[],poolLabel);
  /* ksm:post-split-end */
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
  /* ksm:post-split-begin engine-bridge */return KSMEngine.initialPoolStandings((state.pools[div]||[]).find(p=>p.label===poolLabel),state.allMatches[div]||[]);
  /* ksm:post-split-end */
}
/**
 * @param {string} poolLabel
 * @param {string} div
 * @param {PoolStandingRow[]} players
 * @returns {{stats: TiebreakStatsRow[], done: Match[]}}
 */
function tiebreakStatsForPlayers(poolLabel,div,players){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.tiebreakStatsForPlayers(state.allMatches[div]||[],poolLabel,players);
  /* ksm:post-split-end */
}

/**
 * @param {string} poolLabel
 * @param {string} div
 * @param {PoolStandingRow[]} players
 * @param {number} series
 * @returns {{stats: TiebreakStatsRow[], matches: Match[]}}
 */
function tiebreakSeriesStats(poolLabel,div,players,series){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.tiebreakSeriesStats(state.allMatches[div]||[],poolLabel,players,series);
  /* ksm:post-split-end */
}
/**
 * Orders a tied group by its tiebreak series, one series after another.
 * @param {string} poolLabel
 * @param {string} div
 * @param {TiedGroup} target
 * @returns {{locked: TiebreakStatsRow[], unresolved: PoolStandingRow[], ordered: (PoolStandingRow|TiebreakStatsRow)[], lastStats: TiebreakStatsRow[]}}
 */
function resolveTiebreakBaseGroup(poolLabel,div,target){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.resolveTiebreakBaseGroup(state.allMatches[div]||[],poolLabel,target);
  /* ksm:post-split-end */
}
/**
 * Players still tied for a place that matters (up to reqSeed), or null.
 * @param {string} poolLabel
 * @param {string} div
 * @param {TiedGroup} target
 * @param {number} reqSeed
 * @returns {PoolStandingRow[]|null}
 */
function unresolvedRequiredTiebreakGroup(poolLabel,div,target,reqSeed){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.unresolvedRequiredTiebreakGroup(state.allMatches[div]||[],poolLabel,target,reqSeed);
  /* ksm:post-split-end */
}
/**
 * @param {string} div
 * @param {string} pool
 * @param {PoolStandingRow[]} players
 * @returns {Match[]}
 */
function tiebreakMatchesForGroup(div,pool,players){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.tiebreakMatchesForGroup(state.allMatches?.[div]||[],div,pool,players,poolCourtFor(div,pool));
  /* ksm:post-split-end */
}

const APPROVED_DYNAMIC_MATCH_TYPES=Object.freeze(new Set([
  'INDIVIDUAL_POOL_TIEBREAK',
  'TEAM_3_PERSON_REPRESENTATIVE',
  'TEAM_5_PERSON_REPRESENTATIVE',
  'KACHINUKI_REPRESENTATIVE',
  'TEAM_3_PERSON_ROUND_ROBIN_TIEBREAK',
  'TEAM_5_PERSON_ROUND_ROBIN_TIEBREAK',
  'KACHINUKI_ROUND_ROBIN_TIEBREAK'
]));
/**
 * @param {Match} match
 * @returns {boolean}
 */
function isIndividualPoolTiebreakMatch(match){return !!(match&&match.type==='individual'&&match.tiebreak&&!match.championship&&match.pool)}
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
 * @param {string} division
 * @param {string} pool
 * @param {{name: string, dojo: string}} a
 * @param {{name: string, dojo: string}} b
 * @param {boolean} [requiresWinner]
 * @param {number} [tiebreakSeries]
 * @param {number} [tiebreakIndex]
 * @returns {Match}
 */
function makeTiebreakMatch(division,pool,a,b,requiresWinner=false,tiebreakSeries=1,tiebreakIndex=0){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.makeTiebreakMatch(division,pool,a,b,requiresWinner,tiebreakSeries,tiebreakIndex,poolCourtFor(division,pool));
  /* ksm:post-split-end */
}

/**
 * @param {string} div
 * @param {string} pair
 * @returns {Match[]}
 */
function teamPairMatches(div,pair){return (state.allMatches[div]||[]).filter(x=>x.teamPair===pair && (x.type==='teamPosition'||x.type==='teamPlayoff'||x.type==='kachinuki'))}
/**
 * @param {string} div
 * @param {string} pair
 * @returns {Match[]}
 */
function teamPositionMatches(div,pair){return (state.allMatches[div]||[]).filter(x=>x.teamPair===pair && x.type==='teamPosition')}
/**
 * @param {string} div
 * @param {string} pair
 * @returns {TeamPairSummary}
 */
function teamPairSummary(div,pair){let ms=teamPairMatches(div,pair);let first=ms[0]||/** @type {Partial<Match>} */({});let wWins=0,rWins=0,wPts=0,rPts=0,done=0;ms.forEach(x=>{if(x.done){done++;let wp=(x.wp||[]).length,rp=(x.rp||[]).length;wPts+=wp;rPts+=rp;if(wp>rp)wWins++; else if(rp>wp)rWins++;}});return {teamWhite:first.teamWhite||'',teamRed:first.teamRed||'',wWins,rWins,wPts,rPts,done,total:ms.length,matches:ms}}
/**
 * @param {string} [div]
 * @returns {string[]}
 */
function teamPairIds(div='Team Tournament'){
  return [...new Set((state.allMatches[div]||[])
    .filter(match=>match.teamPair&&(match.type==='teamPosition'||match.type==='teamPlayoff'||match.type==='kachinuki'))
    .map(match=>match.teamPair))];
}
/**
 * @param {string} [div]
 * @returns {boolean}
 */
function isTeamRoundRobinDivision(div='Team Tournament'){
  if(!isTeamDivision(div))return false;
  if((state.teamBracketNodes?.[div]||[]).length)return false;
  const matches=state.allMatches?.[div]||[];
  return matches.some(match=>match.teamPair&&(match.type==='teamPosition'||match.type==='teamPlayoff'||match.type==='kachinuki'));
}
/**
 * @param {string} div
 * @param {string} pair
 * @returns {boolean}
 */
function teamRoundRobinPairResolved(div,pair){
  const matches=teamPairMatches(div,pair);
  return !!(matches.length&&matches.every(match=>match.done)&&teamWinner(div,pair));
}
/**
 * @param {string} [div]
 * @returns {TeamStandingRow[]}
 */
function teamStandings(div='Team Tournament'){
  const teams={};
  const ensure=name=>{
    if(name&&!teams[name])teams[name]={name,played:0,wins:0,losses:0,matchWins:0,pts:0};
    return teams[name];
  };
  (eligibleTeams(div)||[]).forEach(team=>ensure(team.team));
  (state.allMatches[div]||[]).forEach(match=>{ensure(match.teamWhite);ensure(match.teamRed)});
  teamPairIds(div).forEach(pair=>{
    const summary=teamPairSummary(div,pair);
    const white=ensure(summary.teamWhite),red=ensure(summary.teamRed);
    if(!white||!red||!teamRoundRobinPairResolved(div,pair))return;
    const winner=teamWinner(div,pair);
    white.played++;red.played++;
    white.matchWins+=summary.wWins;red.matchWins+=summary.rWins;
    white.pts+=summary.wPts;red.pts+=summary.rPts;
    if(winner===white.name){white.wins++;red.losses++;}
    else if(winner===red.name){red.wins++;white.losses++;}
  });
  const rows=Object.values(teams).sort((a,b)=>b.wins-a.wins||b.pts-a.pts||a.name.localeCompare(b.name));
  rows.forEach((row,index)=>{
    row.rank=index+1;
    row.nameFallback=rows.some((other,otherIndex)=>otherIndex!==index&&other.wins===row.wins&&other.pts===row.pts);
  });
  return rows;
}
/**
 * @param {string} [div]
 * @returns {{complete: number, total: number}}
 */
function teamRoundRobinProgress(div='Team Tournament'){
  const pairs=teamPairIds(div),complete=pairs.filter(pair=>teamRoundRobinPairResolved(div,pair)).length;
  return {complete,total:pairs.length};
}
/**
 * @param {string} [div]
 */
function teamRoundRobinPlacements(div='Team Tournament'){
  if(!divisionComplete(div))return null;
  const rows=teamStandings(div);
  if(!rows.length)return null;
  return {first:rows[0]?.name||'',second:rows[1]?.name||'',thirds:rows[2]?[rows[2].name]:[],standings:rows,roundRobin:true};
}
/**
 * After a team bout: a representative playoff when the pairing is level.
 * @param {Match} m
 */
function maybeCreateTeamTiebreak(m){
  if(!m || m.type!=='teamPosition' || m.tiebreak) return;
  let div=m.division, pair=m.teamPair, arr=state.allMatches[div]||[];
  let ms=teamPositionMatches(div,pair);
  if(!ms.length || !ms.every(x=>x.done)) return;
  if(arr.some(x=>x.tiebreak && x.type==='teamPlayoff' && x.teamPair===pair)) return;
  let s=teamPairSummary(div,pair);
  if(s.wWins===s.rWins && s.wPts===s.rPts){
    let anchor=ms[ms.length-1]||m;
    /** @type {Match} */
    let playoff={division:div,pool:m.pool,white:`${s.teamWhite} Representative`,red:`${s.teamRed} Representative`,wdojo:s.teamWhite,rdojo:s.teamRed,teamWhite:s.teamWhite,teamRed:s.teamRed,position:'Team Playoff',teamPair:pair,done:false,wp:[],rp:[],tiebreak:true,type:'teamPlayoff',court:anchor.court||m.court||'A',teamNodeId:anchor.teamNodeId,bracketSlot:anchor.bracketSlot,parentTeamMatch:true};
    /** @type {DynamicMatchType} */
    let dynamicType=(/* ksm:post-split-begin engine-settings was:teamFormat?.value */tournamentSettings().teamFormat/* ksm:post-split-end */||'5-Person Team')==='3-Person Team'?'TEAM_3_PERSON_REPRESENTATIVE':'TEAM_5_PERSON_REPRESENTATIVE';
    appendApprovedDynamicMatches(div,ms[ms.length-1]||m,playoff,dynamicType);
  }
}

/**
 * @param {string} div
 */
function allPoolMatchesComplete(div){let arr=state.allMatches[div]||[];let poolMs=arr.filter(m=>m&&m.type==='individual' && !m.championship);return poolMs.length && poolMs.every(m=>m.done)}
/**
 * @param {string} div
 * @returns {boolean}
 */
function hasPendingIndividualTiebreak(div){return (state.allMatches[div]||[]).some(m=>m&&m.type==='individual'&&m.tiebreak&&!m.done)}
