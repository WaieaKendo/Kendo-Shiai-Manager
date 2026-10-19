/* ksm:post-split-begin tournament-switcher */
// Issue #42: all tournament boundaries share the save gate and the same reset.
let ksmTournamentTransition=false;
var ksmStartupLoadFailed=false;
var ksmStartupHasCache=false;
function ksmKeepFailedStartup(err){
  const params=ksmLinkParams(),id=params.get('tournament')||params.get('spectator');
  if(!id||(!navigator.onLine&&!ksmStartupLoadFailed)||err?.code==='tournament-deleted'||/\((404|410)\)/.test(err?.message||''))return false;
  ksmStartupLoadFailed=true;
  disconnectCloudSocket();
  const staff=ksmStaffToken(sessionStorage.getItem(KSM_V316_STAFF_SESSION))&&sessionStorage.getItem(KSM_STAFF_TOURNAMENT)===id&&!ksmExplicitSpectatorUrl&&params.get('view')!=='tv'&&params.get('role')!=='spectator'&&!params.has('spectator');
  const alreadyLoaded=ksmStartupHasCache&&cloudSession.tournamentId===id;
  cloudSession.tournamentId=id;
  setSessionRole(staff?'staff':'spectator');installRoleBanner(ksmSessionRole);
  document.body.classList.remove('ksm-home');
  let record;
  try{record=JSON.parse(localStorage.getItem('ksm.tournament.record:'+id)||'null')}catch(_){}
  ksmStartupHasCache=Boolean(record?.tournamentId===id&&record.payload?.state);
  if(ksmStartupHasCache){
    if(!alreadyLoaded){
      cloudSession.revision=record.revision;cloudSession.slug=record.slug||null;
      rememberCloudBase(record);
      applyTournamentPayload(record.payload,false);if(staff)mergeQueuedStaffWork();
    }
    ksmShowRequestedScreen();
  }else{document.querySelectorAll('main section.view').forEach(el=>el.classList.add('hidden'));}
  let notice=document.getElementById('startupLoadFailure');
  if(!notice){
    notice=document.createElement('div');notice.id='startupLoadFailure';notice.className='card';notice.setAttribute('role','status');
    const heading=document.createElement('h1');heading.textContent='Cloud load failed';
    const detail=document.createElement('p');detail.className='sub';detail.textContent=record?'Showing the cached copy on this device. Retry to reconnect.':'Check your connection and retry.';
    const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';
    retry.onclick=async()=>{
      // Capture edits before the debounced save or another GET can replace the cached state.
      if(ksmStartupHasCache&&localChangesPending()){
        const payload=tournamentPayload();writeOutbox(payload,'Startup retry');noteQueuedMutation(payload,ksmLocalMutationVersion);
      }
      clearTimeout(ksmSaveTimer);ksmSaveTimer=null;clearTimeout(ksmCloudTimer);ksmCloudTimer=null;
      if(!navigator.onLine){setConnectionStatus('Offline · Retry when connected','offline');return}
      retry.disabled=true;
      try{await initializeCloudRoleFromUrl();ksmStartupLoadFailed=false;notice.remove();await flushCloudOutbox()}
      catch(error){if(!ksmKeepFailedStartup(error)){notice.remove();if(/\((404|410)\)/.test(error?.message||''))await ksmShowLibrary({deleted:true});else await showHomePage()}}
      finally{retry.disabled=false}
    };
    notice.append(heading,detail,retry);document.querySelector('main').prepend(notice);
  }
  setConnectionStatus(navigator.onLine?'Cloud load failed':'Offline · Retry when connected','offline');return true;
}
var ksmTournamentEpoch=0;
var ksmFirstLibrary=true;
var ksmLibraryReturnView='setup';
const KSM_DETACHED_DRAFT_KEY=KSM_SAVE_KEY+':library-draft';
var ksmTournamentAddress=location.pathname+location.search+location.hash;
function ksmRefreshTournamentChip(){
  const shortUrl=document.getElementById('setupShortUrl');
  if(shortUrl){
    shortUrl.readOnly=isReadOnlySession();
    const value=cloudSession.slug||ksmPendingSlug||'',identity=(cloudSession.tournamentId||'local')+':'+value;
    if(document.activeElement!==shortUrl&&shortUrl.dataset.identity!==identity){
      shortUrl.dataset.identity=identity;shortUrl.value=value;shortUrl.removeAttribute('aria-invalid');
      document.getElementById('setupShortUrlStatus').textContent='Old links keep working after a rename.';
    }
  }
  ksmPublishHeader({tournamentName:document.body.classList.contains('ksm-home')?'':String(document.getElementById('tName')?.value||'Untitled tournament')});
}
function ksmPushTournamentAddress(id){
  if(!id)return;
  const path=new URL(ksmLinkUrl({screen:'tournament',id})).pathname;
  if(location.pathname!==path)history.pushState(null,'',path);
  ksmTournamentAddress=location.pathname+location.search+location.hash;
}
async function ksmCanLeaveTournament(){
  // A boot-time draft is detached; New/Open preserve it rather than replacing it.
  if(document.body.classList.contains('ksm-home')&&!cloudSession.tournamentId&&!v316StaffPassword())return true;
  const pending=ksmCloudSaveInFlight||ksmCloudSavePending||localChangesPending()||readOutbox();
  // Pending drafts with creation credentials still get the normal save attempt.
  // A quiet imported draft or one without credentials has no server confirmation.
  if(window.ksmBootstrapReady&&!cloudSession.tournamentId&&localStorage.getItem(KSM_SAVE_KEY)&&(!pending||!v316StaffPassword())){
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
  if(document.body.classList.contains('ksm-home')&&!cloudSession.tournamentId&&!v316StaffPassword()&&!localStorage.getItem(KSM_AUTOSAVE_CLOUD_ID)){
    const draft=localStorage.getItem(KSM_SAVE_KEY);
    if(draft&&!localStorage.getItem(KSM_DETACHED_DRAFT_KEY))localStorage.setItem(KSM_DETACHED_DRAFT_KEY,draft);
  }
  ksmStartupLoadFailed=false;ksmStartupHasCache=false;document.getElementById('startupLoadFailure')?.remove();
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
  localStorage.removeItem(KSM_SAVE_KEY);localStorage.removeItem(KSM_AUTOSAVE_CLOUD_ID);
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
    if(!window.ksmBootstrapReady&&!options.deleted){
      ksmFirstLibrary=false;disconnectCloudSocket();
      document.body.classList.add('ksm-home');installRoleBanner('home');
      setSessionRole('spectator');renderHomeTournamentLibrary();show('home');return true;
    }
    if(!options.deleted&&(cloudSession.tournamentId||(!document.body.classList.contains('ksm-home')&&v316StaffPassword()))){
      if(!document.body.classList.contains('ksm-home'))ksmLibraryReturnView=document.querySelector('main .view:not(.hidden)')?.id||'setup';
      document.body.classList.add('ksm-home');
      if(location.pathname!=='/')history.pushState(null,'','/');
      ksmTournamentAddress=location.pathname+location.search+location.hash;
      renderHomeTournamentLibrary();show('home');ksmRefreshTournamentChip();return true;
    }
    if(!options.deleted&&!(await ksmCanLeaveTournament()))return false;
    const startup=ksmFirstLibrary;
    const startupDraft=ksmFirstLibrary&&!cloudSession.tournamentId&&!localStorage.getItem(KSM_AUTOSAVE_CLOUD_ID)?localStorage.getItem(KSM_SAVE_KEY):null;ksmFirstLibrary=false;
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
    try{await performCloudSave(tournamentPayload(),0);ksmRecordScreenPath('setup');showKsmToast('✓ Tournament created',2200)}
    catch(err){console.error(err);writeOutbox(tournamentPayload(),'New tournament');showKsmToast((err.code==='slug-taken'||err.code==='invalid-slug')?err.message+' Use Edit short URL in Setup.':'Tournament saved locally · Connect to sync',6000,true)}
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
    if(cloudSession.tournamentId)history.pushState(null,'',ksmTournamentAddress);
    else history.replaceState(null,'',ksmTournamentAddress);
    return;
  }
  ksmResetTournament();
  // initializeCloudRoleFromUrl also applies court / TV link options.
  try{await initializeCloudRoleFromUrl()}catch(err){console.warn(err);history.replaceState(null,'','/');await ksmShowLibrary()}
  ksmTournamentAddress=location.pathname+location.search+location.hash;
});
/* ksm:post-split-end */
