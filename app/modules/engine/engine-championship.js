// @ts-check
import {getState} from '../../store/index.ts';
import {selectAllMatches,selectBrackets,selectByeWinners,selectChampionshipNodes,selectCurrentDivision,selectDivisionCourts,selectGenerated,selectMatches,selectPools} from '../selectors.js';
import {ksmAppendMatches,ksmSetDivisionMatches,ksmUpdateMatches} from '../court/match-writes.js';
import {championshipCourtFor} from './engine-pools.js';
import {ksmDrawWith,ksmSetDraw} from './structure-store.js';
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
  return KSMEngine.championshipLabels(selectGenerated(getState()),selectBrackets(getState())?.[div],selectPools(getState())[div]||[]);
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
 * The championship nodes and their Match Objects for `seedPairs` (the division's template, Edit Pool's): the nodes go to
 * `draft.championshipNodes` (none for an empty template), for the caller's tournament/poolsEdited with the template they
 * are built from (#15 PR 12b).
 * @param {string} div
 * @param {string[][]} seedPairs
 * @param {{championshipNodes?:any[]}} draft
 * @returns {Match[]}
 */
export function buildChampionshipTemplateMatches(div,seedPairs,draft){
  if(!(seedPairs||[]).length)return [];
  const built=KSMEngine.buildChampionshipTemplateMatches(div,seedPairs,(round,slot,total)=>championshipCourtFor(div,round,slot,total),seedPairs.length);
  draft.championshipNodes=built.nodes;
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
  let arr=selectAllMatches(getState())[div]||[];
  let m=arr.find(x=>x.championship&&x.position===round&&x.bracketSlot===slot);
  if(m&&m.done)return champWinnerObj(m);
  if(round===firstRoundName((selectBrackets(getState())[div]||[]).length)){
    let b=((selectByeWinners(getState())&&selectByeWinners(getState())[div])||[]).find(x=>x.slot===slot);
    if(b)return b.obj;
  }
  return null;
}
function roundMatchCountForDivision(div,round){
  return KSMEngine.roundMatchCount((selectBrackets(getState())[div]||championshipLabels(div)||[]).length,round);
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
  const out=KSMEngine.uniqueIndividualMatches(selectAllMatches(getState())?.[div]||[]);
  ksmSetDivisionMatches(div,out); // state.matches follows (it is allMatches[currentDivision], #15 PR 7)
  return selectAllMatches(getState())[div];
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
export function champMatchBySlot(div,round,slot){return (selectAllMatches(getState())[div]||[]).find(x=>x.championship&&x.position===round&&x.bracketSlot===slot)}
export function sourceLabelForRound(div,prevRound,slot){
  return KSMEngine.sourceLabelForRound(selectAllMatches(getState())[div]||[],prevRound,slot);
}
/**
 * How many places of each pool feed the championship (pool label -> places).
 * @param {string} div
 * @returns {Record<string, number>}
 */
export function requiredSeedPlaces(div){
  const poolOnly=isPoolOnlyDivision(div);return KSMEngine.requiredSeedPlaces(poolOnly?selectPools(getState())[div][0]:null,poolOnly?[]:championshipLabels(div));
}
/**
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {SeedResolution}
 */
export function poolSeedResolution(poolLabel,div=selectCurrentDivision(getState())){
  return /** @type {SeedResolution} */(KSMEngine.poolSeedResolution((selectPools(getState())[div]||[]).find(p=>p.label===poolLabel),poolLabel,selectAllMatches(getState())[div]||[],requiredSeedPlaces(div)[poolLabel]||2));
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
  return KSMEngine.championshipNodeSource(side,label=>seedNameForLabel(div,label,true),selectAllMatches(getState())?.[div]||[]);
}
/**
 * Fills championship matches from pool seeds and earlier winners.
 * @param {string} div
 * @returns {Match[]}
 */
export function syncChampionshipTemplate(div){
  const arr=selectAllMatches(getState())?.[div]||[];
  if(!(selectChampionshipNodes(getState())?.[div]||[]).length)return arr;
  // The nodes' courts follow the division's court setting now, not the one at the draw: a division
  // split between the courts after the draw would otherwise have every bout go back to its old court.
  // Written to the store only when a court really changed.
  const drawn=selectChampionshipNodes(getState())[div];
  const nodes=/** @type {any[]} */(KSMEngine.championshipNodesForCourtMode(drawn,selectDivisionCourts(getState())?.[div]||'A'));
  if(nodes.some((n,i)=>n.court!==drawn[i].court))ksmSetDraw('drawEntriesUpdated',ksmDrawWith(div,{championshipNodes:nodes}));
  const plan=KSMEngine.syncChampionshipTemplate(div,nodes,arr,label=>seedNameForLabel(div,label,true));
  // Written through match-writes.js (#15 PR 13c-1): a division without a list gets one, the missing bouts are appended
  // (their indexes are the plan's), then the plan's values in one write; the list is read again for the caller.
  if(!Array.isArray(selectAllMatches(getState())?.[div]))ksmSetDivisionMatches(div,[]);
  // Self-heal: a generated championship node must always have a Match Object.
  plan.missing.forEach(m=>console.warn('KSM repaired missing championship Match Object',div,m.champNodeId));
  ksmAppendMatches(div,/** @type {Match[]} */(plan.missing));
  ksmUpdateMatches(div,plan.updates);
  return selectAllMatches(getState())[div];
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
function poolPositionsResolvedImpl(poolLabel,div=selectCurrentDivision(getState())){return poolSeedResolution(poolLabel,div).complete;}
export const poolPositionsResolved=replaceable('poolPositionsResolved',poolPositionsResolvedImpl);
