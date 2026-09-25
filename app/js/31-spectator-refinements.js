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


