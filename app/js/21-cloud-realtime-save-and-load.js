// Live sync, cloud saves and tournament files live in app/modules/sync/cloud-realtime-save-and-load.js (step 3d of
// #136). Here, where this file used to load: its load-time side effects (initCloudRealtime(), then the save
// listeners and timers below, in their old order), and connectCloudSocket() / loadTournamentFileAsNew(), which
// 54-auth0-access.js replaces (the module calls them through app/modules/legacy.js).
initCloudRealtime();
function connectCloudSocket(){
  if((document.body.classList.contains('ksm-home')&&!ksmLinkParams().get('tournament')&&!ksmLinkParams().get('spectator'))||ksmStartupLoadFailed)return;
  if(!cloudSession.tournamentId||location.protocol==='file:'||!location.host)return;
  if(ksmCloudSocket&&(ksmCloudSocket.readyState===WebSocket.OPEN||ksmCloudSocket.readyState===WebSocket.CONNECTING))return;
  clearTimeout(ksmCloudReconnectTimer);setConnectionStatus('Sync connecting…','connecting');
  const socket=new WebSocket(cloudSocketUrl(cloudSession.tournamentId));setKsmCloudSocket(socket);
  socket.addEventListener('open',()=>{if(socket!==ksmCloudSocket)return;console.info('[TV Realtime] Connected');updateTvRealtimeDiagnostics({status:'Connected',lastReason:'Socket opened'});setConnectionStatus('Live sync','online');try{socket.send('ping')}catch(_){}flushCloudOutbox();beginTvInitialSync()});
  socket.addEventListener('message',event=>{if(socket!==ksmCloudSocket)return;try{
    const message=JSON.parse(event.data);const revision=Number(message.record?.revision||0),current=Number(cloudSession.revision||0);
    console.info('[TV Realtime] Message',message.type,revision||'');
    updateTvRealtimeDiagnostics({messages:ksmTvRealtimeDiagnostics.messages+1,lastMessageAt:Date.now(),lastReceivedRevision:revision||ksmTvRealtimeDiagnostics.lastReceivedRevision,lastReason:`Received ${message.type||'message'}`});
    if((message.type==='snapshot'||message.type==='connected')&&message.record){
      if(isTvSession()&&revision>current+1){updateTvRealtimeDiagnostics({lastReason:`Revision gap ${current} → ${revision}; requesting full refresh`});refreshTvFromCloud('Revision gap recovery')}
      else applyRemoteCloudRecord(message.record,false,isTvSession()&&message.type==='connected');
    }
    if(message.type==='flash')window.dispatchEvent(new CustomEvent('ksm:tie-flash',{detail:message}));
    if(message.type==='clock')window.dispatchEvent(new CustomEvent('ksm:court-clock',{detail:message}));
    if(message.presence)renderCloudPresence(message.presence);if(message.type==='presence')renderCloudPresence(message.clients||[]);
    if(message.type==='credential-rotated'&&message.role===ksmSessionRole){setConnectionStatus('Access key changed','offline');disconnectCloudSocket()}
  }catch(err){console.warn('Cloud sync message failed',err);updateTvRealtimeDiagnostics({lastReason:`Message error: ${err?.message||err}`})}});
  socket.addEventListener('close',()=>{if(socket!==ksmCloudSocket)return;console.info('[TV Realtime] Disconnected');setKsmCloudSocket(null);clearTvSyncTimers();updateTvRealtimeDiagnostics({status:navigator.onLine?'Reconnecting':'Offline',lastReason:'Socket closed'});setConnectionStatus(navigator.onLine?'Sync reconnecting…':'Offline • local saved',navigator.onLine?'connecting':'offline');scheduleCloudReconnect()});
  // Issue #26: a deleted tournament closes every live connection ('Tournament deleted') after a
  // 'deleted' message; a device that reconnects later is refused (410) and ends the same way.
  {const tournamentId=cloudSession.tournamentId;
  socket.addEventListener('message',event=>{try{if(JSON.parse(event.data).type==='deleted')ksmAnnounceTournamentGone(tournamentId)}catch(_){}});
  socket.addEventListener('close',event=>{if(event.reason!=='Reconnect')ksmAnnounceSocketEnd(tournamentId,event.reason)})}
  for(const event of ['open','close','error'])socket.addEventListener(event,ksmTieFlashConnectionChanged);
  socket.addEventListener('error',()=>{if(socket===ksmCloudSocket){console.warn('[TV Realtime] Socket error');updateTvRealtimeDiagnostics({status:'Interrupted',lastReason:'Socket error'});setConnectionStatus('Sync interrupted','offline')}});
}
async function loadTournamentFileAsNew(){
  const pending=ksmPendingTournamentFile;if(!pending)return;
  // The open tournament's own unsaved work must reach the cloud first: its offline queue would
  // otherwise be replaced by the new tournament's.
  const saved=cloudSession.tournamentId&&!isReadOnlySession()?await saveTournamentToCloudWithReason('Before loading a tournament file',true):true;
  if(!saved||readOutbox()){alert('The open tournament has changes that could not be saved to the cloud yet. Connect to the internet (or use Save Now), then load the file again. Nothing was changed.');return}
  const password=ksmUsesAccountAuth()?'':promptNewStaffPassword();if(!ksmUsesAccountAuth()&&!password)return;
  setKsmPendingTournamentFile(null);closeCloudModal();
  clearTimeout(ksmSaveTimer);setKsmSaveTimer(null);clearTimeout(ksmCloudTimer);setKsmCloudTimer(null);
  const previous={session:{...cloudSession},password:v316StaffPassword(),role:ksmSessionRole};
  disconnectCloudSocket();cloudSession.tournamentId=null;cloudSession.revision=0;cloudSession.updatedAt=null;cloudSession.court='';persistCloudSession();
  if(password)sessionStorage.setItem(KSM_V316_STAFF_SESSION,password);setSessionRole('staff');installRoleBanner('staff');document.body.classList.remove('ksm-home');
  if(!applyTournamentFilePayload(pending.payload,false)){Object.assign(cloudSession,previous.session);persistCloudSession();if(previous.password)sessionStorage.setItem(KSM_V316_STAFF_SESSION,previous.password);else sessionStorage.removeItem(KSM_V316_STAFF_SESSION);setSessionRole(previous.role);if(cloudSession.tournamentId)connectCloudSocket();return}
  // A tournament link in the address bar would reopen the old tournament after a reload.
  const linked=Boolean(ksmLinkParams().get('tournament'));if(linked)ksmReplaceUrl('/');
  markLocalSave('Tournament file loaded as new tournament');updateSaveStatus('Loaded '+pending.fileName);showKsmToast('Creating tournament in cloud…',0);
  try{await performCloudSave(tournamentPayload(),0);if(linked&&cloudSession.tournamentId)ksmReplaceUrl(KSMEngine.routePath({screen:'tournament',id:cloudSession.tournamentId}));showKsmToast('✓ Loaded as a new tournament',2200)}
  catch(err){console.error(err);writeOutbox(tournamentPayload(),'Tournament file loaded as new tournament');showKsmToast(navigator.onLine?'Unable to create tournament in cloud':'Offline · Tournament will sync when connected',3500,true)}
}
window.addEventListener('beforeunload', queueUnsyncedStaffWorkBeforeUnload);
window.addEventListener('beforeunload', autoSaveTournament);
document.addEventListener('input', scheduleAutoSave, true);
document.addEventListener('change', scheduleAutoSave, true);
document.addEventListener('click', function(e){ if(e.target.closest('button,.status,.search-item,.tab,.seg,.x')&&!e.target.closest('[data-testid="nav-toggle"],.mobile-nav-close')&&!ksmPoolEditorClick(e.target)&&!e.target.closest('.tie-flash-action')&&!e.target.closest('.match-timer')) scheduleAutoSave(e); }, true);
setInterval(()=>autoSaveTournament('10-minute safety autosave'),600000);
setInterval(renderPersistentSaveStatus,60000);


