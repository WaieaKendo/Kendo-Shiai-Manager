function finalResultsHtml(div){
  if(isTeamDivision(div))return divisionComplete(div)?teamFinalResultsHtml(div):'';
  let final=(state.allMatches[div]||[]).find(m=>m.championship&&m.position==='Final'&&m.done);
  if(!final)return '';
  let first=winnerOf(final), second=first===final.red?final.white:final.red;
  let semi=(state.allMatches[div]||[]).filter(m=>m.championship&&m.position==='Semifinal'&&m.done);
  let thirds=semi.map(m=>{let w=winnerOf(m);return w===m.red?m.white:m.red}).filter(Boolean);
  return `<div class="muted-card"><h2>Final Results</h2><div class="competitor-line"><b>1st</b><span>${esc(first)}</span></div><div class="competitor-line"><b>2nd</b><span>${esc(second)}</span></div>${thirds.map(t=>`<div class="competitor-line"><b>3rd</b><span>${esc(t)}</span></div>`).join('')}</div>`;
}

function teamQueueStatusHtml(div,c){
  let arr=state.allMatches[div]||[];
  let other=arr.find(m=>!m.done && (m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki') && !matchBelongsToCourt(m,c));
  if(other){
    let label=other.pool||other.position||'Next Match';
    return `<div class="muted-card"><b>Awaiting Next Match</b><br>${esc(label)}<br><span class="small">Court ${esc(other.court||'A')}</span></div>`;
  }
  let doneHtml=finalResultsHtml(div);
  return doneHtml || '<div class="muted-card">Queue complete.</div>';
}
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
function teamPlaceholderRows(div,c,existingPairs){
  let nodes=(state.teamBracketNodes?.[div]||[]);
  let out=[];
  nodes.forEach(node=>{
    if(node.winner||node.court!==c)return;
    if(existingPairs.has(nodePairId(node)))return;
    let a=teamSideTeam(node.left,eligibleTeams(div),div),b=teamSideTeam(node.right,eligibleTeams(div),div);
    if(a&&b)return; // actual match will be created by syncTeamBracket
    // Node left is the red source and node right is the white source.
    out.push(`<div class="queue-row"><div class="white"><b>${esc(teamSideLabel(node.right,div))}</b></div><div class="vs">awaiting<div class="small">${esc(node.round)}</div></div><div class="red"><b>${esc(teamSideLabel(node.left,div))}</b></div></div>`);
  });
  return out;
}
function queueRowHtml(white,red,status,round,extraClass=''){
  return `<div class="queue-row ${extraClass}"><div class="white"><b>${esc(white||'TBD')}</b></div><div class="vs">${status}<div class="small">${esc(round||'')}</div></div><div class="red"><b>${esc(red||'TBD')}</b></div></div>`;
}
function championshipQueueRows(div,c){
  let labels=championshipLabels(div);
  if(!labels.length)return [];
  let first=firstRoundName(labels.length);
  let seq=roundSequenceFromFirst(first);
  let rows=[];
  seq.forEach(round=>{
    let expected=expectedRoundCount(div,round); if(!expected)return;
    for(let i=0;i<expected;i++){
      let m=champMatchBySlot(div,round,i);
      if(m&&m.done)continue;
      if(m){
        if(!matchBelongsToCourt(m,c))continue;
        let playable=m.white&&m.red;
        rows.push(queueRowHtml(m.white,m.red,playable?'vs':'awaiting',m.position||round,m.tiebreak?'gold':''));
      }else if(round===first){
        // First-round championship source labels are [red, white]. Render white on the left and red on the right.
        let pair=labels[i]||[];let rLabel=pair[0],wLabel=pair[1];
        let r=seedNameForLabel(div,rLabel,true),w=seedNameForLabel(div,wLabel,true);
        let red=r?r.name:rLabel,white=w?w.name:wLabel;
        let status=(String(wLabel).toUpperCase()==='BYE'||!wLabel)?'BYE':((r&&w)?'vs':'awaiting');
        rows.push(queueRowHtml(white,red,status,round));
      }else{
        let prev=previousRoundName(round);
        let red=sourceLabelForRound(div,prev,i*2),white=sourceLabelForRound(div,prev,i*2+1);
        rows.push(queueRowHtml(white.name,red.name,(red.done&&white.done)?'vs':'awaiting',round));
      }
    }
  });
  return rows;
}
function renderQueue(){let doneHtml=finalResultsHtml(state.currentDivision);let all=state.allMatches[state.currentDivision]||[];let c=state.currentCourt||'A';if(eliminationFinalDone(state.currentDivision)){queue.innerHTML=doneHtml||'<div class="muted-card">Division complete.</div>';return;}
  let isTeam=all.some(m=>m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki');
  if(isTeam){
    let q=sortTeamMatches(state.currentDivision).filter(m=>!m.done && matchBelongsToCourt(m,c));
    let seen=new Set();let rows=[];
    q.forEach((m)=>{let key=m.teamPair;if(seen.has(key))return;seen.add(key);rows.push(`<div class="queue-row ${m.tiebreak?'gold':''}"><div class="white"><b>${esc(m.teamWhite||m.wdojo)}</b></div><div class="vs">${rows.length===0?'NOW':'vs'}<div class="small">${esc(m.pool||m.position||'Team Match')}</div></div><div class="red"><b>${esc(m.teamRed||m.rdojo)}</b></div></div>`)});
    rows.push(...teamPlaceholderRows(state.currentDivision,c,seen));
    queue.innerHTML=rows.join('')||teamQueueStatusHtml(state.currentDivision,c);return;
  }
  // Individual single-elimination queue is a read-only view of the immutable node list.
  // It shows every incomplete future match exactly once, including placeholders, and hides completed matches.
  if(all.some(m=>m.singleElim)){
    let arr=dedupeSingleElimMatches(state.currentDivision);
    let nodes=(state.singleElimNodes?.[state.currentDivision]||[]);
    let rows=[];
    nodes.forEach(node=>{
      let m=arr.find(x=>x.singleElim&&x.elimNodeId===node.id);
      if(m&&m.done)return;
      if(node.winner&&!m)return; // auto-advanced bye; no scoreable match to show
      if(m && matchBelongsToCourt(m,c)){
        rows.push(`<div class="queue-row ${m.tiebreak?'gold':''}"><div class="white"><b>${esc(m.white)}</b><div class="small">${esc(m.wdojo||'')}</div></div><div class="vs">${rows.length===0?'NOW':'vs'}<div class="small">${m.position?esc(m.position):''}</div></div><div class="red"><b>${esc(m.red)}</b><div class="small">${esc(m.rdojo||'')}</div></div></div>`);
      } else if(!m) {
        let court=(state.divisionCourts[state.currentDivision]||'A');
        if(court===c){
          rows.push(`<div class="queue-row"><div class="white"><b>${esc(sideLabelGeneric(node.right,state.currentDivision))}</b></div><div class="vs">awaiting<div class="small">${esc(node.round||'')}</div></div><div class="red"><b>${esc(sideLabelGeneric(node.left,state.currentDivision))}</b></div></div>`);
        }
      }
    });
    if(!rows.length){queue.innerHTML=doneHtml||'<div class="muted-card">Queue complete.</div>';return;}
    queue.innerHTML=rows.join('');return;
  }
  // Round robin / pool play queue is also a view of the full ordered division match timeline.
  // It includes pool matches plus championship placeholders, and hides completed matches.
  let q=(state.allMatches[state.currentDivision]||[]).filter(m=>!m.done && !m.championship && matchBelongsToCourt(m,c));
  let groups=[];q.forEach((m,i)=>{let key=m.pool||'Championship';let g=groups.find(x=>x.pool===key);if(!g){g={pool:key,matches:[]};groups.push(g)}g.matches.push({m,i});});
  let html='';groups.forEach((g,gi)=>{let label=(gi===0?'Current Pool ':'Next Pool ')+esc(g.pool);let body=g.matches.map(({m,i})=>`<div class="queue-row ${m.tiebreak?'gold':''}"><div class="white"><b>${esc(specificMatchSideLabel(m,'white'))}</b><div class="small">${esc(m.wdojo||'')}</div></div><div class="vs">${m.tiebreak?'<div class="tiebreak-label">TIEBREAK</div>':(i===0?'NOW':'vs')}<div class="small">${m.position?esc(m.position):''}</div></div><div class="red"><b>${esc(specificMatchSideLabel(m,'red'))}</b><div class="small">${esc(m.rdojo||'')}</div></div></div>`).join('');
    if(gi===0)html+=`<div class="queue-divider">${label}</div>${body}`;else html+=`<details class="result-section"><summary>${label}</summary><div class="result-inner">${body}</div></details>`;
  });
  let champRows=championshipQueueRows(state.currentDivision,c);
  if(champRows.length){html+=`<div class="queue-divider">Championship Bracket</div>${champRows.join('')}`;}
  if(doneHtml && !q.length && !champRows.length){queue.innerHTML=doneHtml;return;}
  queue.innerHTML=html||'<div class="muted-card">Queue complete.</div>'}
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
function renderPublic(){let data=courtCurrentMatch(state.publicCourt||'A');function panel(label,data){if(!data)return `<div class="fighter"><div class="court-chip">Court ${label}</div><h2>No active match</h2></div>`;let m=data.match,n=data.next,pts=activeScoreArrays(m);if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'){return `<div class="fighter"><div class="court-chip">Court ${label} • ${esc(data.division)}</div><h2>${esc(m.teamWhite)} vs ${esc(m.teamRed)}</h2>${m.type==='kachinuki'?kachinukiSheetHtml(m):teamSheetHtml(m.division,m.teamPair,m)}</div>`}return `<div class="fighter"><div class="court-chip">Court ${label} • ${esc(data.division)}${m.position?' • '+esc(m.position):''}</div><div class="scorebox"><div><div class="small">White</div><h2>${esc(m.white)}</h2><div class="points">${pts.W.join(' ')}</div></div><div class="redside"><div class="small">Red</div><h2>${esc(m.red)}</h2><div class="points">${pts.R.join(' ')}</div></div></div><h3>On Deck</h3>${n?`<div class="queue-row"><div class="white">${esc(n.white)}<div class="small">${esc(n.wdojo||'')}</div></div><div class="vs">vs<div class="small">${n.position?esc(n.position):''}</div></div><div class="red">${esc(n.red)}<div class="small">${esc(n.rdojo||'')}</div></div></div>`:'<div class="small">None</div>'}</div>`}if(window.publicTitle)publicTitle.textContent='Live Scores • Court '+(state.publicCourt||'A');publicLive.innerHTML=panel(state.publicCourt||'A',data)}
function renderProgress(){progActive.innerHTML=`<b>${esc(state.currentDivision)}</b><br><span class="small">${state.matches[state.current]?`Pool ${state.matches[state.current].pool}`:'Not started'}</span>`;progUpcoming.innerHTML=state.divisions.filter(d=>d!==state.currentDivision).slice(0,4).map(d=>`<div class="competitor-line">${esc(d)}</div>`).join('')}
function renderSearch(){if(!window.searchName||!window.searchDojo)return;let q=searchName.value.toLowerCase(),d=searchDojo.value.toLowerCase();let names=state.competitors.filter(c=>q&&c.name.toLowerCase().includes(q)).slice(0,8);nameResults.classList.toggle('hidden',!names.length);nameResults.innerHTML=names.map((c,i)=>`<div class="search-item" onclick="showCompProfile(${state.competitors.indexOf(c)})">${esc(c.name)}<div class="small">${esc(c.dojo)} • ${esc(c.division)}</div></div>`).join('');let dojos=[...new Set([...state.competitors.map(c=>c.dojo),...state.teams.map(t=>t.dojo)].filter(Boolean))].filter(x=>d&&x.toLowerCase().includes(d)).slice(0,8);dojoResults.classList.toggle('hidden',!dojos.length);dojoResults.innerHTML=dojos.map(x=>`<div class="search-item" onclick="showDojoProfile(${jsArg(x)})">${esc(x)}</div>`).join('')}
function showCompProfile(i){let c=state.competitors[i];profile.innerHTML=`<h1>${esc(c.name)}</h1><p>${esc(c.dojo)} • ${esc(c.division)}</p><p>Status: ${esc(c.status)}</p>`}
function showDojoProfile(x){let n=state.competitors.filter(c=>c.dojo===x).length,t=state.teams.filter(c=>c.dojo===x).length;profile.innerHTML=`<h1>${esc(x)}</h1><p>${n} individual entries • ${t} teams</p>`}
