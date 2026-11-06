// @ts-check
import {state} from '../app-state.js';
import {championshipCourtFor} from './engine-pools.js';
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
  state.allMatches[div]=out;
  if(state.currentDivision===div)state.matches=out;
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
