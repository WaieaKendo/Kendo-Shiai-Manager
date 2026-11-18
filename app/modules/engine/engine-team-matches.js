// @ts-check
import {state} from '../app-state.js';
import {sortTeamMatches} from '../court/court-match-order.js';
import {ksmAppendMatches,ksmSetDivisionMatches} from '../court/match-writes.js';
import {ksmTeamSettings} from '../registration/team-divisions.js';
import {ksmAdvanceBracket,ksmNodesWithWinners} from './structure-store.js';
import * as KSMEngine from '../../engine/index.ts';
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
 * Creates the bouts of every team node whose two teams are known and advances the winners (KSMEngine.syncTeamBracket(),
 * a plan on copies). The bouts are written first (`allMatches` through match-writes.js, #15 PR 13c-1: a list that is not
 * the division's yet, a draw's, is put in place first, then the new bouts appended and the list sorted; the caller reads
 * the list again, never `arr`), then the nodes with their new winners in one
 * tournament/advancementApplied (#15 PR 12b). `draft` (a draw being built: generation, a team's No Show): the nodes are
 * read from and written to `draft.teamBracketNodes` instead, and the caller puts them in its own action.
 * @param {string} div
 * @param {Match[]} arr
 * @param {Team[]} teams
 * @param {{teamBracketNodes?:any[]}} [draft]
 */
export function syncTeamBracket(div,arr,teams,draft){
  const nodes=(draft?draft.teamBracketNodes:state.teamBracketNodes?.[div])||[],current=state.allMatches[div];
  const plan=KSMEngine.syncTeamBracket(div,nodes,arr,teams,ksmTeamSettings(div).teamFormat,current===arr?undefined:(current||[]));
  const next=ksmNodesWithWinners(nodes,plan.winners);
  if(current!==arr)ksmSetDivisionMatches(div,arr);
  ksmAppendMatches(div,/** @type {Match[]} */(plan.added));sortTeamMatches(div,next);
  if(draft)draft.teamBracketNodes=next;else ksmAdvanceBracket(div,'teamBracketNodes',nodes,next);
  return state.allMatches[div];
}
