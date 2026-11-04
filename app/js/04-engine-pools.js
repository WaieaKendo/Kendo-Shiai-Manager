// @ts-check
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
 * @param {string} div
 * @returns {boolean}
 */
function isTeamDivision(div){return !!ksmTeamDivision(div)||div==='Team Tournament'||/team|kachinuki/i.test(state.divisionTypes[div]||'')}
/**
 * Registered competitors of a division who are not no-shows.
 * @param {string} div
 * @returns {Competitor[]}
 */
function eligibleIndividuals(div){
  return KSMEngine.eligibleIndividuals(state.competitors,div);
}
/**
 * @param {string} div
 * @returns {Team[]}
 */
function eligibleTeams(div){
  return KSMEngine.eligibleTeams(state.teams.filter(t=>!state.teamDivisions||(t.teamDivisionId||'Team Tournament')===div));
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
function poolPlayerSlotLetter(index){
  return KSMEngine.poolPlayerSlotLetter(index);// moved to app/engine/pools.ts
}
/**
 * Gives each pool player its A/B/C/D slot (copies the players).
 * @param {Pool[]} pools
 * @returns {Pool[]}
 */
function assignPoolPlayerSlots(pools){
  KSMEngine.assignPoolPlayerSlots(pools).forEach((p,i)=>{pools[i].players=p.players});return pools;// moved to app/engine/pools.ts
}
/**
 * @param {PoolPlayer} player
 * @param {number} index
 * @returns {string}
 */
function poolPlayerSlot(player,index){
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
function divisionCourtMode(div){return state.divisionCourts[div]||'A'}
/**
 * @param {string} div
 * @param {string} poolLabel
 * @param {Pool[]} [pools]
 * @returns {Court}
 */
function poolCourtFor(div,poolLabel,pools=state.pools[div]||[]){let mode=divisionCourtMode(div);let pool=pools.find(p=>p.label===poolLabel);if(pool&&pool.court)return pool.court;if(mode!=='split')return /** @type {Court} */(mode);let idx=pools.findIndex(p=>p.label===poolLabel),aCount=Math.floor(pools.length/2);let court=/** @type {Court} */(idx>=0&&idx<aCount?'A':'B');if(pool)pool.court=court;return court}
/**
 * @param {string} div
 * @param {RoundName} round
 * @param {number} slot
 * @param {number} totalInRound
 * @returns {Court}
 */
function championshipCourtFor(div,round,slot,totalInRound){
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
function poolMatchPairs(size){
  return KSMEngine.poolMatchPairs(size);// moved to app/engine/pools.ts
}
/**
 * @param {string} div
 * @param {Pool[]} pools
 * @returns {Match[]}
 */
function buildPoolMatches(div,pools){
  return KSMEngine.buildPoolMatches(div,pools,(pools||[]).map(pool=>poolCourtFor(div,pool.label,pools)));// moved to app/engine/pools.ts
}
