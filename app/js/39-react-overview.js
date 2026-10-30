/* ksm:post-split-begin react-overview */
// ==========================================================
// React Overview (app/react/features/overview/, roadmap M.13, #136 step 2)
// The Overview screen (#director, nav "Overview") is drawn only by one React island: the contents
// of #director .director-dashboard, mounted by app/react/features/overview/main.tsx. The island
// computes what it shows itself (publish.ts: tournamentSummary(), courtSummaryFor('A'/'B') and the
// tournament name, as plain data in window.ksmOverviewInput); legacy only signals. renderDirector()
// (30-setup-header-and-director.js) calls ksmRenderOverview() below, which dispatches ksm:overview.
// It must not call a function defined in the module: this script runs before it (the module may not
// exist yet, or at all). ksmOverviewRequested tells the module, when it loads, that a signal came
// earlier. tests/golden/overview/*.json pin what the island draws.
// When the Overview is redrawn stays legacy: opening it (show() -> renderAll(), then
// startDirectorRefresh()), renderAll() while it is shown, and the 5 s timer.
// If the React module does not load, the Overview shows a notice (the end of this file).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmRenderOverview(){
  if(!window.directorCourtGrid)return;
  window.ksmOverviewRequested=true;
  window.dispatchEvent(new CustomEvent('ksm:overview'));
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
