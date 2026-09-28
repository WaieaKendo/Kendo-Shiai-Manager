// ==========================================================
// KSM v3.15.14 — clean-room fixed-grid TV renderer
// ==========================================================
function tv3Name(name){
  const parts=String(name||'—').trim().split(/\s+/).filter(Boolean);
  if(parts.length<=1)return `<span>${esc(parts[0]||'—')}</span>`;
  return `<span>${esc(parts[0])}</span><span>${esc(parts.slice(1).join(' '))}</span>`;
}
function tv3Side(match,side,teamMode){
  if(teamMode)return side==='white'?(match.teamWhite||match.wdojo||teamSideLabel(match.right,match.division)||'TBD'):(match.teamRed||match.rdojo||teamSideLabel(match.left,match.division)||'TBD');
  return tvIndividualSideLabel(match,side);
}
function tv3UpcomingModel(court,current,teamMode){
  const found=(tvUpcomingMatches(court,current,teamMode)||[]).slice(0,2).map(m=>({
    left:tv3Side(m,'white',teamMode),right:tv3Side(m,'red',teamMode),
    leftSub:teamMode?(m.position||m.round||''):(m.wdojo||m.position||''),
    rightSub:teamMode?'':(m.rdojo||''),round:teamMode?(m.position||m.round||''):''
  }));
  while(found.length<2)found.push(null);
  return found;
}
function buildTV3ViewModel(court){
  const data=courtCurrentMatch(court);
  const division=state.courtActiveDivision?.[court]||state.courtState?.[court]?.division||null;
  if(!data){
    if(division&&divisionComplete(division)&&resultPlacements(division).length){
      return {court,empty:false,division,format:'results',meta:{division,line:'Final Results'},upcoming:[null,null]};
    }
    return {court,empty:true,division,upcoming:[null,null]};
  }
  const m=data.match,meta=audienceMeta(m),teamMode=isTeamMatch(m);
  return {court,empty:false,division:m.division,data,match:m,meta,teamMode,format:m.type==='kachinuki'?'kachinuki':(teamMode?'team':'individual'),upcoming:tv3UpcomingModel(court,m,teamMode)};
}
function tv3Header(vm){return `<div class="tv3-head" data-testid="tv-header"><div class="tv3-court" data-testid="tv-court">Court ${esc(vm.court)}</div><div class="tv3-division" data-testid="tv-division">${esc(vm.meta?.division||vm.division||'No active match')}</div><div class="tv3-meta" data-testid="tv-meta">${esc(vm.meta?.line||'')}</div></div>`}
function tv3Upcoming(vm){
  const cards=vm.upcoming.map(x=>x?`<div class="tv3-up-card" data-testid="tv-upcoming-card"><div><div class="tv3-up-name" data-testid="tv-upcoming-white">${esc(x.left)}</div>${x.leftSub?`<div class="tv3-up-sub">${esc(x.leftSub)}</div>`:''}</div><div class="tv3-up-vs">vs</div><div><div class="tv3-up-name" data-testid="tv-upcoming-red">${esc(x.right)}</div>${x.rightSub?`<div class="tv3-up-sub">${esc(x.rightSub)}</div>`:''}</div></div>`:`<div class="tv3-up-card empty" data-testid="tv-upcoming-card"><div class="tv3-up-name">No additional match scheduled</div></div>`).join('');
  return `<div class="tv3-upcoming" data-testid="tv-upcoming"><div class="tv3-upcoming-title">Upcoming Matches</div>${cards}</div>`;
}
function tv3Player(name,dojo,red=false){return `<div class="tv3-player${red?' red':''}"><div class="tv3-top-rule${red?' red':''}"></div><div class="tv3-player-copy"><div class="tv3-name" data-testid="tv-${red?'red':'white'}-name">${tv3Name(name)}</div><div class="tv3-sub">${esc(dojo||'')}</div></div></div>`}
function tv3Individual(vm){
  const m=vm.match,p=activeScoreArrays(m);
  return `<div class="tv3-body"><div class="tv3-individual" data-testid="tv-current-match">${tv3Player(tvIndividualSideLabel(m,'white'),m.wdojo,false)}<div class="tv3-score white" data-testid="tv-white-score">${esc(tvPointText(p.W))}</div><div class="tv3-versus">vs</div><div class="tv3-score red" data-testid="tv-red-score">${esc(tvPointText(p.R))}</div>${tv3Player(tvIndividualSideLabel(m,'red'),m.rdojo,true)}</div></div>`;
}
function tv3Team(vm){
  const m=vm.match,all=(state.allMatches[m.division]||[]).filter(x=>x.teamPair===m.teamPair&&(x.type==='teamPosition'||x.type==='teamPlayoff'));
  const rows=all.length?all:[m],count=rows.length<=3?3:5,first=rows[0]||m,sum=teamPairSummary(m.division,m.teamPair);
  const left=rows.map((x,i)=>{const p=activeScoreArrays(x);return `<div class="tv3-team-row${x===m?' active':''}"${x===m?' data-testid="tv-active-bout"':''}><div class="tv3-person"${x===m?' data-testid="tv-white-name"':''}><span class="tv3-pos">${i+1}</span>${esc(x.white||'TBD')}</div><div class="tv3-row-score">${esc(tvPointText(p.W))}</div></div>`}).join('');
  const right=rows.map((x,i)=>{const p=activeScoreArrays(x);return `<div class="tv3-team-row${x===m?' active':''}"><div class="tv3-row-score">${esc(tvPointText(p.R))}</div><div class="tv3-person"${x===m?' data-testid="tv-red-name"':''}>${esc(x.red||'TBD')}<span class="tv3-pos">${i+1}</span></div></div>`}).join('');
  return `<div class="tv3-body"><div class="tv3-team-grid" data-testid="tv-current-match"><div class="tv3-team-col"><div class="tv3-top-rule"></div><div class="tv3-team-name" data-testid="tv-white-team">${esc(first.teamWhite||m.teamWhite||'White Team')}</div><div class="tv3-roster ${count===3?'three':'five'}">${left}</div><div class="tv3-summary" data-testid="tv-white-summary"><span class="label">Wins</span> ${sum.wWins} &nbsp; <span class="label">Points</span> ${sum.wPts}</div></div><div></div><div class="tv3-team-col red"><div class="tv3-top-rule red"></div><div class="tv3-team-name" data-testid="tv-red-team">${esc(first.teamRed||m.teamRed||'Red Team')}</div><div class="tv3-roster ${count===3?'three':'five'}">${right}</div><div class="tv3-summary" data-testid="tv-red-summary"><span class="label">Wins</span> ${sum.rWins} &nbsp; <span class="label">Points</span> ${sum.rPts}</div></div></div></div>`;
}
function tv3KRow(name,index,active){const stateName=index<active?'eliminated':index===active?'active':'waiting';return `<div class="tv3-k-row ${stateName}" data-testid="tv-kachinuki-row"><span>${esc(name||'—')}</span><span class="tv3-k-state">${stateName}</span></div>`}
function tv3Kachinuki(vm){
  const m=vm.match,p=activeScoreArrays(m),wl=(m.lineupW||[]).slice(0,3),rl=(m.lineupR||[]).slice(0,3);while(wl.length<3)wl.push('—');while(rl.length<3)rl.push('—');
  return `<div class="tv3-body"><div class="tv3-k-wrap" data-testid="tv-current-match"><div class="tv3-k-current" data-testid="tv-kachinuki-current">${tv3Player(m.white||'—','',false)}<div class="tv3-score white" data-testid="tv-white-score">${esc(tvPointText(p.W))}</div><div class="tv3-versus">vs</div><div class="tv3-score red" data-testid="tv-red-score">${esc(tvPointText(p.R))}</div>${tv3Player(m.red||'—','',true)}</div><div class="tv3-k-lineups"><div class="tv3-k-team" data-testid="tv-kachinuki-lineup"><div class="tv3-top-rule"></div><div class="tv3-k-title">${esc(m.teamWhite||'White Team')}</div><div class="tv3-k-rows">${wl.map((n,i)=>tv3KRow(n,i,m.wIndex||0)).join('')}</div></div><div></div><div class="tv3-k-team red" data-testid="tv-kachinuki-lineup"><div class="tv3-top-rule red"></div><div class="tv3-k-title">${esc(m.teamRed||'Red Team')}</div><div class="tv3-k-rows">${rl.map((n,i)=>tv3KRow(n,i,m.rIndex||0)).join('')}</div></div></div></div></div>`;
}
function tv3Results(vm){
  return `<div class="tv3-body tv3-results-body">${divisionCompletePanelHtml(vm.division)}</div>`;
}
function tv3ResultsFooter(){
  return `<div class="tv3-results-footer"><div>Division Complete</div></div>`;
}
function renderTvDisplay(){
/* ksm:post-split-begin react-tv */
  // The React TV display (app/react/tv/, 37-react-tv.js) draws #tvLive once it is mounted.
  if(window.ksmTvMounted){ksmRenderTv();return}
/* ksm:post-split-end */
  if(!window.tvLive)return;
  const vm=buildTV3ViewModel(tvAssignedCourt());
  const body=vm.empty?`<div class="tv3-body"></div>`:(vm.format==='results'?tv3Results(vm):vm.format==='individual'?tv3Individual(vm):vm.format==='kachinuki'?tv3Kachinuki(vm):tv3Team(vm));
  const footer=vm.format==='results'?tv3ResultsFooter():tv3Upcoming(vm);
  tvLive.innerHTML=`<div class="tv3-root" data-testid="tv-canvas">${tv3Header(vm)}${body}${footer}</div>`;
}

