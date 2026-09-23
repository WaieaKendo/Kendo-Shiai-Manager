function cloudSocketUrl(id){
  const protocol=location.protocol==='https:'?'wss:':'ws:';
  const url=new URL(`${protocol}//${location.host}/api/tournaments/${encodeURIComponent(id)}/live`);
  url.searchParams.set('role',ksmSessionRole==='local'?'spectator':ksmSessionRole);
  if(sessionKey())url.searchParams.set('key',sessionKey());
  url.searchParams.set('clientId',cloudSession.clientId||'');url.searchParams.set('name',cloudSession.clientName||'KSM Device');
  if(cloudSession.court)url.searchParams.set('court',cloudSession.court);
  return url.toString();
}
const ksmTvRealtimeDiagnostics={status:'Not connected',messages:0,ignored:0,lastMessageAt:null,lastReceivedRevision:0,lastAppliedRevision:0,lastVerifiedRevision:0,lastVerifiedAt:null,refreshes:0,lastReason:'Waiting'};
function isTvSession(){return document.body.classList.contains('ksm-tv')||new URLSearchParams(location.search).get('view')==='tv'}
function preserveLocalDivisionForRemoteSync(){
  // v3.17.17 intentionally made the scorekeeper-selected division local so a
  // remote court could not switch it back. That rule must NOT apply to a
  // read-only TV/spectator client: its job is to follow the authoritative
  // courtState/courtActiveDivision published by the scorekeeper.
  return canCloudWrite()&&!isTvSession();
}
function formatTvDiagTime(value){return value?new Date(value).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'}
function renderTvRealtimeDiagnostics(){
  const el=document.getElementById('tvRealtimeDiagnostics');
  if(!el||!document.body.classList.contains('ksm-tv'))return;
  const d=ksmTvRealtimeDiagnostics;
  el.innerHTML=`<strong>TV Realtime Diagnostics</strong><div class="tvdiag-grid"><span class="tvdiag-label">Status</span><span>${esc(d.status)}</span><span class="tvdiag-label">Messages</span><span>${d.messages}</span><span class="tvdiag-label">Last message</span><span>${esc(formatTvDiagTime(d.lastMessageAt))}</span><span class="tvdiag-label">Received revision</span><span>${d.lastReceivedRevision||'—'}</span><span class="tvdiag-label">Applied revision</span><span>${d.lastAppliedRevision||'—'}</span><span class="tvdiag-label">Verified revision</span><span>${d.lastVerifiedRevision||'—'}</span><span class="tvdiag-label">Last verified</span><span>${esc(formatTvDiagTime(d.lastVerifiedAt))}</span><span class="tvdiag-label">Full refreshes</span><span>${d.refreshes}</span><span class="tvdiag-label">Ignored</span><span>${d.ignored}</span><span class="tvdiag-label">Last action</span><span>${esc(d.lastReason)}</span></div><button type="button" onclick="reconnectTvRealtime()">Reconnect Realtime</button>`;
}
function updateTvRealtimeDiagnostics(patch){Object.assign(ksmTvRealtimeDiagnostics,patch);renderTvRealtimeDiagnostics()}
function clearTvSyncTimers(){clearTimeout(ksmTvInitialSyncTimer);ksmTvInitialSyncTimer=null;clearInterval(ksmTvVerificationTimer);ksmTvVerificationTimer=null}
function scheduleTvVerification(){
  if(!isTvSession())return;
  clearInterval(ksmTvVerificationTimer);
  ksmTvVerificationTimer=setInterval(()=>refreshTvFromCloud('Periodic verification',false),15000);
}
async function refreshTvFromCloud(reason='TV full refresh',forceApply=true){
  if(!isTvSession()||!cloudSession.tournamentId||location.protocol==='file:'||!navigator.onLine)return false;
  if(ksmTvRefreshInFlight)return ksmTvRefreshInFlight;
  updateTvRealtimeDiagnostics({status:'Verifying',lastReason:reason});
  ksmTvRefreshInFlight=(async()=>{
    try{
      const response=await fetch(`/api/tournaments/${encodeURIComponent(cloudSession.tournamentId)}?tvRefresh=${Date.now()}`,{cache:'no-store',headers:{'cache-control':'no-cache'}});
      if(!response.ok)throw new Error(`Refresh failed (${response.status})`);
      const record=await response.json();
      const applied=applyRemoteCloudRecord(record,false,forceApply);
      ksmTvLastVerifiedAt=Date.now();
      updateTvRealtimeDiagnostics({status:'Connected',lastVerifiedRevision:Number(record.revision||0),lastVerifiedAt:ksmTvLastVerifiedAt,refreshes:ksmTvRealtimeDiagnostics.refreshes+1,lastReason:applied?`${reason}: applied ${record.revision}`:`${reason}: verified ${record.revision}`});
      return true;
    }catch(err){
      console.warn('[TV Realtime] Full refresh failed',err);
      updateTvRealtimeDiagnostics({status:navigator.onLine?'Refresh failed':'Offline',lastReason:`${reason}: ${err?.message||err}`});
      return false;
    }finally{ksmTvRefreshInFlight=null}
  })();
  return ksmTvRefreshInFlight;
}
function beginTvInitialSync(){
  if(!isTvSession())return;
  clearTimeout(ksmTvInitialSyncTimer);
  refreshTvFromCloud('Connection handshake');
  ksmTvInitialSyncTimer=setTimeout(()=>{
    const current=Number(cloudSession.revision||0),verified=Number(ksmTvRealtimeDiagnostics.lastVerifiedRevision||0);
    if(!verified||verified<current)refreshTvFromCloud('Initial sync fallback');
  },3000);
  scheduleTvVerification();
}
function reconnectTvRealtime(){updateTvRealtimeDiagnostics({status:'Reconnecting',lastReason:'Manual reconnect requested'});disconnectCloudSocket();connectCloudSocket()}
function disconnectCloudSocket(){clearTimeout(ksmCloudReconnectTimer);ksmCloudReconnectTimer=null;clearTvSyncTimers();if(ksmCloudSocket){const socket=ksmCloudSocket;ksmCloudSocket=null;try{socket.close(1000,'Reconnect')}catch(_){}}}
function scheduleCloudReconnect(){clearTimeout(ksmCloudReconnectTimer);if(!cloudSession.tournamentId||location.protocol==='file:')return;ksmCloudReconnectTimer=setTimeout(()=>connectCloudSocket(),2000)}
function renderCloudPresence(clients=[]){cloudSession.presence=clients;const el=document.getElementById('cloudPresence');if(el)el.textContent=clients.length?`${clients.length} online`:''}
function connectCloudSocket(){
  if(!cloudSession.tournamentId||location.protocol==='file:'||!location.host)return;
  if(ksmCloudSocket&&(ksmCloudSocket.readyState===WebSocket.OPEN||ksmCloudSocket.readyState===WebSocket.CONNECTING))return;
  clearTimeout(ksmCloudReconnectTimer);setConnectionStatus('Sync connecting…','connecting');
  const socket=new WebSocket(cloudSocketUrl(cloudSession.tournamentId));ksmCloudSocket=socket;
  socket.addEventListener('open',()=>{if(socket!==ksmCloudSocket)return;console.info('[TV Realtime] Connected');updateTvRealtimeDiagnostics({status:'Connected',lastReason:'Socket opened'});setConnectionStatus('Live sync','online');try{socket.send('ping')}catch(_){}flushCloudOutbox();beginTvInitialSync()});
  socket.addEventListener('message',event=>{if(socket!==ksmCloudSocket)return;try{
    const message=JSON.parse(event.data);const revision=Number(message.record?.revision||0),current=Number(cloudSession.revision||0);
    console.info('[TV Realtime] Message',message.type,revision||'');
    updateTvRealtimeDiagnostics({messages:ksmTvRealtimeDiagnostics.messages+1,lastMessageAt:Date.now(),lastReceivedRevision:revision||ksmTvRealtimeDiagnostics.lastReceivedRevision,lastReason:`Received ${message.type||'message'}`});
    if((message.type==='snapshot'||message.type==='connected')&&message.record){
      if(isTvSession()&&revision>current+1){updateTvRealtimeDiagnostics({lastReason:`Revision gap ${current} → ${revision}; requesting full refresh`});refreshTvFromCloud('Revision gap recovery')}
      else applyRemoteCloudRecord(message.record,false,isTvSession()&&message.type==='connected');
    }
    if(message.presence)renderCloudPresence(message.presence);if(message.type==='presence')renderCloudPresence(message.clients||[]);
    if(message.type==='credential-rotated'&&message.role===ksmSessionRole){setConnectionStatus('Access key changed','offline');disconnectCloudSocket()}
  }catch(err){console.warn('Cloud sync message failed',err);updateTvRealtimeDiagnostics({lastReason:`Message error: ${err?.message||err}`})}});
  socket.addEventListener('close',()=>{if(socket!==ksmCloudSocket)return;console.info('[TV Realtime] Disconnected');ksmCloudSocket=null;clearTvSyncTimers();updateTvRealtimeDiagnostics({status:navigator.onLine?'Reconnecting':'Offline',lastReason:'Socket closed'});setConnectionStatus(navigator.onLine?'Sync reconnecting…':'Offline • local saved',navigator.onLine?'connecting':'offline');scheduleCloudReconnect()});
  socket.addEventListener('error',()=>{if(socket===ksmCloudSocket){console.warn('[TV Realtime] Socket error');updateTvRealtimeDiagnostics({status:'Interrupted',lastReason:'Socket error'});setConnectionStatus('Sync interrupted','offline')}});
}
window.addEventListener('online',()=>{if(isTvSession()){updateTvRealtimeDiagnostics({status:'Reconnecting',lastReason:'Network restored'});disconnectCloudSocket();connectCloudSocket()}});
document.addEventListener('visibilitychange',()=>{if(isTvSession()&&!document.hidden)refreshTvFromCloud('TV became visible')});
let ksmDeferredRemoteRecord=null;
let ksmLastEditorInputAt=0;
let ksmDeferredRemoteTimer=null;
function activeEditorHasFocus(){
  const el=document.activeElement;
  return Boolean(el&&el!==document.body&&(el.matches?.('input,textarea,select,[contenteditable="true"]')));
}
function recentEditorActivity(){return Date.now()-ksmLastEditorInputAt<3000}
function applyDeferredRemoteRecord(){
  clearTimeout(ksmDeferredRemoteTimer);
  if(activeEditorHasFocus()||recentEditorActivity()||!ksmDeferredRemoteRecord){
    if(ksmDeferredRemoteRecord)ksmDeferredRemoteTimer=setTimeout(applyDeferredRemoteRecord,3200);
    return;
  }
  const record=ksmDeferredRemoteRecord;ksmDeferredRemoteRecord=null;applyRemoteCloudRecord(record,true);
}
document.addEventListener('input',event=>{
  if(event.target?.matches?.('input,textarea,[contenteditable="true"]')){
    ksmLastEditorInputAt=Date.now();
    clearTimeout(ksmDeferredRemoteTimer);
    if(ksmDeferredRemoteRecord)ksmDeferredRemoteTimer=setTimeout(applyDeferredRemoteRecord,3200);
  }
},true);
document.addEventListener('focusout',()=>setTimeout(applyDeferredRemoteRecord,50),true);
function applyRemoteCloudRecord(record,allowWhileEditing=false,forceApply=false){
  const tvCourt=isTvSession()?tvAssignedCourt():normalizeCourt(cloudSession.court||state.publicCourt||'A');
  const priorTvDivision=state.courtActiveDivision?.[tvCourt]||state.courtState?.[tvCourt]?.division||null;
  if(!record||record.tournamentId!==cloudSession.tournamentId){updateTvRealtimeDiagnostics({ignored:ksmTvRealtimeDiagnostics.ignored+1,lastReason:'Ignored wrong tournament'});return false}
  const incomingRevision=Number(record.revision||0);
  if(!forceApply&&canCloudWrite()&&localChangesPending())return deferRemoteRecord(record,`Revision ${incomingRevision} arrived while local Court ${pinnedCourt()||state.currentCourt||'—'} changes were pending`);
  if(!forceApply&&incomingRevision<=Number(cloudSession.revision||0)){updateTvRealtimeDiagnostics({ignored:ksmTvRealtimeDiagnostics.ignored+1,lastReason:`Ignored old revision ${incomingRevision}`});return false}
  // Staff pages ignore their own echoed save. Spectator/TV pages must apply it even when
  // they share the same browser-level client ID with the Staff tab.
  const isOwnWritableUpdate=canCloudWrite()&&Boolean(record.updatedBy?.clientId&&record.updatedBy.clientId===cloudSession.clientId);
  if(isOwnWritableUpdate){
    cloudSession.revision=incomingRevision;cloudSession.updatedAt=record.updatedAt;persistCloudSession();ksmLastSuccessfulSaveAt=Date.parse(record.updatedAt)||Date.now();ksmSaveStatusMode='saved';clearOutbox();renderPersistentSaveStatus();setConnectionStatus('Live sync','online');updateTvRealtimeDiagnostics({ignored:ksmTvRealtimeDiagnostics.ignored+1,lastReason:`Ignored own Staff echo ${incomingRevision}`});return false
  }
  if(!allowWhileEditing&&ksmSessionRole==='staff'&&(activeEditorHasFocus()||recentEditorActivity())){
    if(!ksmDeferredRemoteRecord||incomingRevision>Number(ksmDeferredRemoteRecord.revision||0))ksmDeferredRemoteRecord=record;
    updateSaveStatus('Live update waiting for editing to finish');updateTvRealtimeDiagnostics({lastReason:`Deferred revision ${incomingRevision} while editing`});return false;
  }
  const outbox=readOutbox();if(outbox&&Number(outbox.baseRevision||0)<incomingRevision&&!(isReadOnlySession()&&outbox.role==='staff'&&outbox.tournamentId===record.tournamentId)){preserveRecovery(outbox,record);clearOutbox()}
  ksmApplyingRemoteSnapshot=true;
  try{
    applyTournamentPayload(record.payload,false,{pinnedCourt:pinnedCourt(),preserveLocalDivision:preserveLocalDivisionForRemoteSync(),source:'live sync'});restorePinnedCourt();localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(record.payload));cloudSession.revision=Math.max(Number(cloudSession.revision||0),incomingRevision);cloudSession.updatedAt=record.updatedAt;persistCloudSession();const by=record.updatedBy?.name||record.updatedBy?.role;updateSaveStatus((by?`Updated by ${by} • `:'Live update • ')+new Date(record.updatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));setConnectionStatus('Live sync','online');const nextTvDivision=state.courtActiveDivision?.[tvCourt]||state.courtState?.[tvCourt]?.division||null;if(isTvSession()){renderTvDisplay();if(priorTvDivision!==nextTvDivision)console.info('[TV Realtime] Active division changed',tvCourt,priorTvDivision,'→',nextTvDivision)}console.info('[TV Realtime] Applied revision',incomingRevision);updateTvRealtimeDiagnostics({lastAppliedRevision:incomingRevision,lastReason:priorTvDivision!==nextTvDivision?`Applied ${incomingRevision}; Court ${tvCourt} division refreshed`:`Applied revision ${incomingRevision}`});return true
  }finally{ksmApplyingRemoteSnapshot=false}
}


function saveTournamentToCloud(){return saveTournamentToCloudWithReason('Manual cloud save',true)}
function queuePendingCloudSave(reason='Autosave',force=false){
  return new Promise(resolve=>{
    if(!ksmCloudSavePending)ksmCloudSavePending={reason,force:Boolean(force),resolvers:[]};
    else{ksmCloudSavePending.reason=reason||ksmCloudSavePending.reason;ksmCloudSavePending.force=ksmCloudSavePending.force||Boolean(force)}
    ksmCloudSavePending.resolvers.push(resolve);
    if(force){ksmSaveStatusMode='syncing';renderPersistentSaveStatus()}
  })
}
async function runPendingCloudSave(){
  const pending=ksmCloudSavePending;if(!pending)return;
  ksmCloudSavePending=null;
  const saved=await saveTournamentToCloudWithReason(pending.reason,pending.force);
  pending.resolvers.forEach(resolve=>resolve(saved));
}
async function saveTournamentToCloudWithReason(reason='Autosave',force=false){
  if(location.protocol==='file:'||ksmApplyingRemoteSnapshot||isReadOnlySession()||!canCloudWrite())return false;
  if(ksmCloudSaveInFlight)return queuePendingCloudSave(reason,force);
  const payload=tournamentPayload();
  if(!navigator.onLine){writeOutbox(payload,reason);setConnectionStatus('Offline','offline');return false}
  ksmCloudSaveInFlight=true;
  ksmSaveStatusMode=readOutbox()?'syncing':'saving';
  setConnectionStatus('Connected','online');
  renderPersistentSaveStatus();
  const savingMutationVersion=ksmLocalMutationVersion;
  try{
    const savedRecord=await performCloudSave(payload,cloudSession.revision||0);
    ksmConfirmedMutationVersion=Math.max(ksmConfirmedMutationVersion,savingMutationVersion);
    if(savedRecord?.__ksmRebased){
      let localPayload=savedRecord.payload;
      const newerLocalActions=ksmLocalMutationVersion!==savingMutationVersion;
      if(newerLocalActions){
        localPayload=rebaseLocalPayloadOnRecord(
          tournamentPayload(),
          savedRecord,
          Number(savedRecord.__ksmOriginalBaseRevision||0)
        );
        writeCloudDiagnosticsState({
          stage:'Rebased cloud result merged with newer local court actions',
          serverRevision:Number(savedRecord.revision||0),
          rebaseAttempt:Number(savedRecord.__ksmRebaseAttempts||0),
          pinnedCourt:pinnedCourt()||''
        });
      }
      ksmApplyingRemoteSnapshot=true;
      try{
        applyTournamentPayload(localPayload,false,{pinnedCourt:pinnedCourt(),preserveLocalDivision:true,source:'concurrent rebase'});
        localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(localPayload));
      }finally{ksmApplyingRemoteSnapshot=false}
    }
    return true;
  }catch(err){
    console.warn('Cloud save failed',err);
    if(!String(err.message).includes('conflict'))writeOutbox(payload,reason);
    ksmSaveStatusMode=String(err.message).includes('conflict')?'error':'offline';
    setConnectionStatus(String(err.message).includes('conflict')?'Conflict':'Offline',String(err.message).includes('conflict')?'error':'offline');
    renderPersistentSaveStatus();
    scheduleCloudReconnect();
    return false;
  }finally{
    ksmCloudSaveInFlight=false;
    await runPendingCloudSave();
    if(!localChangesPending())applyDeferredSyncRecord();
  }
}
async function flushCloudOutbox(){const outbox=readOutbox();if(!outbox||ksmCloudSaveInFlight||isReadOnlySession()||!navigator.onLine)return false;if(outbox.tournamentId&&outbox.tournamentId!==cloudSession.tournamentId){writeCloudDiagnosticsState({stage:'Outbox blocked',errorMessage:'Queued snapshot belongs to a different tournament',queuedTournamentId:outbox.tournamentId||'',activeTournamentId:cloudSession.tournamentId||''});return false}ksmCloudSaveInFlight=true;ksmSaveStatusMode='syncing';writeCloudDiagnosticsState({stage:'Retrying queued snapshot',lastAttemptAt:new Date().toISOString(),baseRevision:outbox.baseRevision||0,snapshotBytes:payloadByteSize(outbox.payload),retryCount:(readCloudDiagnosticsState().retryCount||0)+1});renderPersistentSaveStatus();const mutationVersion=ksmLocalMutationVersion;try{const record=await performCloudSave(outbox.payload,outbox.baseRevision);
  // After a reload the screen shows the older cloud copy and our own echo is ignored: show what
  // was just saved, replaying court actions taken while the flush was in flight (as a rebase does).
  if(record?.payload){const localPayload=ksmLocalMutationVersion===mutationVersion?record.payload:rebaseLocalPayloadOnRecord(tournamentPayload(),record,Number(outbox.baseRevision||0));ksmApplyingRemoteSnapshot=true;try{applyTournamentPayload(localPayload,false,{pinnedCourt:pinnedCourt(),preserveLocalDivision:true,source:'outbox flush'});localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(localPayload))}finally{ksmApplyingRemoteSnapshot=false}}
  return true}catch(err){console.warn('Queued cloud save failed',err);writeCloudDiagnosticsState({stage:'Queued save failed',errorMessage:String(err?.message||err),lastFailureAt:new Date().toISOString()});ksmSaveStatusMode='error';renderPersistentSaveStatus();return false}finally{ksmCloudSaveInFlight=false;await runPendingCloudSave()}}
async function retryQueuedCloudSave(){if(!readOutbox()){showKsmToast('No queued snapshot to retry',1800);return}showKsmToast('Retrying queued save…',1200);const ok=await flushCloudOutbox();showKsmToast(ok?'✓ Queued save completed':'Queued save still needs attention',2600,!ok);cloudDiagnostics()}
function scheduleCloudSave(reason='Autosave',delay=1200){if(ksmApplyingRemoteSnapshot||isReadOnlySession())return;clearTimeout(ksmCloudTimer);ksmCloudTimer=setTimeout(()=>{ksmCloudTimer=null;saveTournamentToCloudWithReason(reason)},delay)}
async function promptLoadTournamentFromCloud(){const id=prompt('Enter Tournament ID',cloudSession.tournamentId||'');if(!id)return;try{await loadTournamentFromCloud(id,{spectator:true});updateSaveStatus('Loaded cloud tournament')}catch(err){alert('Unable to load that cloud tournament.');console.error(err);setConnectionStatus('Cloud load failed','offline')}}
async function copyTournamentId(){if(!cloudSession.tournamentId)await saveTournamentToCloud();if(!cloudSession.tournamentId){alert('A Tournament ID could not be created while offline.');return}await copyTextValue(cloudSession.tournamentId,'Tournament ID copied')}
async function loadTournamentFromCloud(tournamentId,options={}){
  const id=(tournamentId||cloudSession.tournamentId||'').trim();if(!id)throw new Error('Tournament ID required');const previousTournamentId=cloudSession.tournamentId||'';if(previousTournamentId&&previousTournamentId!==id)clearLocalCourtDivisions();const requestedCourt=options.court?normalizeCourt(options.court):pinnedCourt();if(requestedCourt)pinCourtLocally(requestedCourt);setConnectionStatus('Loading cloud…','connecting');const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}`);if(!response.ok)throw new Error(`Cloud load failed (${response.status})`);const record=await response.json();disconnectCloudSocket();cloudSession.tournamentId=record.tournamentId;if(requestedCourt)pinCourtLocally(requestedCourt);ksmApplyingRemoteSnapshot=true;try{applyTournamentPayload(record.payload,false,{pinnedCourt:requestedCourt,preserveLocalDivision:false,source:'cloud load'});localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(record.payload))}finally{ksmApplyingRemoteSnapshot=false}
  cloudSession.tournamentId=record.tournamentId;cloudSession.revision=record.revision;cloudSession.updatedAt=record.updatedAt;cloudSession.court=requestedCourt||'';
  if(options.credentials)cloudSession.credentials=options.credentials;else if(options.role&&options.key){cloudSession.credentials={[options.role]:options.key}}else if(options.spectator)delete cloudSession.credentials;
  persistCloudSession();ksmLastSuccessfulSaveAt=Date.parse(record.updatedAt)||Date.now();ksmSaveStatusMode='saved';setSessionRole(options.role||((cloudSession.credentials&&Object.keys(cloudSession.credentials)[0])||'spectator'));connectCloudSocket();setConnectionStatus('Connected','online');renderPersistentSaveStatus();return record;
}
function showKsmToast(message,duration=2000,isError=false){let toast=document.getElementById('ksmToast');if(!toast){toast=document.createElement('div');toast.id='ksmToast';toast.className='ksm-toast';toast.dataset.testid='toast';document.body.appendChild(toast)}clearTimeout(showKsmToast.timer);toast.textContent=message;toast.classList.toggle('error',Boolean(isError));requestAnimationFrame(()=>toast.classList.add('show'));if(duration>0)showKsmToast.timer=setTimeout(()=>toast.classList.remove('show'),duration)}
async function copyTextValue(value,success,closeAfter=false){try{await navigator.clipboard.writeText(value);showKsmToast('✓ '+success,1200);if(closeAfter)setTimeout(closeCloudModal,850);return true}catch(_){prompt(success,value);return false}}
function roleLink(role,court=''){if(!cloudSession.tournamentId)return '';const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('role',role);url.searchParams.set('tournament',cloudSession.tournamentId);const key=cloudSession.credentials?.[role];if(key)url.searchParams.set('key',key);if(court)url.searchParams.set('court',court);return url.toString()}
function tvLink(court){const url=new URL(roleLink('spectator',court));if(!url.href||!cloudSession.tournamentId)return '';url.searchParams.set('view','tv');url.searchParams.set('court',court);return url.toString()}
function spectatorLink(){return roleLink('spectator')}
function directorLink(){return roleLink('director')}
async function copySpectatorLink(){if(!cloudSession.tournamentId)await saveTournamentToCloud();const link=spectatorLink();if(!link){alert('Create the cloud tournament while online first.');return}await copyTextValue(link,'Spectator link copied')}
async function copyDirectorLink(){const link=directorLink();if(!link||!cloudSession.credentials?.director){alert('This device does not have director access.');return}await copyTextValue(link,'Director link copied')}
// Court access helpers remain available: copyScorekeeperLink('A') copyScorekeeperLink('B')
async function copyScorekeeperLink(court){const link=roleLink('scorekeeper',court);if(!link||!cloudSession.credentials?.scorekeeper){alert('This device does not have the scorekeeper credential.');return}await copyTextValue(link,`Court ${court} scorekeeper link copied`)}
async function copyAdminLink(){const link=roleLink('admin');if(!link||!cloudSession.credentials?.admin){alert('This device does not have admin access.');return}await copyTextValue(link,'Admin link copied')}
function closeCloudModal(){document.getElementById('ksmCloudModal')?.remove()}
function openCloudModal(title,body){closeCloudModal();const wrap=document.createElement('div');wrap.id='ksmCloudModal';wrap.className='cloud-modal-backdrop';wrap.innerHTML=`<div class="cloud-modal" role="dialog" aria-modal="true" data-testid="cloud-modal"><div class="cloud-modal-head"><div><div class="setup-panel-eyebrow">KSM Cloud</div><h2 data-testid="cloud-modal-title">${esc(title)}</h2></div><button class="secondary" onclick="closeCloudModal()" data-testid="cloud-modal-close">Close</button></div>${body}</div>`;wrap.addEventListener('click',e=>{if(e.target===wrap)closeCloudModal()});document.body.appendChild(wrap)}
function showQr(label,link){if(!link)return;const qr=`https://api.qrserver.com/v1/create-qr-code/?size=440x440&data=${encodeURIComponent(link)}`;openCloudModal(`${label} QR Code`,`<img class="cloud-qr" src="${qr}" alt="${label} QR code"><p class="small" style="text-align:center">Scan this code to open ${label}.</p><div class="row" style="justify-content:center"><button class="secondary" onclick="openTournamentAccess()">Back</button></div>`)}
async function openTournamentAccess(){if(!cloudSession.tournamentId)await saveNow();if(!cloudSession.tournamentId){alert('Connect to the internet and save the tournament first.');return}const rows=[['Spectator View',spectatorLink(),true],['Court A Scorekeeper',roleLink('scorekeeper','A'),Boolean(cloudSession.credentials?.scorekeeper)],['Court B Scorekeeper',roleLink('scorekeeper','B'),Boolean(cloudSession.credentials?.scorekeeper)],['TV Display — Court A',tvLink('A'),true],['TV Display — Court B',tvLink('B'),true],['Admin Access',roleLink('admin'),Boolean(cloudSession.credentials?.admin)]];const html=`<p class="small">Spectator access is public. Court and Admin links are private.</p>${rows.map(([label,link,allowed])=>`<div class="cloud-access-row"><div><b>${esc(label)}</b>${allowed?'':`<div class="small">Not available on this device</div>`}</div><div class="cloud-access-actions">${allowed?`<button onclick='copyTextValue(${jsArg(link)},${jsArg(label+' link copied')},true)'>Copy Link</button><button class="secondary" onclick='showQr(${jsArg(label)},${jsArg(link)})'>QR Code</button>`:''}</div></div>`).join('')}`;openCloudModal('Tournament Access',html)}
function installRoleBanner(role){document.querySelector('.spectator-readonly-banner')?.remove();if(!['spectator','scorekeeper'].includes(role))return;const banner=document.createElement('div');banner.className='spectator-readonly-banner';banner.textContent=role==='spectator'?'LIVE SPECTATOR VIEW • READ ONLY':`COURT ${cloudSession.court||'—'} SCOREKEEPER • LIVE SYNC`;document.body.prepend(banner)}
function cloudDiagnostics(){const outbox=readOutbox(),presence=cloudSession.presence||[],diag=readCloudDiagnosticsState(),currentAnalysis=analyzeTournamentSnapshot(),analysis=diag.snapshotAnalysis||currentAnalysis,historyAnalysis=analyzeCourtActionHistory();const details=[['Connection',navigator.onLine?'Online':'Offline'],['Realtime',ksmCloudSocket?.readyState===1?'Connected':'Not connected'],['Last successful save',ksmLastSuccessfulSaveAt?new Date(ksmLastSuccessfulSaveAt).toLocaleString():'None'],['Pending offline changes',outbox?'1 queued snapshot':'None'],['Tournament ID',cloudSession.tournamentId||'None'],['Role',ksmSessionRole],['Pinned court',pinnedCourt()||'—'],['Displayed court',state.currentCourt||'—'],['Local changes pending',localChangesPending()?'Yes':'No'],['Court',cloudSession.court||state.currentCourt||'—'],['Connected devices',String(presence.length)],['Cloud revision',String(cloudSession.revision||0)],['Last save stage',diag.stage||'No diagnostic attempt recorded'],['Last attempt',formatDiagnosticTime(diag.lastAttemptAt)],['HTTP status',diag.httpStatus==null?'None':String(diag.httpStatus)],['Last error',diag.errorMessage||'None'],['Server response',diag.errorBody||'None'],['Retry count',String(diag.retryCount||0)],['Queued base revision',outbox?String(outbox.baseRevision||0):'None'],['Queued since',outbox?formatDiagnosticTime(outbox.queuedAt):'None'],['Snapshot size',formatSnapshotBytes(outbox?payloadByteSize(outbox.payload):(diag.snapshotBytes||currentAnalysis.totalBytes))]];const actions=`<div class="row" style="justify-content:flex-end;margin-top:18px;gap:10px;flex-wrap:wrap"><button class="secondary" onclick="downloadSnapshotAnalysis()">Download snapshot analysis</button><button class="secondary" onclick="downloadActionHistorySample()">Download action history sample</button>${outbox&&!isReadOnlySession()?'<button class="secondary" onclick="retryQueuedCloudSave()" data-testid="diagnostics-retry">Retry queued save</button>':''}</div>`;openCloudModal('Developer Tools',`<div class="cloud-detail-grid">${details.map(([a,b])=>`<div class="cloud-detail"><div class="small">${esc(a)}</div><b style="overflow-wrap:anywhere">${esc(b)}</b></div>`).join('')}</div><h2 style="margin-top:24px">Snapshot Analysis</h2>${snapshotAnalysisHtml(analysis)}<h2 style="margin-top:24px">Action History Analysis</h2><p class="small">Read-only diagnostics. Scoring, undo, redo, saving, and synchronization are unchanged.</p>${actionHistoryAnalysisHtml(historyAnalysis)}${actions}`)}
async function initializeCloudRoleFromUrl(){ensureClientIdentity();const params=new URLSearchParams(location.search);let role=params.get('role'),id=params.get('tournament'),key=params.get('key'),court=params.get('court')||'',requestedView=params.get('view')||'';
  if(!role){if(params.get('spectator')){role='spectator';id=params.get('spectator')}else if(params.get('director')){role='director';id=params.get('director');key=params.get('key')}}
  if(role&&id){role=['spectator','scorekeeper','director','admin'].includes(role)?role:'spectator';cloudSession.clientName=promptDeviceName(role,cloudSession.clientName);await loadTournamentFromCloud(id,role==='spectator'?{spectator:true,role,court}:{role,key,court});installRoleBanner(role);if(requestedView==='tv'){document.body.classList.add('ksm-tv');cloudSession.court=(court||'A').toUpperCase()==='B'?'B':'A';persistCloudSession();renderTvDisplay();renderTvRealtimeDiagnostics();show('tv')}else if(role==='spectator'){navigateTo('public')}else if(role==='scorekeeper'){chooseCourt(court||'A')}else navigateTo('director');return true}
  const creds=cloudSession.credentials||{};const savedRole=cloudSession.tournamentId?(creds.admin?'admin':creds.director?'director':creds.scorekeeper?'scorekeeper':'spectator'):'local';setSessionRole(savedRole);installRoleBanner(savedRole);return false}
function promptDeviceName(role,current){if(role==='spectator')return current||'Spectator';const suggested=current&&current!=='KSM Device'?current:(role==='scorekeeper'?`Court Device`:'Director Device');return prompt('Name this device for live session status',suggested)||suggested}
window.addEventListener('online',()=>{setConnectionStatus('Reconnecting','connecting');ksmSaveStatusMode=readOutbox()?'syncing':'saved';renderPersistentSaveStatus();connectCloudSocket();flushCloudOutbox()});window.addEventListener('offline',()=>{setConnectionStatus('Offline','offline');markLocalSave('Offline safety save');writeOutbox(tournamentPayload(),'Connection lost')});

function triggerLoadRecoveryFile(){document.getElementById('ksmRecoveryFile')?.click()}
async function loadRecoveryFile(event){const file=event.target.files&&event.target.files[0];if(!file)return;try{const pack=JSON.parse(await file.text());if(pack.fileType!=='KSM_RECOVERY'||!pack.latestLocalSnapshot?.state)throw new Error('Invalid recovery file');const restoredPassword=promptNewStaffPassword();if(!restoredPassword)throw new Error('New Staff password required');sessionStorage.setItem(KSM_V316_STAFF_SESSION,restoredPassword);setSessionRole('staff');cloudSession.tournamentId=null;cloudSession.revision=0;if(cloudSession.tournamentId&&pack.tournamentId&&cloudSession.tournamentId!==pack.tournamentId&&!confirm('This recovery file belongs to a different Tournament ID. Load its local snapshot anyway?'))return;applyTournamentPayload(pack.latestLocalSnapshot,false);localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(pack.latestLocalSnapshot));if(pack.outbox)localStorage.setItem(KSM_CLOUD_OUTBOX_KEY,JSON.stringify(pack.outbox));cloudSession.tournamentId=null;cloudSession.revision=0;if(pack.assignedCourt)cloudSession.court=pack.assignedCourt;persistCloudSession();ksmSaveStatusMode='offline';setConnectionStatus(navigator.onLine?'Connected':'Offline',navigator.onLine?'online':'offline');renderPersistentSaveStatus();if(navigator.onLine&&pack.outbox)await flushCloudOutbox();updateSaveStatus('Recovery file loaded')}catch(err){console.error(err);alert('Unable to load this recovery file.')}finally{event.target.value=''}}
function manualSaveTournament(){
  try{
    const payload=tournamentPayload();
    const base=(payload.setup?.tName||'KSM_Tournament').replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'') || 'KSM_Tournament';
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=base+'.ksm';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    updateSaveStatus('Saved file');
  }catch(err){ alert('Unable to save tournament file.'); console.error(err); }
}
function triggerLoadTournament(){ document.getElementById('ksmLoadFile')?.click(); }
function loadTournamentFromFile(event){
  const file=event.target.files && event.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const payload=JSON.parse(String(reader.result||''));
      applyTournamentPayload(payload,true);
      updateSaveStatus('Loaded '+file.name);
    }catch(err){ alert('Unable to load this tournament file.'); console.error(err); }
  };
  reader.readAsText(file);
  event.target.value='';
}
function repairLoadedEliminationAdvancement(source='tournament load'){
  repairCompletedMatchResults(state,source);
  Object.keys(state.allMatches||{}).forEach(div=>{
    if((state.championshipNodes?.[div]||[]).length)syncChampionshipTemplate(div);
    if((state.singleElimNodes?.[div]||[]).length){
      (state.singleElimNodes[div]||[]).forEach(node=>{node.winner=null});
      const comps=(state.singleElimComps?.[div]||eligibleIndividuals(div).filter(c=>c.name));
      syncIndividualSingleElim(div,state.allMatches[div]||[],comps);
    }
  });
}
function rehydrateLoadedTournamentState(options){
  options=options||{};
  const court=state.currentCourt||'A';
  const preserveLocalDivision=options.preserveLocalDivision===true;
  const preferred=preserveLocalDivision?localCourtDivision(court):null;
  let cs=preferred&&Array.isArray(state.allMatches?.[preferred])?{division:preferred,index:0}:state.courtState?.[court];
  if((!cs||!cs.division) && state.currentDivision){
    cs={division:state.currentDivision,index:state.current||0};
  }
  if(cs&&cs.division){
    const arr=state.allMatches?.[cs.division]||[];
    let index=Number.isInteger(cs.index)?cs.index:(state.currentByDivision?.[cs.division]||0);
    index=Math.max(0,Math.min(index,arr.length));
    let normalized={division:cs.division,index};
    const active=arr[index];
    // A saved pointer at arr.length (or at an unresolved championship placeholder)
    // is not an active match. This commonly occurs when pool play finishes before
    // the first QF becomes ready on another synchronized client. Always self-heal
    // to the first currently scorable match for this court/division.
    if(!individualMatchReady(active)||!matchBelongsToCourt(active,court)){
      normalized=findNextForCourt(court,cs.division,0);
    }
    state.courtState=state.courtState||{};
    state.courtState[court]=normalized;
    applyCourtState(court,normalized,true);
    if(normalized.division)rememberLocalCourtDivision(court,normalized.division);
  }else{
    state.matches=[];
    state.current=0;
    state.score={W:[],R:[],WT:0,RT:0};
  }
}

function applyTournamentPayload(payload,saveAfter,options={}){
  if(!payload || !payload.state) throw new Error('Invalid KSM file');
  const localCourt=options.pinnedCourt||pinnedCourt()||cloudSession.court||state.currentCourt||null;
  const localPublicCourt=state.publicCourt||localCourt||'A';
  const loaded=payload.state;
  Object.keys(state).forEach(k=>delete state[k]);
  Object.assign(state, loaded);
  sanitizeLoadedTournamentState(state,options.source||'tournament load');
  normalizeAllIndividualPoolTiebreakOrder(state,options.source||'tournament load');
  state.teamElimTeams=state.teamElimTeams||{};state.managementRevision=state.managementRevision||0;state.divisionCourts=state.divisionCourts||{};Object.keys(state.divisionCourts).forEach(d=>{if(state.divisionCourts[d]==='Both'&&d!=='Team Tournament')state.divisionCourts[d]='split'});
  if(localCourt){pinCourtLocally(localCourt);state.currentCourt=normalizeCourt(localCourt)}
  if(isTvSession())state.publicCourt=normalizeCourt(localCourt||localPublicCourt);else state.publicCourt=normalizeCourt(localPublicCourt);
  applySetupSnapshot(payload.setup);
  ensureCourtHistory();
  repairLoadedEliminationAdvancement(options.source||'tournament load');
  rehydrateLoadedTournamentState(options);
  restorePinnedCourt();
  renderAll();
  updateUndoButton();
  if(saveAfter) autoSaveTournament();
}
function restoreAutoSaveIfWanted(){
  try{
    // A tournament link (spectator, TV, court device) always loads the cloud copy, which would
    // replace anything restored here. Unsynced staff work is kept in the outbox instead.
    const params=new URLSearchParams(location.search);
    if(params.get('tournament')||params.get('spectator'))return false;
    const raw=localStorage.getItem(KSM_SAVE_KEY);
    if(!raw) return false;
    const payload=JSON.parse(raw);
    const label=payload?.setup?.tName || 'autosaved tournament';
    const when=payload?.savedAt ? new Date(payload.savedAt).toLocaleString() : 'unknown time';
    if(confirm('Restore autosaved tournament?\n\n'+label+'\nSaved: '+when)){
      applyTournamentPayload(payload,false);
      updateSaveStatus('Restored autosave');
      return true;
    }
  }catch(err){console.warn('Autosave restore failed',err)}
  return false;
}
// A reload before the debounced cloud save runs must not drop staff work: queue it in the
// outbox, which survives the reload and is flushed once staff access is back.
// An older queued snapshot keeps its base revision so the flush still replays its court actions.
function queueUnsyncedStaffWorkBeforeUnload(){if(isReadOnlySession()||!cloudSession.tournamentId||!localChangesPending())return;const earlier=readOutbox();if(earlier?.tournamentId&&earlier.tournamentId!==cloudSession.tournamentId)return;writeOutbox(tournamentPayload(),'Unsynced changes at page unload');if(earlier){const queued=readOutbox();queued.baseRevision=Math.min(Number(earlier.baseRevision||0),Number(queued.baseRevision||0));localStorage.setItem(KSM_CLOUD_OUTBOX_KEY,JSON.stringify(queued))}}
window.addEventListener('beforeunload', queueUnsyncedStaffWorkBeforeUnload);
window.addEventListener('beforeunload', autoSaveTournament);
document.addEventListener('input', scheduleAutoSave, true);
document.addEventListener('change', scheduleAutoSave, true);
document.addEventListener('click', function(e){ if(e.target.closest('button,.status,.search-item,.tab,.seg,.x')) scheduleAutoSave(); }, true);
setInterval(()=>autoSaveTournament('10-minute safety autosave'),600000);
setInterval(renderPersistentSaveStatus,60000);


