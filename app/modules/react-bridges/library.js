// @ts-check
import {connectCloudSocket,ksmAccount,ksmLibraryAuthInvalid,ksmReadHeaders,ksmVisibleLibrary,readTournamentLibrary,setSessionRole} from '../auth/auth0-access.js';
import {esc} from '../html-text.js';
import {ksmIsExplicitSpectatorUrl,ksmLinkParams} from '../links/path-urls.js';
import {navigateTo,show} from '../navigation.js';
import {ksmOpenCloudModal,ksmOpenDeleteTournament,ksmShellDialogsState} from './shell.js';
import {ksmPrintRenderer} from '../results/print.js';
import {installRoleBanner,isReadOnlySession,v316StaffPassword} from '../session/staff-session-and-library.js';
import {KSM_DETACHED_DRAFT_KEY,ksmCanLeaveTournament,ksmLibraryReturnView,ksmRefreshTournamentChip,ksmResetTournament} from '../session/tournament-switcher.js';
import {applyTournamentPayload,manualSaveTournament,showKsmToast,tournamentFileProblem} from '../sync/cloud-realtime-save-and-load.js';
import {cloudSession,downloadJson,ksmClearAutosave,ksmStoreAutosave,updateSaveStatus} from '../sync/cloud-session-and-autosave.js';
import {KSM_AUTOSAVE_CLOUD_ID,KSM_SAVE_KEY,cloudBaseFor} from '../sync/sync-state-and-rebase.js';
// ==========================================================
// React Tournament Library (app/react/features/library/, roadmap M.13)
// The Tournament Library, the home page the app boots to (#home, body.ksm-home), is drawn by one
// React island: the contents of #home .home-shell (the brand, "Your Tournaments" with
// ＋ New Tournament, and #homeTournamentLibrary with a card per tournament or one message),
// mounted by app/react/features/library/main.tsx. The legacy code still decides what is shown and
// when: showHomePage() and renderHomeTournamentLibrary() (app/modules/session/staff-session-and-library.js, app/modules/auth) show the
// device's cache, ask the cloud (the list, or discover with the cached IDs) and paint the answer,
// the error or offline line.
// #136 step 2: the input the island draws (the cards, the message, the draft summary and the
// account fields) is computed by app/react/features/library/publish.ts (startLibraryInput(), which
// main.tsx calls before the island mounts). What stays here is what other classic code reads or
// runs synchronously: the draft (ksmReadLocalDraft(), ksmOpenLocalDraft(), the removal in
// ksmDiscardLocalDraft()), the staff tokens (ksmLibraryStaffTokens, which 54- reads through
// ksmCanManageLibraryTournament(); a top-level const, so ksmLibraryAuthorizedIds() hands the
// module its IDs), the actions, and the signal:
// - ksmRenderLibrary(list,message), called by paintHomeTournamentLibrary(list,message) (33) and
//   by 44-react-shell.js, records the request (window.ksmLibraryRequested) and dispatches ksm:library;
//   publish.ts computes window.ksmLibraryInput from it (what libraryCardMarkup() read, in the same
//   order: list.length, then each row's id and name; tests/golden/library/*.json, recorded from the
//   legacy renderer, pin the result). A listener's exception would be swallowed, and a reply that is not a
//   list must still fail at the caller (renderHomeTournamentLibrary() paints inside a try and its
//   catch shows "Unable to load the Tournament Library"), so the module stores the error in
//   window.ksmLibraryError and the stub rethrows it. The input then stays as it was.
// - ksmDecorateLibraryInput(input) is the hook that adds the account
//   fields; the module calls it on every build (it is not kept at start-up).
// The island's buttons call createNewTournament() and openTournamentFromHome(id) (33), as the
// inline handlers did. The legacy library renderer (the DOM writing of
// paintHomeTournamentLibrary(), libraryCardMarkup()) was removed in M.13.
// Draft recovery is explicit and never runs while following a tournament or display link.
export function ksmReadLocalDraft(){
  const params=ksmLinkParams();
  if(params.get('tournament')||params.get('spectator')||['tv','overlay'].includes(params.get('view'))||ksmIsExplicitSpectatorUrl()||params.get('role')==='spectator')return null;
  try{
    const detached=JSON.parse(localStorage.getItem(KSM_DETACHED_DRAFT_KEY)||'null');
    if(detached?.state)return detached;
  }catch(_){}
  // An active local tournament keeps its safety copy; only detached drafts can be discarded.
  if(v316StaffPassword())return null;
  try{
    const payload=JSON.parse(localStorage.getItem(KSM_SAVE_KEY)||'null');
    if(!payload?.state||localStorage.getItem(KSM_AUTOSAVE_CLOUD_ID)||cloudSession.tournamentId)return null;
    return payload;
  }catch(_){return null}
}
export async function ksmOpenLocalDraft(){
  const payload=ksmReadLocalDraft();if(!payload)return;
  if(!(await ksmCanLeaveTournament()))return;
  ksmResetTournament();localStorage.removeItem(KSM_DETACHED_DRAFT_KEY);
  history.pushState(null,'','/');
  document.body.classList.remove('ksm-home');setSessionRole('staff');installRoleBanner('staff');applyTournamentPayload(payload,false);ksmStoreAutosave(payload);
  updateSaveStatus('Restored autosave');navigateTo('setup');
}
export function ksmDiscardLocalDraft(){
  if(!ksmReadLocalDraft())return;
  if(localStorage.getItem(KSM_DETACHED_DRAFT_KEY))localStorage.removeItem(KSM_DETACHED_DRAFT_KEY);
  else ksmClearAutosave();
  // Signal the last request again: the module recomputes the input (the draft is gone, so the summary is
  // null; the other fields are worked out now, not copied). Nothing was drawn before a request: nothing to do.
  if(window.ksmLibraryRequested)ksmSignalLibrary();
}

// If the React module does not load, the library shows a notice (the end of this file).
// ==========================================================
// The signal stub. Clears the error, dispatches ksm:library (publish.ts computes the input) and
// rethrows an error the module stored, so a failure reaches the caller as it did when the build ran here.
function ksmSignalLibrary(){
  window.ksmLibraryError=null;
  window.dispatchEvent(new CustomEvent('ksm:library'));
  if(window.ksmLibraryError){const e=window.ksmLibraryError;window.ksmLibraryError=null;throw e}
}
// paintHomeTournamentLibrary(list,message): the cards, or the message when there are none.
export function ksmRenderLibrary(list,message){
  window.ksmLibraryRequested={list,message};
  ksmSignalLibrary();
}
// The hook that adds the account fields to the input; the module calls it on the input it built.
// The original (no account) and, below it, the final function: the account rules that 54-auth0-access.js used to add by
// reassigning it at load (step 3d of #136; app/js no longer reassigns anything). No account can be enabled before
// initAuth0Access() runs, so until then the final function does what the original did.
function ksmAccountDecorateLibrary(input){return input}
export function ksmDecorateLibraryInput(input){
  if(ksmAccount.enabled&&input?.kind==='library'){
    const admin=!ksmLibraryAuthInvalid&&ksmAccount.globalRole==='admin'&&!!ksmAccount.token;
    const creator=!ksmLibraryAuthInvalid&&['admin','creator'].includes(ksmAccount.globalRole)&&!!ksmAccount.token;
    const active=ksmVisibleLibrary.find(row=>row.id===input.activeId);
    input={...input,hasActive:!!input.hasActive&&!!active&&!!cloudBaseFor(cloudSession.revision),activeName:active?.name||'',authEnabled:true,accountEmail:ksmAccount.email,accountRole:ksmAccount.globalRole,authInvalid:ksmLibraryAuthInvalid,canCreate:creator,canDelete:admin,accessLabels:Object.fromEntries(ksmVisibleLibrary.map(row=>[row.id,row.role])),authorizedIds:ksmLibraryAuthInvalid?[]:ksmVisibleLibrary.filter(row=>admin||row.canManage).map(row=>row.id)};
  }
  return ksmAccountDecorateLibrary(input);
}
// The IDs of the Library rows with a Staff token (ksmLibraryStaffTokens is a top-level const, so not on window).
export function ksmLibraryAuthorizedIds(){return [...ksmLibraryStaffTokens.keys()]}

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
export const ksmLibraryStaffTokens=new Map();
function ksmAccountManageLibrary(id){return (id===cloudSession.tournamentId&&!isReadOnlySession())||ksmLibraryStaffTokens.has(id)}
// Final function (the account rules of app/js/54-auth0-access.js, step 3d of #136; same reason as ksmDecorateLibraryInput()).
export function ksmCanManageLibraryTournament(id){return ksmAccount.enabled?!ksmLibraryAuthInvalid&&!!ksmAccount.token&&!!ksmVisibleLibrary.find(row=>row.id===id)?.canManage:ksmAccountManageLibrary(id)}
export async function ksmAuthorizeLibraryTournament(id){
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
export function ksmReturnFromLibrary(){
  if(!cloudSession.tournamentId&&!v316StaffPassword())return;
  document.body.classList.remove('ksm-home');show(isReadOnlySession()?'public':ksmLibraryReturnView);connectCloudSocket();ksmRefreshTournamentChip();
}
export async function ksmExportLibraryTournament(id,kind){
  if(!ksmCanManageLibraryTournament(id))return;
  try{
    const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}`,{cache:'no-store',headers:ksmReadHeaders()});
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
export async function ksmDeleteLibraryTournament(id){
  if(!ksmCanManageLibraryTournament(id))return;
  if(id===cloudSession.tournamentId&&!isReadOnlySession()){ksmOpenDeleteTournament();return}
  try{
    const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}`,{cache:'no-store',headers:ksmReadHeaders()});
    if(!response.ok)throw new Error('Unable to read tournament for deletion');
    const record=await response.json();if(!ksmCanManageLibraryTournament(id))return;
    ksmOpenCloudModal('Delete Tournament',{kind:'delete',libraryId:id,name:record.payload?.setup?.tName||'',devices:null,busy:false,error:''});
  }catch(err){showKsmToast(err.message,4000,true)}
}
export function ksmDownloadDeleteBackup(){
  const id=ksmShellDialogsState().cloud?.body?.libraryId;
  if(id)return ksmExportLibraryTournament(id,'file');
  manualSaveTournament();
}

// Load-time side effect (app/js/34-bootstrap.js runs it, in the order the files used to load).
export function initLibraryBridge(){
  document.addEventListener('DOMContentLoaded',ksmShowLibraryModuleMissing);
}
