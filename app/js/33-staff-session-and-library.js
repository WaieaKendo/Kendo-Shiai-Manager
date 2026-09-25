// ---------- KSM v3.16.2 Spectator / Staff and Tournament Library ----------
const KSM_V316_STAFF_SESSION='ksm.staff.session.v3_16';
const KSM_V316_LIBRARY='ksm.tournament.library.v3_16';
function v316StaffPassword(){return sessionStorage.getItem(KSM_V316_STAFF_SESSION)||''}
function setSessionRole(role){ksmSessionRole=role==='staff'?'staff':'spectator';const el=document.getElementById('sessionRole');if(el){el.textContent=ksmSessionRole==='staff'?'Staff':'Spectator';el.dataset.role=ksmSessionRole}document.body.classList.toggle('ksm-spectator',ksmSessionRole==='spectator');document.body.classList.toggle('ksm-staff',ksmSessionRole==='staff');document.body.classList.remove('ksm-scorekeeper','ksm-admin');const btn=document.getElementById('staffAuthButton');if(btn)btn.textContent=ksmSessionRole==='staff'?'Logout':'Staff Login'}
function isReadOnlySession(){return ksmSessionRole!=='staff'}
function isSpectatorSession(){return isReadOnlySession()}
function canCloudWrite(){return ksmSessionRole==='staff'||!cloudSession.tournamentId}
function sessionKey(){return v316StaffPassword()}
function cloudHeaders(){return {'content-type':'application/json','x-ksm-role':ksmSessionRole==='staff'?'staff':'spectator','x-ksm-session-key':sessionKey(),'x-ksm-client-id':cloudSession.clientId||'','x-ksm-client-name':cloudSession.clientName||'KSM Device','x-ksm-court':cloudSession.court||''}}
function cloudSocketUrl(id){const protocol=location.protocol==='https:'?'wss:':'ws:';const url=new URL(`${protocol}//${location.host}/api/tournaments/${encodeURIComponent(id)}/live`);url.searchParams.set('role',ksmSessionRole==='staff'?'staff':'spectator');if(sessionKey())url.searchParams.set('key',sessionKey());url.searchParams.set('clientId',cloudSession.clientId||'');url.searchParams.set('name',cloudSession.clientName||'KSM Device');if(cloudSession.court)url.searchParams.set('court',cloudSession.court);return url.toString()}
function promptNewStaffPassword(){const a=prompt('Create Staff password');if(!a)return '';if(a.length<4){alert('Staff password must be at least 4 characters.');return ''}const b=prompt('Confirm Staff password');if(a!==b){alert('Passwords do not match.');return ''}return a}
async function toggleStaffSession(){if(ksmSessionRole==='staff'){sessionStorage.removeItem(KSM_V316_STAFF_SESSION);setSessionRole('spectator');installRoleBanner('spectator');disconnectCloudSocket();connectCloudSocket();navigateTo('public');return}if(!cloudSession.tournamentId){alert('Create or load a tournament before Staff Login.');return}const password=prompt('Enter Staff password');if(!password)return;try{const response=await fetch(`/api/tournaments/${encodeURIComponent(cloudSession.tournamentId)}/auth`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});if(!response.ok)throw new Error();sessionStorage.setItem(KSM_V316_STAFF_SESSION,password);setSessionRole('staff');installRoleBanner('staff');/* ksm:post-split-begin outbox-flush-rebase */mergeQueuedStaffWork();/* ksm:post-split-end */disconnectCloudSocket();connectCloudSocket();showKsmToast('✓ Staff access enabled',1500)}catch(_){alert('Incorrect Staff password.')}}
function installRoleBanner(role){document.querySelector('.spectator-readonly-banner')?.remove();if(role!=='spectator')return;const banner=document.createElement('div');banner.className='spectator-readonly-banner';banner.textContent='LIVE SPECTATOR VIEW • READ ONLY';document.body.prepend(banner)}
function readTournamentLibrary(){try{return JSON.parse(localStorage.getItem(KSM_V316_LIBRARY)||'[]')}catch(_){return []}}
function writeTournamentLibrary(list){localStorage.setItem(KSM_V316_LIBRARY,JSON.stringify((list||[]).slice(0,100)))}
function rememberTournament(record){if(!record?.tournamentId)return;const list=readTournamentLibrary().filter(x=>x.id!==record.tournamentId);list.unshift({id:record.tournamentId,name:record.payload?.setup?.tName||'Kendo Tournament',updatedAt:record.updatedAt||new Date().toISOString()});writeTournamentLibrary(list)}
function libraryCardMarkup(x){const mark=`<span class="home-card-placeholder" aria-hidden="true">🏆</span>`;const id=jsArg(x.id);return `<div class="home-tournament-item" data-testid="home-tournament"><button class="home-tournament-card" type="button" onclick='openTournamentFromHome(${id})' aria-label="Open ${esc(x.name)}">${mark}</button><button class="home-card-name-below" type="button" onclick='openTournamentFromHome(${id})' data-testid="home-tournament-name">${esc(x.name)}</button></div>`}
function paintHomeTournamentLibrary(list,message='No tournaments yet.'){const host=document.getElementById('homeTournamentLibrary');if(!host)return;host.innerHTML=list.length?list.map(libraryCardMarkup).join(''):`<div class="home-empty"><b>${esc(message)}</b></div>`}
async function renderHomeTournamentLibrary(){const cached=readTournamentLibrary();paintHomeTournamentLibrary(cached,cached.length?'':'Loading tournaments…');if(!navigator.onLine){if(!cached.length)paintHomeTournamentLibrary([],'Offline — no cached tournaments are available.');return}try{const ids=cached.map(x=>x.id).filter(Boolean);const response=await fetch(ids.length?'/api/tournaments/discover':'/api/tournaments',{method:ids.length?'POST':'GET',headers:ids.length?{'content-type':'application/json'}:undefined,body:ids.length?JSON.stringify({ids}):undefined,cache:'no-store'});if(!response.ok)throw new Error(`Library load failed (${response.status})`);const cloud=await response.json();writeTournamentLibrary(cloud);paintHomeTournamentLibrary(cloud)}catch(err){console.warn(err);if(!cached.length)paintHomeTournamentLibrary([],'Unable to load the Tournament Library. Check your connection.') }}
function showHomePage(){closeNavMenus();disconnectCloudSocket();sessionStorage.removeItem(KSM_V316_STAFF_SESSION);setSessionRole('spectator');installRoleBanner('home');document.body.classList.add('ksm-home');renderHomeTournamentLibrary();show('home')}
async function createNewTournament(){const name=prompt('Tournament Name','Kendo Tournament');if(!name)return;const password=promptNewStaffPassword();if(!password)return;document.body.classList.remove('ksm-home');disconnectCloudSocket();cloudSession.tournamentId=null;cloudSession.revision=0;cloudSession.updatedAt=null;cloudSession.court='';persistCloudSession();sessionStorage.setItem(KSM_V316_STAFF_SESSION,password);if(window.tName)tName.value=name;setSessionRole('staff');installRoleBanner('staff');navigateTo('setup');markLocalSave('New tournament');showKsmToast('Creating tournament in cloud…',0);try{await performCloudSave(tournamentPayload(),0);showKsmToast('✓ Tournament created',2200)}catch(err){console.error(err);writeOutbox(tournamentPayload(),'New tournament');showKsmToast(navigator.onLine?'Unable to create tournament in cloud':'Offline · Tournament will sync when connected',3500,true)}}
async function openTournamentFromHome(id){sessionStorage.removeItem(KSM_V316_STAFF_SESSION);setSessionRole('spectator');document.body.classList.remove('ksm-home');try{await loadTournamentFromCloud(id,{spectator:true});setSessionRole('spectator');installRoleBanner('spectator');navigateTo('public')}catch(err){console.error(err);document.body.classList.add('ksm-home');renderHomeTournamentLibrary();alert('Unable to open that tournament. The network or tournament data could not be loaded. Please retry; if the problem continues, check the browser console.')}}
async function openTournamentLibrary(){showHomePage()}
function spectatorLink(){if(!cloudSession.tournamentId)return '';const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('tournament',cloudSession.tournamentId);return url.toString()}
async function openTournamentAccess(){if(!cloudSession.tournamentId)await saveNow();if(!cloudSession.tournamentId){alert('Connect to the internet and save the tournament first.');return}const link=spectatorLink();const qr=`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(link)}`;openCloudModal('Tournament Access',`<div class="access-link-box" data-testid="access-link">${esc(link)}</div><div class="row" style="margin-top:12px"><button onclick='copyTextValue(${jsArg(link)},"Tournament link copied")' data-testid="access-copy">Copy Link</button></div><div class="access-qr"><img src="${qr}" alt="Tournament access QR code" data-testid="access-qr"><p class="small">Scan to open the tournament in Spectator mode.</p></div>`)}
async function performCloudSave(payload=tournamentPayload(),baseRevision=cloudSession.revision||0,rebaseAttempt=0,originalBaseRevision=baseRevision){
  const existing=cloudSession.tournamentId;
  const attemptId=++ksmCloudAttemptCounter;
  let envelope={...cloudEnvelope(payload),revision:baseRevision};
  if(!existing){
    const password=v316StaffPassword()||promptNewStaffPassword();
    if(!password)throw new Error('Staff password required');
    sessionStorage.setItem(KSM_V316_STAFF_SESSION,password);
    setSessionRole('staff');
    envelope={...envelope,staffPassword:password};
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
      body
    });
  }catch(err){
    writeCloudDiagnosticsState({attemptId,stage:'Network request failed',errorMessage:String(err?.message||err),lastFailureAt:new Date().toISOString()});
    throw err;
  }
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
  if(response.status===403){
    writeCloudDiagnosticsState({attemptId,stage:'Authorization rejected',errorMessage:'Session authorization required'});
    throw new Error('Session authorization required');
  }
  if(response.status===409){
    const conflict=parsed||{},serverRecord=conflict.record;
    if(serverRecord&&existing&&rebaseAttempt<KSM_CLOUD_REBASE_MAX_ATTEMPTS){
      const serverRevision=Number(serverRecord.revision||0);
      const replayActions=pendingLocalCourtActionsForRebase(payload,serverRecord,originalBaseRevision);
      const rebased=rebaseLocalPayloadOnRecord(payload,serverRecord,originalBaseRevision);
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
      const savedRecord=await performCloudSave(rebased,cloudSession.revision,rebaseAttempt+1,originalBaseRevision);
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
  rememberTournament(record);
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
async function loadTournamentFromCloud(tournamentId,options={}){const id=(tournamentId||cloudSession.tournamentId||'').trim();if(!id)throw new Error('Tournament ID required');setConnectionStatus('Loading cloud…','connecting');const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}`);if(!response.ok)throw new Error(`Cloud load failed (${response.status})`);const record=await response.json();const requestedCourt=options.court?normalizeCourt(options.court):pinnedCourt();cloudSession.tournamentId=record.tournamentId;if(requestedCourt)pinCourtLocally(requestedCourt);disconnectCloudSocket();ksmApplyingRemoteSnapshot=true;try{applyTournamentPayload(record.payload,false,{pinnedCourt:requestedCourt});localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(record.payload))}finally{ksmApplyingRemoteSnapshot=false}cloudSession.tournamentId=record.tournamentId;cloudSession.revision=record.revision;cloudSession.updatedAt=record.updatedAt;cloudSession.court=requestedCourt||'';persistCloudSession();rememberTournament(record);ksmLastSuccessfulSaveAt=Date.parse(record.updatedAt)||Date.now();ksmSaveStatusMode='saved';setSessionRole(v316StaffPassword()?'staff':'spectator');installRoleBanner(ksmSessionRole);connectCloudSocket();setConnectionStatus('Connected','online');renderPersistentSaveStatus();return record}
async function initializeCloudRoleFromUrl(){ensureClientIdentity();const params=new URLSearchParams(location.search);const id=params.get('tournament')||params.get('spectator')||'';const requestedView=params.get('view')||'';const requestedCourt=/* ksm:post-split-begin court-pin was:(params.get('court')||'A').toUpperCase()==='B'?'B':'A' */params.get('court')?normalizeCourt(params.get('court')):(requestedView!=='tv'&&id&&storedCourtPin(id))||'A'/* ksm:post-split-end */;if(id){sessionStorage.removeItem(KSM_V316_STAFF_SESSION);await loadTournamentFromCloud(id,{spectator:true,court:requestedCourt});setSessionRole('spectator');installRoleBanner('spectator');document.body.classList.remove('ksm-home');if(requestedView==='tv'){document.body.classList.add('ksm-tv');cloudSession.court=requestedCourt;persistCloudSession();renderTvDisplay();renderTvRealtimeDiagnostics();show('tv')}else{document.body.classList.remove('ksm-tv');navigateTo('public')}return true}showHomePage();return true}
