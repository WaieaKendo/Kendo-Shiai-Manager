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
  try{
    const detached=JSON.parse(localStorage.getItem(KSM_DETACHED_DRAFT_KEY)||'null');
    if(detached?.state)return detached;
  }catch(_){}
  // An active local tournament keeps its safety copy; only detached drafts can be discarded.
  if(v316StaffPassword())return null;
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
async function ksmOpenLocalDraft(){
  const payload=ksmReadLocalDraft();if(!payload)return;
  if(!(await ksmCanLeaveTournament()))return;
  ksmResetTournament();localStorage.removeItem(KSM_DETACHED_DRAFT_KEY);
  history.pushState(null,'','/');
  document.body.classList.remove('ksm-home');setSessionRole('staff');installRoleBanner('staff');applyTournamentPayload(payload,false);ksmStoreAutosave(payload);
  updateSaveStatus('Restored autosave');navigateTo('setup');
}
function ksmDiscardLocalDraft(){
  if(!ksmReadLocalDraft())return;
  if(localStorage.getItem(KSM_DETACHED_DRAFT_KEY))localStorage.removeItem(KSM_DETACHED_DRAFT_KEY);
  else ksmClearAutosave();
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
  ksmPublishLibrary({kind:'library',cards,message:ksmText(message),draft:ksmLocalDraftSummary(),canManage:!isReadOnlySession(),activeId:cloudSession.tournamentId||'',hasActive:(!isReadOnlySession()||ksmKeepStaffOutbox())&&!!(cloudSession.tournamentId||v316StaffPassword()),authorizedIds:[...ksmLibraryStaffTokens.keys()]});
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
/* ksm:post-split-begin library-setup */
const ksmLibraryStaffTokens=new Map();
function ksmCanManageLibraryTournament(id){return (id===cloudSession.tournamentId&&!isReadOnlySession())||ksmLibraryStaffTokens.has(id)}
async function ksmAuthorizeLibraryTournament(id){
  const password=prompt('Enter Staff password');if(!password)return;
  try{
    const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}/auth`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
    const info=await response.json();if(!response.ok||!info.token)throw new Error(info.error||'Incorrect Staff password');
    // Separate, memory-only access for this Library row. Never replace the active session.
    ksmLibraryStaffTokens.set(id,info.token);ksmRenderLibrary(readTournamentLibrary());
  }catch(err){showKsmToast(err.message||'Unable to enable Staff actions',4000,true)}
}
// Browse the Library without crossing a tournament boundary. Open/New/import still use the
// existing save/replacement gates. In particular, browsing and exporting cannot clear a queue.
function ksmReturnFromLibrary(){
  if(!cloudSession.tournamentId&&!v316StaffPassword())return;
  document.body.classList.remove('ksm-home');show(isReadOnlySession()?'public':ksmLibraryReturnView);connectCloudSocket();ksmRefreshTournamentChip();
}
async function ksmExportLibraryTournament(id,kind){
  if(!ksmCanManageLibraryTournament(id))return;
  try{
    const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`Export failed (${response.status})`);
    const record=await response.json(),payload=record.payload;
    if(!ksmCanManageLibraryTournament(id))return;
    const problem=tournamentFileProblem(payload);if(problem)throw new Error('Invalid tournament: '+problem);
    const base=(payload.setup?.tName||'KSM_Tournament').replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'')||'KSM_Tournament';
    if(kind==='file')downloadJson({...payload,tournamentId:record.tournamentId,revision:record.revision},base+'.ksm');
    else{
      const renderer=ksmPrintRenderer(payload),divs=renderer.printableDivisions();
      const body=kind==='brackets'?(divs.length?divs.map(renderer.printDivisionSheet).join(''):renderer.printSheet('No generated divisions','Generate a tournament before printing.','')):renderer.printResultsSheet();
      // A standalone printable document reuses the app's print sheets and theme stylesheet.
      // No app script runs in it. Download keeps popup blockers from dropping an async export.
      const css='<style>'+[...document.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules].map(rule=>rule.cssText)}catch(_){return []}}).join('\n')+'</style>';
      const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(payload.setup?.tName||'Tournament')} · ${kind==='brackets'?'Brackets':'Results & Awards'}</title>${css}</head><body><main><section id="print"><div id="printBody" class="print-body">${body}</div></section></main></body></html>`;
      const url=URL.createObjectURL(new Blob([html],{type:'text/html'})),a=document.createElement('a');a.href=url;a.download=base+'_'+kind+'.html';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    showKsmToast('Tournament export downloaded',2200);
  }catch(err){showKsmToast(err.message||'Unable to export tournament',4000,true)}
}
// The same typed-name confirmation and DELETE operation, with an explicit Library target.
async function ksmDeleteLibraryTournament(id){
  if(!ksmCanManageLibraryTournament(id))return;
  if(id===cloudSession.tournamentId&&!isReadOnlySession()){ksmOpenDeleteTournament();return}
  try{
    const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}`,{cache:'no-store'});
    if(!response.ok)throw new Error('Unable to read tournament for deletion');
    const record=await response.json();if(!ksmCanManageLibraryTournament(id))return;
    ksmOpenCloudModal('Delete Tournament',{kind:'delete',libraryId:id,name:record.payload?.setup?.tName||'',devices:null,busy:false,error:''});
  }catch(err){showKsmToast(err.message,4000,true)}
}
function ksmDownloadDeleteBackup(){
  const id=ksmShellDialogsState().cloud?.body?.libraryId;
  if(id)return ksmExportLibraryTournament(id,'file');
  manualSaveTournament();
}
/* ksm:post-split-end */
