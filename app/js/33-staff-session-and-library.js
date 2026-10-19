// ---------- KSM v3.16.2 Spectator / Staff and Tournament Library ----------
const KSM_V316_STAFF_SESSION='ksm.staff.session.v3_16';
const KSM_V316_LIBRARY='ksm.tournament.library.v3_16';
/* ksm:post-split-begin refresh-keeps-staff */
const KSM_STAFF_TOURNAMENT='ksm.staff.tournament.v1';
function ksmStoreStaffToken(token,id=cloudSession.tournamentId){
  sessionStorage.setItem(KSM_V316_STAFF_SESSION,token);
  sessionStorage.setItem(KSM_STAFF_TOURNAMENT,id||'');
}
function ksmExpireStaffSession(payload){
  if(!ksmStaffToken(v316StaffPassword()))return;
  if(payload)writeOutbox(payload,'Staff session expired');
  sessionStorage.removeItem(KSM_V316_STAFF_SESSION);
  sessionStorage.removeItem(KSM_STAFF_TOURNAMENT);
  setSessionRole('spectator');installRoleBanner('spectator');disconnectCloudSocket();connectCloudSocket();
  showKsmToast('Staff session expired · use Staff Login again',4000,true);
}
async function ksmResumeStaffSession(id){
  if(!v316StaffPassword()||!navigator.onLine)return;
  // Authorization precedes revision validation. -1 can never match a server revision:
  // a valid session gets 409 without writing, an expired/revoked one gets the usual 401.
  const epoch=ksmTournamentEpoch;
  let response;
  try{
    response=await fetch(`/api/tournaments/${encodeURIComponent(id)}`,{
      method:'PUT',headers:cloudHeaders(),body:JSON.stringify({revision:-1}),signal:cloudSaveTimeoutSignal(id)
    });
  }catch(_){setConnectionStatus('Offline · session check pending','offline');return}
  if(epoch!==ksmTournamentEpoch)throw Object.assign(new Error('Tournament changed'),{code:'transition-cancelled'});
  if(response.status===410){ksmAnnounceTournamentGone(id,true);throw ksmGoneError()}
  if(response.status===401)ksmExpireStaffSession();
  else if(response.status!==409)setConnectionStatus('Session check unavailable','offline');
}
/* ksm:post-split-end */
function v316StaffPassword(){/* ksm:post-split-begin refresh-keeps-staff was:return sessionStorage.getItem(KSM_V316_STAFF_SESSION)||'' */
  const token=sessionStorage.getItem(KSM_V316_STAFF_SESSION)||'';
  if(!ksmStaffToken(token))return token; // Temporary creation password, never a persisted login.
  return sessionStorage.getItem(KSM_STAFF_TOURNAMENT)===cloudSession.tournamentId?token:'';
/* ksm:post-split-end */}
/* ksm:post-split-begin staff-hardening */
// Staff session (issue #9): KSM_V316_STAFF_SESSION holds the session token the server returned at
// Staff Login or tournament creation (sent as x-ksm-session-key and the live connection's key),
// or, only between New Tournament and the server's answer, the new password to create it with.
function ksmStaffToken(value){return typeof value==='string'&&value.startsWith('ksmst_')}
// F33: work queued by staff stays staff work. A device logged out (a 401, Staff Logout) holds no
// staff work of its own, so it never replaces a queued staff snapshot of this tournament (by one
// stamped as spectator, which the next live update would discard) before Staff Login sends it.
function ksmKeepStaffOutbox(){if(!isReadOnlySession()||!cloudSession.tournamentId)return false;const queued=readOutbox();return queued?.role==='staff'&&queued.tournamentId===cloudSession.tournamentId}
/* ksm:post-split-end */
function setSessionRole(role){ksmSessionRole=role==='staff'?'staff':'spectator';document.body.classList.toggle('ksm-spectator',ksmSessionRole==='spectator');document.body.classList.toggle('ksm-staff',ksmSessionRole==='staff');document.body.classList.remove('ksm-scorekeeper','ksm-admin');/* ksm:post-split-begin react-shell */ksmRenderSessionRole();/* ksm:post-split-end */}
function isReadOnlySession(){return ksmSessionRole!=='staff'}
function isSpectatorSession(){return isReadOnlySession()}
function canCloudWrite(){return ksmSessionRole==='staff'||!cloudSession.tournamentId}
function sessionKey(){return v316StaffPassword()}
function cloudHeaders(){return {'content-type':'application/json','x-ksm-role':ksmSessionRole==='staff'?'staff':'spectator','x-ksm-session-key':sessionKey(),'x-ksm-client-id':/* ksm:post-split-begin two-tabs was:cloudSession.clientId||'' */ksmWriterId()/* ksm:post-split-end */,'x-ksm-client-name':cloudSession.clientName||'KSM Device','x-ksm-court':cloudSession.court||''}}
function cloudSocketUrl(id){const protocol=location.protocol==='https:'?'wss:':'ws:';const url=new URL(`${protocol}//${location.host}/api/tournaments/${encodeURIComponent(id)}/live`);url.searchParams.set('role',ksmSessionRole==='staff'?'staff':'spectator');if(sessionKey())url.searchParams.set('key',sessionKey());url.searchParams.set('clientId',cloudSession.clientId||'');url.searchParams.set('name',cloudSession.clientName||'KSM Device');if(cloudSession.court)url.searchParams.set('court',cloudSession.court);return url.toString()}
function promptNewStaffPassword(){const a=prompt('Create Staff password');if(!a)return '';if(a.length<4){alert('Staff password must be at least 4 characters.');return ''}const b=prompt('Confirm Staff password');if(a!==b){alert('Passwords do not match.');return ''}return a}
async function toggleStaffSession(){if(ksmSessionRole==='staff'){sessionStorage.removeItem(KSM_V316_STAFF_SESSION);setSessionRole('spectator');installRoleBanner('spectator');disconnectCloudSocket();connectCloudSocket();navigateTo('public');return}if(!cloudSession.tournamentId){alert('Create or load a tournament before Staff Login.');return}/* ksm:post-split-begin refresh-keeps-staff */const loginTournament=cloudSession.tournamentId,loginEpoch=ksmTournamentEpoch;/* ksm:post-split-end */const password=prompt('Enter Staff password');if(!password)return;try{const response=await fetch(`/api/tournaments/${encodeURIComponent(cloudSession.tournamentId)}/auth`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});/* ksm:post-split-begin delete-tournament */if(response.status===410){ksmAnnounceTournamentGone(cloudSession.tournamentId);return}/* ksm:post-split-end *//* ksm:post-split-begin staff-hardening was:if(!response.ok)throw new Error();sessionStorage.setItem(KSM_V316_STAFF_SESSION,password); */const info=await response.json().catch(()=>null);if(!response.ok){if(response.status===429&&info?.error){alert(info.error);return}throw new Error()}if(loginEpoch!==ksmTournamentEpoch||loginTournament!==cloudSession.tournamentId)return;ksmStoreStaffToken(info?.token||password,loginTournament);/* ksm:post-split-end */setSessionRole('staff');installRoleBanner('staff');/* ksm:post-split-begin outbox-flush-rebase */mergeQueuedStaffWork();/* ksm:post-split-end */disconnectCloudSocket();connectCloudSocket();showKsmToast('✓ Staff access enabled',1500)}catch(_){alert('Incorrect Staff password.')}}
function installRoleBanner(role){document.querySelector('.spectator-readonly-banner')?.remove();if(role!=='spectator')return;const banner=document.createElement('div');banner.className='spectator-readonly-banner';banner.textContent='LIVE SPECTATOR VIEW • READ ONLY';document.body.prepend(banner)}
function readTournamentLibrary(){try{return JSON.parse(localStorage.getItem(KSM_V316_LIBRARY)||'[]')}catch(_){return []}}
function writeTournamentLibrary(list){localStorage.setItem(KSM_V316_LIBRARY,JSON.stringify((list||[]).slice(0,100)))}
function rememberTournament(record){/* ksm:post-split-begin friendly-links */ksmCacheTournament(record);/* ksm:post-split-end */if(!record?.tournamentId)return;const list=readTournamentLibrary().filter(x=>x.id!==record.tournamentId);list.unshift({id:record.tournamentId,name:record.payload?.setup?.tName||'Kendo Tournament',/* ksm:post-split-begin friendly-links */slug:record.slug||cloudSession.slug||null,/* ksm:post-split-end */updatedAt:record.updatedAt||new Date().toISOString()});writeTournamentLibrary(list)}
function paintHomeTournamentLibrary(list,message='No tournaments yet.'){/* ksm:post-split-begin react-library */const host=document.getElementById('homeTournamentLibrary');if(!host)return;ksmRenderLibrary(list,message);/* ksm:post-split-end */}
async function renderHomeTournamentLibrary(){const cached=readTournamentLibrary();paintHomeTournamentLibrary(cached,cached.length?'':'Loading tournaments…');if(!navigator.onLine){if(!cached.length)paintHomeTournamentLibrary([],'Offline — no cached tournaments are available.');return}try{const ids=cached.map(x=>x.id).filter(Boolean);const response=await fetch(ids.length?'/api/tournaments/discover':'/api/tournaments',{method:ids.length?'POST':'GET',headers:ids.length?{'content-type':'application/json'}:undefined,body:ids.length?JSON.stringify({ids}):undefined,cache:'no-store'});if(!response.ok)throw new Error(`Library load failed (${response.status})`);const cloud=await response.json();writeTournamentLibrary(cloud);paintHomeTournamentLibrary(cloud)}catch(err){console.warn(err);if(!cached.length)paintHomeTournamentLibrary([],'Unable to load the Tournament Library. Check your connection.') }}
function showHomePage(){/* ksm:post-split-begin tournament-switcher */return ksmShowLibrary();/* ksm:post-split-end */closeNavMenus();disconnectCloudSocket();sessionStorage.removeItem(KSM_V316_STAFF_SESSION);setSessionRole('spectator');installRoleBanner('home');document.body.classList.add('ksm-home');renderHomeTournamentLibrary();show('home')}
async function createNewTournament(){/* ksm:post-split-begin tournament-switcher */return ksmCreateTournament();/* ksm:post-split-end */const name=prompt('Tournament Name','Kendo Tournament');if(!name)return;const password=promptNewStaffPassword();if(!password)return;document.body.classList.remove('ksm-home');disconnectCloudSocket();cloudSession.tournamentId=null;cloudSession.revision=0;cloudSession.updatedAt=null;cloudSession.court='';persistCloudSession();sessionStorage.setItem(KSM_V316_STAFF_SESSION,password);if(window.tName)tName.value=name;setSessionRole('staff');installRoleBanner('staff');navigateTo('setup');markLocalSave('New tournament');showKsmToast('Creating tournament in cloud…',0);try{await performCloudSave(tournamentPayload(),0);showKsmToast('✓ Tournament created',2200)}catch(err){console.error(err);writeOutbox(tournamentPayload(),'New tournament');showKsmToast(navigator.onLine?'Unable to create tournament in cloud':'Offline · Tournament will sync when connected',3500,true)}}
async function openTournamentFromHome(id){/* ksm:post-split-begin tournament-switcher */return ksmOpenTournament(id);/* ksm:post-split-end */sessionStorage.removeItem(KSM_V316_STAFF_SESSION);setSessionRole('spectator');document.body.classList.remove('ksm-home');try{await loadTournamentFromCloud(id,{spectator:true});setSessionRole('spectator');installRoleBanner('spectator');navigateTo('public')}catch(err){console.error(err);/* ksm:post-split-begin delete-tournament */if(err?.code==='tournament-deleted')return;/* ksm:post-split-end */document.body.classList.add('ksm-home');renderHomeTournamentLibrary();alert('Unable to open that tournament. The network or tournament data could not be loaded. Please retry; if the problem continues, check the browser console.')}}
async function openTournamentLibrary(){showHomePage()}
function spectatorLink(){/* ksm:post-split-begin path-urls was:if(!cloudSession.tournamentId)return '';const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('tournament',cloudSession.tournamentId);return url.toString() */if(!cloudSession.tournamentId)return '';return ksmLinkUrl({screen:'tournament',id:cloudSession.tournamentId})/* ksm:post-split-end */}
async function openTournamentAccess(){if(!cloudSession.tournamentId)await saveNow();if(!cloudSession.tournamentId){alert('Connect to the internet and save the tournament first.');return}const link=spectatorLink();const qr=`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(link)}`;/* ksm:post-split-begin react-shell */ksmOpenTournamentAccess(link,qr);/* ksm:post-split-end */}
async function performCloudSave(payload=tournamentPayload(),baseRevision=cloudSession.revision||0,rebaseAttempt=0,originalBaseRevision=baseRevision/* ksm:post-split-begin edit-merge */,basePayload=cloudBaseFor(baseRevision)/* ksm:post-split-end */){
  /* ksm:post-split-begin tournament-switcher */const savingEpoch=ksmTournamentEpoch;/* ksm:post-split-end */
  const existing=cloudSession.tournamentId;
  const attemptId=++ksmCloudAttemptCounter;
  let envelope={...cloudEnvelope(payload),revision:baseRevision};
  if(!existing){
    const password=/* ksm:post-split-begin staff-hardening was:v316StaffPassword() */(ksmStaffToken(v316StaffPassword())?'':v316StaffPassword())/* ksm:post-split-end */||promptNewStaffPassword();
    if(!password)throw new Error('Staff password required');
    sessionStorage.setItem(KSM_V316_STAFF_SESSION,password);
    setSessionRole('staff');
    envelope={...envelope,staffPassword:password/* ksm:post-split-begin friendly-links */, ...(ksmPendingSlug?{slug:ksmPendingSlug}:{})/* ksm:post-split-end */};
  }
  const body=JSON.stringify(envelope);
  const snapshotAnalysis=analyzeTournamentSnapshot(payload);
  writeCloudDiagnosticsState({
    attemptId,
    stage:rebaseAttempt?`Sending rebased cloud request (${rebaseAttempt}/${KSM_CLOUD_REBASE_MAX_ATTEMPTS})`:'Sending cloud request',
    lastAttemptAt:new Date().toISOString(),
    httpStatus:null,
    errorMessage:'',
    errorBody:'',
    baseRevision,
    originalBaseRevision,
    rebaseAttempt,
    snapshotBytes:new Blob([body]).size,
    snapshotAnalysis
  });
  let response;
  try{
    response=await fetch(existing?`/api/tournaments/${encodeURIComponent(existing)}`:'/api/tournaments',{
      method:existing?'PUT':'POST',
      headers:cloudHeaders(),
      /* ksm:post-split-begin save-retry */signal:cloudSaveTimeoutSignal(existing),/* ksm:post-split-end */body
    });
  }catch(err){
    writeCloudDiagnosticsState({attemptId,stage:'Network request failed',errorMessage:String(err?.message||err),lastFailureAt:new Date().toISOString()});
    throw err;
  }
  /* ksm:post-split-begin tournament-switcher */if(savingEpoch!==ksmTournamentEpoch)throw Object.assign(new Error('Tournament changed'),{code:'transition-cancelled'});/* ksm:post-split-end */
  let responseText='';
  try{responseText=await response.text()}catch(_){}
  let parsed=null;
  if(responseText){try{parsed=JSON.parse(responseText)}catch(_){}}
  writeCloudDiagnosticsState({
    attemptId,
    stage:'Cloud response received',
    httpStatus:response.status,
    errorBody:response.ok?'':responseText.slice(0,1000),
    rebaseAttempt
  });
  /* ksm:post-split-begin delete-tournament */
  // Issue #26: the tournament was deleted: this device forgets it and returns to the Library; the
  // save is neither queued nor retried.
  if(response.status===410){
    writeCloudDiagnosticsState({attemptId,stage:'Tournament deleted',errorMessage:'Tournament deleted'});
    ksmAnnounceTournamentGone(existing);
    throw ksmGoneError();
  }
  /* ksm:post-split-end */
  if(response.status===403){
    writeCloudDiagnosticsState({attemptId,stage:'Authorization rejected',errorMessage:'Session authorization required'});
    throw new Error('Session authorization required');
  }
  /* ksm:post-split-begin staff-hardening */
  // The staff session token expired (24 h unused) or was revoked: the device becomes a spectator,
  // so Staff Login asks for the password again; the unsaved work stays queued for after it.
  if(response.status===401){
    writeCloudDiagnosticsState({attemptId,stage:'Staff session expired',errorMessage:(parsed&&parsed.error)||'Staff session expired'});
    // F33: queue the unsaved work as staff work before the role changes (writeOutbox() stamps the role).
    ksmExpireStaffSession(payload);
    throw new Error('Session authorization required');
  }
  /* ksm:post-split-end */
  /* ksm:post-split-begin friendly-links */if(parsed?.code==='slug-taken'||parsed?.code==='invalid-slug')throw Object.assign(new Error(parsed.error),{code:parsed.code});/* ksm:post-split-end */
  if(response.status===409){
    const conflict=parsed||{},serverRecord=conflict.record;
    if(serverRecord&&existing&&rebaseAttempt<KSM_CLOUD_REBASE_MAX_ATTEMPTS){
      const serverRevision=Number(serverRecord.revision||0);
      const replayActions=pendingLocalCourtActionsForRebase(payload,serverRecord,originalBaseRevision);
      const rebased=rebaseLocalPayloadOnRecord(payload,serverRecord,originalBaseRevision/* ksm:post-split-begin edit-merge */,basePayload/* ksm:post-split-end */);
      writeCloudDiagnosticsState({
        attemptId,
        stage:'Rebasing concurrent court changes',
        baseRevision,
        originalBaseRevision,
        serverRevision,
        rebaseAttempt:rebaseAttempt+1,
        replayActionCount:replayActions.length,
        pinnedCourt:pinnedCourt()||''
      });
      cloudSession.revision=serverRevision||Number(cloudSession.revision||0);
      cloudSession.updatedAt=serverRecord.updatedAt;
      persistCloudSession();
      const savedRecord=await performCloudSave(rebased,cloudSession.revision,rebaseAttempt+1,originalBaseRevision/* ksm:post-split-begin edit-merge */,serverRecord.payload/* ksm:post-split-end */);
      savedRecord.__ksmRebased=true;
      savedRecord.__ksmOriginalBaseRevision=originalBaseRevision;
      savedRecord.__ksmRebaseAttempts=Math.max(Number(savedRecord.__ksmRebaseAttempts||0),rebaseAttempt+1);
      return savedRecord;
    }
    if(serverRecord){
      cloudSession.revision=Number(serverRecord.revision||cloudSession.revision||0);
      cloudSession.updatedAt=serverRecord.updatedAt;
      persistCloudSession();
    }
    const outbox={tournamentId:existing,baseRevision:Number(serverRecord?.revision||baseRevision),payload,queuedAt:new Date().toISOString()};
    preserveRecovery(outbox,serverRecord);
    writeOutbox(payload,'Concurrent court conflict requires retry');
    writeCloudDiagnosticsState({
      attemptId,
      stage:'Revision conflict needs attention',
      errorMessage:'Cloud revision conflict',
      serverRevision:serverRecord?.revision||null,
      originalBaseRevision,
      rebaseAttempt
    });
    throw new Error('Cloud revision conflict');
  }
  if(!response.ok){
    const message=(parsed&&parsed.error)||`Cloud save failed (${response.status})`;
    writeCloudDiagnosticsState({attemptId,stage:'Cloud save rejected',errorMessage:message});
    throw new Error(message);
  }
  const record=parsed;
  if(!record)throw new Error('Cloud response was not valid JSON');
  const idChanged=cloudSession.tournamentId!==record.tournamentId;
  cloudSession.tournamentId=record.tournamentId;
  cloudSession.revision=record.revision;
  cloudSession.updatedAt=record.updatedAt;
  persistCloudSession();
  /* ksm:post-split-begin edit-merge */rememberCloudBase(record);/* ksm:post-split-end */
  /* ksm:post-split-begin friendly-links */cloudSession.slug=record.slug||null;if(!existing&&localStorage.getItem(KSM_SAVE_KEY))localStorage.setItem(KSM_AUTOSAVE_CLOUD_ID,record.tournamentId);ksmPendingSlug='';sessionStorage.removeItem('ksm.pending-slug');persistCloudSession();/* ksm:post-split-end */
  rememberTournament(record);
  /* ksm:post-split-begin tournament-switcher */if(!existing)ksmPushTournamentAddress(record.tournamentId);/* ksm:post-split-end */
  /* ksm:post-split-begin staff-hardening */
  // Creating the tournament logged this device in: keep the session token instead of the password.
  if(!existing){const token=response.headers.get('x-ksm-session-token');if(ksmStaffToken(token))ksmStoreStaffToken(token,record.tournamentId)}
  /* ksm:post-split-end */
  setSessionRole(v316StaffPassword()?'staff':'spectator');
  clearOutbox();
  ksmLastSuccessfulSaveAt=Date.parse(record.updatedAt)||Date.now();
  ksmSaveStatusMode='saved';
  writeCloudDiagnosticsState({
    attemptId,
    stage:rebaseAttempt?'Rebased save completed':'Save completed',
    httpStatus:response.status,
    errorMessage:'',
    errorBody:'',
    retryCount:0,
    lastSuccessAt:record.updatedAt||new Date().toISOString(),
    serverRevision:record.revision,
    rebaseAttempt
  });
  setConnectionStatus('Connected','online');
  renderPersistentSaveStatus();
  if(idChanged||!ksmCloudSocket)connectCloudSocket();
  return record;
}
async function loadTournamentFromCloud(tournamentId,options={}){const id=(tournamentId||cloudSession.tournamentId||'').trim();if(!id)throw new Error('Tournament ID required');setConnectionStatus('Loading cloud…','connecting');/* ksm:post-split-begin friendly-links was:const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}`); */const epoch=ksmTournamentEpoch;const response=await ksmFetchTournament(id);if(epoch!==ksmTournamentEpoch)throw Object.assign(new Error('Tournament changed'),{code:'transition-cancelled'});/* ksm:post-split-end *//* ksm:post-split-begin delete-tournament */if(response.status===410){ksmAnnounceTournamentGone(id,true);throw ksmGoneError()}/* ksm:post-split-end */if(!response.ok)throw new Error(`Cloud load failed (${response.status})`);const record=await response.json();/* ksm:post-split-begin friendly-links */cloudSession.slug=record.slug||null;/* ksm:post-split-end */const requestedCourt=options.court?normalizeCourt(options.court):pinnedCourt();cloudSession.tournamentId=record.tournamentId;if(requestedCourt)pinCourtLocally(requestedCourt);disconnectCloudSocket();ksmApplyingRemoteSnapshot=true;try{applyTournamentPayload(record.payload,false,{pinnedCourt:requestedCourt});/* ksm:post-split-begin autosave-origin was:localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(record.payload)) */ksmStoreAutosave(record.payload)/* ksm:post-split-end */}finally{ksmApplyingRemoteSnapshot=false}cloudSession.tournamentId=record.tournamentId;cloudSession.revision=record.revision;cloudSession.updatedAt=record.updatedAt;cloudSession.court=requestedCourt||'';persistCloudSession();/* ksm:post-split-begin edit-merge */rememberCloudBase(record);/* ksm:post-split-end */rememberTournament(record);ksmLastSuccessfulSaveAt=Date.parse(record.updatedAt)||Date.now();ksmSaveStatusMode='saved';/* ksm:post-split-begin refresh-keeps-staff was:setSessionRole(v316StaffPassword()?'staff':'spectator');installRoleBanner(ksmSessionRole);connectCloudSocket(); */setSessionRole(v316StaffPassword()?'staff':'spectator');if(!isReadOnlySession())mergeQueuedStaffWork();installRoleBanner(ksmSessionRole);if(!options.resumeStaff)connectCloudSocket();/* ksm:post-split-end */setConnectionStatus('Connected','online');renderPersistentSaveStatus();return record}
async function initializeCloudRoleFromUrl(){/* ksm:post-split-begin path-urls */ksmRouteLoading++;try{/* ksm:post-split-end *//* ksm:post-split-begin friendly-links */await ksmResolveSlug();/* ksm:post-split-end */ensureClientIdentity();const params=/* ksm:post-split-begin path-urls was:new URLSearchParams(location.search) */ksmLinkParams()/* ksm:post-split-end */;const id=params.get('tournament')||params.get('spectator')||'';const requestedView=params.get('view')||'';const requestedCourt=/* ksm:post-split-begin court-pin was:(params.get('court')||'A').toUpperCase()==='B'?'B':'A' */params.get('court')?normalizeCourt(params.get('court')):(requestedView!=='tv'&&id&&storedCourtPin(id))||'A'/* ksm:post-split-end */;if(id){/* ksm:post-split-begin refresh-keeps-staff was:sessionStorage.removeItem(KSM_V316_STAFF_SESSION);await loadTournamentFromCloud(id,{spectator:true,court:requestedCourt});setSessionRole('spectator');installRoleBanner('spectator'); */const staff=ksmStaffToken(sessionStorage.getItem(KSM_V316_STAFF_SESSION))&&sessionStorage.getItem(KSM_STAFF_TOURNAMENT)===id&&!ksmExplicitSpectatorUrl&&requestedView!=='tv'&&params.get('role')!=='spectator'&&!params.has('spectator');if(!staff)sessionStorage.removeItem(KSM_V316_STAFF_SESSION);await loadTournamentFromCloud(id,{spectator:!staff,court:requestedCourt,resumeStaff:staff});ksmStartupLoadFailed=false;if(staff)await ksmResumeStaffSession(id);connectCloudSocket();installRoleBanner(ksmSessionRole);/* ksm:post-split-end */document.body.classList.remove('ksm-home');if(requestedView==='tv'){document.body.classList.add('ksm-tv');cloudSession.court=requestedCourt;persistCloudSession();renderTvDisplay();renderTvRealtimeDiagnostics();show('tv')}else{document.body.classList.remove('ksm-tv');/* ksm:post-split-begin path-urls was:navigateTo('public') */ksmShowRequestedScreen()/* ksm:post-split-end */}return true}/* ksm:post-split-begin refresh-keeps-staff */
// The Library URL has no ID. Only this tab's explicitly scoped token may restore its context.
const savedId=sessionStorage.getItem(KSM_STAFF_TOURNAMENT);
if(!window.ksmBootstrapReady&&savedId&&ksmStaffToken(sessionStorage.getItem(KSM_V316_STAFF_SESSION))){
  await loadTournamentFromCloud(savedId,{resumeStaff:true});await ksmResumeStaffSession(savedId);disconnectCloudSocket();
  document.body.classList.add('ksm-home');installRoleBanner('home');renderHomeTournamentLibrary();show('home');return true;
}
// Unscoped legacy tokens are intentionally discarded; a fresh login binds them safely.
sessionStorage.removeItem(KSM_V316_STAFF_SESSION);
/* ksm:post-split-end *//* ksm:post-split-begin tournament-switcher */await /* ksm:post-split-end */showHomePage();return true/* ksm:post-split-begin path-urls */}finally{ksmRouteLoading--;}/* ksm:post-split-end */}
