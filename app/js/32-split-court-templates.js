// ==========================================================
// KSM v3.12.4 — Split-Court Template Consolidation
// ==========================================================
function syncSingleElimNodeWinnerFromMatch(div,node,match){
  if(!match||!match.done)return false;
  const winner=winnerOf(match);
  if(!winner||winner==='Hikiwake')return false;
  const next=winner===match.red?{name:match.red,dojo:match.rdojo}:{name:match.white,dojo:match.wdojo};
  if(!node.winner||node.winner.name!==next.name){node.winner=next;return true;}
  return false;
}
function canonicalSingleElimMatch(div,node,arr){/* ksm:post-split-begin engine-bridge */return KSMEngine.canonicalSingleElimMatch(div,node,arr);// moved to app/engine/bracket-helpers.ts
  /* ksm:post-split-end */}
function syncIndividualSingleElim(div,arr,comps){
  /* ksm:post-split-begin engine-bridge */state.singleElimNodes=state.singleElimNodes||{};
  const nodes=state.singleElimNodes[div]||[];
  const plan=KSMEngine.syncIndividualSingleElim(nodes,arr,comps,/** @type {Court|'split'} */(state.divisionCourts[div]||'A'));
  plan.missing.forEach(id=>console.error('KSM template invariant: missing Match Object for',div,id));
  plan.winners.forEach(w=>{nodes[w.index].winner=w.winner;});
  plan.updates.forEach(u=>Object.assign(arr[u.index],u.set));
  sortIndividualSingleElimMatches(div,arr);
  state.allMatches[div]=arr;
  return enforceUniqueIndividualMatches(div);
  /* ksm:post-split-end */
}
/* ksm:post-split-begin react-court */
// The court queue panel is React (CourtQueue): the module's ksmQueuePanelInput()
// (app/react/features/court/publish.ts) makes the decisions of the legacy queue renderer (this
// file's split-court wrapper around renderQueue() in 24-, removed with the legacy court renderer
// in M.8 step 5). This signals the request (see 35-react-court.js).
function renderQueue(){
  if(!document.getElementById('queue'))return;
  window.ksmCourtQueueRequested=true;
  window.dispatchEvent(new CustomEvent('ksm:court-queue'));
}
/* ksm:post-split-end */

function contextDivisionForCourt(){
  return state.currentDivision||state.courtActiveDivision?.[state.currentCourt||'A']||state.courtState?.[state.currentCourt||'A']?.division||null;
}
/* ksm:post-split-begin react-court */
// The court context panel is React (CourtContext): the module's ksmContextPanelInput()
// (app/react/features/court/publish.ts) makes the decisions of the legacy context renderer (this
// file's wrapper around renderContext() in 31-, removed with the legacy court renderer in M.8
// step 5) and sets the layout classes (setCourtSupportMode()). This signals the request (see
// 35-react-court.js).
function renderContext(){
  if(!window.courtContext)return;
  window.ksmCourtContextRequested=true;
  window.dispatchEvent(new CustomEvent('ksm:court-context'));
}
/* ksm:post-split-end */

function setCourtCompletePresentation(div,complete){
/* ksm:post-split-begin react-court */
  // The React court screen (CourtComplete) sets .division-complete on #score .scoreboard-card and
  // draws the division-complete panel in it; the module computes the panel (35-react-court.js).
  window.ksmCourtCompleteRequested={div,complete};
  window.dispatchEvent(new CustomEvent('ksm:court-complete'));
/* ksm:post-split-end */
}
const renderScore_v3121=renderScore;
renderScore=function(){
  const div=state.currentDivision;
  const current=state.matches?.[state.current];
  if(div&&divisionComplete(div)&&(!current||current.done||!matchBelongsToCourt(current,state.currentCourt||'A'))){
    updateScoreTournamentName();/* ksm:post-split-begin quirks-court */ksmSignalCourtHeader({divisionTitle:div,matchLine:'Division complete'});/* ksm:post-split-end */setCourtCompletePresentation(div,true);renderQueue();renderPublic();renderContext();return;
  }
  setCourtCompletePresentation(div,false);renderScore_v3121();
};

/* ksm:post-split-begin tournament-switcher */
const KSM_EMPTY_SETUP=getSetupSnapshot();
/* ksm:post-split-end */
if(!restoreAutoSaveIfWanted()) renderAll();
setConnectionStatus(cloudSession.tournamentId?'Sync connecting…':'Local only',cloudSession.tournamentId?'connecting':'local');



