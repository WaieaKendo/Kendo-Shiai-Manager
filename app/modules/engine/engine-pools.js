// @ts-check
import {getState} from '../../store/index.ts';
import {selectCompetitors,selectDivisionCourts,selectDivisionTypes,selectPools,selectTeamDivisions,selectTeams} from '../selectors.js';
import {ksmTeamDivision} from '../registration/team-divisions.js';
import {ksmDrawHolds,ksmEditedPools,ksmSetDraw} from './structure-store.js';
import * as KSMEngine from '../../engine/index.ts';
/**
 * Dojo group used to keep dojo-mates apart in pools (Aiea and Waipahu count as one).
 * @param {string} d
 * @returns {string}
 */
function clubGroup(d){
  return KSMEngine.clubGroup(d);// moved to app/engine/pools.ts
}
/**
 * @template {{name: string, dojo: string}} T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffleDeterministic(arr){
  return KSMEngine.shuffleDeterministic(arr);// moved to app/engine/pools.ts
}
/**
 * Registered competitors of a division who are not no-shows.
 * @param {string} div
 * @returns {Competitor[]}
 */
export function eligibleIndividuals(div){
  return KSMEngine.eligibleIndividuals(selectCompetitors(getState()),div);
}
/**
 * @param {string} div
 * @returns {Team[]}
 */
export function eligibleTeams(div){
  return KSMEngine.eligibleTeams(selectTeams(getState()).filter(t=>!selectTeamDivisions(getState())||(t.teamDivisionId||'Team Tournament')===div));
}
/**
 * Pool sizes for n entrants (frozen template library). Delegates to app/engine/pools.ts.
 * @param {number} n
 * @returns {number[]}
 */
function poolSizes(n){
  return KSMEngine.poolSizes(n);// moved to app/engine/pools.ts
}
/**
 * @param {number} index
 * @returns {string}
 */
export function poolPlayerSlotLetter(index){
  return KSMEngine.poolPlayerSlotLetter(index);// moved to app/engine/pools.ts
}
/**
 * Gives each pool player its A/B/C/D slot (copies the players).
 * @param {Pool[]} pools
 * @returns {Pool[]}
 */
export function assignPoolPlayerSlots(pools){
  KSMEngine.assignPoolPlayerSlots(pools).forEach((p,i)=>{pools[i].players=p.players});return pools;// moved to app/engine/pools.ts
}
/**
 * @param {PoolPlayer} player
 * @param {number} index
 * @returns {string}
 */
export function poolPlayerSlot(player,index){
  return KSMEngine.poolPlayerSlot(player,index);// moved to app/engine/pools.ts
}
/**
 * Seeds, then dojo-separated fill.
 * @param {Competitor[]} comps
 * @returns {Pool[]}
 */
function buildPools(comps){
  return KSMEngine.buildPools(comps);// moved to app/engine/pools.ts
}
/**
 * @param {string} div
 * @returns {CourtMode}
 */
export function divisionCourtMode(div){return selectDivisionCourts(getState())[div]||'A'}
/**
 * @param {string} div
 * @param {string} poolLabel
 * @param {Pool[]} [pools]
 * @returns {Court}
 */
export function poolCourtFor(div,poolLabel,pools=selectPools(getState())[div]||[]){let mode=divisionCourtMode(div);let pool=pools.find(p=>p.label===poolLabel);if(pool&&pool.court)return pool.court;if(mode!=='split')return /** @type {Court} */(mode);let idx=pools.findIndex(p=>p.label===poolLabel),aCount=Math.floor(pools.length/2);let court=/** @type {Court} */(idx>=0&&idx<aCount?'A':'B');if(pool)ksmKeepPoolCourt(div,pool,court);return court}
/**
 * The split court a pool was given is kept on the pool (poolCourtFor() reads it first next time; the snapshot carries it).
 * A pool of the draw is store data (#15 PR 12a): a new pool row in one tournament/drawEntriesUpdated (in both maps when
 * a team round robin shares it, ksmEditedPools()). Any other pool (the pool editor's copy, a list a caller built) is
 * written as before; a stale pool of an older draw (frozen in the tests) is left alone, as nothing reads it any more.
 * @param {string} div @param {Pool} pool @param {Court} court
 */
function ksmKeepPoolCourt(div,pool,court){
  if(ksmDrawHolds(div,pool))ksmSetDraw('drawEntriesUpdated',ksmEditedPools(div,p=>p===pool?{...p,court}:p));
  else if(!Object.isFrozen(pool))pool.court=court;
}
/**
 * @param {string} div
 * @param {RoundName} round
 * @param {number} slot
 * @param {number} totalInRound
 * @returns {Court}
 */
export function championshipCourtFor(div,round,slot,totalInRound){
  return /** @type {Court} */(KSMEngine.championshipCourtFor(divisionCourtMode(div),round,slot,totalInRound));
}
const POOL_MATCH_TEMPLATES=Object.freeze({
  2:Object.freeze([[0,1]]),
  3:Object.freeze([[0,1],[2,1],[2,0]]),
  4:Object.freeze([[0,1],[2,3],[2,0],[1,3],[1,2],[3,0]])
});
/**
 * Bout order of a pool as [white, red] player indexes.
 * @param {number} size
 * @returns {number[][]}
 */
export function poolMatchPairs(size){
  return KSMEngine.poolMatchPairs(size);// moved to app/engine/pools.ts
}
/**
 * @param {string} div
 * @param {Pool[]} pools
 * @returns {Match[]}
 */
export function buildPoolMatches(div,pools){
  return KSMEngine.buildPoolMatches(div,pools,(pools||[]).map(pool=>poolCourtFor(div,pool.label,pools)));// moved to app/engine/pools.ts
}
/**
 * @param {string} div
 * @returns {boolean}
 */
export function isTeamDivision(div){return !!ksmTeamDivision(div)||div==='Team Tournament'||/team|kachinuki/i.test(selectDivisionTypes(getState())[div]||'')}
