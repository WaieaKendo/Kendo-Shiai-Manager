// @ts-check
import {state} from '../app-state.js';
import {enforceUniqueIndividualMatches} from '../engine/engine-championship.js';
import {sortIndividualSingleElimMatches} from '../engine/engine-single-elim.js';
import {ksmAdvanceBracket,ksmNodesWithWinners} from '../engine/structure-store.js';
import * as KSMEngine from '../../engine/index.ts';
// ==========================================================
// KSM v3.12.4 — Split-Court Template Consolidation
// ==========================================================
function canonicalSingleElimMatch(div,node,arr){return KSMEngine.canonicalSingleElimMatch(div,node,arr);// moved to app/engine/bracket-helpers.ts
  }
/**
 * Fills a single elimination's bouts from its nodes and advances the winners (KSMEngine.syncIndividualSingleElim(), a
 * plan on copies). The bouts are written first (plain `allMatches`, PR 13), then the nodes with their new winners go in
 * one tournament/advancementApplied (#15 PR 12b), so no store notification shows a finished bout whose node has not got
 * its winner. `draft` (a draw being built: generation, a No Show, a load's repair): the nodes are read from and written
 * to `draft.singleElimNodes` instead, and the caller puts them in its own action.
 * @param {string} div
 * @param {Match[]} arr
 * @param {Competitor[]} comps
 * @param {{singleElimNodes?:any[]}} [draft]
 */
export function syncIndividualSingleElim(div,arr,comps,draft){
  const nodes=(draft?draft.singleElimNodes:state.singleElimNodes?.[div])||[];
  const plan=KSMEngine.syncIndividualSingleElim(nodes,arr,comps,/** @type {Court|'split'} */(state.divisionCourts[div]||'A'));
  plan.missing.forEach(id=>console.error('KSM template invariant: missing Match Object for',div,id));
  const next=ksmNodesWithWinners(nodes,plan.winners);
  plan.updates.forEach(u=>Object.assign(arr[u.index],u.set));
  sortIndividualSingleElimMatches(div,arr,next);
  state.allMatches[div]=arr;
  const out=enforceUniqueIndividualMatches(div);
  if(draft)draft.singleElimNodes=next;else ksmAdvanceBracket(div,'singleElimNodes',nodes,next);
  return out;
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
