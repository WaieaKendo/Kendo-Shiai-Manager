function divisionComplete(div){const matches=(state.allMatches[div]||[]).filter(isValidMatchObject);return matches.some(m=>m.championship&&m.position==='Final'&&m.done) || ((isTeamDivision(div)||isPoolOnlyDivision(div))&&matches.length && matches.every(m=>m.done));}
// Individual round robins too small for a championship bracket (3–5 entrants: a single pool
// and no frozen template) have no Final; they are decided by the final pool standings.
function isPoolOnlyDivision(div){
  if(isTeamDivision(div)||(state.divisionTypes?.[div]||'Round Robin')!=='Round Robin')return false;
  const pools=state.pools?.[div]||[];
  return pools.length===1&&!championshipLabels(div).length;
}
function medalResultsHtml(div){if(!divisionComplete(div))return '';if(isTeamDivision(div))return teamFinalResultsHtml(div);let final=(state.allMatches[div]||[]).find(m=>m.championship&&m.position==='Final'&&m.done);if(final){let first=winnerOf(final),second=first===final.red?final.white:final.red;let thirds=(state.allMatches[div]||[]).filter(m=>m.championship&&m.position==='Semifinal'&&m.done).map(m=>{let w=winnerOf(m);return w===m.red?m.white:m.red}).filter(Boolean);return `<div class="muted-card"><div class="competitor-line"><b>🥇 1st</b><span>${esc(first)}</span></div><div class="competitor-line"><b>🥈 2nd</b><span>${esc(second)}</span></div>${thirds.map(t=>`<div class="competitor-line"><b>🥉 3rd</b><span>${esc(t)}</span></div>`).join('')}</div>`;}return `<div class="muted-card"><b>Completed</b></div>`}

function teamNodeSideName(side,div){
  if(!side)return '';
  if(side.team){let t=eligibleTeams(div)[side.team-1];return t&&t.team?t.team:'';}
  if(side.ref){let n=(state.teamBracketNodes?.[div]||[]).find(x=>x.id===side.ref);return n&&n.winner?n.winner:'';}
  return '';
}
function teamFinalPlacements(div){
  if(isTeamRoundRobinDivision(div))return teamRoundRobinPlacements(div);
  let nodes=state.teamBracketNodes?.[div]||[];
  let final=nodes.find(n=>n.round==='Final')||nodes[nodes.length-1];
  if(!final||!final.winner)return null;
  let left=teamNodeSideName(final.left,div),right=teamNodeSideName(final.right,div);
  let second=final.winner===left?right:left;
  let thirds=nodes.filter(n=>n.round==='Semifinal'&&n.winner).map(n=>{let l=teamNodeSideName(n.left,div),r=teamNodeSideName(n.right,div);return n.winner===l?r:l;}).filter(Boolean);
  return {first:final.winner,second,thirds,roundRobin:false};
}
function teamFinalResultsHtml(div){
  let p=teamFinalPlacements(div);
  if(!p)return '<div class="muted-card"><b>Completed</b></div>';
  let mode=state.teamAwardMode||'top2';
  let rows=`<div class="competitor-line"><b>🥇 1st</b><span>${esc(p.first)}</span></div>`;
  if(mode!=='top1'&&p.second)rows+=`<div class="competitor-line"><b>🥈 2nd</b><span>${esc(p.second)}</span></div>`;
  if(mode==='dual3')rows+=(p.thirds||[]).map(t=>`<div class="competitor-line"><b>🥉 3rd</b><span>${esc(t)}</span></div>`).join('');
  return `<div class="muted-card"><h2>Team Results</h2>${rows}</div>`;
}

function renderResultsAll(){let html='';Object.keys(state.allMatches||{}).forEach((div,idx)=>{let pools=state.pools[div]||[];let inner='';
  if(isTeamDivision(div)){
    let pairs=[...new Set((state.allMatches[div]||[]).filter(m=>m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki').map(m=>m.teamPair))];
    inner+=pairs.map(pair=>{let s=teamPairSummary(div,pair);let matches=(state.allMatches[div]||[]).filter(m=>m.teamPair===pair);return `<details class="result-section"><summary>${esc(s.teamWhite)} vs ${esc(s.teamRed)} — ${s.wWins}-${s.rWins} wins, ${s.wPts}-${s.rPts} points</summary><div class="result-inner">${matches.map(m=>`<div class="queue-row ${m.tiebreak?'gold':''}"><div class="white"><b>${esc(m.white)}</b><div class="small">${(m.wp||[]).join(' ')}</div></div><div class="vs">${m.tiebreak?'Team Playoff':esc(m.position||'')}</div><div class="red"><b>${esc(m.red)}</b><div class="small">${(m.rp||[]).join(' ')}</div></div></div>`).join('')}</div></details>`}).join('');
  } else {
    if(pools.length){inner+=`<details class="result-section"><summary>Pool Play</summary><div class="result-inner">`+pools.map(p=>{let st=poolStandings(p.label,div);let matches=(state.allMatches[div]||[]).filter(m=>m.pool===p.label&&!m.championship);return `<details class="result-section"><summary>Pool ${esc(p.label)}</summary><div class="result-inner"><div class="stand-row small"><b>Rank</b><b>Name</b><b>Wins</b><b>Pts</b></div>${st.map((r,i)=>`<div class="stand-row"><span>${i+1}</span><div><b>${esc(r.name)}</b><div class="small">${esc(r.dojo)} ${i<2&&topSeedsResolved(p.label,div)?'<span class="winner-chip">ADVANCES</span>':''}</div></div><b>${r.wins}</b><b>${r.pts}</b>${typeof r.tbWins==='number'?`<div class="small" style="grid-column:2 / -1">Tiebreak: ${r.tbWins}W / ${r.tbPts} pts</div>`:''}</div>`).join('')}<h3>Pool Results</h3>${matches.map(m=>`<div class="queue-row ${m.tiebreak?'gold':''}"><div class="white"><b>${esc(m.white)}</b><div class="small">${(m.wp||[]).join(' ')}</div></div><div class="vs">${m.done?'DONE':(m.tiebreak?'TIEBREAK':'vs')}</div><div class="red"><b>${esc(m.red)}</b><div class="small">${(m.rp||[]).join(' ')}</div></div></div>`).join('')}</div></details>`}).join('')+`</div></details>`;}
    let champ=(state.allMatches[div]||[]).filter(m=>m.championship||m.tiebreak);
    inner+=`<details class="result-section"><summary>Championship</summary><div class="result-inner">${champ.length?champ.map(m=>`<div class="queue-row ${m.tiebreak?'gold':''}"><div class="white"><b>${esc(m.white)}</b><div class="small">${(m.wp||[]).join(' ')} ${esc(m.wdojo||'')}</div></div><div class="vs">${m.tiebreak?'Tiebreak':esc(m.position||'Championship')}</div><div class="red"><b>${esc(m.red)}</b><div class="small">${(m.rp||[]).join(' ')} ${esc(m.rdojo||'')}</div></div></div>`).join(''):'No championship matches yet.'}</div></details>`;
  }
  let complete=divisionComplete(div);
  html+=`<div class="result-section"><div class="summary-like"><b>${esc(div)}${complete?' ✓':''}</b></div>${complete?medalResultsHtml(div):''}${complete?`<details><summary>Expand for details</summary><div class="result-inner">${inner||'<div class="muted-card">No detailed results.</div>'}</div></details>`:''}</div>`;
});
  html+=renderAwards();return html||'<div class="muted-card">Generate pools to see results.</div>'+renderAwards();}
function renderAwards(){return `<div style="margin-top:16px"><h2>Awards</h2><div style="overflow:auto"><table><thead><tr><th>Award</th><th>Name</th><th>Dojo</th><th></th></tr></thead><tbody>${(state.awards||[]).map((a,i)=>`<tr><td><input value="${esc(a.award)}" onchange="state.awards[${i}].award=this.value"></td><td><input value="${esc(a.name)}" onchange="state.awards[${i}].name=this.value"></td><td><input value="${esc(a.dojo)}" onchange="state.awards[${i}].dojo=this.value"></td><td><button onclick="state.awards.splice(${i},1);renderPools()">×</button></td></tr>`).join('')}</tbody></table></div><div class="row" style="margin-top:10px"><button class="primary" onclick="addAward()">+ Add Award</button></div></div>`}
function addAward(){state.awards=state.awards||[];state.awards.push({award:'Fighting Spirit',name:'',dojo:''});renderPools()}
function exportCSV(){let rows=[['Name','Dojo','Division','Seed','Status'],...state.competitors.map(c=>[c.name,c.dojo,c.division,c.seed,c.status])];let csv=rows.map(r=>r.map(x=>`"${String(x||'').replace(/"/g,'""')}"`).join(',')).join('\n');let blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ksm-registration.csv';a.click();URL.revokeObjectURL(url)}
function teamRoster(team){let t=(state.teams||[]).find(x=>String(x.team).trim()===String(team).trim());if(!t)return [];let fmt=t.type||teamFormat?.value||'5-Person Team';let keys=(fmt==='3-Person Team'||fmt==='Kachinuki')?['senpo','chuken','taisho']:['senpo','jiho','chuken','fukusho','taisho'];return keys.map(k=>t[k]).filter(n=>n&&String(n).trim());}
function canModifyRepresentative(m){
  if(!m||m.type!=='teamPlayoff'||isReadOnlySession())return false;
  if(['local','admin','director','staff'].includes(ksmSessionRole))return true;
  if(ksmSessionRole==='scorekeeper'){
    const assigned=(cloudSession.court||state.currentCourt||'').toUpperCase();
    return !!assigned&&matchBelongsToCourt(m,assigned);
  }
  return false;
}
function repSelect(side,team,current){
  let m=state.matches[state.current];
  let roster=(m&&m.type==='teamPlayoff')?(side==='W'?teamRoster(m.teamWhite):teamRoster(m.teamRed)):teamRoster(team);
  let placeholder=!current||/Representative/.test(current);
  if(!canModifyRepresentative(m))return `<span class="representative-readonly" data-testid="representative-readonly">${esc(placeholder?`${team||'Dojo'} Representative`:current)}</span>`;
  let opts=`<option value="" ${placeholder?'selected':''}>${esc(team||'Dojo')} Representative</option>`+roster.map(n=>`<option value="${esc(n)}" ${n===current?'selected':''}>${esc(n)}</option>`).join('');
  return `<select onchange="setRepresentative('${side}',this.value)" data-testid="representative-select">${opts}</select>`;
}
function setRepresentative(side,val){
  let m=state.matches[state.current];
  if(!m||!val||!canModifyRepresentative(m)){if(m&&!canModifyRepresentative(m))updateSaveStatus('Representative selection is read only');return;}
  performCourtAction(`${side==='W'?'White':'Red'} Representative`,()=>{if(side==='W')m.white=val;else m.red=val;renderScore()});
}

