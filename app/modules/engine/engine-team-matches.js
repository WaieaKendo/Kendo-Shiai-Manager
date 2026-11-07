// @ts-check
import {state} from '../app-state.js';
import {sortTeamMatches} from '../court/court-match-order.js';
import {teamBracketNodesForCount} from './engine-team-bracket.js';
import {ksmTeamSettings} from '../registration/team-divisions.js';
/**
 * @param {string} k
 * @returns {string} 'senpo' -> 'Senpo'
 */
export function slotLabel(k){
  return KSMEngine.slotLabel(k);
}
/**
 * @param {BracketSource|null} side
 * @param {Team[]} teams
 * @param {string} div
 * @returns {Team|null}
 */
function teamSideTeam(side,teams,div){
  return /** @type {Team|null} */(KSMEngine.teamSideTeam(side,teams,state.teamBracketNodes?.[div]||[]));
}
function nodeHasMatch(arr,node){
  return KSMEngine.nodeHasMatch(arr,node);
}
/**
 * @param {TeamBracketNode} node
 * @returns {string}
 */
export function nodePairId(node){
  return KSMEngine.nodePairId(node);
}
/**
 * Member positions of the team format in Setup, in bout order.
 * @returns {TeamPosition[]}
 */
export function teamSlots(div){
  return KSMEngine.teamSlots(ksmTeamSettings(div).teamFormat);
}
/**
 * Team event matches: single-elimination bracket (state.teamBracketNodes) or round robin.
 * @param {string} div
 * @param {Team[]} teams
 * @returns {Match[]}
 */
function buildTeamMatches(div,teams){
  const plan=KSMEngine.buildTeamMatches(div,teams,ksmTeamSettings(div));let m=/** @type {Match[]} */(plan.matches);
  state.teamElimTeams=state.teamElimTeams||{};state.teamElimTeams[div]=[...teams];
  if(plan.singleElim){
    state.teamBracketNodes=state.teamBracketNodes||{};
    state.teamBracketNodes[div]=teamBracketNodesForCount(teams.length);
    syncTeamBracket(div,m,state.teamElimTeams[div]);
  }
  return m;
}
/**
 * Creates the bouts of every team node whose two teams are known.
 * @param {string} div
 * @param {Match[]} arr
 * @param {Team[]} teams
 */
export function syncTeamBracket(div,arr,teams){
  state.teamBracketNodes=state.teamBracketNodes||{};
  const nodes=state.teamBracketNodes[div]||[],current=state.allMatches[div];
  const plan=KSMEngine.syncTeamBracket(div,nodes,arr,teams,ksmTeamSettings(div).teamFormat,current===arr?undefined:(current||[]));
  plan.winners.forEach(w=>{nodes[w.index].winner=w.winner;});
  arr.push(.../** @type {Match[]} */(plan.added));
  state.allMatches[div]=arr;sortTeamMatches(div);return state.allMatches[div];
}
