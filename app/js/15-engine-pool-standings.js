// @ts-check
/**
 * Pool standings; tied groups are ordered by their tiebreaks (their pool record is kept in wins/pts).
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {PoolStandingRow[]}
 */
function poolStandings(poolLabel,div=state.currentDivision){
  let pool=(state.pools[div]||[]).find(p=>p.label===poolLabel);if(!pool)return [];
  let base=initialPoolStandings(poolLabel,div);if(!base.length)return [];
  let req=requiredSeedPlaces(div)[poolLabel]||2,rebuilt=[];
  for(let i=0;i<base.length;){
    let j=i+1;while(j<base.length&&base[j].wins===base[i].wins&&base[j].pts===base[i].pts)j++;
    let group=base.slice(i,j);
    if(group.length>1&&(i+1)<=req){
      const resolved=resolveTiebreakBaseGroup(poolLabel,div,{start:i+1,end:j,players:group});
      const statsByName=new Map(tiebreakStatsForPlayers(poolLabel,div,group).stats.map(x=>[x.name,x]));
      // resolved.locked holds tiebreak-series stats; report the pool record (from `group`) as wins/pts
      // and keep the tiebreak record separately in tbWins/tbPts.
      const poolRecordByName=new Map(group.map(x=>[x.name,x]));
      rebuilt.push(...resolved.ordered.map(x=>{const st=statsByName.get(x.name),rec=poolRecordByName.get(x.name)||x;return {name:x.name,dojo:x.dojo,wins:rec.wins,pts:rec.pts,tbWins:st?.wins||0,tbPts:st?.pts||0,seedLocked:resolved.locked.some(l=>l.name===x.name)};}));
    }else rebuilt.push(...group);
    i=j;
  }
  return rebuilt;
}
