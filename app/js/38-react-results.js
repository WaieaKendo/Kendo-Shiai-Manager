/* ksm:post-split-begin react-results */
// ==========================================================
// React Results (app/react/results/, roadmap M.13)
// The Results screen (#results) is drawn only by React: four islands (the result cards and awards
// editor in #resultsBody, the hero's #resultsTournamentName, the bracket modal's
// #resultsBracketTitle and #resultsBracketBody), mounted by app/react/results/main.tsx. The
// legacy code still decides what is shown: renderResultsDashboard() (27-results-screen.js) calls
// ksmRenderResults() below, which publishes the cards (the placements from resultPlacements(),
// the engine's rule) and state.awards as plain data (ksm:results, window.ksmResultsInput);
// openResultsBracket() (27-) publishes the modal's division detail (ksm:results-bracket,
// window.ksmResultsBracketInput) and shows the modal. The legacy Results renderer (the DOM
// writing of renderResultsDashboard() and openResultsBracket(), resultCardHtml(),
// awardsEditorHtml(), completedResultDetailHtml(), teamResultsBracketHtml() in 27-/28-, and the
// older renderResultsAll()/renderAwards() in 09-) was removed in M.13; the functions below mirror
// its reads, in the same order, which tests/golden/results/*.json (recorded from it) pin;
// text is what esc() showed (ksmText(), String(x||'')); the brackets are the court screen's data
// (ksmBracket(), ksmTeamResults(), 35-react-court.js).
// The awards editor's buttons call addResultAward() / removeResultAward() (27-) and its inputs'
// change events ksmSetResultAward(), the legacy inline handlers' code.
// If the React module does not load, Results shows a notice (the end of this file).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmPublishResults(input){
  window.ksmResultsInput=input;
  window.dispatchEvent(new CustomEvent('ksm:results'));
}
function ksmPublishResultsBracket(input){
  window.ksmResultsBracketInput=input;
  window.dispatchEvent(new CustomEvent('ksm:results-bracket'));
}
// resultCardHtml(div) as data: placements null for the in-progress card (none yet).
function ksmResultCard(div){
  const placements=resultPlacements(div),roundRobin=isTeamRoundRobinDivision(div);
  if(!placements.length){
    const progress=roundRobin?teamRoundRobinProgress(div):null;
    return {division:ksmText(div),name:ksmDivisionName(div),roundRobin:!!roundRobin,placements:null,progress:progress?{complete:progress.complete,total:progress.total}:null};
  }
  // The tier is printed into the class as it is (no esc()).
  return {division:ksmText(div),name:ksmDivisionName(div),roundRobin:!!roundRobin,progress:null,
    placements:placements.map(p=>({place:ksmText(p.place),name:ksmText(p.name),tier:String(p.tier)}))};
}
// renderResultsDashboard() (27-) as data: the tournament name, the Completed and In Progress
// cards, and awardsEditorHtml()'s awards.
function ksmResultsDashboardInput(){
  const divisions=[
    ...new Set([
      ...(state.divisions||[]),
      ...ksmTeamDivisions().filter(d=>state.allMatches?.[d.id]).map(d=>d.id),
      ...Object.keys(state.allMatches||{})
    ])
  ].filter(div=>(state.allMatches?.[div]||[]).length);
  const completed=divisions.filter(divisionComplete);
  const pending=divisions.filter(div=>!divisionComplete(div));
  return {kind:'results',
    tournamentName:(window.tName&&tName.value)?tName.value:'Kendo Tournament',
    completed:completed.map(ksmResultCard),
    pending:pending.map(ksmResultCard),
    noDivisions:!divisions.length,
    awards:(state.awards||[]).map(a=>({award:ksmText(a.award||''),name:ksmText(a.name||''),dojo:ksmText(a.dojo||'')})),
    // Owner decision 8 (#29): spectators see the awards read-only.
    readOnly:isReadOnlySession()};
}
function ksmRenderResults(){
  ksmPublishResults(ksmResultsDashboardInput());
}
// completedResultDetailHtml(div) (27-) as data.
function ksmResultDetail(div){
  // teamResultsBracketHtml() (the last declaration, 28-)
  if(isTeamDivision(div))return {kind:'bracket',bracket:ksmTeamResults(div)};
  const pools=state.pools?.[div]||[];
  if(pools.length){
    // Standings printed as they are (no esc()) apart from names and dojos.
    const poolData=pools.map(pool=>{const {rows,note}=ksmPoolStandingRows(div,pool.label);
      return {label:ksmText(pool.label),tiebreakNote:note,standings:rows}});
    return {kind:'pools',pools:poolData,bracket:ksmBracket(div)};
  }
  return {kind:'bracket',bracket:ksmBracket(div)};
}
// openResultsBracket(div) (27-): the title is the division as textContent showed it.
function ksmRenderResultsBracket(div){
  ksmPublishResultsBracket({kind:'bracket',title:div==null?'':ksmDivisionName(String(div)),detail:ksmResultDetail(div)});
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
