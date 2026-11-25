// @ts-check
import {state} from '../app-state.js';
import {eligibleTeams} from './engine-pools.js';
import {teamPairMatches} from './engine-standings-and-tiebreaks.js';
import {syncTeamBracket} from './engine-team-matches.js';
import {ksmTeamSettings} from '../registration/team-divisions.js';
import * as KSMEngine from '../../engine/index.ts';
/**
 * Bracket side: team number n (1-based registration order).
 * @param {number} n
 * @returns {BracketSource}
 */
function T(n){
  return KSMEngine.teamSource(n);
}
/**
 * Bracket side: winner of node id.
 * @param {string} id
 * @returns {BracketSource}
 */
function W(id){
  return KSMEngine.winnerSource(id);
}
/**
 * @param {string} id
 * @param {RoundName} round
 * @param {Court} court
 * @param {BracketSource|null} left
 * @param {BracketSource|null} right
 * @param {number} slot
 * @returns {TeamBracketNode}
 */
function N(id,round,court,left,right,slot){
  return KSMEngine.teamNode(id,round,court,left,right,slot);
}
/**
 * Frozen bracket template for n teams (also used for individual single elimination).
 * @param {number} n
 * @returns {TeamBracketNode[]}
 */
export function teamBracketNodesForCount(n){
  const nodes=KSMEngine.teamBracketNodesForCount(n);
  if(!nodes){alert('Team single-elimination templates currently support 2–32 teams.');return [];}
  return nodes;
}
/**
 * Adds a pairing's bouts (one kachinuki bout, or one per position).
 * @param {Match[]} m
 * @param {string} div
 * @param {Team} a White team
 * @param {Team} b Red team
 * @param {string} pool
 * @param {string} pairId
 * @param {Court} court
 * @param {string} matchFmt
 * @param {TeamPosition[]} slots
 */
function addTeamPairMatches(m,div,a,b,pool,pairId,court,matchFmt,slots){
  m.push(.../** @type {Match[]} */(KSMEngine.teamPairMatchObjects(div,a,b,pool,pairId,court,matchFmt,slots)));
}
/**
 * Next lineup indexes after a kachinuki bout: the winner stays, a draw eliminates both (except a last player).
 * @param {Match} m
 * @returns {{wi: number, ri: number, whiteExhausted: boolean, redExhausted: boolean}}
 */
function kachinukiTransitionState(m){
  return KSMEngine.kachinukiTransitionState(m);
}
/**
 * @param {string} div
 * @param {string} pair
 * @returns {string|null}
 */
function kachinukiPairWinner(div,pair){
  return KSMEngine.kachinukiPairWinner(teamPairMatches(div,pair));
}
/**
 * Winning team name of a pairing, or null while undecided.
 * @param {string} div
 * @param {string} pair
 * @returns {string|null}
 */
export function teamWinner(div,pair){
  return KSMEngine.teamWinner(state.allMatches[div]||[],pair);
}
/**
 * @param {Match} m
 */
export function maybeAdvanceTeamBracket(m){
  if(!m || !(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'))return;
  let div=m.division, fmt=ksmTeamSettings(div).teamTournamentFormat||'Single Elimination';
  if(fmt!=='Single Elimination')return;
  syncTeamBracket(div,state.allMatches[div]||[],state.teamElimTeams?.[div]||eligibleTeams(div));
}
