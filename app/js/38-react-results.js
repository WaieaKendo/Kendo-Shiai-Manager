/* ksm:post-split-begin react-results */
// ==========================================================
// React Results (app/react/results/, roadmap M.13)
// The Results screen (#results) is drawn by React: four islands (the result cards and awards
// editor in #resultsBody, the hero's #resultsTournamentName, the bracket modal's
// #resultsBracketTitle and #resultsBracketBody), mounted by app/react/results/main.tsx. The
// legacy code still decides what is shown: renderResultsDashboard() (27-results-screen.js) calls
// ksmRenderResults() below, which publishes the cards (the placements from resultPlacements(),
// the engine's rule) and state.awards as plain data (ksm:results, window.ksmResultsInput);
// openResultsBracket() (27-) publishes the modal's division detail (ksm:results-bracket,
// window.ksmResultsBracketInput) and shows the modal. The functions below mirror the legacy
// Results renderer's reads, in the same order (resultCardHtml(), awardsEditorHtml(),
// completedResultDetailHtml() in 27-), which tests/golden/results/*.json (recorded from it) pin;
// text is what esc() showed (ksmText(), String(x||'')); the brackets are the court screen's data
// (ksmBracket(), ksmTeamResults(), 35-react-court.js).
// The awards editor's buttons call addResultAward() / removeResultAward() (27-) and its inputs'
// change events ksmSetResultAward(), the legacy inline handlers' code.
// Until the legacy renderer is removed it still draws when the islands are not mounted.
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
    return {division:ksmText(div),roundRobin:!!roundRobin,placements:null,progress:progress?{complete:progress.complete,total:progress.total}:null};
  }
  // The tier is printed into the class as it is (no esc()).
  return {division:ksmText(div),roundRobin:!!roundRobin,progress:null,
    placements:placements.map(p=>({place:ksmText(p.place),name:ksmText(p.name),tier:String(p.tier)}))};
}
// renderResultsDashboard() (27-) as data: the tournament name, the Completed and In Progress
// cards, and awardsEditorHtml()'s awards.
function ksmResultsDashboardInput(){
  const divisions=[
    ...new Set([
      ...(state.divisions||[]),
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
    awards:(state.awards||[]).map(a=>({award:ksmText(a.award||''),name:ksmText(a.name||''),dojo:ksmText(a.dojo||'')}))};
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
    const poolData=pools.map(pool=>({label:ksmText(pool.label),standings:poolStandings(pool.label,div).map(row=>({
      name:ksmText(row.name),dojo:ksmText(row.dojo||''),wins:String(row.wins),pts:String(row.pts)}))}));
    return {kind:'pools',pools:poolData,bracket:ksmBracket(div)};
  }
  return {kind:'bracket',bracket:ksmBracket(div)};
}
// openResultsBracket(div) (27-): the title is the division as textContent showed it.
function ksmRenderResultsBracket(div){
  ksmPublishResultsBracket({kind:'bracket',title:div==null?'':String(div),detail:ksmResultDetail(div)});
}
// An award input's change (awardsEditorHtml()'s inline handler: state.awards[i].<field>=this.value;saveAuto()).
function ksmSetResultAward(index,field,value){
  state.awards[index][field]=value;saveAuto();
}

/* ksm:post-split-end */
