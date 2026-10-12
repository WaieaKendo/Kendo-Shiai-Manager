// ==========================================================
// KSM v3.9.1 — Live Scores render modes
// ==========================================================
function audienceTournamentName(){
  return (window.tName&&tName.value)?tName.value:'Kendo Tournament';
}
function audienceMeta(m){
  if(!m)return {division:'—',line:'No active match'};
  let line='';
  if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'){
    line=m.position||m.pool||'Team Match';
  }else if(m.championship||m.pool==='Championship'){
    line=m.position||'Championship';
  }else{
    line=`Pool ${m.pool||'A'}`;
  }
  return {division:m.division||state.currentDivision||'—',line};
}
function audiencePenalties(m,side){
  const arr=state.allMatches[m.division]||[];
  const idx=arr.indexOf(m);
  if(m.division===state.currentDivision&&idx===state.current&&!m.done){
    return side==='W'?(state.score?.WT||0):(state.score?.RT||0);
  }
  return side==='W'?(m.wt||0):(m.rt||0);
}
function audienceHeaderHtml(court,m,compact=false){
  const meta=audienceMeta(m);
  return `<div class="audience-header">
    <div class="audience-tournament">
      <img src="/assets/ksm-fuji-logo-nav.svg" alt="">
      <span>${esc(audienceTournamentName())}</span>
    </div>
    <div class="audience-title">
      <h1 class="audience-court">Court ${esc(court)}</h1>
      <div class="audience-division">${esc(meta.division)}</div>
      <div class="audience-match-meta">${esc(meta.line)}</div>
    </div>
    <div></div>
  </div>`;
}
function audienceScoreHtml(m,compact=false){
  const pts=activeScoreArrays(m);
  const wt=audiencePenalties(m,'W');
  const rt=audiencePenalties(m,'R');
  return `<div class="audience-score-center">
    <div class="audience-score-stack">
      <div class="audience-points audience-white-points">${(pts.W||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
      <div class="audience-triangles audience-white-triangles">${'△ '.repeat(wt)}</div>
    </div>
    <div class="audience-vs">vs</div>
    <div class="audience-score-stack">
      <div class="audience-points audience-red-points">${(pts.R||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
      <div class="audience-triangles audience-red-triangles">${'△ '.repeat(rt)}</div>
    </div>
  </div>`;
}
function audienceIndividualHero(court,m,extraClass=''){
  return `<div class="audience-hero ${extraClass}">
    <img class="audience-watermark" src="/assets/KSM-Background-watermark.svg" alt="" aria-hidden="true">
    ${audienceHeaderHtml(court,m)}
    <div class="audience-match-grid">
      <div class="audience-player white">
        <div class="audience-player-head">
          <span class="audience-side-dot audience-white-dot" aria-hidden="true"></span>
          <div>
            <h2 class="audience-player-name">${esc(m.white||'TBD')}</h2>
            <div class="audience-dojo">${esc(m.wdojo||m.teamWhite||'')}</div>
          </div>
        </div>
      </div>
      ${audienceScoreHtml(m)}
      <div class="audience-player red">
        <div class="audience-player-head">
          <div>
            <h2 class="audience-player-name">${esc(m.red||'TBD')}</h2>
            <div class="audience-dojo">${esc(m.rdojo||m.teamRed||'')}</div>
          </div>
          <span class="audience-side-dot audience-red-dot" aria-hidden="true"></span>
        </div>
      </div>
    </div>
  </div>`;
}
function audienceNextIndividualHtml(next){
  if(!next)return `<div class="audience-next-card">
    <div class="audience-next-label">Next Match</div>
    <div class="small" style="text-align:center">No additional match queued.</div>
  </div>`;
  return `<div class="audience-next-card">
    <div class="audience-next-label">Next Match</div>
    <div class="audience-next-row">
      <div class="audience-next-side">
        <span class="audience-side-dot audience-white-dot" style="border-color:#071f33;width:20px;height:20px;margin-top:4px"></span>
        <div>
          <div class="audience-next-name">${esc(next.white||'TBD')}</div>
          <div class="audience-next-dojo">${esc(next.wdojo||'')}</div>
        </div>
      </div>
      <div class="audience-next-vs">vs</div>
      <div class="audience-next-side red">
        <div>
          <div class="audience-next-name">${esc(next.red||'TBD')}</div>
          <div class="audience-next-dojo">${esc(next.rdojo||'')}</div>
        </div>
        <span class="audience-side-dot audience-red-dot" style="width:20px;height:20px;margin-top:4px"></span>
      </div>
    </div>
  </div>`;
}
function teamPointSlots(points,side){
  const p=[...(points||[])].slice(0,2);
  while(p.length<2)p.push('');
  return p.map(x=>`<div class="team-point-slot ${side==='R'?'red':''}">${esc(x)}</div>`).join('');
}
function nextTeamPairText(div,court,current){
  const all=sortTeamMatches(div);
  const idx=all.indexOf(current);
  const currentPair=current?.teamPair;
  const nextActual=all.slice(Math.max(0,idx+1)).find(m=>
    isTeamMatch(m)&&!m.done&&matchBelongsToCourt(m,court)&&m.teamPair!==currentPair
  );
  if(nextActual){
    return `${nextActual.teamWhite||nextActual.wdojo||'TBD'} vs ${nextActual.teamRed||nextActual.rdojo||'TBD'}`;
  }
  const nodes=state.teamBracketNodes?.[div]||[];
  const currentNodeIndex=nodes.findIndex(n=>n.id===current?.teamNodeId);
  const future=nodes.slice(Math.max(0,currentNodeIndex+1)).find(n=>!n.winner&&n.court===court);
  if(future){
    return `${teamSideLabel(future.right,div)} vs ${teamSideLabel(future.left,div)}`;
  }
  return 'No additional team match queued';
}
function standardTeamAudienceHtml(court,data){
  const m=data.match;
  const matches=(state.allMatches[m.division]||[]).filter(x=>
    x.teamPair===m.teamPair&&(x.type==='teamPosition'||x.type==='teamPlayoff')
  );
  const first=matches[0]||m;
  const summary=teamPairSummary(m.division,m.teamPair);
  const rows=matches.map(x=>{
    const pts=activeScoreArrays(x);
    return `<div class="team-live-row ${x===m?'current':''}">
      <div class="team-live-player">${esc(x.white||'TBD')}</div>
      ${teamPointSlots(pts.W,'W')}
      <div class="team-row-vs">${x===m?'NOW':(x.done?'':'vs')}</div>
      ${teamPointSlots(pts.R,'R')}
      <div class="team-live-player red">${esc(x.red||'TBD')}</div>
    </div>`;
  }).join('');
  return `<div class="audience-hero team-audience-hero">
    <img class="audience-watermark" src="/assets/KSM-Background-watermark.svg" alt="" aria-hidden="true">
    ${audienceHeaderHtml(court,m)}
    <div class="team-audience-head">
      <div class="team-name-block">
        <span class="audience-side-dot audience-white-dot"></span>
        <span>${esc(first.teamWhite||m.teamWhite||'White Team')}</span>
      </div>
      <div class="team-name-block red">
        <span>${esc(first.teamRed||m.teamRed||'Red Team')}</span>
        <span class="audience-side-dot audience-red-dot"></span>
      </div>
    </div>
    <div class="team-lineup">${rows}</div>
    <div class="team-total-summary">
      <div class="team-total-number white">${summary.wWins}</div>
      <div class="team-total-label">Wins</div>
      <div class="team-total-number red">${summary.rWins}</div>
      <div class="team-total-number white">${summary.wPts}</div>
      <div class="team-total-label">Points</div>
      <div class="team-total-number red">${summary.rPts}</div>
    </div>
  </div>
  <div class="audience-next-card team-next-footer">
    <div class="audience-next-label">Next Match</div>
    <div class="team-next-pair">(${esc(nextTeamPairText(m.division,court,m))})</div>
  </div>`;
}
function kachinukiPlayerRows(names,index,activeName,side){
  return (names||[]).map((name,i)=>{
    const eliminated=i<index;
    const current=i===index&&name===activeName;
    return `<div class="kachinuki-player ${eliminated?'eliminated':''} ${current?'current':''}">
      ${side==='W'?'<span class="audience-side-dot audience-white-dot" style="border-color:#071f33;width:18px;height:18px;margin:0"></span>':''}
      <span>${esc(name)}</span>
      ${side==='R'?'<span class="audience-side-dot audience-red-dot" style="width:18px;height:18px;margin:0"></span>':''}
    </div>`;
  }).join('');
}
function kachinukiAudienceHtml(court,data){
  const m=data.match;
  return `${audienceIndividualHero(court,m,'kachinuki-active')}
  <div class="kachinuki-lineup-card">
    <div class="kachinuki-lineups">
      <div class="kachinuki-team">
        <div class="kachinuki-team-name">${esc(m.teamWhite||'White Team')}</div>
        ${kachinukiPlayerRows(m.lineupW||[],m.wIndex||0,m.white,'W')}
      </div>
      <div class="kachinuki-team red">
        <div class="kachinuki-team-name">${esc(m.teamRed||'Red Team')}</div>
        ${kachinukiPlayerRows(m.lineupR||[],m.rIndex||0,m.red,'R')}
      </div>
    </div>
  </div>
  <div class="audience-next-card team-next-footer">
    <div class="audience-next-label">Next Match</div>
    <div class="team-next-pair">(${esc(nextTeamPairText(m.division,court,m))})</div>
  </div>`;
}
function liveScorePoints(m){
  const pts=activeScoreArrays(m);
  return {white:(pts.W||[]).join(' ')||'—',red:(pts.R||[]).join(' ')||'—'};
}
function liveScoresCourtCard(court){
  const data=courtCurrentMatch(court);
  if(!data)return `<section class="live-court-card" data-testid="live-court-${esc(court)}"><div class="live-court-head"><h2>Court ${esc(court)}</h2><span data-testid="live-meta">No active match</span></div><div class="live-empty">Waiting for the next division</div></section>`;
  const m=data.match, next=data.next, meta=audienceMeta(m), pts=liveScorePoints(m);
  if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'){
    const sheet=m.type==='kachinuki'?kachinukiSheetHtml(m):teamSheetHtml(m.division,m.teamPair,m);
    return `<section class="live-court-card live-team-card" data-testid="live-court-${esc(court)}"><div class="live-court-head"><h2>Court ${esc(court)}</h2><span data-testid="live-meta">${esc(meta.division)} • ${esc(meta.line)}</span></div>${sheet}<div class="live-next"><span>Next</span>${next?`<b>${esc(next.teamWhite||next.white||'TBD')}</b><i>vs</i><b>${esc(next.teamRed||next.red||'TBD')}</b>`:'<em>No match queued</em>'}</div></section>`;
  }
  return `<section class="live-court-card" data-testid="live-court-${esc(court)}"><div class="live-court-head"><h2>Court ${esc(court)}</h2><span data-testid="live-meta">${esc(meta.division)} • ${esc(meta.line)}</span></div><div class="live-match-row"><div class="live-player white"><span class="live-side-label">White</span><strong data-testid="live-white-name">${esc(m.white||'TBD')}</strong><small>${esc(m.wdojo||'')}</small></div><div class="live-score-pair"><b>${esc(pts.white)}</b><span>vs</span><b>${esc(pts.red)}</b></div><div class="live-player red"><span class="live-side-label">Red</span><strong data-testid="live-red-name">${esc(m.red||'TBD')}</strong><small>${esc(m.rdojo||'')}</small></div></div><div class="live-next"><span>Next</span>${next?`<b>${esc(next.white||'TBD')}</b><i>vs</i><b>${esc(next.red||'TBD')}</b>`:'<em>No match queued</em>'}</div></section>`;
}
function renderPublic(){
  if(!window.publicLive)return;
  publicLive.innerHTML=`<div class="live-scores-heading"><div class="setup-panel-eyebrow">Live Tournament</div><h1>Live Scores</h1></div><div class="live-courts-grid">${liveScoresCourtCard('A')}${liveScoresCourtCard('B')}</div>`;
  if(document.body.classList.contains('ksm-tv'))renderTvDisplay();
}
function fitTvText(root=tvLive){
  if(!root)return;
  requestAnimationFrame(()=>root.querySelectorAll('[data-tv-fit]').forEach(el=>{
    const max=Number(el.dataset.max)||parseFloat(getComputedStyle(el).fontSize)||72;
    const min=Number(el.dataset.min)||22;
    let size=max;el.style.fontSize=size+'px';
    while(size>min&&el.scrollWidth>el.clientWidth){size-=2;el.style.fontSize=size+'px';}
  }));
}
function tvPointText(points){return (points||[]).join(' ')||'—'}
function tvNameLines(name){const parts=String(name||'TBD').trim().split(/\s+/).filter(Boolean);if(parts.length<2)return [parts[0]||'TBD',''];return [parts[0],parts.slice(1).join(' ')]}
function tvNameHtml(name){const [first,last]=tvNameLines(name);return `<span>${esc(first)}</span>${last?`<span>${esc(last)}</span>`:''}`}
const KSM_TV_ASSIGNED_COURT=(()=>{const value=(new URLSearchParams(location.search).get('court')||'A').toUpperCase();return value==='B'?'B':'A'})();
function tvAssignedCourt(){return KSM_TV_ASSIGNED_COURT}
function tvIndividualSideLabel(match,side){
  const direct=side==='white'?match?.white:match?.red;if(direct)return direct;
  if(match?.championship){
    const node=(state.championshipNodes?.[match.division]||[]).find(n=>n.id===match.champNodeId);
    if(node){const source=side==='white'?node.right:node.left;if(source?.seed)return source.seed;if(source?.ref){const prev=(state.championshipNodes?.[match.division]||[]).find(n=>n.id===source.ref);return `Winner of ${prev?.round||'Previous Round'} Match ${(prev?.slot??0)+1}`}}
    if(match.position&&match.position!==firstRoundName(championshipLabels(match.division).length)){const prev=previousRoundName(match.position);const slot=(match.bracketSlot||0)*2+(side==='white'?1:0);return sourceLabelForRound(match.division,prev,slot).name}
  }
  if(match?.singleElim&&match.elimNodeId){const node=(state.singleElimNodes?.[match.division]||[]).find(n=>n.id===match.elimNodeId);if(node)return sideLabelGeneric(side==='white'?node.right:node.left,match.division)}
  return 'TBD';
}
function tvTeamNodeEntries(court,current){
  const div=current.division,nodes=state.teamBracketNodes?.[div]||[],all=state.allMatches?.[div]||[],entries=[],seen=new Set();
  let currentNodeIndex=nodes.findIndex(n=>n.id===current.teamNodeId);
  if(currentNodeIndex<0&&current.teamPair){
    const sibling=all.find(x=>x.teamPair===current.teamPair&&x.teamNodeId);
    if(sibling)currentNodeIndex=nodes.findIndex(n=>n.id===sibling.teamNodeId);
  }
  nodes.forEach((node,nodeIndex)=>{
    if(nodeIndex<=currentNodeIndex||node.winner)return;
    const nodeCourt=String(node.court||'').toUpperCase();
    if(nodeCourt&&nodeCourt!=='BOTH'&&nodeCourt!==court)return;
    const matches=all.filter(m=>isTeamMatch(m)&&m.teamNodeId===node.id&&!m.done);
    const m=matches[0];
    const white=m?(m.teamWhite||m.wdojo||teamSideLabel(node.right,div)):teamSideLabel(node.right,div);
    const red=m?(m.teamRed||m.rdojo||teamSideLabel(node.left,div)):teamSideLabel(node.left,div);
    const key=m?.teamPair||node.id;
    if(seen.has(key))return;
    seen.add(key);
    entries.push({teamWhite:white||'TBD',teamRed:red||'TBD',position:node.round||m?.position||'',teamNodeId:node.id,teamPair:m?.teamPair||'',placeholder:!m});
  });
  return entries;
}
function tvUpcomingMatches(court,current,teamMode=false){
  let all=state.allMatches[current.division]||[];
  if(all.some(isTeamMatch))all=sortTeamMatches(current.division);else all=sortIndividualDivisionMatches(current.division,all);
  const idx=all.indexOf(current);
  let candidates=all.slice(Math.max(0,idx+1)).filter(x=>!x.done&&matchBelongsToCourt(x,court));
  if(teamMode){
    const seen=new Set(),actual=[];
    candidates.forEach(x=>{
      const key=x.teamPair||x.teamNodeId||`${x.teamWhite}|${x.teamRed}`;
      if(!isTeamMatch(x)||key===current.teamPair||seen.has(key))return;
      seen.add(key);actual.push(x);
    });
    tvTeamNodeEntries(court,current).forEach(x=>{
      const key=x.teamPair||x.teamNodeId||`${x.teamWhite}|${x.teamRed}`;
      if(!seen.has(key)){seen.add(key);actual.push(x)}
    });
    return actual.slice(0,2);
  }
  return candidates.slice(0,2);
}
function tvUpcomingHtml(court,m,teamMode=false){
  const upcoming=tvUpcomingMatches(court,m,teamMode);
  const rows=upcoming.map(next=>{
    const left=teamMode?(next.teamWhite||next.wdojo||'TBD'):tvIndividualSideLabel(next,'white');
    const right=teamMode?(next.teamRed||next.rdojo||'TBD'):tvIndividualSideLabel(next,'red');
    const leftSub=teamMode?(next.position||''):(next.wdojo||next.position||'');
    const rightSub=teamMode?'':(next.rdojo||'');
    return `<div class="tv-next-pair"><div class="tv-next-player"><strong data-tv-fit data-min="22">${esc(left)}</strong>${leftSub?`<small>${esc(leftSub)}</small>`:''}</div><span>vs</span><div class="tv-next-player"><strong data-tv-fit data-min="22">${esc(right)}</strong>${rightSub?`<small>${esc(rightSub)}</small>`:''}</div></div>`;
  }).join('');
  const body=rows||'<div class="tv-next-pair tv-next-empty"><div class="tv-next-player"><strong>Queue complete</strong></div></div>';
  return `<div class="tv-next"><div class="tv-next-label">Upcoming Matches</div><div class="tv-upcoming-list">${body}</div></div>`;
}
async function launchTvDisplay(court){closeNavMenus();if(!cloudSession.tournamentId)await saveNow();if(!cloudSession.tournamentId){alert('Save the tournament to cloud before opening TV Display.');return}window.open(tvLink(court),'_blank','noopener')}

function tvIndividualHtml(court,data){
  const m=data.match,meta=audienceMeta(m),pts=activeScoreArrays(m);
  return `<div class="tv-canvas"><div class="tv-shell">
    <header><div class="tv-court-label">Court ${esc(court)}</div><div class="tv-context" data-tv-fit data-min="26">${esc(meta.division)}</div><div class="tv-context-meta">${esc(meta.line)}</div></header>
    <main class="tv-individual-match">
      <section class="tv-individual-name-side white"><div class="tv-name-block"><strong class="tv-player-name" data-tv-fit data-min="38">${tvNameHtml(tvIndividualSideLabel(m,'white'))}</strong><div class="tv-player-dojo">${esc(m.wdojo||'')}</div></div></section>
      <div class="tv-point-string tv-white-points">${esc(tvPointText(pts.W))}</div>
      <div class="tv-vs">vs</div>
      <div class="tv-point-string tv-red-points">${esc(tvPointText(pts.R))}</div>
      <section class="tv-individual-name-side red"><div class="tv-name-block"><strong class="tv-player-name" data-tv-fit data-min="38">${tvNameHtml(tvIndividualSideLabel(m,'red'))}</strong><div class="tv-player-dojo">${esc(m.rdojo||'')}</div></div></section>
    </main>
    ${tvUpcomingHtml(court,m,false)}
  </div></div>`;
}
function tvKachinukiStatusRow(name,index,activeIndex){
  const status=index<activeIndex?'eliminated':(index===activeIndex?'active':'waiting');
  return `<div class="tv-kachinuki-row ${status}"><span class="name" data-tv-fit data-min="18">${esc(name||'—')}</span><span class="status">${status}</span></div>`;
}
function tvKachinukiHtml(court,data){
  const m=data.match,meta=audienceMeta(m),pts=activeScoreArrays(m);
  const whiteLineup=(m.lineupW||[]).slice(0,3),redLineup=(m.lineupR||[]).slice(0,3);
  while(whiteLineup.length<3)whiteLineup.push('—');
  while(redLineup.length<3)redLineup.push('—');
  return `<div class="tv-canvas"><div class="tv-shell">
    <header><div class="tv-court-label">Court ${esc(court)}</div><div class="tv-context" data-tv-fit data-min="26">${esc(meta.division)}</div><div class="tv-context-meta">${esc(meta.line)}</div></header>
    <main class="tv-kachinuki-main">
      <section class="tv-kachinuki-current">
        <div class="tv-current-player white"><strong class="tv-current-name" data-tv-fit data-min="30">${tvNameHtml(m.white||'—')}</strong></div>
        <div class="tv-point-string">${esc(tvPointText(pts.W))}</div>
        <div class="tv-vs">vs</div>
        <div class="tv-point-string">${esc(tvPointText(pts.R))}</div>
        <div class="tv-current-player red"><strong class="tv-current-name" data-tv-fit data-min="30">${tvNameHtml(m.red||'—')}</strong></div>
      </section>
      <section class="tv-kachinuki-lineups">
        <div class="tv-kachinuki-team"><div class="tv-kachinuki-team-name" data-tv-fit data-min="22">${esc(m.teamWhite||'White Team')}</div>${whiteLineup.map((name,i)=>tvKachinukiStatusRow(name,i,m.wIndex||0)).join('')}</div>
        <div class="tv-kachinuki-team red"><div class="tv-kachinuki-team-name" data-tv-fit data-min="22">${esc(m.teamRed||'Red Team')}</div>${redLineup.map((name,i)=>tvKachinukiStatusRow(name,i,m.rIndex||0)).join('')}</div>
      </section>
    </main>
    ${tvUpcomingHtml(court,m,true)}
  </div></div>`;
}
function tvTeamHtml(court,data){
  const m=data.match,meta=audienceMeta(m);
  if(m.type==='kachinuki')return tvKachinukiHtml(court,data);
  const matches=(state.allMatches[m.division]||[]).filter(x=>x.teamPair===m.teamPair&&(x.type==='teamPosition'||x.type==='teamPlayoff'));
  const first=matches[0]||m,summary=teamPairSummary(m.division,m.teamPair);
  const whiteRows=matches.map((x,i)=>{const pts=activeScoreArrays(x);return `<div class="tv-team-cell ${x===m?'current':''}"><div class="tv-team-name-wrap"><span class="position">${i+1}</span><strong class="tv-team-cell-name" data-tv-fit data-min="16">${esc(x.white||'TBD')}</strong></div><div class="tv-team-cell-points">${esc(tvPointText(pts.W))}</div></div>`}).join('');
  const redRows=matches.map((x,i)=>{const pts=activeScoreArrays(x);return `<div class="tv-team-cell ${x===m?'current':''}"><div class="tv-team-cell-points">${esc(tvPointText(pts.R))}</div><div class="tv-team-name-wrap"><strong class="tv-team-cell-name" data-tv-fit data-min="16">${esc(x.red||'TBD')}</strong><span class="position">${i+1}</span></div></div>`}).join('');
  return `<div class="tv-canvas"><div class="tv-shell">
    <header><div class="tv-court-label">Court ${esc(court)}</div><div class="tv-context" data-tv-fit data-min="26">${esc(meta.division)}</div><div class="tv-context-meta">${esc(meta.line)}</div></header>
    <main class="tv-team-main"><div class="tv-team-head"><div class="tv-team-name" data-tv-fit data-min="24">${esc(first.teamWhite||m.teamWhite||'White Team')}</div><div class="tv-team-name red" data-tv-fit data-min="24">${esc(first.teamRed||m.teamRed||'Red Team')}</div></div><div class="tv-team-roster"><div class="tv-team-column">${whiteRows}</div><div class="tv-team-column red">${redRows}</div></div><div class="tv-team-summary"><div class="white"><span class="label">Wins</span> <b>${summary.wWins}</b> &nbsp; <span class="label">Points</span> <b>${summary.wPts}</b></div><div></div><div class="red"><span class="label">Wins</span> <b>${summary.rWins}</b> &nbsp; <span class="label">Points</span> <b>${summary.rPts}</b></div></div></main>
    ${tvUpcomingHtml(court,m,true)}
  </div></div>`;
}
function fitTvCanvas(){if(window.tvLive)tvLive.style.removeProperty('--tv-scale')}
function renderTvDisplay(){
  if(!window.tvLive)return;
  const court=tvAssignedCourt(),data=courtCurrentMatch(court);
  if(!data){tvLive.innerHTML=`<div class="tv-canvas"><div class="tv-empty"><div><div class="tv-court-label">Court ${esc(court)}</div><h1>No active match</h1></div></div></div>`;fitTvCanvas();return;}
  const m=data.match;
  tvLive.innerHTML=(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki')?tvTeamHtml(court,data):tvIndividualHtml(court,data);
  fitTvText(tvLive);
  fitTvCanvas();
}





