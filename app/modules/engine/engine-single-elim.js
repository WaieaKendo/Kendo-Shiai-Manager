// @ts-check
import {state} from '../app-state.js';
import {syncIndividualSingleElim} from '../court/split-court-templates.js';
import {ksmSetDivisionMatches} from '../court/match-writes.js';
import {champWinnerObj,seedNameForLabel} from './engine-championship.js';
import {eligibleIndividuals} from './engine-pools.js';
import {teamBracketNodesForCount} from './engine-team-bracket.js';
import * as KSMEngine from '../../engine/index.ts';
const BRACKET_SLOT_TEMPLATES={
  4:[{slot:1,quadrant:0,protectedSeed:1},{slot:2,quadrant:0},{slot:3,quadrant:1,protectedSeed:2},{slot:4,quadrant:1}],
  8:[{slot:1,quadrant:0,protectedSeed:1},{slot:2,quadrant:0},{slot:3,quadrant:1,protectedSeed:4},{slot:4,quadrant:1},{slot:5,quadrant:2,protectedSeed:3},{slot:6,quadrant:2},{slot:7,quadrant:3,protectedSeed:2},{slot:8,quadrant:3}],
  16:[{slot:1,quadrant:0,protectedSeed:1},{slot:2,quadrant:0},{slot:3,quadrant:0},{slot:4,quadrant:0},{slot:5,quadrant:1,protectedSeed:4},{slot:6,quadrant:1},{slot:7,quadrant:1},{slot:8,quadrant:1},{slot:9,quadrant:2,protectedSeed:3},{slot:10,quadrant:2},{slot:11,quadrant:2},{slot:12,quadrant:2},{slot:13,quadrant:3,protectedSeed:2},{slot:14,quadrant:3},{slot:15,quadrant:3},{slot:16,quadrant:3}],
  32:[{slot:1,quadrant:0,protectedSeed:1},{slot:9,quadrant:1,protectedSeed:4},{slot:17,quadrant:2,protectedSeed:3},{slot:25,quadrant:3,protectedSeed:2}]
};
/**
 * @param {number} n
 * @returns {number}
 */
function singleElimBracketSize(n){
  return KSMEngine.singleElimBracketSize(n);
}
function protectedSeedQuadrant(seed){
  return KSMEngine.protectedSeedQuadrant(seed);
}
function singleElimSlotInfo(n){
  return KSMEngine.singleElimSlotInfo(n,teamBracketNodesForCount(n));
}
function chooseBestSeedSlot(q,positions,info,allPositions){
  return KSMEngine.chooseBestSeedSlot(q,positions,info,allPositions);
}
/**
 * Bracket order: seeds in protected quadrants, then dojo-separated fill.
 * @param {Competitor[]} comps
 * @returns {Competitor[]}
 */
function placeIndividualsForSingleElim(comps){
  return KSMEngine.placeIndividualsForSingleElim(comps,comps.length>1?teamBracketNodesForCount(comps.length):[]);
}
/** Node id -> its place in the bracket; `nodes` (a draw not in the store yet) instead of the division's nodes. */
export function singleElimOrderMap(div,nodes=state.singleElimNodes?.[div]){let map={};(nodes||[]).forEach((n,i)=>map[n.id]=i);return map;}
/** The single elimination's bout order (node order, then bracket slot), for a sort; `nodes` (a draw not in the store yet) instead of the division's. */
export function singleElimMatchCompare(div,nodes){let order=singleElimOrderMap(div,nodes);return (a,b)=>{
  let oa=order[a.elimNodeId]??9999, ob=order[b.elimNodeId]??9999;
  if(oa!==ob)return oa-ob;
  return (a.bracketSlot||0)-(b.bracketSlot||0);
}}
/** `arr` in the single elimination's bout order: a sorted copy (#15 PR 13c-1: the division's own list is sorted through match-writes.js). */
export function sortIndividualSingleElimMatches(div,arr,nodes){return [...arr].sort(singleElimMatchCompare(div,nodes));}
export function dedupeSingleElimMatches(div){
  let arr=state.allMatches[div]||[];
  let seen=new Set(), out=[];
  // Sorted on a copy (#15 PR 13c-1): the division's list was sorted in place and replaced by `out` right after, so only `out` is written.
  sortIndividualSingleElimMatches(div,arr).forEach(m=>{
    if(m.singleElim){
      let k=m.elimNodeId||m.position+'-'+(m.bracketSlot||'');
      if(seen.has(k))return;
      seen.add(k);
    }
    out.push(m);
  });
  ksmSetDivisionMatches(div,out);
  return state.allMatches[div];
}
/**
 * @param {BracketSource|null} side
 * @param {Competitor[]} comps
 * @param {string} div
 * @returns {{name: string, dojo: string}|null}
 */
function indivSide(side,comps,div){
  return KSMEngine.indivSide(side,comps,state.singleElimNodes?.[div]||[]);
}
function indivNodeHasMatch(arr,node){return KSMEngine.indivNodeHasMatch(arr,node);// moved to app/engine/bracket-helpers.ts
  }
export function sideLabelGeneric(side,div){
  return KSMEngine.sideLabelGeneric(side,state.singleElimComps?.[div]||[],state.singleElimNodes?.[div]||[]);
}
/**
 * One Match Object per bracket node, filled as winners are known: a new bracket (a No Show's). The nodes go to
 * `draft.singleElimNodes`, for the caller's own action with the rest of the draw (#15 PR 12b).
 * @param {string} div
 * @param {Competitor[]} comps
 * @param {{singleElimNodes?:any[]}} draft
 * @returns {Match[]}
 */
export function buildIndividualSingleElimMatches(div,comps,draft){
  const built=KSMEngine.buildIndividualSingleElimMatches(div,teamBracketNodesForCount(comps.length),/** @type {Court|'split'} */(state.divisionCourts[div]||'A'));
  draft.singleElimNodes=built.nodes;
  const arr=/** @type {Match[]} */(built.matches);
  syncIndividualSingleElim(div,arr,comps,draft);
  // The division's list as the sync left it (it is `arr`, sorted, with the plan's values: a new bracket has no duplicate
  // to drop), read again (#15 PR 13c-1).
  return state.allMatches[div];
}
/**
 * @param {Match} m
 */
export function maybeAdvanceIndividualSingleElim(m){
  if(!m||!m.singleElim)return;
  let div=m.division,arr=state.allMatches[div]||[],comps=(state.singleElimComps&&state.singleElimComps[div])||eligibleIndividuals(div).filter(c=>c.name);
  syncIndividualSingleElim(div,arr,comps);
}
function championshipSideLabel(side,div){
  if(!side)return 'BYE';
  if(side.seed){
    const resolved=seedNameForLabel(div,side.seed,true);
    return resolved?.name||side.seed;
  }
  if(side.ref){
    const source=(state.championshipNodes?.[div]||[]).find(node=>node.id===side.ref);
    const sourceMatch=(state.allMatches?.[div]||[]).find(m=>m&&m.championship&&m.champNodeId===side.ref);
    if(sourceMatch?.done){const winner=champWinnerObj(sourceMatch);if(winner)return winner.name;}
    return `Winner of ${source?.round||'Match'} Match ${Number(source?.slot||0)+1}`;
  }
  return 'TBD';
}
/**
 * Name, or where the side comes from ('Winner of …').
 * @param {Match} match
 * @param {'white'|'red'} side
 * @returns {string}
 */
export function specificMatchSideLabel(match,side){
  if(!match)return 'TBD';
  const actual=side==='white'?(match.white||match.teamWhite):(match.red||match.teamRed);
  if(actual)return actual;
  if(match.singleElim){
    const node=(state.singleElimNodes?.[match.division]||[]).find(n=>n.id===match.elimNodeId);
    return sideLabelGeneric(side==='white'?node?.right:node?.left,match.division);
  }
  if(match.championship){
    const node=(state.championshipNodes?.[match.division]||[]).find(n=>n.id===match.champNodeId);
    return championshipSideLabel(side==='white'?node?.right:node?.left,match.division);
  }
  return 'TBD';
}
