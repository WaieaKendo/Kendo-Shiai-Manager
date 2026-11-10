// @ts-check
import {ksmAccountCacheTournament,ksmAccountFetchTournament} from '../links/friendly-links.js';
import {ksmIsExplicitSpectatorUrl,ksmLinkParams} from '../links/path-urls.js';
import {KSM_STAFF_TOURNAMENT,KSM_V316_STAFF_SESSION,initializeCloudRoleFromUrl,installRoleBanner,isReadOnlySession,ksmAccountExpire,ksmAccountHeaders,ksmAccountLoad,ksmAccountReadLibrary,ksmAccountRenderLibrary,ksmAccountSetRole,ksmAccountSocketUrl,ksmAccountToggleStaff,ksmAccountWriteLibrary,paintHomeTournamentLibrary,v316StaffPassword} from '../session/staff-session-and-library.js';
import {ksmAccountCreate,ksmAccountFailedStartup,ksmShowLibrary,setKsmStartupHasCache,setKsmStartupLoadFailed} from '../session/tournament-switcher.js';
import {disconnectCloudSocket,ksmAccountConnect,ksmAccountFileAsNew,ksmCloudSocket,mergeQueuedStaffWork,showKsmToast} from '../sync/cloud-realtime-save-and-load.js';
import {cloudSession,ksmSessionRole,writeOutbox} from '../sync/cloud-session-and-autosave.js';
// Auth0 accounts in the legacy app (step 3d of #136, from app/js/54-auth0-access.js). Its load-time side effects
// (the auth-ready promise, window.ksmAuthBridge) are initAuth0Access(), which app/js/54-auth0-access.js runs where
// this file used to load; that file also keeps the account rules of the app/js functions that have not moved
// (ksmCanDeleteTournament, ksmCanManageLibraryTournament, ksmDecorateLibraryInput) and the ready-UI reveal.
//
// Until step 3d this file replaced functions of earlier files at load (`var ksmAccountX=X; X=function(){...}`).
// Those functions and their originals are all modules now, so each X below is the final function and calls its
// original under the ksmAccountX name it had here. No call reached an original between its file and this one
// (34-bootstrap.js only calls initializeCloudRoleFromUrl(), which awaits before anything else), and with no account
// (ksmAccount.enabled false, as until the account module runs) every X below does what its original did.
// The SDK lives in the module bundle. This bridge keeps legacy scoring on its existing staff /
// spectator model; the server alone decides whether an account has tournament access.
export const ksmAccount={enabled:false,token:'',role:'spectator',globalRole:'spectator',tournamentId:'',email:'',passwordFallback:true};
/** Resolved by the account module (window.ksmResolveAuthReady); created by initAuth0Access(). @type {Promise<void>} */
export let ksmAuthReady;
export function ksmUsesAccountAuth(){return ksmAccount.enabled}
export function ksmReadHeaders(){return typeof ksmAccount!=='undefined'&&ksmAccount.enabled&&ksmAccount.token?{authorization:`Bearer ${ksmAccount.token}`}:{}}
function ksmAccountCanEdit(){
  const params=ksmLinkParams();
  if(params.get('view')==='tv'||params.get('role')==='spectator'||params.has('spectator')||ksmIsExplicitSpectatorUrl())return false;
  return !ksmLibraryAuthInvalid&&!!ksmAccount.token&&(ksmAccount.globalRole==='admin'||(['owner','director'].includes(ksmAccount.role)&&ksmAccount.tournamentId===cloudSession.tournamentId));
}
function ksmAccountChanged(){
  document.body.classList.toggle('ksm-account-signed-in',!!ksmAccount.email);
  document.body.classList.toggle('ksm-account-enabled',ksmAccount.enabled);
  setSessionRole(v316StaffPassword()?'staff':'spectator');
  window.dispatchEvent(new CustomEvent('ksm:account'));
}
export function setSessionRole(role){
  ksmAccountSetRole(ksmAccountCanEdit()?'staff':ksmAccount.enabled&&!ksmAccount.passwordFallback?'spectator':role);
  window.dispatchEvent(new CustomEvent('ksm:account'));
}
export function toggleStaffSession(){
  if(ksmAccountCanEdit()){/** @type {HTMLElement|null} */(document.querySelector('[data-testid=auth0-sign-in]'))?.click();return}
  if(ksmAccount.enabled&&!ksmAccount.passwordFallback){/** @type {HTMLElement|null} */(document.querySelector('[data-testid=auth0-sign-in]'))?.click();return}
  return ksmAccountToggleStaff();
}
export function cloudHeaders(){const headers=ksmAccountHeaders();if(ksmAccount.enabled&&ksmAccount.token)headers.authorization=`Bearer ${ksmAccount.token}`;return headers}
export function cloudSocketUrl(id){const url=new URL(ksmAccountSocketUrl(id));if(ksmAccount.enabled&&ksmAccount.token){url.searchParams.delete('key');url.searchParams.set('access_token',ksmAccount.token)}return url.toString()}
export async function loadTournamentFromCloud(id,options={}){
  await ksmAuthReady;
  if(window.ksmRefreshAccount)await window.ksmRefreshAccount(id);
  let record;
  try{record=await ksmAccountLoad(id,options);document.getElementById('startupLoadFailure')?.remove()}catch(error){if(error?.code==='tournament-private')ksmKeepFailedStartup(error);throw error}
  window.dispatchEvent(new CustomEvent('ksm:account'));
  return record;
}
export function connectCloudSocket(){
  ksmAccountConnect();
  const socket=/** @type {any} */(ksmCloudSocket),id=cloudSession.tournamentId;
  if(!ksmAccount.enabled||!socket||socket.ksmPrivacyListener)return;
  socket.ksmPrivacyListener=true;
  socket.addEventListener('close',event=>{
    if(!['Visibility changed','Access changed'].includes(event.reason)||id!==cloudSession.tournamentId)return;
    ksmPrivateFetch(id).catch(error=>{if(id===cloudSession.tournamentId&&error?.code==='tournament-private')ksmKeepFailedStartup(error)});
  });
}
export async function ksmCreateTournament(){
  await ksmAuthReady;
  if(ksmAccount.enabled&&(!['admin','creator'].includes(ksmAccount.globalRole)||ksmLibraryAuthInvalid)){alert('Sign in as an Admin or Creator to create a tournament.');return}
  const result=await ksmAccountCreate();
  if(ksmAccount.enabled&&cloudSession.tournamentId){await window.ksmRefreshAccount?.(cloudSession.tournamentId);window.ksmAuthBridge.refreshUi()}
  return result;
}
export async function loadTournamentFileAsNew(){
  if(ksmAccount.enabled&&(!['admin','creator'].includes(ksmAccount.globalRole)||ksmLibraryAuthInvalid)){alert('Sign in as an Admin or Creator to load a new tournament.');return}
  const result=await ksmAccountFileAsNew();
  if(ksmAccount.enabled&&cloudSession.tournamentId){await window.ksmRefreshAccount?.(cloudSession.tournamentId);window.ksmAuthBridge.refreshUi()}
  return result;
}
// The library this account may see (/api/tournaments) and whether the server rejected its sign-in. Assigned only
// here; app/js/54-auth0-access.js reads them.
export let ksmVisibleLibrary=[],ksmLibraryAuthInvalid=false;
export function readTournamentLibrary(){return ksmAccount.enabled?ksmVisibleLibrary:ksmAccountReadLibrary()}
export function writeTournamentLibrary(list){if(!ksmAccount.enabled)return ksmAccountWriteLibrary(list)}
export async function renderHomeTournamentLibrary(){
  if(!ksmAccount.enabled)return ksmAccountRenderLibrary();
  const token=ksmAccount.token;
  paintHomeTournamentLibrary([], 'Loading tournaments…');
  try{
    const response=await fetch('/api/tournaments',{headers:token?{authorization:`Bearer ${token}`}:{},cache:'no-store'});
    if(!response.ok)throw new Error('Unable to load tournaments.');
    const list=await response.json();
    if(token!==ksmAccount.token)return;
    const wasInvalid=ksmLibraryAuthInvalid;
    ksmLibraryAuthInvalid=response.headers.get('x-ksm-auth')==='invalid';
    if(ksmLibraryAuthInvalid)window.dispatchEvent(new CustomEvent('ksm:library-auth-invalid'));
    if(wasInvalid!==ksmLibraryAuthInvalid)ksmAccountChanged();
    ksmVisibleLibrary=list;paintHomeTournamentLibrary(list,'No tournaments available.');
  }catch(_){paintHomeTournamentLibrary([],'Unable to load tournaments. Check your connection.');}
}
export async function ksmFetchTournament(id){await ksmAuthReady;if(!ksmAccount.enabled)return ksmAccountFetchTournament(id);return ksmPrivateFetch(id)}
async function ksmPrivateFetch(id){
  if(!navigator.onLine){const cached=JSON.parse(localStorage.getItem('ksm.tournament.record:'+id)||'null');if(cached?.isPublic===true)return new Response(JSON.stringify(cached),{headers:{'content-type':'application/json'}});throw new Error('No public offline copy of this tournament is available');}
  const headers=ksmAccount.token?{authorization:`Bearer ${ksmAccount.token}`}:{...cloudHeaders()};
  const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}`,{headers,cache:'no-store'});
  if(response.status===403){localStorage.removeItem('ksm.tournament.record:'+id);throw Object.assign(new Error('Tournament not viewable (403)'),{code:'tournament-private'});}
  return response;
}
export function ksmCacheTournament(record){if(record.isPublic===false){localStorage.removeItem('ksm.tournament.record:'+record.tournamentId);return}if(ksmAccount.enabled&&record.isPublic!==true)return;return ksmAccountCacheTournament(record)}
export function ksmKeepFailedStartup(error){
  if(error?.code!=='tournament-private')return ksmAccountFailedStartup(error);
  setKsmStartupLoadFailed(true);setKsmStartupHasCache(false);disconnectCloudSocket();
  ksmAccount.role='spectator';ksmAccount.globalRole='spectator';ksmAccount.passwordFallback=false;setSessionRole('spectator');
  document.body.classList.remove('ksm-home','ksm-tv');
  document.querySelectorAll('main section.view').forEach(el=>el.classList.add('hidden'));
  document.getElementById('startupLoadFailure')?.remove();
  const notice=document.createElement('div');notice.id='startupLoadFailure';notice.className='card';notice.setAttribute('role','status');notice.dataset.testid='tournament-not-viewable';
  const title=document.createElement('h1');title.textContent='Tournament not viewable';
  const text=document.createElement('p');text.textContent=ksmAccount.email?'This tournament is private. Your account does not have access. Ask an admin to appoint you as a director.':'This tournament is private. Sign in with an account that can manage it.';
  const login=document.createElement('button');login.textContent=ksmAccount.email?'Switch account':'Sign in';login.onclick=()=>window.dispatchEvent(new CustomEvent('ksm:sign-in'));
  const back=document.createElement('button');back.textContent='Tournament Library';back.onclick=()=>ksmShowLibrary();
  notice.append(title,text,login,back);document.querySelector('main').prepend(notice);return true;
}
export function ksmExpireStaffSession(payload){
  if(ksmAccountCanEdit()){
    if(payload)writeOutbox(payload,'Sign-in expired');
    ksmAccount.token='';ksmAccount.role='spectator';ksmAccount.globalRole='spectator';
    ksmAccountChanged();disconnectCloudSocket();connectCloudSocket();
    showKsmToast('Sign in again to send your saved changes.',4000,true);return;
  }
  return ksmAccountExpire(payload);
}
export function ksmRevealReadyUi(){document.documentElement.classList.add('ksm-ui-ready')}
// Load-time side effects (the auth-ready promise and its resolver on window, the bridge the account module uses),
// run from app/js where this file was loaded.
export function initAuth0Access(){
ksmAuthReady=new Promise(resolve=>{window.ksmResolveAuthReady=resolve});
window.ksmAuthBridge={
  state:()=>ksmAccount,
  tournament:()=>cloudSession.tournamentId||'',
  name:()=>/** @type {HTMLInputElement|null} */(document.getElementById('tName'))?.value||'Tournament',
  update:patch=>{const previous=ksmAccount.token,wasEnabled=ksmAccount.enabled;Object.assign(ksmAccount,patch);ksmAccountChanged();if(previous!==ksmAccount.token||wasEnabled!==ksmAccount.enabled){ksmVisibleLibrary=[];if(document.body.classList.contains('ksm-home'))renderHomeTournamentLibrary()}},
  library:()=>renderHomeTournamentLibrary(),
  restore:()=>initializeCloudRoleFromUrl(),
  reconnect:()=>{disconnectCloudSocket();connectCloudSocket()},
  refreshUi:()=>{if(!isReadOnlySession())mergeQueuedStaffWork();installRoleBanner(ksmSessionRole)},
  clearStaff:()=>{sessionStorage.removeItem(KSM_V316_STAFF_SESSION);sessionStorage.removeItem(KSM_STAFF_TOURNAMENT)},
  headers:()=>cloudHeaders()
};
}
