// @ts-check
const CHAMPIONSHIP_TEMPLATE_VERSION='v1.0';
/**
 * Frozen first-round seed pairs for `total` pool entrants, e.g. [['A1','B2'],['B1','A2']].
 * @param {number} total
 * @returns {string[][]}
 */
function championshipTemplateForTotal(total){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.championshipTemplateForTotal(total);
  /* ksm:post-split-end */
}
/**
 * @param {string} div
 * @returns {string[][]}
 */
function championshipLabels(div){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.championshipLabels(state.generated,state.brackets?.[div],state.pools[div]||[]);
  /* ksm:post-split-end */
}
/**
 * How many places of each pool feed the championship (pool label -> places).
 * @param {string} div
 * @returns {Record<string, number>}
 */
function requiredSeedPlaces(div){
  /* ksm:post-split-begin engine-bridge */const poolOnly=isPoolOnlyDivision(div);return KSMEngine.requiredSeedPlaces(poolOnly?state.pools[div][0]:null,poolOnly?[]:championshipLabels(div));
  /* ksm:post-split-end */
}
/**
 * @param {PoolStandingRow} a
 * @param {PoolStandingRow} b
 * @returns {boolean}
 */
function poolRowsStillTied(a,b){
  if(!a||!b)return false;
  if(a.wins!==b.wins || a.pts!==b.pts)return false;
  // If this tied base-position group has completed tiebreak data, use that data to resolve placement.
  let aHasTb=typeof a.tbWins==='number' || typeof a.tbPts==='number';
  let bHasTb=typeof b.tbWins==='number' || typeof b.tbPts==='number';
  if(aHasTb||bHasTb){
    let aw=a.tbWins||0, bw=b.tbWins||0, ap=a.tbPts||0, bp=b.tbPts||0;
    if(aw!==bw || ap!==bp)return false;
  }
  return true;
}
/**
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {SeedResolution}
 */
function poolSeedResolution(poolLabel,div=state.currentDivision){
  /* ksm:post-split-begin engine-bridge */return /** @type {SeedResolution} */(KSMEngine.poolSeedResolution((state.pools[div]||[]).find(p=>p.label===poolLabel),poolLabel,state.allMatches[div]||[],requiredSeedPlaces(div)[poolLabel]||2));
  /* ksm:post-split-end */
}
/**
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {boolean}
 */
function poolPositionsResolved(poolLabel,div=state.currentDivision){return poolSeedResolution(poolLabel,div).complete;}
/**
 * The standings row for a seed label ('A1'), or null while undecided.
 * @param {string} div
 * @param {string} label
 * @param {boolean} [onlyFinalized]
 * @returns {PoolStandingRow|null}
 */
function seedNameForLabel(div,label,onlyFinalized=true){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.seedNameForLabel(label,poolLabel=>poolSeedResolution(poolLabel,div),onlyFinalized);
  /* ksm:post-split-end */
}

/**
 * @param {string} div
 * @param {ChampionshipNode} node
 * @returns {Match}
 */
function championshipMatchObjectForNode(div,node){
  /* ksm:post-split-begin engine-bridge */return /** @type {Match} */(KSMEngine.championshipMatchObjectForNode(div,node));
  /* ksm:post-split-end */
}
/**
 * Creates the championship nodes (state.championshipNodes) and their Match Objects.
 * @param {string} div
 * @param {string[][]} seedPairs
 * @returns {Match[]}
 */
function buildChampionshipTemplateMatches(div,seedPairs){
  /* ksm:post-split-begin engine-bridge */if(!(seedPairs||[]).length)return [];
  const built=KSMEngine.buildChampionshipTemplateMatches(div,seedPairs,(round,slot,total)=>championshipCourtFor(div,round,slot,total),(state.brackets[div]||championshipLabels(div)||[]).length);
  state.championshipNodes=state.championshipNodes||{};
  state.championshipNodes[div]=built.nodes;
  return /** @type {Match[]} */(built.matches);
  /* ksm:post-split-end */
}
/**
 * @param {string} div
 * @param {BracketSource} side
 * @returns {{name: string, dojo: string}|null}
 */
function championshipNodeSource(div,side){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.championshipNodeSource(side,label=>seedNameForLabel(div,label,true),state.allMatches?.[div]||[]);
  /* ksm:post-split-end */
}
/**
 * Fills championship matches from pool seeds and earlier winners.
 * @param {string} div
 * @returns {Match[]}
 */
function syncChampionshipTemplate(div){
  /* ksm:post-split-begin engine-bridge */const nodes=state.championshipNodes?.[div]||[];
  const arr=state.allMatches?.[div]||[];
  if(!nodes.length)return arr;
  const plan=KSMEngine.syncChampionshipTemplate(div,nodes,arr,label=>seedNameForLabel(div,label,true));
  // Self-heal: a generated championship node must always have a Match Object.
  plan.missing.forEach(m=>{arr.push(/** @type {Match} */(m));console.warn('KSM repaired missing championship Match Object',div,m.champNodeId);});
  plan.updates.forEach(u=>Object.assign(arr[u.index],u.set));
  state.allMatches[div]=arr;
  return arr;
  /* ksm:post-split-end */
}
function championshipSeeds(div){
  return championshipLabels(div).map(([r,w])=>[r==='BYE'?{name:'BYE',dojo:''}:seedNameForLabel(div,r,true),w==='BYE'?{name:'BYE',dojo:''}:seedNameForLabel(div,w,true),r,w]);
}
function bracketPairsFromSeeds(seeds){return seeds}
function champRoundOrder(name){return name==='Round of 16'?16:name==='Quarterfinal'?8:name==='Semifinal'?4:name==='Final'?2:0}
/**
 * @param {Match} m
 * @returns {{name: string, dojo: string}|null}
 */
function champWinnerObj(m){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.champWinnerObj(m);
  /* ksm:post-split-end */
}
function nextChampRoundName(current,count){if(current==='Round of 16')return 'Quarterfinal';if(current==='Quarterfinal')return 'Semifinal';if(current==='Semifinal')return 'Final';if(count===8)return 'Quarterfinal';if(count===4)return 'Semifinal';return 'Final'}
function champSourceWinner(div,round,slot){
  let arr=state.allMatches[div]||[];
  let m=arr.find(x=>x.championship&&x.position===round&&x.bracketSlot===slot);
  if(m&&m.done)return champWinnerObj(m);
  if(round===firstRoundName((state.brackets[div]||[]).length)){
    let b=((state.byeWinners&&state.byeWinners[div])||[]).find(x=>x.slot===slot);
    if(b)return b.obj;
  }
  return null;
}
function roundMatchCountForDivision(div,round){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.roundMatchCount((state.brackets[div]||championshipLabels(div)||[]).length,round);
  /* ksm:post-split-end */
}
/**
 * @param {Match} m
 * @returns {string}
 */
function individualLogicalMatchKey(m){
  /* ksm:post-split-begin engine-bridge */return /** @type {string} */(KSMEngine.individualLogicalMatchKey(m));
  /* ksm:post-split-end */
}
/**
 * @param {string} div
 */
function enforceUniqueIndividualMatches(div){
  /* ksm:post-split-begin engine-bridge */const out=KSMEngine.uniqueIndividualMatches(state.allMatches?.[div]||[]);
  state.allMatches[div]=out;
  if(state.currentDivision===div)state.matches=out;
  return out;
  /* ksm:post-split-end */
}
/**
 * @param {string} div
 */
function recomputeChampionshipAdvancement(div){return syncChampionshipTemplate(div)}
/**
 * @param {Match} m
 */
function maybeAdvanceChampionship(m){if(!m||!m.championship||m.type!=='individual')return;syncChampionshipTemplate(m.division)}
/**
 * @param {Match} m
 */
function maybeCreateChampionship(m){if(!m||m.type!=='individual'||m.championship)return;syncChampionshipTemplate(m.division)}
/**
 * @param {number} n number of first-round matches
 * @returns {RoundName}
 */
function firstRoundName(n){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.firstRoundName(n);
  /* ksm:post-split-end */
}
/**
 * @param {RoundName} name
 * @returns {RoundName|null}
 */
function nextRoundFromName(name){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.nextRoundFromName(name);
  /* ksm:post-split-end */
}
/**
 * @param {RoundName} name
 * @returns {RoundName|null}
 */
function previousRoundName(name){if(name==='Quarterfinal')return 'Round of 16';if(name==='Semifinal')return 'Quarterfinal';if(name==='Final')return 'Semifinal';return null}
function expectedRoundCount(div,round){
  let labels=championshipLabels(div);let first=firstRoundName(labels.length);let count=labels.length;
  if(round===first)return count;
  let r=nextRoundFromName(first);
  while(r){count=Math.ceil(count/2);if(r===round)return count;if(r==='Final')break;r=nextRoundFromName(r)}
  return 0;
}
/**
 * @param {RoundName} first
 * @returns {RoundName[]}
 */
function roundSequenceFromFirst(first){let seq=[];let r=first;while(r){seq.push(r);if(r==='Final')break;r=nextRoundFromName(r)}return seq;}
/**
 * @param {string} div
 * @param {RoundName} round
 * @param {number} slot
 * @returns {Match|undefined}
 */
function champMatchBySlot(div,round,slot){return (state.allMatches[div]||[]).find(x=>x.championship&&x.position===round&&x.bracketSlot===slot)}
function sourceLabelForRound(div,prevRound,slot){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.sourceLabelForRound(state.allMatches[div]||[],prevRound,slot);
  /* ksm:post-split-end */
}
