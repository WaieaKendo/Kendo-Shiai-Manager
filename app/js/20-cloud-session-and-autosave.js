const cloudSession=loadCloudSession();
let ksmSessionRole='local';
function loadCloudSession(){try{return JSON.parse(localStorage.getItem(KSM_CLOUD_SESSION_KEY)||'{}')}catch(_){return {}}}
function persistCloudSession(){localStorage.setItem(KSM_CLOUD_SESSION_KEY,JSON.stringify(cloudSession))}
function setConnectionStatus(text,mode='local'){/* ksm:post-split-begin react-shell */ksmRenderConnectionStatus(text,mode);if(window.ksmShellMounted)return;/* ksm:post-split-end */const el=document.getElementById('connectionStatus');if(!el)return;const labels={online:'🟢 Online',offline:'🟠 Offline',connecting:'🟡 Connecting',error:'🔴 Attention',local:'Local'};el.textContent=labels[mode]||text||'Local';el.dataset.mode=mode;el.title=text||el.textContent}
function humanSaveAge(){if(!ksmLastSuccessfulSaveAt)return 'Not saved yet';const min=Math.max(0,Math.floor((Date.now()-ksmLastSuccessfulSaveAt)/60000));if(min<1)return '✓ Saved just now';if(min<60)return `✓ Saved ${min} min ago`;return '✓ Saved at '+new Date(ksmLastSuccessfulSaveAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}
function renderPersistentSaveStatus(){/* ksm:post-split-begin react-shell */ksmRenderSaveStatus(ksmPersistentSaveStatusText());if(window.ksmShellMounted)return;/* ksm:post-split-end */const el=document.getElementById('saveStatus');if(!el)return;if(ksmSaveStatusMode==='saving'){el.textContent='Saving…';return}if(ksmSaveStatusMode==='syncing'){el.textContent='Synchronizing…';return}if(ksmSaveStatusMode==='offline'){el.textContent=`Saved locally${readOutbox()?' · 1 change waiting':''}`;return}if(ksmSaveStatusMode==='error'){el.textContent='Save needs attention';return}el.textContent=humanSaveAge()}
function setSessionRole(role){ksmSessionRole=role||'local';const names={spectator:'Spectator',scorekeeper:'Scorekeeper',director:'Director',admin:'Admin',local:'Local'};const el=document.getElementById('sessionRole');if(el){el.textContent=names[ksmSessionRole]||'Local';el.dataset.role=ksmSessionRole}document.body.classList.toggle('ksm-spectator',ksmSessionRole==='spectator');document.body.classList.toggle('ksm-scorekeeper',ksmSessionRole==='scorekeeper');document.body.classList.toggle('ksm-admin',ksmSessionRole==='admin')}
function isReadOnlySession(){return ksmSessionRole==='spectator'}
function isSpectatorSession(){return isReadOnlySession()}
function canCloudWrite(){return ['scorekeeper','director','admin'].includes(ksmSessionRole)||!cloudSession.tournamentId}
function sessionKey(){return cloudSession.credentials?.[ksmSessionRole]||cloudSession.directorKey||''}
function ensureClientIdentity(){if(!cloudSession.clientId)cloudSession.clientId=crypto.randomUUID();if(!cloudSession.clientName)cloudSession.clientName='KSM Device';persistCloudSession()}
function cloudEnvelope(payload=tournamentPayload()){return {schemaVersion:'1.2',tournamentId:cloudSession.tournamentId||null,engineVersion:'3.12.9',revision:cloudSession.revision||0,payload}}
function cloudHeaders(){return {'content-type':'application/json','x-ksm-role':ksmSessionRole==='local'?'director':ksmSessionRole,'x-ksm-session-key':sessionKey(),'x-ksm-client-id':cloudSession.clientId||'','x-ksm-client-name':cloudSession.clientName||'KSM Device','x-ksm-court':cloudSession.court||''}}
function readOutbox(){try{return JSON.parse(localStorage.getItem(KSM_CLOUD_OUTBOX_KEY)||'null')}catch(_){return null}}
function writeOutbox(payload,reason='Local change'){const queued={schemaVersion:'1.0',tournamentId:cloudSession.tournamentId,assignedCourt:cloudSession.court||state.currentCourt||'',role:ksmSessionRole,baseRevision:cloudSession.revision||0,/* ksm:post-split-begin edit-merge */basePayload:cloudBaseFor(cloudSession.revision||0),/* ksm:post-split-end */payload,actions:[{type:'snapshot',reason,createdAt:new Date().toISOString()}],queuedAt:new Date().toISOString()};localStorage.setItem(KSM_CLOUD_OUTBOX_KEY,JSON.stringify(queued));localStorage.setItem(KSM_CLOUD_RECOVERY_KEY,JSON.stringify({savedAt:new Date().toISOString(),outbox:queued,serverRevision:cloudSession.revision||0}));ksmSaveStatusMode='offline';renderPersistentSaveStatus()}
function clearOutbox(){localStorage.removeItem(KSM_CLOUD_OUTBOX_KEY)}
function preserveRecovery(outbox,serverRecord){localStorage.setItem(KSM_CLOUD_RECOVERY_KEY,JSON.stringify({savedAt:new Date().toISOString(),outbox,serverRevision:serverRecord?.revision||0}));ksmSaveStatusMode='error';renderPersistentSaveStatus()}
function downloadJson(value,name){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function recoveryPackage(){const outbox=readOutbox();let stored=null;try{stored=JSON.parse(localStorage.getItem(KSM_CLOUD_RECOVERY_KEY)||'null')}catch(_){}return {fileType:'KSM_RECOVERY',schemaVersion:'1.0',appVersion:'3.17.3-test',engineVersion:'3.12.9',createdAt:new Date().toISOString(),tournamentId:cloudSession.tournamentId||outbox?.tournamentId||null,assignedCourt:cloudSession.court||state.currentCourt||'',role:ksmSessionRole,lastConfirmedCloudRevision:cloudSession.revision||0,latestLocalSnapshot:tournamentPayload(),queuedActions:outbox?.actions||[],outbox:outbox||null,conflictRecovery:stored||null}}
function downloadRecoveryFile(){try{const pack=recoveryPackage();const court=pack.assignedCourt?`_Court-${pack.assignedCourt}`:'';const stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);downloadJson(pack,`KSM_Recovery${court}_${stamp}.ksm`);updateSaveStatus('Recovery file downloaded')}catch(err){console.error(err);alert('Unable to create recovery file.')}}
function downloadCloudRecovery(){downloadRecoveryFile()}
function getSetupSnapshot(){
  const ids=['tName','tHost','tDate','tLocation','tCourts','tType','teamEnabled','teamFormat','teamTournamentFormat','teamCourt','teamAwardMode','exhibitionEnabled','court1Refs','court2Refs','court1RedSide','court2RedSide'];
  const data={};
  ids.forEach(id=>{const el=document.getElementById(id); if(el) data[id]=el.value;});
  return data;
}
/* ksm:post-split-begin engine-settings */
// Engine code reads tournament settings only through this accessor (app/engine/settings.ts);
// the source is the same `setup` snapshot that tournamentPayload() persists.
function tournamentSettings(setup=getSetupSnapshot()){return KSMEngine.readSettings(setup)}
/* ksm:post-split-end */
function applySetupSnapshot(data){
  if(!data) return;
  Object.keys(data).forEach(id=>{const el=document.getElementById(id); if(el) el.value=data[id];});
  applyCourtSides();
  if(data.teamCourt) state.divisionCourts['Team Tournament']=data.teamCourt;
  if(data.teamAwardMode) state.teamAwardMode=data.teamAwardMode;
}
function tournamentPayload(){
  return {
    schemaVersion:'1.1',
    engineVersion:'3.12.9',
    templateVersion:'2026.1',
    savedAt:new Date().toISOString(),
    setup:getSetupSnapshot(),
    state:JSON.parse(JSON.stringify(state))
  };
}
function updateSaveStatus(text){/* ksm:post-split-begin react-shell */ksmRenderSaveStatus(text);if(window.ksmShellMounted)return;/* ksm:post-split-end */const el=document.getElementById('saveStatus');if(el)el.textContent=text}
function markLocalSave(reason='Local autosave'){try{localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(tournamentPayload()));return true}catch(err){console.warn('Local save failed',err);ksmSaveStatusMode='error';renderPersistentSaveStatus();return false}}
function autoSaveTournament(reason='Autosave'){if(!markLocalSave(reason))return;if(!ksmApplyingRemoteSnapshot&&!isReadOnlySession())scheduleCloudSave(reason)}
// Remote snapshots never echo into cloud: if(!ksmApplyingRemoteSnapshot)scheduleCloudSave()
function scheduleAutoSave(reason='Edit'){noteLocalMutation();clearTimeout(ksmSaveTimer);ksmSaveTimer=setTimeout(()=>{ksmSaveTimer=null;autoSaveTournament(reason)},2000)}
/* ksm:post-split-begin award-save */
// F11: the Results awards editor calls saveAuto() (add, remove, edit), which was never defined, so
// every award action threw: award edits were never autosaved and add/remove did not redraw.
// It is an ordinary edit, saved like the others.
function saveAuto(){scheduleAutoSave('Awards')}
/* ksm:post-split-end */
async function saveNow(){markLocalSave('Manual Save Now');showKsmToast('Saving…',0);const saved=await saveTournamentToCloudWithReason('Manual Save Now',true);if(saved){showKsmToast('✓ Tournament saved',2000)}else if(!navigator.onLine){showKsmToast('Saved locally · Waiting to sync',3000)}else{showKsmToast('Unable to save to cloud',3500,true)}}
function criticalAutoSave(reason){noteLocalMutation();markLocalSave(reason);if(!isReadOnlySession())saveTournamentToCloudWithReason(reason,true)}

