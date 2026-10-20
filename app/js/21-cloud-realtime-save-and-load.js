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
function isTvSession(){return document.body.classList.contains('ksm-tv')||/* ksm:post-split-begin path-urls was:new URLSearchParams(location.search) */ksmLinkParams()/* ksm:post-split-end */.get('view')==='tv'}
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
/* ksm:post-split-begin delete-tournament */
// Issue #26: how the cloud code tells the app that a tournament was deleted (the answer is in
// 44-react-shell.js: ksmTournamentGone()). Events, so the save and load code does not depend on
// the Library and the dialogs.
function ksmAnnounceTournamentGone(id,fromLoad){window.dispatchEvent(new CustomEvent('ksm:tournament-gone',{detail:{id,fromLoad:!!fromLoad}}))}
function ksmAnnounceSocketEnd(id,reason){window.dispatchEvent(new CustomEvent('ksm:tournament-socket-end',{detail:{id,reason}}))}
function ksmGoneError(){return Object.assign(new Error('Tournament deleted'),{code:'tournament-deleted'})}
/* ksm:post-split-end */
async function refreshTvFromCloud(reason='TV full refresh',forceApply=true){
  if(!isTvSession()||!cloudSession.tournamentId||location.protocol==='file:'||!navigator.onLine)return false;
  if(ksmTvRefreshInFlight)return ksmTvRefreshInFlight;
  updateTvRealtimeDiagnostics({status:'Verifying',lastReason:reason});
  /* ksm:post-split-begin tournament-switcher */const refreshEpoch=ksmTournamentEpoch;/* ksm:post-split-end */
  ksmTvRefreshInFlight=(async()=>{
    try{
      const response=await fetch(`/api/tournaments/${encodeURIComponent(cloudSession.tournamentId)}?tvRefresh=${Date.now()}`,{cache:'no-store',headers:{'cache-control':'no-cache'}});
      /* ksm:post-split-begin tournament-switcher */if(refreshEpoch!==ksmTournamentEpoch)return false;/* ksm:post-split-end */
      /* ksm:post-split-begin delete-tournament */if(response.status===410){ksmAnnounceTournamentGone(cloudSession.tournamentId);throw ksmGoneError()}/* ksm:post-split-end */
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
    }finally{/* ksm:post-split-begin tournament-switcher */if(refreshEpoch===ksmTournamentEpoch)/* ksm:post-split-end */ksmTvRefreshInFlight=null}
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
/* ksm:post-split-begin tie-flash */
// Ephemeral live events: never enter tournament state, the outbox or the save queue.
function ksmTieFlashConnected(){return ksmSessionRole==='staff'&&ksmCloudSocket?.readyState===WebSocket.OPEN}
function ksmTieFlashConnectionChanged(){window.dispatchEvent(new Event('ksm:tie-flash-connection'))}
// Names this tab as one reporter of a court's clock; kept across reloads so a reload replaces its own earlier report.
// (crypto.randomUUID needs a secure context; a tablet on a plain-http LAN address does not have it, and a top-level
// throw here would stop the rest of this script from running.)
function ksmClockId(){try{return crypto.randomUUID()}catch(_){return Math.random().toString(36).slice(2)+Date.now().toString(36)}}
const ksmClockSource=(()=>{try{let id=sessionStorage.getItem('ksm:clock-source');if(!id){id=ksmClockId();sessionStorage.setItem('ksm:clock-source',id)}return id}catch(_){return ksmClockId()}})();
function ksmSendCourtClock(court,state){
  if(!ksmTieFlashConnected()||(court!=='A'&&court!=='B')||!['running','stopped','off'].includes(state))return;
  try{ksmCloudSocket.send(JSON.stringify({type:'clock',court,source:ksmClockSource,state}))}catch(_){ksmTieFlashConnectionChanged()}
}
function ksmSendTieFlash(){
  const input=window.ksmCourtScoreboardInput,header=window.ksmCourtHeaderInput;
  if(!ksmTieFlashConnected()||!input?.match||!header||input.score.W.length!==input.score.R.length)return;
  const court=header.court,kind=header.requiresWinner?'encho':'hikiwake';
  if(court!=='A'&&court!=='B')return;
  try{ksmCloudSocket.send(JSON.stringify({type:'flash',court,kind,id:crypto.randomUUID()}))}catch(_){ksmTieFlashConnectionChanged()}
}
/* ksm:post-split-end */
function disconnectCloudSocket(){clearTimeout(ksmCloudReconnectTimer);ksmCloudReconnectTimer=null;clearTvSyncTimers();if(ksmCloudSocket){const socket=ksmCloudSocket;ksmCloudSocket=null;/* ksm:post-split-begin tie-flash */ksmTieFlashConnectionChanged();/* ksm:post-split-end */try{socket.close(1000,'Reconnect')}catch(_){}}}
function scheduleCloudReconnect(){clearTimeout(ksmCloudReconnectTimer);if(!cloudSession.tournamentId||location.protocol==='file:')return;ksmCloudReconnectTimer=setTimeout(()=>connectCloudSocket(),2000)}
function renderCloudPresence(clients=[]){cloudSession.presence=clients;/* ksm:post-split-begin react-shell */ksmRenderPresence(clients);/* ksm:post-split-end */}
function connectCloudSocket(){
  /* ksm:post-split-begin startup-recovery */if((document.body.classList.contains('ksm-home')&&!ksmLinkParams().get('tournament')&&!ksmLinkParams().get('spectator'))||ksmStartupLoadFailed)return;/* ksm:post-split-end */
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
    /* ksm:post-split-begin tie-flash */
    if(message.type==='flash')window.dispatchEvent(new CustomEvent('ksm:tie-flash',{detail:message}));
    if(message.type==='clock')window.dispatchEvent(new CustomEvent('ksm:court-clock',{detail:message}));
    /* ksm:post-split-end */
    if(message.presence)renderCloudPresence(message.presence);if(message.type==='presence')renderCloudPresence(message.clients||[]);
    if(message.type==='credential-rotated'&&message.role===ksmSessionRole){setConnectionStatus('Access key changed','offline');disconnectCloudSocket()}
  }catch(err){console.warn('Cloud sync message failed',err);updateTvRealtimeDiagnostics({lastReason:`Message error: ${err?.message||err}`})}});
  socket.addEventListener('close',()=>{if(socket!==ksmCloudSocket)return;console.info('[TV Realtime] Disconnected');ksmCloudSocket=null;clearTvSyncTimers();updateTvRealtimeDiagnostics({status:navigator.onLine?'Reconnecting':'Offline',lastReason:'Socket closed'});setConnectionStatus(navigator.onLine?'Sync reconnecting…':'Offline • local saved',navigator.onLine?'connecting':'offline');scheduleCloudReconnect()});
/* ksm:post-split-begin delete-tournament */
  // Issue #26: a deleted tournament closes every live connection ('Tournament deleted') after a
  // 'deleted' message; a device that reconnects later is refused (410) and ends the same way.
  {const tournamentId=cloudSession.tournamentId;
  socket.addEventListener('message',event=>{try{if(JSON.parse(event.data).type==='deleted')ksmAnnounceTournamentGone(tournamentId)}catch(_){}});
  socket.addEventListener('close',event=>{if(event.reason!=='Reconnect')ksmAnnounceSocketEnd(tournamentId,event.reason)})}
/* ksm:post-split-end */
  /* ksm:post-split-begin tie-flash */
  for(const event of ['open','close','error'])socket.addEventListener(event,ksmTieFlashConnectionChanged);
  /* ksm:post-split-end */
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
  /* ksm:post-split-begin friendly-links */if(Number(record.revision||0)>=Number(cloudSession.revision||0))ksmCacheTournament(record);/* ksm:post-split-end */
  const incomingRevision=Number(record.revision||0);
  if(!forceApply&&canCloudWrite()&&localChangesPending())return deferRemoteRecord(record,`Revision ${incomingRevision} arrived while local Court ${pinnedCourt()||state.currentCourt||'—'} changes were pending`);
  if(!forceApply&&incomingRevision<=Number(cloudSession.revision||0)){updateTvRealtimeDiagnostics({ignored:ksmTvRealtimeDiagnostics.ignored+1,lastReason:`Ignored old revision ${incomingRevision}`});return false}
  // Staff pages ignore their own echoed save. Spectator/TV pages must apply it even when
  // they share the same browser-level client ID with the Staff tab.
  // F36: the saving tab, not the device: another tab's save (same clientId) is a remote update.
  const isOwnWritableUpdate=canCloudWrite()&&Boolean(record.updatedBy?.clientId&&record.updatedBy.clientId===/* ksm:post-split-begin two-tabs was:cloudSession.clientId */ksmWriterId()/* ksm:post-split-end */);
  if(isOwnWritableUpdate){
    cloudSession.revision=incomingRevision;cloudSession.updatedAt=record.updatedAt;persistCloudSession();/* ksm:post-split-begin edit-merge */rememberCloudBase(record);/* ksm:post-split-end */ksmLastSuccessfulSaveAt=Date.parse(record.updatedAt)||Date.now();ksmSaveStatusMode='saved';clearOutbox();renderPersistentSaveStatus();setConnectionStatus('Live sync','online');updateTvRealtimeDiagnostics({ignored:ksmTvRealtimeDiagnostics.ignored+1,lastReason:`Ignored own Staff echo ${incomingRevision}`});return false
  }
  if(!allowWhileEditing&&ksmSessionRole==='staff'&&(activeEditorHasFocus()||recentEditorActivity())){
    if(!ksmDeferredRemoteRecord||incomingRevision>Number(ksmDeferredRemoteRecord.revision||0))ksmDeferredRemoteRecord=record;
    /* ksm:post-split-begin edit-merge */
    // A record may arrive after focusout's callback while recent input still blocks it.
    // Always schedule its retry; otherwise no further input means it waits forever.
    clearTimeout(ksmDeferredRemoteTimer);ksmDeferredRemoteTimer=setTimeout(applyDeferredRemoteRecord,3200);
    /* ksm:post-split-end */
    updateSaveStatus('Live update waiting for editing to finish');updateTvRealtimeDiagnostics({lastReason:`Deferred revision ${incomingRevision} while editing`});return false;
  }
  const outbox=readOutbox();if(outbox&&/* ksm:post-split-begin two-tabs */!outbox.peeked&&/* ksm:post-split-end */Number(outbox.baseRevision||0)<incomingRevision&&!(isReadOnlySession()&&outbox.role==='staff'&&outbox.tournamentId===record.tournamentId)){preserveRecovery(outbox,record);clearOutbox()}
  ksmApplyingRemoteSnapshot=true;
  try{
    applyTournamentPayload(record.payload,false,{pinnedCourt:pinnedCourt(),preserveLocalDivision:preserveLocalDivisionForRemoteSync(),source:'live sync'});restorePinnedCourt();/* ksm:post-split-begin autosave-origin was:localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(record.payload)) */ksmStoreAutosave(record.payload)/* ksm:post-split-end */;cloudSession.revision=Math.max(Number(cloudSession.revision||0),incomingRevision);cloudSession.updatedAt=record.updatedAt;persistCloudSession();/* ksm:post-split-begin edit-merge */rememberCloudBase(record);/* ksm:post-split-end */const by=record.updatedBy?.name||record.updatedBy?.role;updateSaveStatus((by?`Updated by ${by} • `:'Live update • ')+new Date(record.updatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));setConnectionStatus('Live sync','online');const nextTvDivision=state.courtActiveDivision?.[tvCourt]||state.courtState?.[tvCourt]?.division||null;if(isTvSession()){renderTvDisplay();if(priorTvDivision!==nextTvDivision)console.info('[TV Realtime] Active division changed',tvCourt,priorTvDivision,'→',nextTvDivision)}console.info('[TV Realtime] Applied revision',incomingRevision);updateTvRealtimeDiagnostics({lastAppliedRevision:incomingRevision,lastReason:priorTvDivision!==nextTvDivision?`Applied ${incomingRevision}; Court ${tvCourt} division refreshed`:`Applied revision ${incomingRevision}`});return true
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
  if(ksmCloudSaveInFlight/* ksm:post-split-begin replace-conflict */||ksmFileReplace/* ksm:post-split-end */)return queuePendingCloudSave(reason,force);
  const payload=tournamentPayload();
  /* ksm:post-split-begin library-setup was:if(!navigator.onLine){ */if(!navigator.onLine&&!force){/* ksm:post-split-end */writeOutbox(payload,reason);/* ksm:post-split-begin save-retry */noteQueuedMutation(payload,ksmLocalMutationVersion);/* ksm:post-split-end */setConnectionStatus('Offline','offline');return false}
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
          Number(savedRecord.__ksmOriginalBaseRevision||0)/* ksm:post-split-begin edit-merge */,
          payload/* ksm:post-split-end */
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
        /* ksm:post-split-begin autosave-origin was:localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(localPayload)) */ksmStoreAutosave(localPayload)/* ksm:post-split-end */;
      }finally{ksmApplyingRemoteSnapshot=false}
    }
    return true;
  }catch(err){
    console.warn('Cloud save failed',err);
    /* ksm:post-split-begin team-divisions */if(['slug-taken','invalid-slug'].includes(err?.code))writeCloudDiagnosticsState({errorMessage:String(err?.message||err)});/* ksm:post-split-end */
/* ksm:post-split-begin tournament-switcher */if(err?.code==='transition-cancelled')return false;/* ksm:post-split-end *//* ksm:post-split-begin delete-tournament */if(err?.code==='tournament-deleted')return false;/* ksm:post-split-end */
    if(!String(err.message).includes('conflict'))writeOutbox(payload,reason);
    ksmSaveStatusMode=String(err.message).includes('conflict')?'error':'offline';
    setConnectionStatus(String(err.message).includes('conflict')?'Conflict':'Offline',String(err.message).includes('conflict')?'error':'offline');
    renderPersistentSaveStatus();
    scheduleCloudReconnect();
/* ksm:post-split-begin save-retry */
    noteQueuedMutation(payload,savingMutationVersion);
    scheduleQueuedSaveRetry(err);
/* ksm:post-split-end */
    return false;
  }finally{
    ksmCloudSaveInFlight=false;
    await runPendingCloudSave();
    if(!localChangesPending())applyDeferredSyncRecord();
  }
}
/* ksm:post-split-begin outbox-flush-rebase */
// After a link reload the device is read-only and follows the cloud copy, so staff work queued
// before the reload exists only in the outbox, and any successful save clears the outbox. When
// staff logs in again, replay the queued court actions onto the current copy (the same rebase
// as a 409), so every save from then on carries them, not only the flush.
function mergeQueuedStaffWork(){
  let outbox=readOutbox();
  if(!outbox?.payload||isReadOnlySession()||(outbox.tournamentId&&outbox.tournamentId!==cloudSession.tournamentId))return false;
  if(outbox.peeked&&!(outbox=ksmTakeOrphanNow()))return false;  // F36: a closed tab's work, taken over first
  const merged=rebaseLocalPayloadOnRecord(outbox.payload,{payload:tournamentPayload(),revision:cloudSession.revision},Number(outbox.baseRevision||0),outbox.basePayload||null);
  ksmApplyingRemoteSnapshot=true;
  try{applyTournamentPayload(merged,false,{pinnedCourt:pinnedCourt(),preserveLocalDivision:true,source:'queued work merge'});ksmStoreAutosave(merged)}finally{ksmApplyingRemoteSnapshot=false}
  ksmMarkOutboxMerged();
  return true;
}
/* ksm:post-split-end */
async function flushCloudOutbox(){const outbox=readOutbox();if(!outbox||ksmCloudSaveInFlight||/* ksm:post-split-begin replace-conflict */ksmFileReplace||/* ksm:post-split-end */isReadOnlySession()||!navigator.onLine)return false;/* ksm:post-split-begin two-tabs */if(outbox.peeked)return false;if(outbox.adoptedFrom!=null)return ksmSendAdoptedOutbox();/* ksm:post-split-end */if(outbox.tournamentId&&outbox.tournamentId!==cloudSession.tournamentId){writeCloudDiagnosticsState({stage:'Outbox blocked',errorMessage:'Queued snapshot belongs to a different tournament',queuedTournamentId:outbox.tournamentId||'',activeTournamentId:cloudSession.tournamentId||''});return false}ksmCloudSaveInFlight=true;ksmSaveStatusMode='syncing';writeCloudDiagnosticsState({stage:'Retrying queued snapshot',lastAttemptAt:new Date().toISOString(),baseRevision:outbox.baseRevision||0,snapshotBytes:payloadByteSize(outbox.payload),retryCount:(readCloudDiagnosticsState().retryCount||0)+1});renderPersistentSaveStatus();const mutationVersion=ksmLocalMutationVersion;try{const record=await performCloudSave(outbox.payload,outbox.baseRevision/* ksm:post-split-begin edit-merge */,0,outbox.baseRevision,outbox.basePayload||cloudBaseFor(outbox.baseRevision)/* ksm:post-split-end */);
  // After a reload the screen shows the older cloud copy and our own echo is ignored: show what
  // was just saved, replaying court actions taken while the flush was in flight (as a rebase does).
/* ksm:post-split-begin outbox-flush-rebase */
  // Also replay actions taken before the flush started (after a reload, staff can score before
  // the socket opens and triggers the flush): any unconfirmed local change, not only newer ones.
/* ksm:post-split-end */
  if(record?.payload){const localPayload=/* ksm:post-split-begin outbox-flush-rebase was:ksmLocalMutationVersion===mutationVersion */ksmLocalMutationVersion===mutationVersion&&ksmLocalMutationVersion<=ksmConfirmedMutationVersion/* ksm:post-split-end */?record.payload:rebaseLocalPayloadOnRecord(tournamentPayload(),record,Number(outbox.baseRevision||0)/* ksm:post-split-begin edit-merge */,outbox.payload/* ksm:post-split-end */);ksmApplyingRemoteSnapshot=true;try{applyTournamentPayload(localPayload,false,{pinnedCourt:pinnedCourt(),preserveLocalDivision:true,source:'outbox flush'});/* ksm:post-split-begin autosave-origin was:localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(localPayload)) */ksmStoreAutosave(localPayload)/* ksm:post-split-end */}finally{ksmApplyingRemoteSnapshot=false}}
/* ksm:post-split-begin save-retry */confirmQueuedMutation();/* ksm:post-split-end */
  return true}catch(err){console.warn('Queued cloud save failed',err);/* ksm:post-split-begin tournament-switcher */if(err?.code==='transition-cancelled')return false;/* ksm:post-split-end *//* ksm:post-split-begin delete-tournament */if(err?.code==='tournament-deleted')return false;/* ksm:post-split-end */writeCloudDiagnosticsState({stage:'Queued save failed',errorMessage:String(err?.message||err),lastFailureAt:new Date().toISOString()});ksmSaveStatusMode='error';renderPersistentSaveStatus();/* ksm:post-split-begin save-retry */scheduleQueuedSaveRetry(err);/* ksm:post-split-end */return false}finally{ksmCloudSaveInFlight=false;await runPendingCloudSave()}}
/* ksm:post-split-begin save-retry */
// F35: a save that fails while the live connection stays open (a 5xx, a dropped request, one
// that never answers) is queued in the outbox, but only the socket opening, the browser's
// `online` event or the next edit sent the queue: with none of them the device stayed
// "unsaved" indefinitely. Retry the queue with backoff, and give up on a save that has not
// answered after KSM_CLOUD_SAVE_TIMEOUT_MS (test audit N1), so it is queued and retried too.
const KSM_CLOUD_SAVE_TIMEOUT_MS=20000;
const KSM_QUEUED_SAVE_RETRY_MS=[2000,5000,10000,30000];
let ksmOutboxMutationVersion=0,ksmQueuedSaveRetryTimer=null,ksmQueuedSaveRetryAttempt=0;
// The local changes a queued snapshot carries (the outbox lives in localStorage, the change
// counter only in this page): confirmed when the queue is sent, else the device would stay
// "unsaved" until its next edit. Only when the queued snapshot is this payload (a logged-out
// device keeps an older staff snapshot instead; see ksmKeepStaffOutbox()).
function noteQueuedMutation(payload,version){if(readOutbox()?.payload?.savedAt===payload?.savedAt)ksmOutboxMutationVersion=Math.max(ksmOutboxMutationVersion,version)}
function confirmQueuedMutation(){ksmConfirmedMutationVersion=Math.max(ksmConfirmedMutationVersion,ksmOutboxMutationVersion);ksmOutboxMutationVersion=0;ksmQueuedSaveRetryAttempt=0}
function scheduleQueuedSaveRetry(err){
  const outbox=readOutbox();
  if(ksmQueuedSaveRetryTimer||!outbox||isReadOnlySession()||(outbox.tournamentId&&outbox.tournamentId!==cloudSession.tournamentId))return;
  // A refused staff session needs Staff Login, not another try.
  if(/authorization required|password required|reload the page/i.test(String(err?.message||'')))return;
  const delay=KSM_QUEUED_SAVE_RETRY_MS[Math.min(ksmQueuedSaveRetryAttempt++,KSM_QUEUED_SAVE_RETRY_MS.length-1)];
  ksmQueuedSaveRetryTimer=setTimeout(async()=>{
    ksmQueuedSaveRetryTimer=null;
    if(!readOutbox()){ksmQueuedSaveRetryAttempt=0;return}
    if(!navigator.onLine)return;  // the online event sends the queue
    if(!await flushCloudOutbox())scheduleQueuedSaveRetry();
  },delay);
}
function cloudSaveTimeoutSignal(existing){
  // Only for saves to an existing tournament: a create that timed out and was sent again could
  // create a second tournament.
  if(!existing||typeof AbortController!=='function')return undefined;
  const controller=new AbortController();
  setTimeout(()=>controller.abort(new Error('Cloud save timed out')),KSM_CLOUD_SAVE_TIMEOUT_MS);
  return controller.signal;
}
/* ksm:post-split-end */
async function retryQueuedCloudSave(){if(!readOutbox()){showKsmToast('No queued snapshot to retry',1800);return}showKsmToast('Retrying queued save…',1200);const ok=await flushCloudOutbox();showKsmToast(ok?'✓ Queued save completed':'Queued save still needs attention',2600,!ok);cloudDiagnostics()}
function scheduleCloudSave(reason='Autosave',delay=1200){if(ksmApplyingRemoteSnapshot||isReadOnlySession())return;clearTimeout(ksmCloudTimer);ksmCloudTimer=setTimeout(()=>{ksmCloudTimer=null;saveTournamentToCloudWithReason(reason)},delay)}
async function promptLoadTournamentFromCloud(){const id=prompt('Enter Tournament ID',cloudSession.tournamentId||'');if(!id)return;try{await loadTournamentFromCloud(id,{spectator:true});updateSaveStatus('Loaded cloud tournament')}catch(err){alert('Unable to load that cloud tournament.');console.error(err);setConnectionStatus('Cloud load failed','offline')}}
async function copyTournamentId(){if(!cloudSession.tournamentId)await saveTournamentToCloud();if(!cloudSession.tournamentId){alert('A Tournament ID could not be created while offline.');return}await copyTextValue(cloudSession.tournamentId,'Tournament ID copied')}
async function loadTournamentFromCloud(tournamentId,options={}){
  const id=(tournamentId||cloudSession.tournamentId||'').trim();if(!id)throw new Error('Tournament ID required');const previousTournamentId=cloudSession.tournamentId||'';if(previousTournamentId&&previousTournamentId!==id)clearLocalCourtDivisions();const requestedCourt=options.court?normalizeCourt(options.court):pinnedCourt();if(requestedCourt)pinCourtLocally(requestedCourt);setConnectionStatus('Loading cloud…','connecting');const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}`);if(!response.ok)throw new Error(`Cloud load failed (${response.status})`);const record=await response.json();disconnectCloudSocket();cloudSession.tournamentId=record.tournamentId;if(requestedCourt)pinCourtLocally(requestedCourt);ksmApplyingRemoteSnapshot=true;try{applyTournamentPayload(record.payload,false,{pinnedCourt:requestedCourt,preserveLocalDivision:false,source:'cloud load'});/* ksm:post-split-begin autosave-origin was:localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(record.payload)) */ksmStoreAutosave(record.payload)/* ksm:post-split-end */}finally{ksmApplyingRemoteSnapshot=false}
  cloudSession.tournamentId=record.tournamentId;cloudSession.revision=record.revision;cloudSession.updatedAt=record.updatedAt;cloudSession.court=requestedCourt||'';
  if(options.credentials)cloudSession.credentials=options.credentials;else if(options.role&&options.key){cloudSession.credentials={[options.role]:options.key}}else if(options.spectator)delete cloudSession.credentials;
  persistCloudSession();ksmLastSuccessfulSaveAt=Date.parse(record.updatedAt)||Date.now();ksmSaveStatusMode='saved';setSessionRole(options.role||((cloudSession.credentials&&Object.keys(cloudSession.credentials)[0])||'spectator'));connectCloudSocket();setConnectionStatus('Connected','online');renderPersistentSaveStatus();return record;
}
function showKsmToast(message,duration=2000,isError=false){let toast=document.getElementById('ksmToast');if(!toast){toast=document.createElement('div');toast.id='ksmToast';toast.className='ksm-toast';toast.dataset.testid='toast';document.body.appendChild(toast)}clearTimeout(showKsmToast.timer);toast.textContent=message;toast.classList.toggle('error',Boolean(isError));requestAnimationFrame(()=>toast.classList.add('show'));if(duration>0)showKsmToast.timer=setTimeout(()=>toast.classList.remove('show'),duration)}
async function copyTextValue(value,success,closeAfter=false){try{await navigator.clipboard.writeText(value);showKsmToast('✓ '+success,1200);if(closeAfter)setTimeout(closeCloudModal,850);return true}catch(_){/* ksm:post-split-begin quirks-shell was:prompt(success,value); */prompt(success.replace(/ copied$/,'')+' (copy it from here):',value);/* ksm:post-split-end */return false}}
function roleLink(role,court=''){/* ksm:post-split-begin path-urls was:if(!cloudSession.tournamentId)return '';const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('role',role);url.searchParams.set('tournament',cloudSession.tournamentId);const key=cloudSession.credentials?.[role];if(key)url.searchParams.set('key',key);if(court)url.searchParams.set('court',court);return url.toString() */if(!cloudSession.tournamentId)return '';const id=cloudSession.tournamentId;return ksmLinkUrl(court?{screen:'court',id,court:normalizeCourt(court)}:{screen:'tournament',id},[['role',role==='spectator'?'':role],['key',cloudSession.credentials?.[role]]])/* ksm:post-split-end */}
function tvLink(court){/* ksm:post-split-begin path-urls was:const url=new URL(roleLink('spectator',court));if(!url.href||!cloudSession.tournamentId)return '';url.searchParams.set('view','tv');url.searchParams.set('court',court);return url.toString() */if(!cloudSession.tournamentId)return '';return ksmLinkUrl({screen:'tv',id:cloudSession.tournamentId,court:normalizeCourt(court)},[['key',cloudSession.credentials?.spectator]])/* ksm:post-split-end */}
function spectatorLink(){return roleLink('spectator')}
function directorLink(){return roleLink('director')}
async function copySpectatorLink(){if(!cloudSession.tournamentId)await saveTournamentToCloud();const link=spectatorLink();if(!link){alert('Create the cloud tournament while online first.');return}await copyTextValue(link,'Spectator link copied')}
async function copyDirectorLink(){const link=directorLink();if(!link||!cloudSession.credentials?.director){alert('This device does not have director access.');return}await copyTextValue(link,'Director link copied')}
// Court access helpers remain available: copyScorekeeperLink('A') copyScorekeeperLink('B')
async function copyScorekeeperLink(court){const link=roleLink('scorekeeper',court);if(!link||!cloudSession.credentials?.scorekeeper){alert('This device does not have the scorekeeper credential.');return}await copyTextValue(link,`Court ${court} scorekeeper link copied`)}
async function copyAdminLink(){const link=roleLink('admin');if(!link||!cloudSession.credentials?.admin){alert('This device does not have admin access.');return}await copyTextValue(link,'Admin link copied')}
function closeCloudModal(){/* ksm:post-split-begin replace-conflict */if(ksmFileReplace?.record)return ksmCancelReplace();/* ksm:post-split-end *//* ksm:post-split-begin react-shell */ksmCloseCloudModal();/* ksm:post-split-end */}
function installRoleBanner(role){document.querySelector('.spectator-readonly-banner')?.remove();if(!['spectator','scorekeeper'].includes(role))return;const banner=document.createElement('div');banner.className='spectator-readonly-banner';banner.textContent=role==='spectator'?'LIVE SPECTATOR VIEW • READ ONLY':`COURT ${cloudSession.court||'—'} SCOREKEEPER • LIVE SYNC`;document.body.prepend(banner)}
function cloudDiagnostics(){const outbox=readOutbox(),presence=cloudSession.presence||[],diag=readCloudDiagnosticsState(),currentAnalysis=analyzeTournamentSnapshot(),analysis=diag.snapshotAnalysis||currentAnalysis,historyAnalysis=analyzeCourtActionHistory();const details=[['Connection',navigator.onLine?'Online':'Offline'],['Realtime',ksmCloudSocket?.readyState===1?'Connected':'Not connected'],['Last successful save',ksmLastSuccessfulSaveAt?new Date(ksmLastSuccessfulSaveAt).toLocaleString():'None'],['Pending offline changes',outbox?'1 queued snapshot':'None'],['Tournament ID',cloudSession.tournamentId||'None'],['Role',ksmSessionRole],['Pinned court',pinnedCourt()||'—'],['Displayed court',state.currentCourt||'—'],['Local changes pending',localChangesPending()?'Yes':'No'],['Court',cloudSession.court||state.currentCourt||'—'],['Connected devices',String(presence.length)],['Cloud revision',String(cloudSession.revision||0)],['Last save stage',diag.stage||'No diagnostic attempt recorded'],['Last attempt',formatDiagnosticTime(diag.lastAttemptAt)],['HTTP status',diag.httpStatus==null?'None':String(diag.httpStatus)],['Last error',diag.errorMessage||'None'],['Server response',diag.errorBody||'None'],['Retry count',String(diag.retryCount||0)],['Queued base revision',outbox?String(outbox.baseRevision||0):'None'],['Queued since',outbox?formatDiagnosticTime(outbox.queuedAt):'None'],['Snapshot size',formatSnapshotBytes(outbox?payloadByteSize(outbox.payload):(diag.snapshotBytes||currentAnalysis.totalBytes))]];/* ksm:post-split-begin react-shell */ksmOpenDiagnostics(details,analysis,historyAnalysis,outbox&&!isReadOnlySession());/* ksm:post-split-end */}
async function initializeCloudRoleFromUrl(){ensureClientIdentity();const params=new URLSearchParams(location.search);let role=params.get('role'),id=params.get('tournament'),key=params.get('key'),court=params.get('court')||'',requestedView=params.get('view')||'';
  if(!role){if(params.get('spectator')){role='spectator';id=params.get('spectator')}else if(params.get('director')){role='director';id=params.get('director');key=params.get('key')}}
  if(role&&id){role=['spectator','scorekeeper','director','admin'].includes(role)?role:'spectator';cloudSession.clientName=promptDeviceName(role,cloudSession.clientName);await loadTournamentFromCloud(id,role==='spectator'?{spectator:true,role,court}:{role,key,court});installRoleBanner(role);if(requestedView==='tv'){document.body.classList.add('ksm-tv');cloudSession.court=(court||'A').toUpperCase()==='B'?'B':'A';persistCloudSession();renderTvDisplay();renderTvRealtimeDiagnostics();show('tv')}else if(role==='spectator'){navigateTo('public')}else if(role==='scorekeeper'){chooseCourt(court||'A')}else navigateTo('director');return true}
  const creds=cloudSession.credentials||{};const savedRole=cloudSession.tournamentId?(creds.admin?'admin':creds.director?'director':creds.scorekeeper?'scorekeeper':'spectator'):'local';setSessionRole(savedRole);installRoleBanner(savedRole);return false}
function promptDeviceName(role,current){if(role==='spectator')return current||'Spectator';const suggested=current&&current!=='KSM Device'?current:(role==='scorekeeper'?`Court Device`:'Director Device');return prompt('Name this device for live session status',suggested)||suggested}
window.addEventListener('online',()=>{setConnectionStatus('Reconnecting','connecting');ksmSaveStatusMode=readOutbox()?'syncing':'saved';renderPersistentSaveStatus();connectCloudSocket();flushCloudOutbox()});window.addEventListener('offline',()=>{setConnectionStatus('Offline','offline');/* ksm:post-split-begin tournament-switcher */if(!isReadOnlySession()&&(!document.body.classList.contains('ksm-home')||cloudSession.tournamentId)&&!(ksmStartupLoadFailed&&!ksmStartupHasCache)){/* ksm:post-split-end */markLocalSave('Offline safety save');writeOutbox(tournamentPayload(),'Connection lost')/* ksm:post-split-begin tournament-switcher */}/* ksm:post-split-end */});

function triggerLoadRecoveryFile(){document.getElementById('ksmRecoveryFile')?.click()}
/* ksm:post-split-begin recovery-guard */
// F7: Load Recovery File always makes a new tournament from the file's snapshot. Ask first when a
// tournament is open (its old "different Tournament ID" confirm ran after the ID was cleared, so
// it never showed), and never load while this device still has work queued for the cloud: the
// file's outbox would replace it and that work would never arrive. Same rule as Load Tournament
// File (0.5).
async function confirmRecoveryFileLoad(pack){
  const name=pack.latestLocalSnapshot?.setup?.tName||'Unnamed tournament';
  const when=pack.createdAt&&!isNaN(new Date(pack.createdAt))?new Date(pack.createdAt).toLocaleString():'unknown date';
  if(cloudSession.tournamentId){
    const open=(window.tName&&tName.value)||'The open tournament';
    if(!confirm(`Load this recovery file as a new tournament? File: ${name}, saved ${when}. ${open} stays unchanged.`))return false;
  }
  // Only when there is something to save: a save with nothing new would still add a revision.
  const saved=cloudSession.tournamentId&&!isReadOnlySession()&&localChangesPending()?await saveTournamentToCloudWithReason('Before loading a recovery file',true):true;
  if(!saved||readOutbox()){alert('This device has changes that could not be saved to the cloud yet. Connect to the internet (or use Save Now), then load the recovery file again. Nothing was changed.');return false}
  return true;
}
/* ksm:post-split-end */
async function loadRecoveryFile(event){const file=event.target.files&&event.target.files[0];if(!file)return;try{const pack=JSON.parse(await file.text());if(pack.fileType!=='KSM_RECOVERY'||!pack.latestLocalSnapshot?.state)throw new Error('Invalid recovery file');/* ksm:post-split-begin recovery-guard */if(!(await confirmRecoveryFileLoad(pack)))return;/* ksm:post-split-end */const restoredPassword=promptNewStaffPassword();if(!restoredPassword)throw new Error('New Staff password required');sessionStorage.setItem(KSM_V316_STAFF_SESSION,restoredPassword);setSessionRole('staff');cloudSession.tournamentId=null;cloudSession.revision=0;if(cloudSession.tournamentId&&pack.tournamentId&&cloudSession.tournamentId!==pack.tournamentId&&!confirm('This recovery file belongs to a different Tournament ID. Load its local snapshot anyway?'))return;applyTournamentPayload(pack.latestLocalSnapshot,false);/* ksm:post-split-begin autosave-origin was:localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(pack.latestLocalSnapshot)) */ksmStoreAutosave(pack.latestLocalSnapshot)/* ksm:post-split-end */;if(pack.outbox)/* ksm:post-split-begin two-tabs was:localStorage.setItem(KSM_CLOUD_OUTBOX_KEY,JSON.stringify(pack.outbox)) */{ksmRetagHistory(pack.outbox,KSM_TAB_ID);const {adoptedFrom:_,...entry}=pack.outbox;localStorage.setItem(ksmOutboxKey(),JSON.stringify({...entry,writer:KSM_TAB_ID}))}/* ksm:post-split-end */;cloudSession.tournamentId=null;cloudSession.revision=0;if(pack.assignedCourt)cloudSession.court=pack.assignedCourt;persistCloudSession();ksmSaveStatusMode='offline';setConnectionStatus(navigator.onLine?'Connected':'Offline',navigator.onLine?'online':'offline');renderPersistentSaveStatus();if(navigator.onLine&&pack.outbox)await flushCloudOutbox();updateSaveStatus('Recovery file loaded')}catch(err){console.error(err);alert('Unable to load this recovery file.')}finally{event.target.value=''}}
function manualSaveTournament(){
  try{
    const payload=/* ksm:post-split-begin load-file-guard was:tournamentPayload() */tournamentFilePayload()/* ksm:post-split-end */;
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
      /* ksm:post-split-begin load-file-guard was:applyTournamentPayload(payload,true); */confirmTournamentFileLoad(payload,file.name);/* ksm:post-split-end */
      /* ksm:post-split-begin load-file-guard was:updateSaveStatus('Loaded '+file.name); *//* ksm:post-split-end */
    }catch(err){ alert('Unable to load this tournament file.'); console.error(err); }
  };
  reader.readAsText(file);
  event.target.value='';
}
/* ksm:post-split-begin load-file-guard */
// Roadmap 0.5: Load Tournament File never replaces the open tournament without a confirmation,
// and a file from another tournament never replaces it at all: it is loaded as a new cloud
// tournament instead. The file names its tournament (ID, revision), written by
// Download Tournament File; older files without an ID count as another tournament.
// An invalid file changes nothing.
function tournamentFilePayload(){return {...tournamentPayload(),tournamentId:cloudSession.tournamentId||null,revision:Number(cloudSession.revision)||0}}
function tournamentFileProblem(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return 'it is not a tournament file';
  if(payload.fileType==='KSM_RECOVERY')return 'it is a recovery file (use Load Recovery File)';
  const s=payload.state;
  if(!s||typeof s!=='object'||Array.isArray(s))return 'it holds no tournament data';
  if(!Array.isArray(s.divisions)||!Array.isArray(s.competitors))return 'its tournament data is incomplete';
  if(payload.setup!=null&&(typeof payload.setup!=='object'||Array.isArray(payload.setup)))return 'its setup data is damaged';
  return '';
}
// The details the confirmation shows: [label, value, test ID] (the React shell draws them,
// app/js/44-react-shell.js).
function tournamentFileDetails(payload){
  const saved=payload.savedAt&&!isNaN(new Date(payload.savedAt))?new Date(payload.savedAt).toLocaleString():'Unknown';
  return [['File',payload.setup?.tName||'Unnamed tournament','file-load-name'],['Saved',saved,'file-load-saved'],['Revision',payload.revision==null?'Unknown':String(payload.revision),'file-load-revision'],['Tournament ID',payload.tournamentId||'None (older file)','file-load-id'],['Open tournament',`${(window.tName&&tName.value)||'Kendo Tournament'} · revision ${Number(cloudSession.revision)||0}`,'file-load-open']];
}
let ksmPendingTournamentFile=null;
function confirmTournamentFileLoad(payload,fileName){
  const problem=tournamentFileProblem(payload);
  if(problem){alert(`Unable to load ${fileName}: ${problem}. Nothing was changed.`);return}
  ksmPendingTournamentFile={payload,fileName};
  const same=Boolean(!isReadOnlySession()&&cloudSession.tournamentId&&payload.tournamentId===cloudSession.tournamentId);
  const message=same
    ?'This file is a copy of the open tournament. Replacing makes the file the tournament on every device: changes made after it was saved are lost.'
    :`This file is ${cloudSession.tournamentId?'not the open tournament':'not an open cloud tournament'}, so it will not replace ${cloudSession.tournamentId?'it':'anything'}. It can be loaded as a new tournament with its own Staff password; the open tournament stays unchanged.`;
  const title=same?'Replace the open tournament?':'Load as a new tournament?';
  // The React shell (app/js/44-react-shell.js) draws the confirmation.
  ksmOpenFileLoadModal(title,tournamentFileDetails(payload),message,same);
}
function applyTournamentFilePayload(payload,saveAfter){
  const before=tournamentPayload();
  try{applyTournamentPayload(payload,saveAfter);return true}
  catch(err){console.error(err);try{applyTournamentPayload(before,false)}catch(_){}alert('Unable to load this tournament file. Nothing was changed.');return false}
}
function replaceTournamentFromFile(){
  if(isReadOnlySession()){showKsmToast('Staff Login required to replace this tournament',3500,true);return}
  const pending=ksmPendingTournamentFile;ksmPendingTournamentFile=null;closeCloudModal();
  if(!pending||pending.payload.tournamentId!==cloudSession.tournamentId)return;
  // F37 (#88): Replace is saved on its own (never merged into another device's save), so it needs the
  // cloud now: queued for later it would meet that save silently.
  if(!navigator.onLine||ksmFileReplace){alert('Connect to the internet to replace the tournament. Nothing was changed.');return}
  const before={payload:tournamentPayload(),outbox:localStorage.getItem(ksmOutboxKey()),pending:localChangesPending()};
  if(!applyTournamentFilePayload(pending.payload,false))return;
  noteLocalMutation();markLocalSave('Tournament file replace');updateSaveStatus('Loaded '+pending.fileName);
  // The file as applied: what Replace sends, also after a save in flight has applied its own result meanwhile.
  // version: the local changes the file stands for (an edit made later, e.g. while asked, is saved after it).
  ksmSendFileReplace({fileName:pending.fileName,before,record:null,payload:tournamentPayload(),version:ksmLocalMutationVersion});
}
// F37 (#88): the Replace in progress: {fileName, before: what to put back if it fails, record: the other
// device's copy while the director is asked}. Ordinary saves wait meanwhile (they would merge the file away).
let ksmFileReplace=null;
// baseRevision: Replace anyway's (the other device's copy); else this device's after its own save in flight.
async function ksmSendFileReplace(replace,baseRevision=null){
  ksmFileReplace=replace;
  clearTimeout(ksmSaveTimer);ksmSaveTimer=null;clearTimeout(ksmCloudTimer);ksmCloudTimer=null;
  let waited=false;
  for(let i=0;ksmCloudSaveInFlight&&i<250;i++){waited=true;await new Promise(resolve=>setTimeout(resolve,100))}
  if(ksmFileReplace!==replace)return;  // the tournament was closed meanwhile
  // That save may have applied its (rebased) result over the file: show the file again.
  if(waited){ksmApplyingRemoteSnapshot=true;try{applyTournamentPayload(replace.payload,false,{pinnedCourt:pinnedCourt(),preserveLocalDivision:true,source:'file replace'})}finally{ksmApplyingRemoteSnapshot=false};ksmStoreAutosave(replace.payload)}
  if(baseRevision==null)baseRevision=Number(cloudSession.revision)||0;
  const version=replace.version;
  // The file replaces this device's queued work: dropped now, so the save's success cannot give a closed
  // tab's work it took over back as a new queue (it would replay over the file). Put back if it fails.
  // A copy survives a crash meanwhile (no beforeunload): released as a closed tab's work (18-two-tabs.js).
  if(replace.before.outbox)localStorage.setItem(KSM_REPLACE_BACKUP_PREFIX+KSM_TAB_ID,replace.before.outbox);
  localStorage.removeItem(ksmOutboxKey());
  ksmCloudSaveInFlight=true;ksmSaveStatusMode='saving';renderPersistentSaveStatus();
  try{
    await performCloudSave({...replace.payload,savedAt:new Date().toISOString()},baseRevision,0,baseRevision,null,{wholeReplace:true});
    ksmConfirmedMutationVersion=Math.max(ksmConfirmedMutationVersion,version);
    ksmFileReplace=null;localStorage.removeItem(KSM_REPLACE_BACKUP_PREFIX+KSM_TAB_ID);
    // Edits made while it was sent or asked are saved on top of it.
    if(ksmLocalMutationVersion>version&&!ksmCloudSavePending)scheduleCloudSave('Changes during the replace');
    // The file is the tournament now, on every device: work queued here before it, and closed tabs' work
    // for it, is replaced too.
    ksmDropOutboxesFor(cloudSession.tournamentId);
    showKsmToast(`✓ Tournament replaced from ${replace.fileName}`,2600);
  }catch(err){
    console.warn('Replace from file failed',err);
    if(err?.code==='replace-conflict'){
      replace.record=err.record;
      ksmOpenCloudModal('Another device changed the tournament during the replace.',{kind:'replace-conflict',fileName:ksmHtmlText(replace.fileName)});
      return;
    }
    if(err?.code==='transition-cancelled'||err?.code==='tournament-deleted'){ksmFileReplace=null;return}
    const message=String(err?.message||err||'');
    // A request that failed or timed out may still have reached the server: it decides.
    if(!/authorization|conflict|invalid|rejected|\(4\d\d\)/i.test(message)&&await ksmFileReplaceLanded(baseRevision)){
      ksmFileReplace=null;ksmConfirmedMutationVersion=Math.max(ksmConfirmedMutationVersion,version);
      localStorage.removeItem(KSM_REPLACE_BACKUP_PREFIX+KSM_TAB_ID);
      ksmDropOutboxesFor(cloudSession.tournamentId);
      if(ksmLocalMutationVersion>version&&!ksmCloudSavePending)scheduleCloudSave('Changes during the replace');
      showKsmToast(`✓ Tournament replaced from ${replace.fileName}`,2600);
      return;
    }
    ksmFileReplace=null;
    ksmUndoFileReplace(replace,null);
    const reason=/authorization/i.test(message)?'Staff Login required':/fetch|network|timed out|abort|failed \(5/i.test(message)?'the cloud could not be reached':message;
    showKsmToast(`Tournament file not loaded · ${reason}`,4000,true);
  }finally{
    ksmCloudSaveInFlight=false;
    if(!ksmFileReplace){await runPendingCloudSave();if(!localChangesPending())applyDeferredSyncRecord()}
  }
}
// Replace anyway: the file again, against the other device's revision (asked again if yet another save came first).
function ksmReplaceAnyway(){
  const replace=ksmFileReplace;if(!replace?.record)return;
  const revision=Number(replace.record.revision)||0;
  replace.record=null;ksmCloseCloudModal();
  ksmSendFileReplace(replace,revision);
}
// Cancel (also closing the question): the other device's copy stays; this device follows it.
function ksmCancelReplace(){
  const replace=ksmFileReplace;if(!replace?.record)return;
  ksmFileReplace=null;ksmCloseCloudModal();
  ksmUndoFileReplace(replace,replace.record);
  const waiting=ksmCloudSavePending;ksmCloudSavePending=null;waiting?.resolvers.forEach(resolve=>resolve(false));
  showKsmToast('Tournament file not loaded · the other device\'s change was kept',4000,true);
  if(!localChangesPending())applyDeferredSyncRecord();
}
// Puts back the copy from before the Replace (or the server's newer one) and this device's queued work.
function ksmUndoFileReplace(replace,record){
  ksmApplyingRemoteSnapshot=true;
  try{
    const payload=record?.payload||replace.before.payload;
    applyTournamentPayload(payload,false,{pinnedCourt:pinnedCourt(),preserveLocalDivision:true,source:'replace undone'});ksmStoreAutosave(payload);
    if(record){cloudSession.revision=Number(record.revision)||0;cloudSession.updatedAt=record.updatedAt;persistCloudSession();rememberCloudBase(record)}
  }finally{ksmApplyingRemoteSnapshot=false}
  if(replace.before.outbox)localStorage.setItem(ksmOutboxKey(),replace.before.outbox);else localStorage.removeItem(ksmOutboxKey());
  localStorage.removeItem(KSM_REPLACE_BACKUP_PREFIX+KSM_TAB_ID);
  if(!replace.before.pending||record)ksmConfirmedMutationVersion=ksmLocalMutationVersion;
  else scheduleCloudSave('Changes before the replace');
  renderPersistentSaveStatus();
}
// Whether this tab's Replace reached the server although its answer did not: the next revision is this
// tab's save (F36: updatedBy.clientId is this tab's writer id).
async function ksmFileReplaceLanded(baseRevision){
  try{
    const response=await fetch(`/api/tournaments/${encodeURIComponent(cloudSession.tournamentId)}`,{cache:'no-store'});
    if(!response.ok)return false;
    const record=await response.json();
    if(Number(record.revision)!==Number(baseRevision)+1||record.updatedBy?.clientId!==ksmWriterId())return false;
    cloudSession.revision=Number(record.revision);cloudSession.updatedAt=record.updatedAt;persistCloudSession();rememberCloudBase(record);
    return true;
  }catch(_){return false}
}
// A reload or a closed tab while a Replace is unsettled: the file is not queued (a later flush would merge
// it into the other device's copy without asking); what was queued and autosaved before it is put back.
function ksmFileReplaceBeforeUnload(){
  const replace=ksmFileReplace;if(!replace)return false;
  if(replace.before.outbox)localStorage.setItem(ksmOutboxKey(),replace.before.outbox);else localStorage.removeItem(ksmOutboxKey());
  localStorage.removeItem(KSM_REPLACE_BACKUP_PREFIX+KSM_TAB_ID);
  ksmStoreAutosave(replace.before.payload);
  return true;
}
async function loadTournamentFileAsNew(){
  const pending=ksmPendingTournamentFile;if(!pending)return;
  // The open tournament's own unsaved work must reach the cloud first: its offline queue would
  // otherwise be replaced by the new tournament's.
  const saved=cloudSession.tournamentId&&!isReadOnlySession()?await saveTournamentToCloudWithReason('Before loading a tournament file',true):true;
  if(!saved||readOutbox()){alert('The open tournament has changes that could not be saved to the cloud yet. Connect to the internet (or use Save Now), then load the file again. Nothing was changed.');return}
  const password=promptNewStaffPassword();if(!password)return;
  ksmPendingTournamentFile=null;closeCloudModal();
  clearTimeout(ksmSaveTimer);ksmSaveTimer=null;clearTimeout(ksmCloudTimer);ksmCloudTimer=null;
  const previous={session:{...cloudSession},password:v316StaffPassword(),role:ksmSessionRole};
  disconnectCloudSocket();cloudSession.tournamentId=null;cloudSession.revision=0;cloudSession.updatedAt=null;cloudSession.court='';persistCloudSession();
  sessionStorage.setItem(KSM_V316_STAFF_SESSION,password);setSessionRole('staff');installRoleBanner('staff');document.body.classList.remove('ksm-home');
  if(!applyTournamentFilePayload(pending.payload,false)){Object.assign(cloudSession,previous.session);persistCloudSession();if(previous.password)sessionStorage.setItem(KSM_V316_STAFF_SESSION,previous.password);else sessionStorage.removeItem(KSM_V316_STAFF_SESSION);setSessionRole(previous.role);if(cloudSession.tournamentId)connectCloudSocket();return}
  // A tournament link in the address bar would reopen the old tournament after a reload.
  const linked=Boolean(ksmLinkParams().get('tournament'));if(linked)ksmReplaceUrl('/');
  markLocalSave('Tournament file loaded as new tournament');updateSaveStatus('Loaded '+pending.fileName);showKsmToast('Creating tournament in cloud…',0);
  try{await performCloudSave(tournamentPayload(),0);if(linked&&cloudSession.tournamentId)ksmReplaceUrl(KSMEngine.routePath({screen:'tournament',id:cloudSession.tournamentId}));showKsmToast('✓ Loaded as a new tournament',2200)}
  catch(err){console.error(err);writeOutbox(tournamentPayload(),'Tournament file loaded as new tournament');showKsmToast(navigator.onLine?'Unable to create tournament in cloud':'Offline · Tournament will sync when connected',3500,true)}
}
/* ksm:post-split-end */
function repairLoadedEliminationAdvancement(source='tournament load'){
  /* ksm:post-split-begin engine-bridge */repairCompletedMatchResults(state,source);
  KSMEngine.loadedEliminationRepairPlan(Object.keys(state.allMatches||{}),state.championshipNodes,state.singleElimNodes).forEach(({division:div,championship,singleElim})=>{
    if(championship)syncChampionshipTemplate(div);
    if(singleElim){
      (state.singleElimNodes[div]||[]).forEach(node=>{node.winner=null});
      const comps=(state.singleElimComps?.[div]||eligibleIndividuals(div).filter(c=>c.name));
      syncIndividualSingleElim(div,state.allMatches[div]||[],comps);
    }
  });
  /* ksm:post-split-end */
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
  /* ksm:post-split-begin team-divisions was:const loaded=payload.state; */const loaded=KSMEngine.migrateTeamDivisions(JSON.parse(JSON.stringify(payload.state)),payload.setup||{});ksmNoteTeamsReassigned(payload.state,loaded,options.source);/* ksm:post-split-end */
  Object.keys(state).forEach(k=>delete state[k]);
  Object.assign(state, loaded);
  sanitizeLoadedTournamentState(state,options.source||'tournament load');
  normalizeAllIndividualPoolTiebreakOrder(state,options.source||'tournament load');
  state.teamElimTeams=state.teamElimTeams||{};state.managementRevision=state.managementRevision||0;state.divisionCourts=state.divisionCourts||{};Object.keys(state.divisionCourts).forEach(d=>{if(state.divisionCourts[d]==='Both'&&/* ksm:post-split-begin team-divisions was:d!=='Team Tournament' */!isTeamDivision(d)/* ksm:post-split-end */)state.divisionCourts[d]='split'});
  if(localCourt){pinCourtLocally(localCourt);state.currentCourt=normalizeCourt(localCourt)}
  if(isTvSession())state.publicCourt=normalizeCourt(localCourt||localPublicCourt);else state.publicCourt=normalizeCourt(localPublicCourt);
  applySetupSnapshot(payload.setup);
  ensureCourtHistory();
  repairLoadedEliminationAdvancement(options.source||'tournament load');
  rehydrateLoadedTournamentState(options);
  restorePinnedCourt();
  /* ksm:post-split-begin team-rr-daihyosen */if(ksmAddDaihyosenForTeamAwards().length&&!saveAfter)setTimeout(()=>scheduleAutoSave('Daihyosen for the team awards'),0);/* ksm:post-split-end */
  renderAll();
  updateUndoButton();
  if(saveAfter) autoSaveTournament();
}
function restoreAutoSaveIfWanted(){
  /* ksm:post-split-begin startup-recovery */return false;/* ksm:post-split-end */
  try{
    // A tournament link (spectator, TV, court device) always loads the cloud copy, which would
    // replace anything restored here. Unsynced staff work is kept in the outbox instead.
    const params=/* ksm:post-split-begin path-urls was:new URLSearchParams(location.search) */ksmLinkParams()/* ksm:post-split-end */;
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
function queueUnsyncedStaffWorkBeforeUnload(){/* ksm:post-split-begin startup-recovery */if(ksmStartupLoadFailed&&!ksmStartupHasCache)return;/* ksm:post-split-end *//* ksm:post-split-begin replace-conflict */if(ksmFileReplaceBeforeUnload())return;/* ksm:post-split-end */if(isReadOnlySession()||!cloudSession.tournamentId||!localChangesPending())return;const earlier=readOutbox();if(earlier?.tournamentId&&earlier.tournamentId!==cloudSession.tournamentId)return;writeOutbox(tournamentPayload(),'Unsynced changes at page unload');if(earlier/* ksm:post-split-begin two-tabs */&&earlier.adoptedFrom==null/* ksm:post-split-end */){const queued=readOutbox();/* ksm:post-split-begin edit-merge was:queued.baseRevision=Math.min(Number(earlier.baseRevision||0),Number(queued.baseRevision||0)); */if(Number(earlier.baseRevision||0)<Number(queued.baseRevision||0)){queued.baseRevision=Number(earlier.baseRevision||0);queued.basePayload=earlier.basePayload||null}/* ksm:post-split-end *//* ksm:post-split-begin two-tabs was:localStorage.setItem(KSM_CLOUD_OUTBOX_KEY,JSON.stringify(queued)) */localStorage.setItem(ksmOutboxKey(),JSON.stringify(queued))/* ksm:post-split-end */}}
window.addEventListener('beforeunload', queueUnsyncedStaffWorkBeforeUnload);
window.addEventListener('beforeunload', autoSaveTournament);
document.addEventListener('input', scheduleAutoSave, true);
document.addEventListener('change', scheduleAutoSave, true);
document.addEventListener('click', function(e){ if(e.target.closest('button,.status,.search-item,.tab,.seg,.x')/* ksm:post-split-begin react-shell */&&!e.target.closest('[data-testid="nav-toggle"],.mobile-nav-close')/* ksm:post-split-end *//* ksm:post-split-begin pool-edit */&&!ksmPoolEditorClick(e.target)/* ksm:post-split-end *//* ksm:post-split-begin tie-flash */&&!e.target.closest('.tie-flash-action')/* ksm:post-split-end *//* ksm:post-split-begin match-timer */&&!e.target.closest('.match-timer')/* ksm:post-split-end */) /* ksm:post-split-begin library-setup was:scheduleAutoSave(); */scheduleAutoSave(e);/* ksm:post-split-end */ }, true);
setInterval(()=>autoSaveTournament('10-minute safety autosave'),600000);
setInterval(renderPersistentSaveStatus,60000);


