/* ksm:post-split-begin react-library */
// ==========================================================
// React Tournament Library (app/react/library/, roadmap M.13)
// The Tournament Library, the home page the app boots to (#home, body.ksm-home), is drawn by one
// React island: the contents of #home .home-shell (the brand, "Your Tournaments" with
// ＋ New Tournament, and #homeTournamentLibrary with a card per tournament or one message),
// mounted by app/react/library/main.tsx. The legacy code still decides what is shown and when:
// showHomePage() and renderHomeTournamentLibrary() (33-staff-session-and-library.js) show the
// device's cache, ask the cloud (the list, or discover with the cached IDs) and paint the answer,
// the error or offline line; paintHomeTournamentLibrary(list,message) calls ksmRenderLibrary()
// below, which publishes the rows and the message as plain data (ksm:library,
// window.ksmLibraryInput). It reads what libraryCardMarkup() read, in the same order (list.length,
// then each row's id and name), so a reply that is not a list fails where it failed before;
// tests/golden/library/*.json (recorded from the legacy renderer) pin the result. Text is what
// esc() showed (ksmText(), String(x||'')), the ID what jsArg() passed (String(x.id??'')).
// The island's buttons call createNewTournament() and openTournamentFromHome(id) (33), as the
// inline handlers did. The legacy library renderer (the DOM writing of
// paintHomeTournamentLibrary(), libraryCardMarkup()) was removed in M.13.
// Draft recovery is explicit and never runs while following a tournament or display link.
function ksmReadLocalDraft(){
  const params=ksmLinkParams();
  if(params.get('tournament')||params.get('spectator')||params.get('view')==='tv'||ksmExplicitSpectatorUrl)return null;
  try{
    const payload=JSON.parse(localStorage.getItem(KSM_SAVE_KEY)||'null');
    if(!payload?.state||localStorage.getItem(KSM_AUTOSAVE_CLOUD_ID)||cloudSession.tournamentId)return null;
    return payload;
  }catch(_){return null}
}
function ksmLocalDraftSummary(){
  const payload=ksmReadLocalDraft();
  return payload?{name:payload.setup?.tName||'Untitled tournament',saved:payload.savedAt?new Date(payload.savedAt).toLocaleString():'unknown time'}:null;
}
function ksmOpenLocalDraft(){
  const payload=ksmReadLocalDraft();if(!payload)return;
  document.body.classList.remove('ksm-home');setSessionRole('staff');installRoleBanner('staff');applyTournamentPayload(payload,false);
  updateSaveStatus('Restored autosave');navigateTo('setup');
}
function ksmDiscardLocalDraft(){
  if(!ksmReadLocalDraft())return;
  localStorage.removeItem(KSM_SAVE_KEY);
  ksmPublishLibrary({...window.ksmLibraryInput,draft:null});
}

// If the React module does not load, the library shows a notice (the end of this file).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmPublishLibrary(input){
  window.ksmLibraryInput=input;
  window.dispatchEvent(new CustomEvent('ksm:library'));
}
// libraryCardMarkup(x) as data.
function ksmLibraryCard(x){
  return {id:String(x.id??''),name:ksmText(x.name)};
}
// paintHomeTournamentLibrary(list,message) as data: the cards, or the message when there are none.
function ksmRenderLibrary(list,message){
  const cards=list.length?list.map(ksmLibraryCard):[];
  ksmPublishLibrary({kind:'library',cards,message:ksmText(message),draft:ksmLocalDraftSummary()});
}

// If the React module (app/react/main.tsx, a module script after app.js) did not run, say so on
// the home page instead of an empty library, which nothing fills any more (e.g. an offline device
// whose cached copy lacks the module). The static brand and ＋ New Tournament of app/index.html
// stay. Module scripts run before DOMContentLoaded, so a working page never shows this. Existing
// styles only (.card, .sub).
function ksmShowLibraryModuleMissing(){
  if(window.ksmLibraryMounted)return;
  const grid=document.getElementById('homeTournamentLibrary');
  if(!grid||document.getElementById('libraryModuleMissing'))return;
  const notice=document.createElement('div');
  notice.id='libraryModuleMissing';notice.className='card';notice.setAttribute('role','alert');notice.setAttribute('data-testid','library-module-missing');
  notice.innerHTML='<h1>Tournament Library could not load</h1><p class="sub">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</p>';
  grid.style.display='none';
  grid.before(notice);
}
document.addEventListener('DOMContentLoaded',ksmShowLibraryModuleMissing);
/* ksm:post-split-end */
