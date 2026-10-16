/* ksm:post-split-begin tournament-switcher */
// Issue #42: all tournament boundaries share the save gate and the same reset.
let ksmTournamentTransition=false;
function ksmRefreshTournamentChip(){
  ksmPublishHeader({tournamentName:document.body.classList.contains('ksm-home')?'':String(document.getElementById('tName')?.value||'Untitled tournament')});
}
function ksmPushTournamentAddress(id){
  const path=KSMEngine.routePath({screen:'tournament',id});
  if(location.pathname!==path)history.pushState(null,'',path);
}
async function ksmCanLeaveTournament(){
  if(isReadOnlySession()&&!readOutbox()&&!ksmCloudSaveInFlight)return true;
  if(ksmCloudSaveInFlight||ksmCloudSavePending||localChangesPending()||readOutbox()){
    if(!isReadOnlySession())await saveTournamentToCloudWithReason('Before switching tournament',true);
    if(ksmCloudSaveInFlight||ksmCloudSavePending||localChangesPending()||readOutbox()){
      alert('This tournament has changes that could not be saved. Connect to the internet and use Save Now (or Staff Login), then switch again. Your work is still here.');
      return false;
    }
  }
  return true;
}
function ksmResetTournament(){
  const id=cloudSession.tournamentId||'local';
  disconnectCloudSocket();
  clearTimeout(ksmSaveTimer);ksmSaveTimer=null;clearTimeout(ksmCloudTimer);ksmCloudTimer=null;
  clearTimeout(ksmQueuedSaveRetryTimer);ksmQueuedSaveRetryTimer=null;ksmQueuedSaveRetryAttempt=0;
  clearTimeout(ksmDeferredRemoteTimer);ksmDeferredRemoteRecord=null;
  clearTimeout(ksmDeferredSyncTimer);ksmDeferredSyncTimer=null;ksmDeferredSyncRecord=null;
  clearTimeout(directorRefreshTimer);directorRefreshTimer=null;
  clearLocalCourtDivisions();
  for(const store of [localStorage,sessionStorage]){
    for(const key of Object.keys(store)){
      if(key.startsWith(`${KSM_PINNED_COURT_PREFIX}:${id}:`)||key.startsWith(`ksm:match-timer:["${id}",`))store.removeItem(key);
    }
  }
  sessionStorage.removeItem(KSM_V316_STAFF_SESSION);
  localStorage.removeItem(KSM_SAVE_KEY);
  clearOutbox();
  Object.keys(cloudSession).forEach(key=>{if(!['clientId','clientName'].includes(key))delete cloudSession[key]});
  cloudSession.tournamentId=null;cloudSession.revision=0;cloudSession.court='';cloudSession.presence=[];persistCloudSession();
  KSM_CLOUD_BASE.revision=-1;KSM_CLOUD_BASE.payload=null;
  ksmLocalMutationVersion=0;ksmConfirmedMutationVersion=0;ksmOutboxMutationVersion=0;
  ksmLastSuccessfulSaveAt=0;ksmSaveStatusMode='idle';
  Object.keys(state).forEach(key=>delete state[key]);Object.assign(state,JSON.parse(KSM_EMPTY_STATE));
  applySetupSnapshot(KSM_EMPTY_SETUP);
  document.body.classList.remove('ksm-tv');
  setSessionRole('spectator');closeNavMenus();closeCloudModal();
  window.dispatchEvent(new CustomEvent('ksm:tournament-reset'));
  ksmForgotTournament=true;
}
async function ksmShowLibrary(){
  if(ksmTournamentTransition)return false;
  ksmTournamentTransition=true;
  try{
    if(!(await ksmCanLeaveTournament()))return false;
    ksmResetTournament();
    if(location.pathname!=='/'||location.search)history.pushState(null,'','/');
    installRoleBanner('home');document.body.classList.add('ksm-home');
    renderHomeTournamentLibrary();show('home');return true;
  }finally{ksmTournamentTransition=false}
}
async function ksmCreateTournament(){
  if(ksmTournamentTransition)return;
  ksmTournamentTransition=true;
  try{
    if(!(await ksmCanLeaveTournament()))return;
    const name=prompt('Tournament Name','Kendo Tournament');if(!name)return;
    const password=promptNewStaffPassword();if(!password)return;
    ksmResetTournament();
    document.body.classList.remove('ksm-home');
    sessionStorage.setItem(KSM_V316_STAFF_SESSION,password);tName.value=name;
    setSessionRole('staff');installRoleBanner('staff');navigateTo('setup');
    markLocalSave('New tournament');showKsmToast('Creating tournament in cloud…',0);
    try{await performCloudSave(tournamentPayload(),0);showKsmToast('✓ Tournament created',2200)}
    catch(err){console.error(err);writeOutbox(tournamentPayload(),'New tournament');showKsmToast('Tournament saved locally · Connect to sync',3500,true)}
  }finally{ksmTournamentTransition=false}
}
async function ksmOpenTournament(id,fromHistory=false){
  if(ksmTournamentTransition)return;
  ksmTournamentTransition=true;
  try{
    if(!(await ksmCanLeaveTournament()))return false;
    ksmResetTournament();
    if(!fromHistory)ksmPushTournamentAddress(id);
    await initializeCloudRoleFromUrl();return true;
  }catch(err){
    console.error(err);
    if(err?.code!=='tournament-deleted')alert('Unable to open that tournament. Check your connection and retry.');
    history.replaceState(null,'','/');document.body.classList.add('ksm-home');installRoleBanner('home');renderHomeTournamentLibrary();show('home');return false;
  }finally{ksmTournamentTransition=false}
}
window.addEventListener('popstate',async()=>{
  if(!(await ksmCanLeaveTournament())){
    ksmPushTournamentAddress(cloudSession.tournamentId);return;
  }
  ksmResetTournament();
  // initializeCloudRoleFromUrl also applies court / TV link options.
  try{await initializeCloudRoleFromUrl()}catch(err){console.warn(err);history.replaceState(null,'','/');await ksmShowLibrary()}
});
/* ksm:post-split-end */
