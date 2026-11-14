// @ts-check
import {state} from '../app-state.js';
import {applyCourtState,findNextForCourt,individualMatchReady} from './court-match-order.js';
import {fusen,matchRequiresWinner} from './court-scoring-and-history.js';
import {renderContext,renderQueue,setCourtCompletePresentation} from './split-court-templates.js';
import {matchBelongsToCourt} from '../engine/engine-generation.js';
import {ksmSignalCourtHeader,ksmSignalCourtScoreboard} from '../react-bridges/court.js';
import {ksmSetFusenOpen} from '../react-bridges/shell.js';
import {renderPublic} from '../results/live-scores.js';
import {divisionComplete} from '../results/results-and-awards.js';
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
  // state.matches is allMatches[currentDivision] (derived, #15 PR 7), so it is already `arr`.
  if(individualMatchReady(active)&&matchBelongsToCourt(active,court))return active;
  const next=findNextForCourt(court,div,0);
  if(next.division===div&&next.index<arr.length){applyCourtState(court,next,true);return state.matches[state.current]||null;}
  return null;
}


// ---------- KSM v3.9.1 Header helpers ----------
export function updateScoreTournamentName(){
  // The React court header (35-react-court.js) shows it.
  ksmSignalCourtHeader({tournamentName:(window.tName&&tName.value)?tName.value:'Kendo Tournament'});
}

// renderScore() (step 4a of #136; was app/js/22-scorekeeper-screen.js): ONE final function. 32-split-court-templates.js used to
// reassign it at load (the "division complete" screen, then the original); the original body is renderScoreForMatch().
// Nothing called renderScore() between the two files' load (no load-time call before 32-).
function renderScoreForMatch(){
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
export function renderScore(){
  const div=state.currentDivision;
  const current=state.matches?.[state.current];
  if(div&&divisionComplete(div)&&(!current||current.done||!matchBelongsToCourt(current,state.currentCourt||'A'))){
    updateScoreTournamentName();ksmSignalCourtHeader({divisionTitle:div,matchLine:'Division complete'});setCourtCompletePresentation(div,true);renderQueue();renderPublic();renderContext();return;
  }
  setCourtCompletePresentation(div,false);renderScoreForMatch();
}
