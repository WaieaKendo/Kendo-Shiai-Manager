// @ts-check
import {state} from '../app-state.js';
import {championshipCourtFor} from './engine-pools.js';
import {isPoolOnlyDivision} from '../results/results-and-awards.js';
import {replaceable} from '../replaceable.js';
import * as KSMEngine from '../../engine/index.ts';
const CHAMPIONSHIP_TEMPLATE_VERSION='v1.0';
/**
 * Frozen first-round seed pairs for `total` pool entrants, e.g. [['A1','B2'],['B1','A2']].
 * @param {number} total
 * @returns {string[][]}
 */
export function championshipTemplateForTotal(total){
  return KSMEngine.championshipTemplateForTotal(total);
}
/**
 * @param {string} div
 * @returns {string[][]}
 */
export function championshipLabels(div){
  return KSMEngine.championshipLabels(state.generated,state.brackets?.[div],state.pools[div]||[]);
}
/**
 * @param {PoolStandingRow} a
 * @param {PoolStandingRow} b
 * @returns {boolean}
 */
function poolRowsStillTied(a,b){return KSMEngine.poolRowsStillTied(a,b);// moved to app/engine/bracket-helpers.ts
  }
/**
 * @param {string} div
 * @param {ChampionshipNode} node
 * @returns {Match}
 */
function championshipMatchObjectForNode(div,node){
  return /** @type {Match} */(KSMEngine.championshipMatchObjectForNode(div,node));
}
/**
 * Creates the championship nodes (state.championshipNodes) and their Match Objects.
 * @param {string} div
 * @param {string[][]} seedPairs
 * @returns {Match[]}
 */
export function buildChampionshipTemplateMatches(div,seedPairs){
  if(!(seedPairs||[]).length)return [];
  const built=KSMEngine.buildChampionshipTemplateMatches(div,seedPairs,(round,slot,total)=>championshipCourtFor(div,round,slot,total),(state.brackets[div]||championshipLabels(div)||[]).length);
  state.championshipNodes=state.championshipNodes||{};
  state.championshipNodes[div]=built.nodes;
  return /** @type {Match[]} */(built.matches);
}
function bracketPairsFromSeeds(seeds){return KSMEngine.bracketPairsFromSeeds(seeds);// moved to app/engine/bracket-helpers.ts
  }
function champRoundOrder(name){return KSMEngine.champRoundOrder(name);// moved to app/engine/championship.ts
  }
/**
 * @param {Match} m
 * @returns {{name: string, dojo: string}|null}
 */
export function champWinnerObj(m){
  return KSMEngine.champWinnerObj(m);
}
function nextChampRoundName(current,count){return KSMEngine.nextChampRoundName(current,count);// moved to app/engine/championship.ts
  }
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
  return KSMEngine.roundMatchCount((state.brackets[div]||championshipLabels(div)||[]).length,round);
}
/**
 * @param {Match} m
 * @returns {string}
 */
export function individualLogicalMatchKey(m){
  return /** @type {string} */(KSMEngine.individualLogicalMatchKey(m));
}
/**
 * @param {string} div
 */
export function enforceUniqueIndividualMatches(div){
  const out=KSMEngine.uniqueIndividualMatches(state.allMatches?.[div]||[]);
  state.allMatches[div]=out; // state.matches follows (it is allMatches[currentDivision], #15 PR 7)
  return out;
}
/**
 * @param {number} n number of first-round matches
 * @returns {RoundName}
 */
export function firstRoundName(n){
  return KSMEngine.firstRoundName(n);
}
/**
 * @param {RoundName} name
 * @returns {RoundName|null}
 */
export function nextRoundFromName(name){
  return KSMEngine.nextRoundFromName(name);
}
/**
 * @param {RoundName} name
 * @returns {RoundName|null}
 */
export function previousRoundName(name){return KSMEngine.previousRoundName(name);// moved to app/engine/championship.ts
  }
export function expectedRoundCount(div,round){
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
export function roundSequenceFromFirst(first){return KSMEngine.roundSequenceFromFirst(first);// moved to app/engine/championship.ts
  }
/**
 * @param {string} div
 * @param {RoundName} round
 * @param {number} slot
 * @returns {Match|undefined}
 */
export function champMatchBySlot(div,round,slot){return (state.allMatches[div]||[]).find(x=>x.championship&&x.position===round&&x.bracketSlot===slot)}
export function sourceLabelForRound(div,prevRound,slot){
  return KSMEngine.sourceLabelForRound(state.allMatches[div]||[],prevRound,slot);
}
/**
 * How many places of each pool feed the championship (pool label -> places).
 * @param {string} div
 * @returns {Record<string, number>}
 */
export function requiredSeedPlaces(div){
  const poolOnly=isPoolOnlyDivision(div);return KSMEngine.requiredSeedPlaces(poolOnly?state.pools[div][0]:null,poolOnly?[]:championshipLabels(div));
}
/**
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {SeedResolution}
 */
export function poolSeedResolution(poolLabel,div=state.currentDivision){
  return /** @type {SeedResolution} */(KSMEngine.poolSeedResolution((state.pools[div]||[]).find(p=>p.label===poolLabel),poolLabel,state.allMatches[div]||[],requiredSeedPlaces(div)[poolLabel]||2));
}
/**
 * The standings row for a seed label ('A1'), or null while undecided.
 * @param {string} div
 * @param {string} label
 * @param {boolean} [onlyFinalized]
 * @returns {PoolStandingRow|null}
 */
export function seedNameForLabel(div,label,onlyFinalized=true){
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
export function syncChampionshipTemplate(div){
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
export function recomputeChampionshipAdvancement(div){return syncChampionshipTemplate(div)}
/**
 * @param {Match} m
 */
export function maybeAdvanceChampionship(m){if(!m||!m.championship||m.type!=='individual')return;syncChampionshipTemplate(m.division)}
/**
 * @param {Match} m
 */
export function maybeCreateChampionship(m){if(!m||m.type!=='individual'||m.championship)return;syncChampionshipTemplate(m.division)}
// Replaceable by tests (KSMTest.app.poolPositionsResolved = ...): see app/modules/replaceable.js.
/**
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {boolean}
 */
function poolPositionsResolvedImpl(poolLabel,div=state.currentDivision){return poolSeedResolution(poolLabel,div).complete;}
export const poolPositionsResolved=replaceable('poolPositionsResolved',poolPositionsResolvedImpl);
