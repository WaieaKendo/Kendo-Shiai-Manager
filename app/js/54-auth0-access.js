/* ksm:post-split-begin auth0-access */
// The SDK lives in the module bundle. This bridge keeps legacy scoring on its existing staff /
// spectator model; the server alone decides whether an account has tournament access.
var ksmAccount={enabled:false,token:'',role:'spectator',globalRole:'spectator',tournamentId:'',email:'',passwordFallback:true};
var ksmAuthReady=new Promise(resolve=>{window.ksmResolveAuthReady=resolve});
function ksmAccountCanEdit(){
  const params=ksmLinkParams();
  if(params.get('view')==='tv'||params.get('role')==='spectator'||params.has('spectator')||ksmExplicitSpectatorUrl)return false;
  return !!ksmAccount.token&&(ksmAccount.globalRole==='admin'||(ksmAccount.role==='director'&&ksmAccount.tournamentId===cloudSession.tournamentId));
}
function ksmAccountChanged(){
  setSessionRole(v316StaffPassword()?'staff':'spectator');
  window.dispatchEvent(new CustomEvent('ksm:account'));
}
window.ksmAuthBridge={
  state:()=>ksmAccount,
  tournament:()=>cloudSession.tournamentId||'',
  name:()=>document.getElementById('tName')?.value||'Tournament',
  update:patch=>{Object.assign(ksmAccount,patch);ksmAccountChanged()},
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
cloudSocketUrl=function(id){const url=new URL(ksmAccountSocketUrl(id));if(ksmAccountCanEdit()){url.searchParams.delete('key');url.searchParams.set('access_token',ksmAccount.token)}return url.toString()};
var ksmAccountLoad=loadTournamentFromCloud;
loadTournamentFromCloud=async function(id,options={}){
  await ksmAuthReady;
  if(window.ksmRefreshAccount)await window.ksmRefreshAccount(id);
  const record=await ksmAccountLoad(id,options);
  window.dispatchEvent(new CustomEvent('ksm:account'));
  return record;
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
    input={...input,canDelete:admin,...(admin?{authorizedIds:input.cards.map(card=>card.id)}:{})};
  }
  return ksmAccountPublishLibrary(input);
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
/* ksm:post-split-end */
