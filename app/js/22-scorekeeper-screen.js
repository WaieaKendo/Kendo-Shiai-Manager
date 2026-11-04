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
  ksmSetFusenOpen(true,{white:m.white||'TBD',red:m.red||'TBD',redLeft:redOnLeftForCourt(state.currentCourt)});
}
function closeFusenDialog(){
  ksmSetFusenOpen(false);
}
function confirmFusen(side){
  closeFusenDialog();
  // #38: the dialog asks who won; fusen() takes the forfeiting side (the stored label and F F points are unchanged).
  fusen(side==='W'?'R':'W');
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
  // The court screen is React (app/react/court/, 35-react-court.js): the division title, match
  // line and match display are published to it instead of written (M.8).
  updateScoreTournamentName();
  let m=ensureScorableCurrentMatch();
  if(m && !matchBelongsToCourt(m,state.currentCourt||'A'))m=null;
  const meta=matchDisplayMeta(m);
  ksmSignalCourtHeader({matchLine:meta.line,divisionTitle:m?meta.division:(state.currentDivision||'—'),requiresWinner:m?!!matchRequiresWinner(m):null,redLeft:redOnLeftForCourt(state.currentCourt)});
  ksmSignalCourtScoreboard(m);
  renderQueue();renderPublic();renderContext();
}


// ---------- KSM v3.9.1 Header helpers ----------
function updateScoreTournamentName(){
  // The React court header (35-react-court.js) shows it.
  ksmSignalCourtHeader({tournamentName:(window.tName&&tName.value)?tName.value:'Kendo Tournament'});
}
