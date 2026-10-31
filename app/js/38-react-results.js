/* ksm:post-split-begin react-results */
// ==========================================================
// React Results (app/react/features/results/, roadmap M.13, #136 step 2)
// The Results screen (#results) is drawn only by React: four islands (the result cards and awards
// editor in #resultsBody, the hero's #resultsTournamentName, the bracket modal's
// #resultsBracketTitle and #resultsBracketBody), mounted by app/react/features/results/main.tsx.
// The islands' input is computed by the module (publish.ts: the placements from resultPlacements(),
// the engine's rule, state.awards, and the modal's division detail, as plain data in
// window.ksmResultsInput / window.ksmResultsBracketInput); legacy only signals.
// renderResultsDashboard() (27-results-screen.js) calls ksmRenderResults() below, which dispatches
// ksm:results; openResultsBracket() (27-) calls ksmRenderResultsBracket(div), which stores the
// division and dispatches ksm:results-bracket, then shows the modal. They must not call a function
// defined in the module: this script runs before it (the module may not exist yet, or at all).
// ksmResultsRequested / ksmResultsBracketRequested tell the module, when it loads, that a signal
// came earlier. tests/golden/results/*.json pin what the islands draw (recorded from the legacy
// Results renderer, removed in M.13).
// The awards editor's buttons call addResultAward() / removeResultAward() (27-) and its inputs'
// change events ksmSetResultAward() below (classic state + saveAuto(): React calls legacy).
// If the React module does not load, Results shows a notice (the end of this file).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmRenderResults(){
  window.ksmResultsRequested=true;
  window.dispatchEvent(new CustomEvent('ksm:results'));
}
function ksmRenderResultsBracket(div){
  window.ksmResultsBracketRequested={div};
  window.dispatchEvent(new CustomEvent('ksm:results-bracket'));
}
// An award input's change (awardsEditorHtml()'s inline handler: state.awards[i].<field>=this.value;saveAuto();
// saveAuto() is the scheduled autosave defined for F11 in 20-cloud-session-and-autosave.js).
function ksmSetResultAward(index,field,value){
  state.awards[index][field]=value;saveAuto();
}

// If the React module (app/react/main.tsx, a module script after app.js) did not run, say so on
// Results instead of an empty screen, which nothing fills any more (e.g. an offline device whose
// cached copy lacks the module). Module scripts run before DOMContentLoaded, so a working page
// never shows this. Existing styles only (.card, .sub).
function ksmShowResultsModuleMissing(){
  if(window.ksmResultsMounted)return;
  const body=document.getElementById('resultsBody');
  if(!body||document.getElementById('resultsModuleMissing'))return;
  const notice=document.createElement('div');
  notice.id='resultsModuleMissing';notice.className='card';notice.setAttribute('role','alert');notice.setAttribute('data-testid','results-module-missing');
  notice.innerHTML='<h1>Results could not load</h1><p class="sub">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</p>';
  body.style.display='none';
  body.before(notice);
}
document.addEventListener('DOMContentLoaded',ksmShowResultsModuleMissing);
/* ksm:post-split-end */
