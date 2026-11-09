// @ts-check
import {state} from '../app-state.js';
import {ksmKeepFailedStartup,ksmUsesAccountAuth,renderHomeTournamentLibrary,setSessionRole} from '../auth/auth0-access.js';
import {closeNavMenus,ksmDirectorRefreshTimer,ksmEmptySetup,ksmEmptyState,ksmIsExplicitSpectatorUrl,ksmLinkParams,ksmLinkUrl,ksmPublishHeader,ksmRecordScreenPath,ksmShowRequestedScreen,navigateTo,setDirectorRefreshTimer,setKsmForgotTournament,show} from '../legacy.js';
import {ksmPendingSlug,setKsmPendingSlug} from '../links/friendly-links.js';
import {applyTournamentPayload,closeCloudModal,disconnectCloudSocket,flushCloudOutbox,ksmCloudSaveInFlight,ksmCloudTimer,ksmDeferredRemoteTimer,ksmLocalMutationVersion,ksmQueuedSaveRetryTimer,ksmSaveTimer,mergeQueuedStaffWork,noteQueuedMutation,saveTournamentToCloudWithReason,setKsmCloudTimer,setKsmConfirmedMutationVersion,setKsmDeferredRemoteRecord,setKsmFileReplace,setKsmLastSuccessfulSaveAt,setKsmLocalMutationVersion,setKsmOutboxMutationVersion,setKsmQueuedSaveRetryAttempt,setKsmQueuedSaveRetryTimer,setKsmSaveStatusMode,setKsmSaveTimer,setKsmTvLastVerifiedAt,setKsmTvRefreshInFlight,showKsmToast} from '../sync/cloud-realtime-save-and-load.js';
import {applySetupSnapshot,clearOutbox,cloudSession,ksmSessionRole,markLocalSave,persistCloudSession,setConnectionStatus,tournamentPayload,writeOutbox} from '../sync/cloud-session-and-autosave.js';
import {KSM_AUTOSAVE_CLOUD_ID,KSM_CLOUD_BASE,KSM_CLOUD_DIAGNOSTICS_KEY,KSM_CLOUD_RECOVERY_KEY,KSM_PINNED_COURT_PREFIX,KSM_SAVE_KEY,clearLocalCourtDivisions,ksmDeferredSyncTimer,localChangesPending,rememberCloudBase,setKsmDeferredSyncRecord,setKsmDeferredSyncTimer} from '../sync/sync-state-and-rebase.js';
import {ksmOwnOutbox,ksmTabHasUnsavedWork} from '../sync/two-tabs.js';
import {KSM_STAFF_TOURNAMENT,KSM_V316_STAFF_SESSION,initializeCloudRoleFromUrl,installRoleBanner,isReadOnlySession,ksmStaffToken,performCloudSave,promptNewStaffPassword,showHomePage,v316StaffPassword} from './staff-session-and-library.js';
// Switching tournaments: open, create, leave, reset, the startup load failure (step 3d of #136, from
// app/js/33-tournament-switcher.js). Its load-time side effects (the address and the popstate listener) are
// initTournamentSwitcher(), which app/js/33-tournament-switcher.js runs where this file used to load.
// ksmCreateTournament() and ksmKeepFailedStartup() are the account-aware ones of app/modules/auth/auth0-access.js;
// ksmAccountCreate() and ksmAccountFailedStartup() below are the plain ones they call (54-auth0-access.js replaced
// them at load until step 3d).
// Issue #42: all tournament boundaries share the save gate and the same reset.
export let ksmTournamentTransition=false;
export let ksmStartupLoadFailed=false;
export let ksmStartupHasCache=false;
// A module's `let` is read-only to importers: the other modules and the window accessors (tests) assign them here.
export function setKsmTournamentTransition(value){ksmTournamentTransition=value}
export function setKsmStartupLoadFailed(value){ksmStartupLoadFailed=value}
export function setKsmStartupHasCache(value){ksmStartupHasCache=value}
export function ksmAccountFailedStartup(err){
  const params=ksmLinkParams(),id=params.get('tournament')||params.get('spectator');
  if(!id||(!navigator.onLine&&!ksmStartupLoadFailed)||err?.code==='tournament-deleted'||/\((404|410)\)/.test(err?.message||''))return false;
  ksmStartupLoadFailed=true;
  disconnectCloudSocket();
  const staff=ksmStaffToken(sessionStorage.getItem(KSM_V316_STAFF_SESSION))&&sessionStorage.getItem(KSM_STAFF_TOURNAMENT)===id&&!ksmIsExplicitSpectatorUrl()&&params.get('view')!=='tv'&&params.get('role')!=='spectator'&&!params.has('spectator');
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
      clearTimeout(ksmSaveTimer);setKsmSaveTimer(null);clearTimeout(ksmCloudTimer);setKsmCloudTimer(null);
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
export let ksmTournamentEpoch=0;
let ksmFirstLibrary=true;
export let ksmLibraryReturnView='setup';
// Both set by initTournamentSwitcher(): no module reads another module's binding (KSM_SAVE_KEY) or the address
// while loading.
export let KSM_DETACHED_DRAFT_KEY;
export let ksmTournamentAddress;
// A module's `let` is read-only to importers: app/js/00-path-urls.js assigns it here.
export function setKsmTournamentAddress(value){ksmTournamentAddress=value}
export function ksmRefreshTournamentChip(){
  const shortUrl=/** @type {HTMLInputElement|null} */(document.getElementById('setupShortUrl'));
  if(shortUrl){
    shortUrl.readOnly=isReadOnlySession();
    const value=cloudSession.slug||ksmPendingSlug||'',identity=(cloudSession.tournamentId||'local')+':'+value;
    if(document.activeElement!==shortUrl&&shortUrl.dataset.identity!==identity){
      shortUrl.dataset.identity=identity;shortUrl.value=value;shortUrl.removeAttribute('aria-invalid');
      document.getElementById('setupShortUrlStatus').textContent='Old links keep working after a rename.';
    }
  }
  ksmPublishHeader({tournamentName:document.body.classList.contains('ksm-home')?'':String(/** @type {HTMLInputElement|null} */(document.getElementById('tName'))?.value||'Untitled tournament')});
}
export function ksmPushTournamentAddress(id){
  if(!id)return;
  const path=new URL(ksmLinkUrl({screen:'tournament',id})).pathname;
  if(location.pathname!==path)history.pushState(null,'',path);
  ksmTournamentAddress=location.pathname+location.search+location.hash;
}
export async function ksmCanLeaveTournament(){
  // A boot-time draft is detached; New/Open preserve it rather than replacing it.
  if(document.body.classList.contains('ksm-home')&&!cloudSession.tournamentId&&!v316StaffPassword())return true;
  // F36: only this tab's own work. A closed tab's queued work that this tab merely shows stays in the
  // browser for the next staff tab of its tournament: it never keeps this tab from switching.
  const pending=ksmTabHasUnsavedWork();
  // Pending drafts with creation credentials still get the normal save attempt.
  // A quiet imported draft or one without credentials has no server confirmation.
  if(window.ksmBootstrapReady&&!cloudSession.tournamentId&&localStorage.getItem(KSM_SAVE_KEY)&&(!pending||!v316StaffPassword())){
    alert('This tournament is only saved on this device. Save it to the cloud before switching. You can also download a Tournament File to keep a backup. Your draft is still here.');
    return false;
  }
  if(isReadOnlySession()&&!ksmOwnOutbox()&&!ksmCloudSaveInFlight)return true;
  if(pending){
    if(!isReadOnlySession()){
      // The immediate save includes the debounced edits; cancel only those existing timers.
      // A new edit during the request schedules its own timer and still blocks the exit.
      clearTimeout(ksmSaveTimer);setKsmSaveTimer(null);clearTimeout(ksmCloudTimer);setKsmCloudTimer(null);
      await saveTournamentToCloudWithReason('Before switching tournament',true);
    }
    if(ksmTabHasUnsavedWork()){
      alert('This tournament has changes that could not be saved. Connect to the internet and use Save Now (or Staff Login), then switch again. Your work is still here.');
      return false;
    }
  }
  return true;
}
export function ksmResetTournament(){
  if(document.body.classList.contains('ksm-home')&&!cloudSession.tournamentId&&!v316StaffPassword()&&!localStorage.getItem(KSM_AUTOSAVE_CLOUD_ID)){
    const draft=localStorage.getItem(KSM_SAVE_KEY);
    if(draft&&!localStorage.getItem(KSM_DETACHED_DRAFT_KEY))localStorage.setItem(KSM_DETACHED_DRAFT_KEY,draft);
  }
  ksmStartupLoadFailed=false;ksmStartupHasCache=false;document.getElementById('startupLoadFailure')?.remove();
  ksmTournamentEpoch++;
  setKsmFileReplace(null);  // F37: a Replace of the tournament being closed
  const id=cloudSession.tournamentId||'local';
  disconnectCloudSocket();setKsmTvRefreshInFlight(null);setKsmTvLastVerifiedAt(0);
  clearTimeout(ksmSaveTimer);setKsmSaveTimer(null);clearTimeout(ksmCloudTimer);setKsmCloudTimer(null);
  clearTimeout(ksmQueuedSaveRetryTimer);setKsmQueuedSaveRetryTimer(null);setKsmQueuedSaveRetryAttempt(0);
  clearTimeout(ksmDeferredRemoteTimer);setKsmDeferredRemoteRecord(null);
  clearTimeout(ksmDeferredSyncTimer);setKsmDeferredSyncTimer(null);setKsmDeferredSyncRecord(null);
  clearTimeout(ksmDirectorRefreshTimer());setDirectorRefreshTimer(null);
  clearLocalCourtDivisions();
  for(const store of [localStorage,sessionStorage]){
    for(const key of Object.keys(store)){
      if(key.startsWith(`${KSM_PINNED_COURT_PREFIX}:${id}:`)||(!cloudSession.tournamentId&&key.startsWith(`${KSM_PINNED_COURT_PREFIX}:unassigned:`))||key.startsWith(`ksm:match-timer:["${id}",`))store.removeItem(key);
    }
  }
  sessionStorage.removeItem(KSM_V316_STAFF_SESSION);sessionStorage.removeItem('ksm.pending-slug');setKsmPendingSlug('');
  localStorage.removeItem(KSM_SAVE_KEY);localStorage.removeItem(KSM_AUTOSAVE_CLOUD_ID);
  clearOutbox();localStorage.removeItem(KSM_CLOUD_RECOVERY_KEY);localStorage.removeItem(KSM_CLOUD_DIAGNOSTICS_KEY);
  Object.keys(cloudSession).forEach(key=>{if(!['clientId','clientName'].includes(key))delete cloudSession[key]});
  cloudSession.tournamentId=null;cloudSession.revision=0;cloudSession.court='';cloudSession.presence=[];persistCloudSession();
  KSM_CLOUD_BASE.revision=-1;KSM_CLOUD_BASE.payload=null;
  setKsmLocalMutationVersion(0);setKsmConfirmedMutationVersion(0);setKsmOutboxMutationVersion(0);
  setKsmLastSuccessfulSaveAt(0);setKsmSaveStatusMode('idle');
  Object.keys(state).forEach(key=>delete state[key]);Object.assign(state,JSON.parse(ksmEmptyState()));
  applySetupSnapshot(ksmEmptySetup());
  document.body.classList.remove('ksm-tv');
  setSessionRole('spectator');closeNavMenus();closeCloudModal();
  window.dispatchEvent(new CustomEvent('ksm:tournament-reset'));
  setKsmForgotTournament(true);
}
export async function ksmShowLibrary(options={}){
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
    if(startup)setKsmForgotTournament(false);
    if(startupDraft)localStorage.setItem(KSM_SAVE_KEY,startupDraft);
    if(location.pathname!=='/'||location.search)history.pushState(null,'','/');
    ksmTournamentAddress=location.pathname+location.search+location.hash;
    installRoleBanner('home');document.body.classList.add('ksm-home');
    renderHomeTournamentLibrary();show('home');return true;
  }finally{ksmTournamentTransition=false}
}
export async function ksmAccountCreate(){
  if(ksmTournamentTransition)return;
  ksmTournamentTransition=true;
  try{
    if(!(await ksmCanLeaveTournament()))return;
    const name=prompt('Tournament Name','Kendo Tournament');if(!name)return;
    const password=ksmUsesAccountAuth()?'':promptNewStaffPassword();if(!ksmUsesAccountAuth()&&!password)return;
    const suggested=KSMEngine.suggestSlug(name,String(new Date().getFullYear()));
    const slug=prompt('Tournament short name (lowercase letters, digits and dashes)',suggested);if(slug===null)return;
    if(!KSMEngine.isValidSlug(slug)){alert('Choose a valid, non-reserved tournament short name.');return}
    ksmResetTournament();setKsmPendingSlug(slug);sessionStorage.setItem('ksm.pending-slug',slug);
    if(location.pathname!=='/')history.pushState(null,'','/');
    ksmTournamentAddress=location.pathname+location.search+location.hash;
    document.body.classList.remove('ksm-home');
    if(password)sessionStorage.setItem(KSM_V316_STAFF_SESSION,password);tName.value=name;
    setSessionRole('staff');installRoleBanner('staff');navigateTo('setup');
    markLocalSave('New tournament');showKsmToast('Creating tournament in cloud…',0);
    try{await performCloudSave(tournamentPayload(),0);ksmRecordScreenPath('setup');showKsmToast('✓ Tournament created',2200)}
    catch(err){console.error(err);writeOutbox(tournamentPayload(),'New tournament');showKsmToast((err.code==='slug-taken'||err.code==='invalid-slug')?err.message+' Use Edit short URL in Setup.':'Tournament saved locally · Connect to sync',6000,true)}
  }finally{ksmTournamentTransition=false}
}
export async function ksmOpenTournament(id,fromHistory=false){
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
// Load-time side effects (the address of the open tournament, the KSM_DETACHED_DRAFT_KEY constant, the popstate
// listener), run from app/js where this file was loaded.
export function initTournamentSwitcher(){
KSM_DETACHED_DRAFT_KEY=KSM_SAVE_KEY+':library-draft';
ksmTournamentAddress=location.pathname+location.search+location.hash;
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
}
