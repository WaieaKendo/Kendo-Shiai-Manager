// @ts-check
/**
 * How many places of each pool feed the championship (pool label -> places).
 * @param {string} div
 * @returns {Record<string, number>}
 */
function requiredSeedPlaces(div){
  const poolOnly=isPoolOnlyDivision(div);return KSMEngine.requiredSeedPlaces(poolOnly?state.pools[div][0]:null,poolOnly?[]:championshipLabels(div));
}
/**
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {SeedResolution}
 */
function poolSeedResolution(poolLabel,div=state.currentDivision){
  return /** @type {SeedResolution} */(KSMEngine.poolSeedResolution((state.pools[div]||[]).find(p=>p.label===poolLabel),poolLabel,state.allMatches[div]||[],requiredSeedPlaces(div)[poolLabel]||2));
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
  return KSMEngine.seedNameForLabel(label,poolLabel=>poolSeedResolution(poolLabel,div),onlyFinalized);
}
/**
 * @param {string} div
 * @param {BracketSource} side
 * @returns {{name: string, dojo: string}|null}
 */
function championshipNodeSource(div,side){
  return KSMEngine.championshipNodeSource(side,label=>seedNameForLabel(div,label,true),state.allMatches?.[div]||[]);
}
/**
 * Fills championship matches from pool seeds and earlier winners.
 * @param {string} div
 * @returns {Match[]}
 */
function syncChampionshipTemplate(div){
  const nodes=state.championshipNodes?.[div]||[];
  const arr=state.allMatches?.[div]||[];
  if(!nodes.length)return arr;
  const plan=KSMEngine.syncChampionshipTemplate(div,nodes,arr,label=>seedNameForLabel(div,label,true));
  // Self-heal: a generated championship node must always have a Match Object.
  plan.missing.forEach(m=>{arr.push(/** @type {Match} */(m));console.warn('KSM repaired missing championship Match Object',div,m.champNodeId);});
  plan.updates.forEach(u=>Object.assign(arr[u.index],u.set));
  state.allMatches[div]=arr;
  return arr;
}
function championshipSeeds(div){
  return championshipLabels(div).map(([r,w])=>[r==='BYE'?{name:'BYE',dojo:''}:seedNameForLabel(div,r,true),w==='BYE'?{name:'BYE',dojo:''}:seedNameForLabel(div,w,true),r,w]);
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