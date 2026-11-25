/* ksm:post-split-begin path-urls */
// ==========================================================
// Path URLs (roadmap M.9; the scheme is app/engine/routes.ts, KSMEngine.*)
// /t/<id>, /t/<id>/live, /t/<id>/court/a|b, /t/<id>/tv/a|b (and /t/<id>/overlay/a|b, the
// overlay page). This file runs first in app.js: an old link (?tournament=<id>&court=A,
// &role=spectator&view=tv, ...) is replaced by its path (history.replaceState, so it works
// offline and adds no history entry) before any other code reads the address, and a /t/...
// path that is not a route goes to / (the Tournament Library, as an unknown tournament does).
// The code that read the old parameters (initializeCloudRoleFromUrl(), KSM_TV_ASSIGNED_COURT,
// isTvSession(), pinnedCourt(), courtPinStorageKey(), restoreAutoSaveIfWanted(), the Load
// Tournament File guard) reads them through ksmLinkParams(): the same names and values, from
// the path. The links the app makes (Tournament Access and its QR code, the TV menu, the
// stream overlay links, roleLink()) are built by ksmLinkUrl(). In-app navigation
// replaces the current screen path without adding a history entry.
// Post-split code: scripts/verify-split.mjs removes the marked region before it compares.
// ==========================================================
var ksmRouteLoading=0;
// Preserve an explicit read-only query before the path migration removes legacy keys.
var ksmExplicitSpectatorUrl=new URLSearchParams(location.search).get('role')==='spectator'||new URLSearchParams(location.search).has('spectator');
function ksmResolvedUrl(){return KSMEngine.resolveUrl(location.pathname||'/',location.search||'')}
// The page's link parameters by their old names (tournament, court, view; key= and others as
// they are), as new URLSearchParams(location.search) gave them for an old link.
function ksmLinkParams(){
  const route=ksmResolvedUrl().route;
  if(route.slug){const identity=ksmCachedSlug(route.slug);if(identity)route.id=identity.id}
  return new URLSearchParams(KSMEngine.legacyQuery(route,location.search||''));
}
function ksmCachedSlug(slug){try{return JSON.parse(localStorage.getItem('ksm.slug:'+slug)||'null')}catch(_){return null}}
async function ksmResolveSlug(){
  const route=ksmResolvedUrl().route;if(!route.slug)return;
  const epoch=ksmTournamentEpoch;
  let identity;
  if(!navigator.onLine)identity=ksmCachedSlug(route.slug);
  else{
    const response=await fetch('/api/slugs/'+encodeURIComponent(route.slug),{cache:'no-store'});
    if(!response.ok)throw new Error('Tournament short name could not be resolved');
    identity=await response.json();
    if(epoch!==ksmTournamentEpoch)throw Object.assign(new Error('Tournament changed'),{code:'transition-cancelled'});
    localStorage.setItem('ksm.slug:'+route.slug,JSON.stringify(identity));
    localStorage.setItem('ksm.slug:'+identity.slug,JSON.stringify(identity));
  }
  if(!identity)throw new Error('Connect once to open this tournament short name');
  if(identity.slug!==route.slug)ksmReplaceUrl(KSMEngine.routePath({...route,slug:identity.slug})+location.search);
}

// The visible app screen replaces the tournament's existing history entry.
function ksmRecordScreenPath(view){
  if(ksmRouteLoading||!window.ksmBootstrapReady||!cloudSession.tournamentId||ksmApplyingRemoteSnapshot||document.body.classList.contains('ksm-home'))return;
  if(view!=='tv')document.body.classList.remove('ksm-tv');
  const screens={setup:'setup',registration:state.regMode==='pools'?'pools':'registration',score:'court',public:'live',director:'overview',results:'results',tv:'tv'};
  const screen=screens[view];if(!screen)return;
  const current=ksmResolvedUrl().route;
  const slug=current.slug||(current.id?undefined:cloudSession.slug);
  const route={screen,id:cloudSession.tournamentId,slug,court:normalizeCourt(view==='tv'?cloudSession.court:state.currentCourt)};
  ksmReplaceUrl(KSMEngine.routePath(route)+location.search+location.hash);
  ksmTournamentAddress=location.pathname+location.search+location.hash;
}
function ksmHeaderLogo(){if(!isReadOnlySession())return showHomePage();navigateTo(KSMEngine.TOURNAMENT_HOME.view)}
function ksmTournamentHomeUrl(){return cloudSession.tournamentId?ksmLinkUrl({screen:KSMEngine.DEFAULT_TOURNAMENT_SCREEN,id:cloudSession.tournamentId}):'/'}
function ksmShowRequestedScreen(){
  const screen=ksmResolvedUrl().route.screen;
  if(screen==='overview'){navigateTo('director');return}
  if(screen==='results'){navigateTo('results');return}
  // A court address (/court/a, /court/b) reopens that court's scorekeeper screen after a refresh
  // (before: it fell through to Live Scores). Spectators, who have no court screen, still get Live Scores.
  if(screen==='court'&&!isSpectatorSession()){openCourt(ksmResolvedUrl().route.court);return}
  if(['setup','registration','pools'].includes(screen)){
    if(!isReadOnlySession()){
      if(screen==='setup')navigateTo('setup');else openRegistrationTab(screen==='pools'?'pools':'individual');
      return;
    }
    const current=ksmResolvedUrl().route;
    ksmReplaceUrl(KSMEngine.routePath({...current,screen:KSMEngine.DEFAULT_TOURNAMENT_SCREEN,id:cloudSession.tournamentId})+location.search+location.hash);
    navigateTo(KSMEngine.TOURNAMENT_HOME.view);return;
  }
  navigateTo(screen==='tournament'?(KSMEngine.TOURNAMENT_HOME.view):'public');
}

// An absolute link to a route (KSMEngine.routeUrl(): path plus query pairs; empty ones left out).
function ksmLinkUrl(route,query){
  if(route.screen==='tournament')route={...route,screen:KSMEngine.DEFAULT_TOURNAMENT_SCREEN};
  const slug=route.id===cloudSession.tournamentId?cloudSession.slug:readTournamentLibrary().find(row=>row.id===route.id)?.slug;
  return new URL(KSMEngine.routeUrl({...route,...(slug?{slug}:{})},query||[]),location.href).toString();
}
function ksmReplaceUrl(path){try{history.replaceState(history.state,'',path);if(typeof ksmTournamentAddress!=='undefined')ksmTournamentAddress=location.pathname+location.search+location.hash;}catch(err){console.warn('KSM could not update the address',err)}}
(function ksmApplyPathRoute(){
  if(typeof location==='undefined'||typeof history==='undefined'||typeof KSMEngine==='undefined')return;
  const resolved=ksmResolvedUrl();
  if(resolved.redirect!==null)ksmReplaceUrl(resolved.redirect+(resolved.route.screen==='invalid'?'':location.hash));
})();
/* ksm:post-split-end */
