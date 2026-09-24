// ---------- KSM v3.9.1 Scorekeeper redesign helpers ----------
function matchDisplayMeta(m){
  if(!m)return {division:'—', line:'No active match'};
  let division=m.division||state.currentDivision||'—';
  let line='';
  if(m.type==='teamPosition') line=`${m.teamWhite||''} vs ${m.teamRed||''} · ${m.position||'Team Match'}`;
  else if(m.type==='teamPlayoff') line=`${m.teamWhite||''} vs ${m.teamRed||''} · ${m.position||'Playoff'}`;
  else if(m.type==='kachinuki') line=`Kachinuki · ${m.position||'Winner Stays In'}`;
  else if(m.championship || m.pool==='Championship') line=`${m.position||'Championship'}${typeof state.current==='number'?' · Match '+(state.current+1):''}`;
  else line=`Pool ${m.pool||'A'}${typeof state.current==='number'?' · Match '+(state.current+1):''}`;
  return {division,line};
}
function setMatchBadge(done){
  const badge=document.getElementById('matchStatusBadge');
  if(!badge)return;
  if(done){badge.textContent='Completed';badge.classList.remove('live');badge.classList.add('completed');}
  else{badge.textContent='Live';badge.classList.add('live');badge.classList.remove('completed');}
}
function openFusenDialog(){
  const m=state.matches?.[state.current];
  if(!m){return;}
  const dlg=document.getElementById('fusenDialog');
  if(dlg)dlg.classList.remove('hidden');
}
function closeFusenDialog(){
  const dlg=document.getElementById('fusenDialog');
  if(dlg)dlg.classList.add('hidden');
}
function confirmFusen(side){
  closeFusenDialog();
  fusen(side);
}
function scorekeeperQueueRow(m,label){
  if(!m)return '';
  let mid=m.position||m.pool||'Match';
  if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki')mid=m.position||m.pool||'Team Match';
  return `<div class="queue-row ${m.tiebreak?'gold':''}"><div class="white"><b>${esc(m.white||m.teamWhite||'TBD')}</b><div class="small">${esc(m.wdojo||m.teamWhite||'')}</div></div><div class="vs">${esc(label||'vs')}<div class="small">${esc(mid)}</div></div><div class="red"><b>${esc(m.red||m.teamRed||'TBD')}</b><div class="small">${esc(m.rdojo||m.teamRed||'')}</div></div></div>`;
}
function courtQueueItems(div,c){
  let all=state.allMatches?.[div]||[];
  let current=state.matches?.[state.current]||null;
  let currentGlobalIndex=all.indexOf(current);
  let items=[];
  if(all.some(m=>m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki')){
    items=sortTeamMatches(div).filter(m=>!m.done && matchBelongsToCourt(m,c) && m!==current);
    return items;
  }
  if(all.some(m=>m.singleElim)){
    let arr=dedupeSingleElimMatches(div).filter(m=>!m.done && matchBelongsToCourt(m,c) && m!==current);
    return arr;
  }
  items=all.filter((m,i)=>!m.done && matchBelongsToCourt(m,c) && m!==current && (currentGlobalIndex<0 || i>currentGlobalIndex || m.championship));
  return items;
}
function renderQueue(){
  const div=state.currentDivision;
  const c=state.currentCourt||'A';
  const target=document.getElementById('queue');
  if(!target)return;
  let doneHtml=finalResultsHtml(div);
  if(!div){target.innerHTML='<div class="muted-card">No active division.</div>';return;}
  if(eliminationFinalDone(div)){target.innerHTML=doneHtml||'<div class="muted-card">Division complete.</div>';return;}
  const items=courtQueueItems(div,c);
  if(!items.length){
    target.innerHTML=doneHtml||'<div class="muted-card">Queue complete.</div>';
    return;
  }
  let html='';
  if(items[0]) html+=`<div class="queue-section-label">On Deck</div>${scorekeeperQueueRow(items[0],'vs')}`;
  if(items[1]) html+=`<div class="queue-section-label following">Following</div>${scorekeeperQueueRow(items[1],'vs')}`;
  if(items.length>2){
    html+=`<details class="result-section" open><summary>Remaining</summary><div class="result-inner">`+
      items.slice(2,12).map(m=>scorekeeperQueueRow(m,'vs')).join('')+
      (items.length>12?`<div class="small" style="margin-top:10px">+ ${items.length-12} more matches</div>`:'')+
      `</div></details>`;
  }
  target.innerHTML=html;
}
function renderScore(){
  updateScoreTournamentName();
  let m=state.matches[state.current];
  if(m && !matchBelongsToCourt(m,state.currentCourt||'A'))m=null;
  if(!m){
    whiteName.textContent='—'; redName.textContent='—';
    if(window.whiteDojo)whiteDojo.textContent='—';
    if(window.redDojo)redDojo.textContent='—';
    matchMeta.textContent='No active match';
    if(window.scoreDivisionTitle)scoreDivisionTitle.textContent=state.currentDivision||'—';
    whitePts.textContent=''; redPts.textContent=''; whiteTri.textContent=''; redTri.textContent='';
    setMatchBadge(false); renderQueue(); renderPublic(); renderContext(); return;
  }
  if(m.type==='teamPlayoff'){
    whiteName.innerHTML=repSelect('W',m.teamWhite,m.white);
    redName.innerHTML=repSelect('R',m.teamRed,m.red);
  }else{
    whiteName.textContent=m.white||'TBD';
    redName.textContent=m.red||'TBD';
  }
  if(window.whiteDojo)whiteDojo.textContent=m.wdojo||m.teamWhite||'—';
  if(window.redDojo)redDojo.textContent=m.rdojo||m.teamRed||'—';
  const meta=matchDisplayMeta(m);
  if(window.scoreDivisionTitle)scoreDivisionTitle.textContent=meta.division;
  matchMeta.textContent=meta.line;
  whitePts.textContent=(state.score.W||[]).join(' ');
  redPts.textContent=(state.score.R||[]).join(' ');
  whiteTri.textContent='△ '.repeat(state.score.WT||0);
  redTri.textContent='△ '.repeat(state.score.RT||0);
  setMatchBadge(!!m.done);
  renderQueue();renderPublic();renderContext();
}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape')closeFusenDialog();
});


// ---------- KSM v3.9.1 Court Context cleanup ----------
function renderContext(){
  if(!window.courtContext)return;
  let m=state.matches[state.current];
  if(!m){courtContext.innerHTML='<div class="muted-card">No active match.</div>';return}
  if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'){
    if(m.type==='kachinuki'){
      courtContext.innerHTML=`<h2>${esc(m.teamWhite)} vs ${esc(m.teamRed)}</h2><p class="sub">Kachinuki • winner stays in</p>${kachinukiSheetHtml(m)}`;
      return;
    }
    let s=teamPairSummary(m.division,m.teamPair);
    courtContext.innerHTML=`<h2>${esc(s.teamWhite)} vs ${esc(s.teamRed)}</h2><p class="sub">Current team match only</p>${teamSheetHtml(m.division,m.teamPair,m)}`;
    return;
  }
  if(m.singleElim || (m.championship && m.pool==='Championship' && !(state.pools[m.division]||[]).length)){
    courtContext.innerHTML=`<div class="context-box"><h2>Championship Bracket Preview</h2>${bracketHtml(m.division)}</div>`;
    return;
  }
  let currentPool=m.pool && m.pool!=='Championship'?m.pool:(state.pools[m.division]?.[0]?.label||'A');
  let standings=poolStandings(currentPool,m.division);
  courtContext.innerHTML=`<div class="context-split"><div class="context-box"><h2>Pool ${esc(currentPool)} Standings</h2><div class="stand-row small"><b>#</b><b>Name</b><b>Wins</b><b>Pts</b></div>${standings.map((r,i)=>`<div class="stand-row"><span>${i+1}</span><div><b>${esc(r.name)}</b><div class="small">${esc(r.dojo)}</div></div><b>${r.wins}</b><b>${r.pts}</b></div>`).join('')}</div><div class="context-box"><h2>Championship Bracket Preview</h2>${bracketHtml(m.division)}</div></div>`;
}


// ---------- KSM v3.9.1 Scoreboard render override ----------
function setMatchBadge(done){ return; }
function renderScore(){
  updateScoreTournamentName();
  let m=state.matches[state.current];
  if(m && !matchBelongsToCourt(m,state.currentCourt||'A'))m=null;
  if(!m){
    whiteName.textContent='—'; redName.textContent='—';
    if(window.whiteDojo)whiteDojo.textContent='—';
    if(window.redDojo)redDojo.textContent='—';
    matchMeta.textContent='No active match';
    if(window.scoreDivisionTitle)scoreDivisionTitle.textContent=state.currentDivision||'—';
    whitePts.textContent=''; redPts.textContent=''; whiteTri.textContent=''; redTri.textContent='';
    renderQueue(); renderPublic(); renderContext(); return;
  }
  if(m.type==='teamPlayoff'){
    whiteName.innerHTML=repSelect('W',m.teamWhite,m.white);
    redName.innerHTML=repSelect('R',m.teamRed,m.red);
  }else{
    whiteName.textContent=m.white||'TBD';
    redName.textContent=m.red||'TBD';
  }
  if(window.whiteDojo)whiteDojo.textContent=m.wdojo||m.teamWhite||'—';
  if(window.redDojo)redDojo.textContent=m.rdojo||m.teamRed||'—';
  const meta=matchDisplayMeta(m);
  if(window.scoreDivisionTitle)scoreDivisionTitle.textContent=meta.division;
  matchMeta.textContent=meta.line;
  whitePts.textContent=(state.score.W||[]).join(' ');
  redPts.textContent=(state.score.R||[]).join(' ');
  whiteTri.textContent='△ '.repeat(state.score.WT||0);
  redTri.textContent='△ '.repeat(state.score.RT||0);
  renderQueue();renderPublic();renderContext();
}


// ---------- KSM v3.9.1 Score rendering ----------
function renderPointLetters(target,letters,side){
  if(!target)return;
  target.innerHTML=(letters||[]).map(letter=>`<span class="score-letter ${side==='R'?'score-letter-red':'score-letter-white'}">${esc(letter)}</span>`).join('');
}
function ensureScorableCurrentMatch(){
  const court=state.currentCourt||'A',div=state.currentDivision;
  if(!div)return null;
  const arr=state.allMatches?.[div]||[];
  const active=arr[state.current];
  if(individualMatchReady(active)&&matchBelongsToCourt(active,court)){
    if(state.matches!==arr)state.matches=arr;
    return active;
  }
  const next=findNextForCourt(court,div,0);
  if(next.division===div&&next.index<arr.length){applyCourtState(court,next,true);return state.matches[state.current]||null;}
  return null;
}
function renderScore(){
/* ksm:post-split-begin react-court */
  if(ksmReactScoreboardActive())return renderScoreWithReactScoreboard();
/* ksm:post-split-end */
  updateScoreTournamentName();
  let m=ensureScorableCurrentMatch();
  if(m && !matchBelongsToCourt(m,state.currentCourt||'A'))m=null;
  if(!m){
    whiteName.textContent='—'; redName.textContent='—';
    if(window.whiteDojo)whiteDojo.textContent='—';
    if(window.redDojo)redDojo.textContent='—';
    matchMeta.textContent='No active match';
    if(window.scoreDivisionTitle)scoreDivisionTitle.textContent=state.currentDivision||'—';
    whitePts.innerHTML=''; redPts.innerHTML=''; whiteTri.textContent=''; redTri.textContent='';
    renderQueue();renderPublic();renderContext();return;
  }
  if(m.type==='teamPlayoff'){
    whiteName.innerHTML=repSelect('W',m.teamWhite,m.white);
    redName.innerHTML=repSelect('R',m.teamRed,m.red);
  }else{
    whiteName.textContent=m.white||'TBD';
    redName.textContent=m.red||'TBD';
  }
  if(window.whiteDojo)whiteDojo.textContent=m.wdojo||m.teamWhite||'—';
  if(window.redDojo)redDojo.textContent=m.rdojo||m.teamRed||'—';
  const meta=matchDisplayMeta(m);
  if(window.scoreDivisionTitle)scoreDivisionTitle.textContent=meta.division;
  matchMeta.textContent=meta.line;
  renderPointLetters(whitePts,state.score.W||[],'W');
  renderPointLetters(redPts,state.score.R||[],'R');
  whiteTri.textContent='△ '.repeat(state.score.WT||0);
  redTri.textContent='△ '.repeat(state.score.RT||0);
  renderQueue();renderPublic();renderContext();
}


// ---------- KSM v3.9.1 Header and action-label helpers ----------
function updateScoreTournamentName(){
/* ksm:post-split-begin react-court */
  if(ksmReactCourtHeaderActive())return ksmPublishCourtHeader({tournamentName:(window.tName&&tName.value)?tName.value:'Kendo Tournament'});
/* ksm:post-split-end */
  const target=document.getElementById('scoreTournamentName');
  if(target)target.textContent=(window.tName&&tName.value)?tName.value:'Kendo Tournament';
}
function legacyUpdateUndoButton(){
  let btn=document.getElementById('undoBtn');
  if(!btn)return;
  ensureCourtHistory();const stack=state.courtActionHistory[currentHistoryCourt()];const text=stack.length?`Undo ${stack[stack.length-1].label}`:'Undo';
  btn.innerHTML=`<span class="action-icon" aria-hidden="true">↶</span><span class="action-label">${esc(text)}</span>`;
}


// ---------- KSM v3.9.1 Stable undo button renderer ----------
function legacyUpdateUndoButton(){
  const btn=document.getElementById('undoBtn');
  if(!btn)return;
  ensureCourtHistory();const stack=state.courtActionHistory[currentHistoryCourt()];const text=stack.length?`Undo ${stack[stack.length-1].label}`:'Undo';
  btn.innerHTML=`
    <svg class="action-svg undo-svg" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M28 14H12v16" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13 28c6-11 18-16 29-11 12 5 18 19 13 31-5 12-19 18-31 13-6-3-11-8-13-14" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
    </svg>
    <span class="action-label">${esc(text)}</span>`;
}


// ---------- KSM v3.9.1 Corrected undo renderer ----------
function legacyUpdateUndoButton(){
  const btn=document.getElementById('undoBtn');
  if(!btn)return;
  ensureCourtHistory();const stack=state.courtActionHistory[currentHistoryCourt()];const text=stack.length?`Undo ${stack[stack.length-1].label}`:'Undo';
  btn.innerHTML=`
    <svg class="action-svg undo-svg" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M18 11H8v10" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M9.5 20.5C12.5 13.8 19.1 9.5 26.5 9.5c10.2 0 18.5 8.3 18.5 18.5S36.7 46.5 26.5 46.5c-8 0-14.8-5.1-17.4-12.2" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/>
    </svg>
    <span class="action-label">${esc(text)}</span>`;
}


// ---------- KSM v3.9.1 Approved action button renderer ----------
function legacyUpdateUndoButton(){
  const btn=document.getElementById('undoBtn');
  if(!btn)return;
  ensureCourtHistory();const stack=state.courtActionHistory[currentHistoryCourt()];const text=stack.length?`Undo ${stack[stack.length-1].label}`:'Undo';
  btn.innerHTML=`
    <svg class="action-svg undo-svg" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M24 14H10v14" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M11 27c4-10 14-17 26-17 15 0 27 12 27 27S52 64 37 64c-11 0-21-7-25-17" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    </svg>
    <span class="action-label">${esc(text)}</span>`;
}


