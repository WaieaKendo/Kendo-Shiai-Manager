/* ksm:post-split-begin react-overview */
// ==========================================================
// React Overview (app/react/overview/, roadmap M.13)
// The Overview screen (#director, nav "Overview") is drawn only by one React island: the contents of
// #director .director-dashboard (the overall card with the tournament name, the overall
// progress, bar and remaining count, and the court cards in #directorCourtGrid), mounted by
// app/react/overview/main.tsx. The legacy code still decides what is shown: renderDirector()
// (30-setup-header-and-director.js) calls ksmRenderOverview() below, which publishes
// tournamentSummary() and courtSummaryFor('A'/'B') (the progress rules of 30-) as plain data
// (ksm:overview, window.ksmOverviewInput). The functions below read what renderDirector() and
// directorMatchRow() read, in the same order, which tests/golden/overview/*.json (recorded from
// the legacy renderer) pin; text is what esc() / textContent showed (ksmText(), String(x||'')).
// When the Overview is redrawn stays legacy: opening it (show() -> renderAll(), then
// startDirectorRefresh()), renderAll() while it is shown, and the 5 s timer. The legacy Overview
// renderer (the DOM writing of renderDirector(), directorMatchRow()) was removed in M.13, with the
// first renderProgress() (11-), which wrote #progActive/#progUpcoming, elements the page never
// had (overridden by the empty renderProgress() in 23-).
// If the React module does not load, the Overview shows a notice (the end of this file).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmPublishOverview(input){
  window.ksmOverviewInput=input;
  window.dispatchEvent(new CustomEvent('ksm:overview'));
}
// directorMatchRow(label,m)'s match: null draws "No match scheduled".
function ksmOverviewMatch(m){
  if(!m)return null;
  return {white:ksmText(m.white||'—'),red:ksmText(m.red||'—')};
}
function ksmOverviewProgress(x){
  return {completed:x.completed,total:x.total,remaining:x.remaining,variable:!!x.variable};
}
// One court card of renderDirector(): courtSummaryFor(court) as data.
function ksmOverviewCourt(c){
  const x=courtSummaryFor(c);
  return {court:c,division:ksmText(x.division||'No active division'),round:ksmText(x.round||''),...ksmOverviewProgress(x),
    current:ksmOverviewMatch(x.current),onDeck:ksmOverviewMatch(x.onDeck),following:ksmOverviewMatch(x.following)};
}
// renderDirector() as data: the overall numbers, the tournament name, then Court A and Court B.
function ksmOverviewInputData(){
  const t=tournamentSummary();
  const tournamentName=(window.tName&&tName.value)||'Kendo Tournament';
  return {kind:'overview',tournamentName:String(tournamentName),overall:ksmOverviewProgress(t),courts:['A','B'].map(ksmOverviewCourt)};
}
function ksmRenderOverview(){
  if(!window.directorCourtGrid)return;
  ksmPublishOverview(ksmOverviewInputData());
}

// If the React module (app/react/main.tsx, a module script after app.js) did not run, say so on
// the Overview instead of the static markup's empty dashboard, which nothing fills any more (e.g.
// an offline device whose cached copy lacks the module). Module scripts run before
// DOMContentLoaded, so a working page never shows this. Existing styles only (.card, .sub).
function ksmShowOverviewModuleMissing(){
  if(window.ksmOverviewMounted)return;
  const dashboard=document.querySelector('#director .director-dashboard');
  if(!dashboard||document.getElementById('overviewModuleMissing'))return;
  const notice=document.createElement('div');
  notice.id='overviewModuleMissing';notice.className='card';notice.setAttribute('role','alert');notice.setAttribute('data-testid','overview-module-missing');
  notice.innerHTML='<h1>Overview could not load</h1><p class="sub">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</p>';
  dashboard.style.display='none';
  dashboard.before(notice);
}
document.addEventListener('DOMContentLoaded',ksmShowOverviewModuleMissing);
/* ksm:post-split-end */
