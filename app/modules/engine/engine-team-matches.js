// @ts-check
import {state} from '../app-state.js';
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
