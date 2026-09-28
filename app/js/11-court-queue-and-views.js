
function teamSideLabel(side,div){
  if(!side)return 'TBD';
  // Direct team references must resolve to the registered team name everywhere,
  // including deeper placeholder queue rows. Do not wait until the match becomes active.
  if(side.team){
    let t=eligibleTeams(div)[side.team-1];
    return (t&&t.team)?t.team:'Team '+side.team;
  }
  if(side.ref){
    let n=(state.teamBracketNodes?.[div]||[]).find(x=>x.id===side.ref);
    if(n&&n.winner)return n.winner;
    return 'Winner '+side.ref;
  }
  return 'TBD';
}
function courtCurrentMatch(court){
  let cs=state.courtState?.[court];
  if(cs&&cs.division&&eliminationFinalDone(cs.division))return null;
  if(!cs || !cs.division || !(state.allMatches[cs.division]||[])[cs.index] || (state.allMatches[cs.division]||[])[cs.index]?.done){
    cs=findNextForCourt(court,cs?.division||state.courtActiveDivision?.[court]||null,cs?.index||0);
    state.courtState[court]=cs;state.courtActiveDivision[court]=cs.division;
  }
  let arr=state.allMatches[cs.division]||[];if(arr.some(isTeamMatch))arr=sortTeamMatches(cs.division);
  let m=arr[cs.index];
  if(!m || m.done || !matchBelongsToCourt(m,court))return null;
  let next=arr.slice(cs.index+1).find(x=>!x.done && matchBelongsToCourt(x,court));
  return {division:cs.division,match:m,next};
}
function activeScoreArrays(m){let arr=state.allMatches[m.division]||[],idx=arr.indexOf(m);if(m.division===state.currentDivision && idx===state.current && !m.done){return {W:[...state.score.W],R:[...state.score.R]};}return {W:[...(m.wp||[])],R:[...(m.rp||[])]};}
function teamSheetHtml(div,pair,currentMatch){let matches=(state.allMatches[div]||[]).filter(m=>m.teamPair===pair && (m.type==='teamPosition'||m.type==='teamPlayoff'));let first=matches[0]||{};let s=teamPairSummary(div,pair);let rows=matches.map(x=>{let pts=activeScoreArrays(x);let mid=x===currentMatch?'NOW':(x.done?'DONE':esc(x.position||''));return `<div class="team-sheet-row ${x===currentMatch?'gold':''}"><div class="white"><b>${esc(x.white)}</b><div class="live-points">${pts.W.join(' ')}</div></div><div class="vs">${mid}</div><div class="red"><b>${esc(x.red)}</b><div class="live-points">${pts.R.join(' ')}</div></div></div>`}).join('');return `<div class="team-sheet"><div class="team-sheet-head"><div>${esc(first.teamWhite||'White Team')}</div><div class="redHead">${esc(first.teamRed||'Red Team')}</div></div>${rows}<div class="team-score-footer"><div class="white">Wins ${s.wWins}<br><span class="small">Points ${s.wPts}</span></div><div></div><div class="red">Wins ${s.rWins}<br><span class="small">Points ${s.rPts}</span></div></div></div>`}
function renderProgress(){progActive.innerHTML=`<b>${esc(state.currentDivision)}</b><br><span class="small">${state.matches[state.current]?`Pool ${state.matches[state.current].pool}`:'Not started'}</span>`;progUpcoming.innerHTML=state.divisions.filter(d=>d!==state.currentDivision).slice(0,4).map(d=>`<div class="competitor-line">${esc(d)}</div>`).join('')}
function renderSearch(){if(!window.searchName||!window.searchDojo)return;let q=searchName.value.toLowerCase(),d=searchDojo.value.toLowerCase();let names=state.competitors.filter(c=>q&&c.name.toLowerCase().includes(q)).slice(0,8);nameResults.classList.toggle('hidden',!names.length);nameResults.innerHTML=names.map((c,i)=>`<div class="search-item" onclick="showCompProfile(${state.competitors.indexOf(c)})">${esc(c.name)}<div class="small">${esc(c.dojo)} • ${esc(c.division)}</div></div>`).join('');let dojos=[...new Set([...state.competitors.map(c=>c.dojo),...state.teams.map(t=>t.dojo)].filter(Boolean))].filter(x=>d&&x.toLowerCase().includes(d)).slice(0,8);dojoResults.classList.toggle('hidden',!dojos.length);dojoResults.innerHTML=dojos.map(x=>`<div class="search-item" onclick="showDojoProfile(${jsArg(x)})">${esc(x)}</div>`).join('')}
function showCompProfile(i){let c=state.competitors[i];profile.innerHTML=`<h1>${esc(c.name)}</h1><p>${esc(c.dojo)} • ${esc(c.division)}</p><p>Status: ${esc(c.status)}</p>`}
function showDojoProfile(x){let n=state.competitors.filter(c=>c.dojo===x).length,t=state.teams.filter(c=>c.dojo===x).length;profile.innerHTML=`<h1>${esc(x)}</h1><p>${n} individual entries • ${t} teams</p>`}
