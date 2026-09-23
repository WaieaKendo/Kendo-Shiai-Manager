// @ts-check
/**
 * Dojo group used to keep dojo-mates apart in pools (Aiea and Waipahu count as one).
 * @param {string} d
 * @returns {string}
 */
function clubGroup(d){let s=(d||'').toLowerCase();return s.includes('aiea')||s.includes('waipahu')?'aiea-waipahu':s}
/**
 * @template {{name: string, dojo: string}} T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffleDeterministic(arr){return arr.map((x,i)=>({x,k:(clubGroup(x.dojo)+x.name+i)})).sort((a,b)=>a.k.localeCompare(b.k)).map(o=>o.x)}
/**
 * @param {string} div
 * @returns {boolean}
 */
function isTeamDivision(div){return div==='Team Tournament'||/team|kachinuki/i.test(state.divisionTypes[div]||'')}
/**
 * Registered competitors of a division who are not no-shows.
 * @param {string} div
 * @returns {Competitor[]}
 */
function eligibleIndividuals(div){return state.competitors.filter(c=>c.division===div&&c.status!=='NoShow'&&c.name)}
/**
 * @param {string} div
 * @returns {Team[]}
 */
function eligibleTeams(div){return state.teams.filter(t=>t.status!=='NoShow'&&t.team)}
/**
 * Pool sizes for n entrants (frozen template library).
 * @param {number} n
 * @returns {number[]}
 */
function poolSizes(n){
  // Template library: use as many 4-person pools as possible while avoiding 2-person pools.
  const fixed={
    6:[3,3],7:[4,3],8:[4,4],
    9:[3,3,3],10:[4,3,3],11:[4,4,3],
    12:[4,4,4],13:[4,3,3,3],14:[4,4,3,3],15:[4,4,4,3],16:[4,4,4,4],
    17:[4,4,3,3,3],18:[4,4,4,3,3],19:[4,4,4,4,3],20:[4,4,4,4,4],
    21:[4,4,4,3,3,3],22:[4,4,4,4,3,3],
    23:[4,4,3,3,3,3,3],24:[4,4,4,3,3,3,3],25:[4,4,4,4,3,3,3],26:[4,4,4,4,4,3,3],27:[4,4,4,4,4,4,3],28:[4,4,4,4,4,4,4],
    29:[4,4,4,4,4,3,3,3],30:[4,4,4,4,4,4,3,3],31:[4,4,4,4,4,4,4,3],32:[4,4,4,4,4,4,4,4],
    33:[4,4,4,4,4,4,3,3,3],34:[4,4,4,4,4,4,4,3,3],35:[4,4,4,4,4,4,4,4,3],36:[4,4,4,4,4,4,4,4,4],
    37:[4,4,4,4,4,4,4,3,3,3],38:[4,4,4,4,4,4,4,4,3,3],39:[4,4,4,4,4,4,4,4,4,3],40:[4,4,4,4,4,4,4,4,4,4]
  };
  if(fixed[n])return fixed[n];
  let poolCount=Math.max(1,Math.ceil(n/4));while(n/poolCount<3&&poolCount>1)poolCount--;let sizes=Array(poolCount).fill(3),rem=n-poolCount*3;for(let i=0;i<rem;i++)sizes[i%poolCount]++;return sizes;// wrap: n=5 → [5], not [4,NaN] (which dropped an entrant)
}
/**
 * @param {number} index
 * @returns {string}
 */
function poolPlayerSlotLetter(index){return String.fromCharCode(65+Math.max(0,Number(index)||0))}
/**
 * Gives each pool player its A/B/C/D slot (copies the players).
 * @param {Pool[]} pools
 * @returns {Pool[]}
 */
function assignPoolPlayerSlots(pools){
  (pools||[]).forEach(pool=>{
    pool.players=(pool.players||[]).map((player,index)=>({...player,poolSlot:poolPlayerSlotLetter(index),poolSlotIndex:index}));
  });
  return pools;
}
/**
 * @param {PoolPlayer} player
 * @param {number} index
 * @returns {string}
 */
function poolPlayerSlot(player,index){return player?.poolSlot||poolPlayerSlotLetter(index)}
/**
 * Seeds, then dojo-separated fill.
 * @param {Competitor[]} comps
 * @returns {Pool[]}
 */
function buildPools(comps){
  let n=comps.length,sizes=poolSizes(n);
  let pools=sizes.map((size,i)=>({label:String.fromCharCode(65+i),size,players:[]}));
  let sorted=[...comps].sort((a,b)=>(parseInt(a.seed)||999)-(parseInt(b.seed)||999)||a.name.localeCompare(b.name));
  let seeds=sorted.filter(c=>c.seed).slice(0,pools.length);
  seeds.forEach((c,i)=>pools[i].players.push(c));
  let rest=sorted.filter(c=>!seeds.includes(c));let groups={};
  rest.forEach(c=>{let g=clubGroup(c.dojo);(groups[g]=groups[g]||[]).push(c)});
  let grouped=Object.values(groups).sort((a,b)=>b.length-a.length).map(g=>shuffleDeterministic(g));
  grouped.forEach(group=>{group.forEach(c=>{let choices=pools.filter(p=>p.players.length<p.size);choices.sort((p1,p2)=>{let same1=p1.players.filter(x=>clubGroup(x.dojo)===clubGroup(c.dojo)).length;let same2=p2.players.filter(x=>clubGroup(x.dojo)===clubGroup(c.dojo)).length;if(same1!==same2)return same1-same2;let fill=(p1.players.length/p1.size)-(p2.players.length/p2.size);if(fill!==0)return fill;return p1.label.localeCompare(p2.label)});if(choices[0])choices[0].players.push(c)})});
  // Visible top-to-bottom order is the canonical A/B/C/D slot order.
  // Clone pool entries so slot metadata stays local to the pool rather than registration records.
  return assignPoolPlayerSlots(pools);
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
function championshipCourtFor(div,round,slot,totalInRound){let mode=divisionCourtMode(div);if(mode!=='split')return /** @type {Court} */(mode);if(round==='Final')return 'A';let total=Math.max(1,totalInRound||1);return Number(slot||0)<Math.ceil(total/2)?'A':'B'}
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
  const fixed=POOL_MATCH_TEMPLATES[size];
  if(fixed)return fixed.map(pair=>[...pair]);
  const pairs=[];
  for(let i=0;i<size;i++)for(let j=i+1;j<size;j++)pairs.push([i,j]);
  return pairs;
}
/**
 * @param {string} div
 * @param {Pool[]} pools
 * @returns {Match[]}
 */
function buildPoolMatches(div,pools){
  const matches=[];
  (pools||[]).forEach((pool,poolOrder)=>{
    const players=pool.players||[];
    const pairs=poolMatchPairs(players.length);
    const court=poolCourtFor(div,pool.label,pools);
    pairs.forEach(([whiteIndex,redIndex],poolTemplateOrder)=>matches.push({
      division:div,
      pool:pool.label,
      white:players[whiteIndex].name,
      red:players[redIndex].name,
      wdojo:players[whiteIndex].dojo,
      rdojo:players[redIndex].dojo,
      whitePoolSlot:poolPlayerSlot(players[whiteIndex],whiteIndex),
      redPoolSlot:poolPlayerSlot(players[redIndex],redIndex),
      done:false,
      wp:[],
      rp:[],
      type:'individual',
      origin:'TEMPLATE',
      court,
      poolOrder,
      poolTemplateOrder
    }));
  });
  return matches;
}
