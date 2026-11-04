// ==========================================================
// React TV display (app/react/features/tv/, roadmap M.13, #136 step 2)
// The TV display (?view=tv, body.ksm-tv, #tvLive) is drawn only by React: one island (Tv), mounted
// by app/react/features/tv/main.tsx. What it shows is computed by the module (publish.ts: from
// buildTV3ViewModel() (26-tv-display.js), which takes the TV court's match with
// courtCurrentMatch() (which also moves the court on, as before), its upcoming matches
// (tvUpcomingMatches(), which sorts the division's matches in place) and decides when a completed
// division's Final Results show; as plain data in window.ksmTvInput); legacy only signals.
// renderTvDisplay() (26-) calls ksmRenderTv() below, which dispatches ksm:tv. The signal must not
// call a function defined in the module: this script runs before it (the module may not exist
// yet, or at all); ksmTvRequested tells the module, when it loads, that a signal came earlier.
// tests/golden/tv/*.json pin what the island draws (recorded from the legacy tv3 renderer,
// removed in M.13).
// If the React module does not load, the TV shows a notice (below). ksmFitTv() and its resize
// listener stay here (CSS fallback, harmless off the TV).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmRenderTv(){
  window.ksmTvRequested=true;
  window.dispatchEvent(new CustomEvent('ksm:tv'));
}

// If the React module (app/react/main.tsx, a module script after app.js) did not run, say so on
// the TV instead of an empty screen, which nothing fills any more (e.g. an offline TV whose
// cached copy lacks the module). Module scripts run before DOMContentLoaded, so a working page
// never shows this. Existing styles only (.card, .sub).
function ksmShowTvModuleMissing(){
  if(window.ksmTvMounted)return;
  const live=document.getElementById('tvLive');
  if(!live||document.getElementById('tvModuleMissing'))return;
  const notice=document.createElement('div');
  notice.id='tvModuleMissing';notice.className='card';notice.setAttribute('role','alert');notice.setAttribute('data-testid','tv-module-missing');
  notice.innerHTML='<h1>TV display could not load</h1><p class="sub">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</p>';
  // The TV CSS sizes #tvLive with !important rules (the fixed canvas), so hide it the same way.
  live.style.setProperty('display','none','important');
  live.before(notice);
}
document.addEventListener('DOMContentLoaded',ksmShowTvModuleMissing);

// F14: the TV CSS (13-tv.css, tv-fit) scales the 1920x1080 canvas by --ksm-tv-fit to fit the
// window, centred. Set here (CSS cannot divide lengths) and on every resize; harmless off the TV.
function ksmFitTv(){
  const root=typeof document!=='undefined'&&document.documentElement;
  if(!root||!root.style||typeof window==='undefined')return;
  root.style.setProperty('--ksm-tv-fit',String(Math.min(window.innerWidth/1920,window.innerHeight/1080)||1));
}
if(typeof window!=='undefined'&&window.addEventListener){ksmFitTv();window.addEventListener('resize',ksmFitTv);}
