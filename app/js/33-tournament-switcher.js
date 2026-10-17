/* ksm:post-split-begin tournament-switcher */
// Issue #42: all tournament boundaries share the save gate and the same reset.
let ksmTournamentTransition=false;
var ksmTournamentEpoch=0;
var ksmFirstLibrary=true;
var ksmTournamentAddress=location.pathname+location.search+location.hash;
function ksmRefreshTournamentChip(){
  ksmPublishHeader({tournamentName:document.body.classList.contains('ksm-home')?'':String(document.getElementById('tName')?.value||'Untitled tournament')});
}
function ksmPushTournamentAddress(id){
  if(!id)return;
  const path=new URL(ksmLinkUrl({screen:'tournament',id})).pathname;
  if(location.pathname!==path)history.pushState(null,'',path);
  ksmTournamentAddress=location.pathname+location.search+location.hash;
}
async function ksmCanLeaveTournament(){
  const pending=ksmCloudSaveInFlight||ksmCloudSavePending||localChangesPending()||readOutbox();
  // Pending drafts with creation credentials still get the normal save attempt.
  // A quiet imported draft or one without credentials has no server confirmation.
  if(!cloudSession.tournamentId&&!document.body.classList.contains('ksm-home')&&localStorage.getItem(KSM_SAVE_KEY)&&(!pending||!v316StaffPassword())){
    alert('This tournament is only saved on this device. Save it to the cloud before switching. You can also download a Tournament File to keep a backup. Your draft is still here.');
    return false;
  }
  if(isReadOnlySession()&&!readOutbox()&&!ksmCloudSaveInFlight)return true;
  if(pending){
    if(!isReadOnlySession()){
      // The immediate save includes the debounced edits; cancel only those existing timers.
      // A new edit during the request schedules its own timer and still blocks the exit.
      clearTimeout(ksmSaveTimer);ksmSaveTimer=null;clearTimeout(ksmCloudTimer);ksmCloudTimer=null;
      await saveTournamentToCloudWithReason('Before switching tournament',true);
    }
    if(ksmCloudSaveInFlight||ksmCloudSavePending||localChangesPending()||readOutbox()){
      alert('This tournament has changes that could not be saved. Connect to the internet and use Save Now (or Staff Login), then switch again. Your work is still here.');
      return false;
    }
  }
  return true;
}
function ksmResetTournament(){
  ksmTournamentEpoch++;
  const id=cloudSession.tournamentId||'local';
  disconnectCloudSocket();ksmTvRefreshInFlight=null;ksmTvLastVerifiedAt=0;
  clearTimeout(ksmSaveTimer);ksmSaveTimer=null;clearTimeout(ksmCloudTimer);ksmCloudTimer=null;
  clearTimeout(ksmQueuedSaveRetryTimer);ksmQueuedSaveRetryTimer=null;ksmQueuedSaveRetryAttempt=0;
  clearTimeout(ksmDeferredRemoteTimer);ksmDeferredRemoteRecord=null;
  clearTimeout(ksmDeferredSyncTimer);ksmDeferredSyncTimer=null;ksmDeferredSyncRecord=null;
  clearTimeout(directorRefreshTimer);directorRefreshTimer=null;
  clearLocalCourtDivisions();
  for(const store of [localStorage,sessionStorage]){
    for(const key of Object.keys(store)){
      if(key.startsWith(`${KSM_PINNED_COURT_PREFIX}:${id}:`)||(!cloudSession.tournamentId&&key.startsWith(`${KSM_PINNED_COURT_PREFIX}:unassigned:`))||key.startsWith(`ksm:match-timer:["${id}",`))store.removeItem(key);
    }
  }
  sessionStorage.removeItem(KSM_V316_STAFF_SESSION);sessionStorage.removeItem('ksm.pending-slug');ksmPendingSlug='';
  localStorage.removeItem(KSM_SAVE_KEY);
  clearOutbox();localStorage.removeItem(KSM_CLOUD_RECOVERY_KEY);localStorage.removeItem(KSM_CLOUD_DIAGNOSTICS_KEY);
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
async function ksmShowLibrary(options={}){
  if(ksmTournamentTransition)return false;
  ksmTournamentTransition=true;
  try{
    if(!options.deleted&&!(await ksmCanLeaveTournament()))return false;
    const startup=ksmFirstLibrary;
    const startupDraft=ksmFirstLibrary&&!cloudSession.tournamentId?localStorage.getItem(KSM_SAVE_KEY):null;ksmFirstLibrary=false;
    ksmResetTournament();
    if(startup)ksmForgotTournament=false;
    if(startupDraft)localStorage.setItem(KSM_SAVE_KEY,startupDraft);
    if(location.pathname!=='/'||location.search)history.pushState(null,'','/');
    ksmTournamentAddress=location.pathname+location.search+location.hash;
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
    const suggested=KSMEngine.suggestSlug(name,String(new Date().getFullYear()));
    const slug=prompt('Tournament short name (lowercase letters, digits and dashes)',suggested);if(slug===null)return;
    if(!KSMEngine.isValidSlug(slug)){alert('Choose a valid, non-reserved tournament short name.');return}
    ksmResetTournament();ksmPendingSlug=slug;sessionStorage.setItem('ksm.pending-slug',slug);
    if(location.pathname!=='/')history.pushState(null,'','/');
    ksmTournamentAddress=location.pathname+location.search+location.hash;
    document.body.classList.remove('ksm-home');
    sessionStorage.setItem(KSM_V316_STAFF_SESSION,password);tName.value=name;
    setSessionRole('staff');installRoleBanner('staff');navigateTo('setup');
    markLocalSave('New tournament');showKsmToast('Creating tournament in cloud…',0);
    try{await performCloudSave(tournamentPayload(),0);showKsmToast('✓ Tournament created',2200)}
    catch(err){console.error(err);writeOutbox(tournamentPayload(),'New tournament');showKsmToast((err.code==='slug-taken'||err.code==='invalid-slug')?err.message+' Use Edit short name in the tournament menu.':'Tournament saved locally · Connect to sync',6000,true)}
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
    if(cloudSession.tournamentId)ksmPushTournamentAddress(cloudSession.tournamentId);
    else history.replaceState(null,'',ksmTournamentAddress);
    return;
  }
  ksmResetTournament();
  // initializeCloudRoleFromUrl also applies court / TV link options.
  try{await initializeCloudRoleFromUrl()}catch(err){console.warn(err);history.replaceState(null,'','/');await ksmShowLibrary()}
  ksmTournamentAddress=location.pathname+location.search+location.hash;
});
/* ksm:post-split-end */
