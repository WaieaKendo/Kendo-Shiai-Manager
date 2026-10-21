/* ksm:post-split-begin auth0-access */
// The SDK lives in the module bundle. This bridge keeps legacy scoring on its existing staff /
// spectator model; the server alone decides whether an account has tournament access.
var ksmAccount={enabled:false,token:'',role:'spectator',globalRole:'spectator',tournamentId:'',email:'',passwordFallback:true};
var ksmAuthReady=new Promise(resolve=>{window.ksmResolveAuthReady=resolve});
function ksmUsesAccountAuth(){return ksmAccount.enabled}
function ksmReadHeaders(){return typeof ksmAccount!=='undefined'&&ksmAccount.enabled&&ksmAccount.token?{authorization:`Bearer ${ksmAccount.token}`}:{}}
function ksmAccountCanEdit(){
  const params=ksmLinkParams();
  if(params.get('view')==='tv'||params.get('role')==='spectator'||params.has('spectator')||ksmExplicitSpectatorUrl)return false;
  return !!ksmAccount.token&&(ksmAccount.globalRole==='admin'||(ksmAccount.role==='director'&&ksmAccount.tournamentId===cloudSession.tournamentId));
}
function ksmAccountChanged(){
  document.body.classList.toggle('ksm-account-signed-in',!!ksmAccount.email);
  setSessionRole(v316StaffPassword()?'staff':'spectator');
  window.dispatchEvent(new CustomEvent('ksm:account'));
}
window.ksmAuthBridge={
  state:()=>ksmAccount,
  tournament:()=>cloudSession.tournamentId||'',
  name:()=>document.getElementById('tName')?.value||'Tournament',
  update:patch=>{const previous=ksmAccount.token;Object.assign(ksmAccount,patch);ksmAccountChanged();if(previous!==ksmAccount.token){ksmVisibleLibrary=[];if(document.body.classList.contains('ksm-home'))renderHomeTournamentLibrary()}},
  library:()=>renderHomeTournamentLibrary(),
  restore:()=>initializeCloudRoleFromUrl(),
  reconnect:()=>{disconnectCloudSocket();connectCloudSocket()},
  refreshUi:()=>{if(!isReadOnlySession())mergeQueuedStaffWork();installRoleBanner(ksmSessionRole)},
  clearStaff:()=>{sessionStorage.removeItem(KSM_V316_STAFF_SESSION);sessionStorage.removeItem(KSM_STAFF_TOURNAMENT)},
  headers:()=>cloudHeaders()
};
var ksmAccountSetRole=setSessionRole;
setSessionRole=function(role){
  ksmAccountSetRole(ksmAccountCanEdit()?'staff':ksmAccount.enabled&&!ksmAccount.passwordFallback?'spectator':role);
  window.dispatchEvent(new CustomEvent('ksm:account'));
};
var ksmAccountToggleStaff=toggleStaffSession;
toggleStaffSession=function(){
  if(ksmAccountCanEdit()){document.querySelector('[data-testid=auth0-sign-in]')?.click();return}
  if(ksmAccount.enabled&&!ksmAccount.passwordFallback){document.querySelector('[data-testid=auth0-sign-in]')?.click();return}
  return ksmAccountToggleStaff();
};
var ksmAccountHeaders=cloudHeaders;
cloudHeaders=function(){const headers=ksmAccountHeaders();if(ksmAccountCanEdit())headers.authorization=`Bearer ${ksmAccount.token}`;return headers};
var ksmAccountSocketUrl=cloudSocketUrl;
cloudSocketUrl=function(id){const url=new URL(ksmAccountSocketUrl(id));if(ksmAccount.enabled&&ksmAccount.token){url.searchParams.delete('key');url.searchParams.set('access_token',ksmAccount.token)}return url.toString()};
var ksmAccountLoad=loadTournamentFromCloud;
loadTournamentFromCloud=async function(id,options={}){
  await ksmAuthReady;
  if(window.ksmRefreshAccount)await window.ksmRefreshAccount(id);
  let record;
  try{record=await ksmAccountLoad(id,options);document.getElementById('startupLoadFailure')?.remove()}catch(error){if(error?.code==='tournament-private')ksmKeepFailedStartup(error);throw error}
  window.dispatchEvent(new CustomEvent('ksm:account'));
  return record;
};
var ksmAccountConnect=connectCloudSocket;
connectCloudSocket=function(){
  ksmAccountConnect();
  const socket=ksmCloudSocket,id=cloudSession.tournamentId;
  if(!ksmAccount.enabled||!socket||socket.ksmPrivacyListener)return;
  socket.ksmPrivacyListener=true;
  socket.addEventListener('close',event=>{
    if(!['Visibility changed','Access changed'].includes(event.reason)||id!==cloudSession.tournamentId)return;
    ksmPrivateFetch(id).catch(error=>{if(id===cloudSession.tournamentId&&error?.code==='tournament-private')ksmKeepFailedStartup(error)});
  });
};
var ksmAccountCreate=ksmCreateTournament;
ksmCreateTournament=async function(){
  await ksmAuthReady;
  if(ksmAccount.enabled&&ksmAccount.globalRole!=='admin'){alert('Sign in as an Admin to create a tournament.');return}
  return ksmAccountCreate();
};
var ksmAccountCanDelete=ksmCanDeleteTournament;
ksmCanDeleteTournament=function(){return ksmAccount.enabled?ksmAccount.globalRole==='admin'&&!!ksmAccount.token&&!!cloudSession.tournamentId:ksmAccountCanDelete()};
var ksmAccountManageLibrary=ksmCanManageLibraryTournament;
ksmCanManageLibraryTournament=function(id){return ksmAccount.enabled&&ksmAccount.globalRole==='admin'&&!!ksmAccount.token||ksmAccountManageLibrary(id)};
var ksmAccountPublishLibrary=ksmPublishLibrary;
ksmPublishLibrary=function(input){
  if(ksmAccount.enabled&&input?.kind==='library'){
    const admin=ksmAccount.globalRole==='admin'&&!!ksmAccount.token;
    const active=ksmVisibleLibrary.find(row=>row.id===input.activeId);
    input={...input,hasActive:!!input.hasActive&&!!active&&!!cloudBaseFor(cloudSession.revision),activeName:active?.name||'',authEnabled:true,accountEmail:ksmAccount.email,accountRole:ksmAccount.globalRole,canCreate:admin,canDelete:admin,authorizedIds:ksmVisibleLibrary.filter(row=>admin||row.canManage).map(row=>row.id)};
  }
  return ksmAccountPublishLibrary(input);
};
var ksmVisibleLibrary=[];
var ksmAccountReadLibrary=readTournamentLibrary;
readTournamentLibrary=function(){return ksmAccount.enabled?ksmVisibleLibrary:ksmAccountReadLibrary()};
var ksmAccountWriteLibrary=writeTournamentLibrary;
writeTournamentLibrary=function(list){if(!ksmAccount.enabled)return ksmAccountWriteLibrary(list)};
var ksmAccountRenderLibrary=renderHomeTournamentLibrary;
renderHomeTournamentLibrary=async function(){
  if(!ksmAccount.enabled)return ksmAccountRenderLibrary();
  const token=ksmAccount.token;
  paintHomeTournamentLibrary([], 'Loading tournaments…');
  try{
    const response=await fetch('/api/tournaments',{headers:token?{authorization:`Bearer ${token}`}:{},cache:'no-store'});
    if(!response.ok)throw new Error('Unable to load tournaments.');
    const list=await response.json();
    if(token!==ksmAccount.token)return;
    ksmVisibleLibrary=list;paintHomeTournamentLibrary(list,'No tournaments available.');
  }catch(_){paintHomeTournamentLibrary([],'Unable to load tournaments. Check your connection.');}
};
var ksmAccountFetchTournament=ksmFetchTournament;
ksmFetchTournament=async function(id){if(!ksmAccount.enabled)return ksmAccountFetchTournament(id);return ksmPrivateFetch(id)};
async function ksmPrivateFetch(id){
  const headers=ksmAccount.token?{authorization:`Bearer ${ksmAccount.token}`}:{...cloudHeaders()};
  const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}`,{headers,cache:'no-store'});
  if(response.status===403){localStorage.removeItem('ksm.tournament.record:'+id);throw Object.assign(new Error('Tournament not viewable (403)'),{code:'tournament-private'});}
  return response;
}
var ksmAccountCacheTournament=ksmCacheTournament;
ksmCacheTournament=function(record){if(ksmAccount.enabled||record.isPublic===false){localStorage.removeItem('ksm.tournament.record:'+record.tournamentId);return}return ksmAccountCacheTournament(record)};
var ksmAccountFailedStartup=ksmKeepFailedStartup;
ksmKeepFailedStartup=function(error){
  if(error?.code!=='tournament-private')return ksmAccountFailedStartup(error);
  ksmStartupLoadFailed=true;ksmStartupHasCache=false;disconnectCloudSocket();
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
};
var ksmAccountExpire=ksmExpireStaffSession;
ksmExpireStaffSession=function(payload){
  if(ksmAccountCanEdit()){
    if(payload)writeOutbox(payload,'Sign-in expired');
    ksmAccount.token='';ksmAccount.role='spectator';ksmAccount.globalRole='spectator';
    ksmAccountChanged();disconnectCloudSocket();connectCloudSocket();
    showKsmToast('Sign in again to send your saved changes.',4000,true);return;
  }
  return ksmAccountExpire(payload);
};
function ksmRevealReadyUi(){document.documentElement.classList.add('ksm-ui-ready')}
Promise.all([ksmBootstrapInitialization,ksmAuthReady]).then(ksmRevealReadyUi,ksmRevealReadyUi);
// Preserve the existing module-load failure notices when the account module cannot run.
document.addEventListener('DOMContentLoaded',()=>{if(!window.ksmShellMounted)ksmRevealReadyUi()});
/* ksm:post-split-end */
