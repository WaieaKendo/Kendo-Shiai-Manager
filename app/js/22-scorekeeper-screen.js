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
document.addEventListener('keydown',function(e){
  if(e.key==='Escape')closeFusenDialog();
});


// ---------- KSM v3.9.1 Score rendering ----------
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
  // The court screen is React (app/react/court/, 35-react-court.js): the division title, match
  // line and match display are published to it instead of written (M.8).
  updateScoreTournamentName();
  let m=ensureScorableCurrentMatch();
  if(m && !matchBelongsToCourt(m,state.currentCourt||'A'))m=null;
  const meta=matchDisplayMeta(m);
  ksmPublishCourtHeader({matchLine:meta.line,divisionTitle:m?meta.division:(state.currentDivision||'—')});
  ksmPublishCourtScoreboard(m);
  renderQueue();renderPublic();renderContext();
/* ksm:post-split-end */
}


// ---------- KSM v3.9.1 Header helpers ----------
function updateScoreTournamentName(){
/* ksm:post-split-begin react-court */
  // The React court header (35-react-court.js) shows it.
  ksmPublishCourtHeader({tournamentName:(window.tName&&tName.value)?tName.value:'Kendo Tournament'});
/* ksm:post-split-end */
}
