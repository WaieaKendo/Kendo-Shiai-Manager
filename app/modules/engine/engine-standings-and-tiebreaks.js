// @ts-check
import {state} from '../app-state.js';
import {eligibleTeams,isTeamDivision,poolCourtFor} from './engine-pools.js';
import {appendApprovedDynamicMatches} from '../legacy.js';
import {ksmTeamSettings} from '../registration/team-divisions.js';
/**
 * @param {string} poolLabel
 * @param {string} div
 * @param {PoolStandingRow[]} players
 * @returns {{stats: TiebreakStatsRow[], done: Match[]}}
 */
function tiebreakStatsForPlayers(poolLabel,div,players){
  return KSMEngine.tiebreakStatsForPlayers(state.allMatches[div]||[],poolLabel,players);
}
/**
 * @param {string} poolLabel
 * @param {string} div
 * @param {PoolStandingRow[]} players
 * @param {number} series
 * @returns {{stats: TiebreakStatsRow[], matches: Match[]}}
 */
function tiebreakSeriesStats(poolLabel,div,players,series){
  return KSMEngine.tiebreakSeriesStats(state.allMatches[div]||[],poolLabel,players,series);
}
/**
 * Players still tied for a place that matters (up to reqSeed), or null.
 * @param {string} poolLabel
 * @param {string} div
 * @param {TiedGroup} target
 * @param {number} reqSeed
 * @returns {PoolStandingRow[]|null}
 */
export function unresolvedRequiredTiebreakGroup(poolLabel,div,target,reqSeed){
  return KSMEngine.unresolvedRequiredTiebreakGroup(state.allMatches[div]||[],poolLabel,target,reqSeed);
}
/**
 * @param {string} div
 * @param {string} pool
 * @param {PoolStandingRow[]} players
 * @returns {Match[]}
 */
export function tiebreakMatchesForGroup(div,pool,players){
  return KSMEngine.tiebreakMatchesForGroup(state.allMatches?.[div]||[],div,pool,players,poolCourtFor(div,pool));
}
export const APPROVED_DYNAMIC_MATCH_TYPES=Object.freeze(new Set([
  'INDIVIDUAL_POOL_TIEBREAK',
  'TEAM_3_PERSON_REPRESENTATIVE',
  'TEAM_5_PERSON_REPRESENTATIVE',
  'KACHINUKI_REPRESENTATIVE',
  'TEAM_3_PERSON_ROUND_ROBIN_TIEBREAK',
  'TEAM_5_PERSON_ROUND_ROBIN_TIEBREAK',
  'KACHINUKI_ROUND_ROBIN_TIEBREAK'
]));
/**
 * @param {Match} match
 * @returns {boolean}
 */
export function isIndividualPoolTiebreakMatch(match){return KSMEngine.isIndividualPoolTiebreakMatch(match);// moved to app/engine/match-helpers.ts
  }
/**
 * @param {string} division
 * @param {string} pool
 * @param {{name: string, dojo: string}} a
 * @param {{name: string, dojo: string}} b
 * @param {boolean} [requiresWinner]
 * @param {number} [tiebreakSeries]
 * @param {number} [tiebreakIndex]
 * @returns {Match}
 */
export function makeTiebreakMatch(division,pool,a,b,requiresWinner=false,tiebreakSeries=1,tiebreakIndex=0){
  return KSMEngine.makeTiebreakMatch(division,pool,a,b,requiresWinner,tiebreakSeries,tiebreakIndex,poolCourtFor(division,pool));
}
/**
 * @param {string} div
 * @param {string} pair
 * @returns {Match[]}
 */
export function teamPairMatches(div,pair){
  return KSMEngine.teamPairMatches(state.allMatches[div]||[],pair);
}
/**
 * @param {string} div
 * @param {string} pair
 * @returns {Match[]}
 */
function teamPositionMatches(div,pair){
  return KSMEngine.teamPositionMatches(state.allMatches[div]||[],pair);
}
/**
 * @param {string} div
 * @param {string} pair
 * @returns {TeamPairSummary}
 */
export function teamPairSummary(div,pair){
  return KSMEngine.teamPairSummary(state.allMatches[div]||[],pair);
}
/**
 * @param {string} [div]
 * @returns {string[]}
 */
export function teamPairIds(div='Team Tournament'){
  return KSMEngine.teamPairIds(state.allMatches[div]||[]);
}
/**
 * @param {string} div
 * @param {string} pair
 * @returns {boolean}
 */
export function teamRoundRobinPairResolved(div,pair){
  return KSMEngine.teamRoundRobinPairResolved(state.allMatches[div]||[],pair);
}
/**
 * @param {string} [div]
 * @returns {{complete: number, total: number}}
 */
export function teamRoundRobinProgress(div='Team Tournament'){
  return KSMEngine.teamRoundRobinProgress(state.allMatches[div]||[]);
}
/**
 * @param {string} div
 */
function allPoolMatchesComplete(div){let arr=state.allMatches[div]||[];let poolMs=arr.filter(m=>m&&m.type==='individual' && !m.championship);return poolMs.length && poolMs.every(m=>m.done)}
/**
 * @param {string} div
 * @returns {boolean}
 */
function hasPendingIndividualTiebreak(div){return (state.allMatches[div]||[]).some(m=>m&&m.type==='individual'&&m.tiebreak&&!m.done)}
/**
 * @param {string} [div]
 * @returns {boolean}
 */
export function isTeamRoundRobinDivision(div='Team Tournament'){
  if(!isTeamDivision(div))return false;
  if((state.teamBracketNodes?.[div]||[]).length)return false;
  const matches=state.allMatches?.[div]||[];
  return matches.some(match=>match.teamPair&&(match.type==='teamPosition'||match.type==='teamPlayoff'||match.type==='kachinuki'));
}
/**
 * @param {string} [div]
 * @returns {TeamStandingRow[]}
 */
export function teamStandings(div='Team Tournament'){
  return KSMEngine.teamStandings(state.allMatches[div]||[],eligibleTeams(div)||[],KSMEngine.teamRoundRobinCountedPlaces(ksmTeamSettings(div).teamAwardMode));
}
/**
 * After a team bout: a representative playoff when the pairing is level.
 * @param {Match} m
 */
export function maybeCreateTeamTiebreak(m){
  const plan=KSMEngine.maybeCreateTeamTiebreak(m,state.allMatches[m?.division]||[],ksmTeamSettings(m?.division).teamFormat);
  if(plan)appendApprovedDynamicMatches(m.division,plan.anchor,/** @type {Match} */(plan.playoff),plan.dynamicType);
  // F27: once every pairing of a team round robin is decided, teams still level on team wins,
  // bout wins and points for a place with an award (D2: Setup's team award mode) get a one-point
  // daihyosen (KSMEngine.teamRoundRobinTiebreakPlan).
  const rr=m&&isTeamRoundRobinDivision(m.division)?KSMEngine.teamRoundRobinTiebreakPlan(m,state.allMatches[m.division]||[],eligibleTeams(m.division)||[],ksmTeamSettings(m.division).teamFormat,KSMEngine.teamRoundRobinCountedPlaces(ksmTeamSettings(m.division).teamAwardMode)):null;
  if(rr)appendApprovedDynamicMatches(m.division,rr.anchor,/** @type {Match[]} */(rr.bouts),rr.dynamicType);
}
