// @ts-check
import {state} from '../app-state.js';
import {enforceUniqueIndividualMatches} from '../engine/engine-championship.js';
import {winnerOf} from '../engine/engine-result-integrity.js';
import {sortIndividualSingleElimMatches} from '../engine/engine-single-elim.js';
import * as KSMEngine from '../../engine/index.ts';
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
function canonicalSingleElimMatch(div,node,arr){return KSMEngine.canonicalSingleElimMatch(div,node,arr);// moved to app/engine/bracket-helpers.ts
  }
export function syncIndividualSingleElim(div,arr,comps){
  state.singleElimNodes=state.singleElimNodes||{};
  const nodes=state.singleElimNodes[div]||[];
  const plan=KSMEngine.syncIndividualSingleElim(nodes,arr,comps,/** @type {Court|'split'} */(state.divisionCourts[div]||'A'));
  plan.missing.forEach(id=>console.error('KSM template invariant: missing Match Object for',div,id));
  plan.winners.forEach(w=>{nodes[w.index].winner=w.winner;});
  plan.updates.forEach(u=>Object.assign(arr[u.index],u.set));
  sortIndividualSingleElimMatches(div,arr);
  state.allMatches[div]=arr;
  return enforceUniqueIndividualMatches(div);
}
// The court queue panel is React (CourtQueue): the module's ksmQueuePanelInput()
// (app/react/features/court/publish.ts) makes the decisions of the legacy queue renderer (this
// file's split-court wrapper around renderQueue() in 24-, removed with the legacy court renderer
// in M.8 step 5). This signals the request (see 35-react-court.js).
export function renderQueue(){
  if(!document.getElementById('queue'))return;
  window.ksmCourtQueueRequested=true;
  window.dispatchEvent(new CustomEvent('ksm:court-queue'));
}

export function contextDivisionForCourt(){
  return state.currentDivision||state.courtActiveDivision?.[state.currentCourt||'A']||state.courtState?.[state.currentCourt||'A']?.division||null;
}
// The court context panel is React (CourtContext): the module's ksmContextPanelInput()
// (app/react/features/court/publish.ts) makes the decisions of the legacy context renderer (this
// file's wrapper around renderContext() in 31-, removed with the legacy court renderer in M.8
// step 5) and sets the layout classes (setCourtSupportMode()). This signals the request (see
// 35-react-court.js).
export function renderContext(){
  if(!window.courtContext)return;
  window.ksmCourtContextRequested=true;
  window.dispatchEvent(new CustomEvent('ksm:court-context'));
}

export function setCourtCompletePresentation(div,complete){
  // The React court screen (CourtComplete) sets .division-complete on #score .scoreboard-card and
  // draws the division-complete panel in it; the module computes the panel (35-react-court.js).
  window.ksmCourtCompleteRequested={div,complete};
  window.dispatchEvent(new CustomEvent('ksm:court-complete'));
}
