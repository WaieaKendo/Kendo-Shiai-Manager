// ==========================================================
// KSM v3.10.9 — spectator presentation refinements
// ==========================================================
function audienceNameHtml(name){
  const value=String(name||'TBD').trim();
  const parts=value.split(/\s+/).filter(Boolean);
  if(parts.length<2)return esc(value);
  return `${esc(parts[0])}<br class="mobile-name-break"> ${esc(parts.slice(1).join(' '))}`;
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
            <h2 class="audience-player-name">${audienceNameHtml(m.white||'TBD')}</h2>
            <div class="audience-dojo">${esc(m.wdojo||m.teamWhite||'')}</div>
          </div>
        </div>
      </div>
      ${audienceScoreHtml(m)}
      <div class="audience-player red">
        <div class="audience-player-head">
          <div>
            <h2 class="audience-player-name">${audienceNameHtml(m.red||'TBD')}</h2>
            <div class="audience-dojo">${esc(m.rdojo||m.teamRed||'')}</div>
          </div>
          <span class="audience-side-dot audience-red-dot" aria-hidden="true"></span>
        </div>
      </div>
    </div>
  </div>`;
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
      <div class="team-live-player">${audienceNameHtml(x.white||'TBD')}</div>
      ${teamPointSlots(pts.W,'W')}
      <div class="team-row-vs">${x===m?'NOW':(x.done?'DONE':'vs')}</div>
      ${teamPointSlots(pts.R,'R')}
      <div class="team-live-player red">${audienceNameHtml(x.red||'TBD')}</div>
    </div>`;
  }).join('');
  return `<div class="audience-hero team-audience-hero">
    <img class="audience-watermark" src="/assets/KSM-Background-watermark.svg" alt="" aria-hidden="true">
    ${audienceHeaderHtml(court,m)}
    <div class="team-audience-head">
      <div class="team-name-block"><span class="audience-side-dot audience-white-dot"></span><span>${esc(first.teamWhite||m.teamWhite||'White Team')}</span></div>
      <div class="team-name-block red"><span>${esc(first.teamRed||m.teamRed||'Red Team')}</span><span class="audience-side-dot audience-red-dot"></span></div>
    </div>
    <div class="team-lineup">${rows}</div>
    <div class="team-total-summary">
      <div class="team-total-number white">${summary.wWins}</div><div class="team-total-label">Wins</div><div class="team-total-number red">${summary.rWins}</div>
      <div class="team-total-number white">${summary.wPts}</div><div class="team-total-label">Points</div><div class="team-total-number red">${summary.rPts}</div>
    </div>
  </div>
  <div class="audience-next-card team-next-footer"><div class="audience-next-label">Next Match</div><div class="team-next-pair">${esc(nextTeamPairText(m.division,court,m))}</div></div>`;
}
function poolDisplayComplete(div,label){
  const matches=(state.allMatches?.[div]||[]).filter(match=>match.pool===label&&!match.championship);
  return matches.length>0&&matches.every(match=>match.done);
}
function poolResultCardHtml(div,pool,options={}){
  const standings=poolStandings(pool.label,div);
  const matches=(state.allMatches?.[div]||[]).filter(match=>match.pool===pool.label&&!match.championship);
  const complete=options.completed??poolDisplayComplete(div,pool.label);
  const standingsHtml=standings.map((row,index)=>`<div class="stand-row"><span>${index+1}</span><div><b>${esc(row.name)}</b><div class="small">${esc(row.dojo||'')}</div></div><b>${row.wins}</b><b>${row.pts}</b></div>`).join('');
  const matchesHtml=matches.map(match=>alignedMatchRowHtml(match,{status:match.done?'DONE':(match.tiebreak?'TIEBREAK':'vs'),compact:true,current:!!options.currentMatch&&match===options.currentMatch})).join('');
  return `<section class="pool-result-card ${options.active?'active-pool-card':''} ${complete?'completed-pool-card':''}" data-testid="context-pool">
    <h3><span data-testid="context-pool-title">Pool ${esc(pool.label)}</span>${complete?'<span class="pool-complete-mark" data-testid="context-pool-complete" aria-label="Complete">✓</span>':''}</h3>
    <div class="pool-result-standings"><div class="stand-row small"><b>#</b><b>Name</b><b>Wins</b><b>Pts</b></div>${standingsHtml}</div>
    <div>${matchesHtml||'<div class="small">No pool matches available.</div>'}</div>
  </section>`;
}
function orderedPoolContextHtml(div,currentMatch){
  const pools=[...(state.pools?.[div]||[])].sort((a,b)=>String(a.label).localeCompare(String(b.label)));
  const incomplete=pools.filter(pool=>!poolDisplayComplete(div,pool.label));
  const completed=pools.filter(pool=>poolDisplayComplete(div,pool.label));
  const currentLabel=currentMatch&&!currentMatch.championship?currentMatch.pool:null;
  const incompleteHtml=incomplete.map(pool=>poolResultCardHtml(div,pool,{active:pool.label===currentLabel,currentMatch})).join('');
  const completedHtml=completed.map(pool=>poolResultCardHtml(div,pool,{completed:true})).join('');
  return `<div class="pool-context-stack">
    ${incompleteHtml?`<div class="context-box"><div class="pool-context-section-label">Pools In Progress</div><div class="all-pools-context-grid">${incompleteHtml}</div></div><div class="pool-context-divider" aria-hidden="true"></div>`:''}
    <div class="context-box pool-context-bracket" data-testid="context-bracket"><h2>Championship Bracket Preview</h2>${bracketHtml(div)}</div>
    ${completedHtml?`<div class="pool-context-divider" aria-hidden="true"></div><div class="context-box"><div class="all-pools-context-grid">${completedHtml}</div></div>`:''}
  </div>`;
}
function renderContext(){
  if(!window.courtContext)return;
  const m=state.matches[state.current];
  if(!m){setCourtSupportMode('standard');courtContext.innerHTML='<div class="muted-card">No active match.</div>';return;}
  if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'){
    setCourtSupportMode('standard');
    if(m.type==='kachinuki'){courtContext.innerHTML=kachinukiSheetHtml(m);return;}
    const summary=teamPairSummary(m.division,m.teamPair);
    courtContext.innerHTML=teamSheetHtml(m.division,m.teamPair,m);return;
  }
  if(m.singleElim||(m.championship&&m.pool==='Championship'&&!(state.pools[m.division]||[]).length)){
    setCourtSupportMode('singleElim');courtContext.innerHTML=renderSingleElimContext(m.division);return;
  }
  setCourtSupportMode('standard');
  courtContext.innerHTML=orderedPoolContextHtml(m.division,m);
}


