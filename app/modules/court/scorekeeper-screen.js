// @ts-check
import {state} from '../app-state.js';
import {applyCourtState,findNextForCourt,individualMatchReady} from './court-match-order.js';
import {fusen} from './court-scoring-and-history.js';
import {matchBelongsToCourt} from '../legacy.js';
import {ksmSignalCourtHeader} from '../react-bridges/court.js';
import {ksmSetFusenOpen} from '../react-bridges/shell.js';
import {redOnLeftForCourt} from '../sync/sync-state-and-rebase.js';
// ---------- KSM v3.9.1 Scorekeeper redesign helpers ----------
export function matchDisplayMeta(m){
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
export function openFusenDialog(){
  const m=state.matches?.[state.current];
  if(!m){return;}
  ksmSetFusenOpen(true,{white:m.white||'TBD',red:m.red||'TBD',redLeft:redOnLeftForCourt(state.currentCourt)});
}
export function closeFusenDialog(){
  ksmSetFusenOpen(false);
}
export function confirmFusen(side){
  closeFusenDialog();
  // #38: the dialog asks who won; fusen() takes the forfeiting side (the stored label and F F points are unchanged).
  fusen(side==='W'?'R':'W');
}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape')closeFusenDialog();
});


// ---------- KSM v3.9.1 Score rendering ----------
export function ensureScorableCurrentMatch(){
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


// ---------- KSM v3.9.1 Header helpers ----------
export function updateScoreTournamentName(){
  // The React court header (35-react-court.js) shows it.
  ksmSignalCourtHeader({tournamentName:(window.tName&&tName.value)?tName.value:'Kendo Tournament'});
}
