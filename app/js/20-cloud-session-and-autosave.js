const cloudSession=loadCloudSession();
let ksmSessionRole='local';
function loadCloudSession(){try{return JSON.parse(localStorage.getItem(KSM_CLOUD_SESSION_KEY)||'{}')}catch(_){return {}}}
function persistCloudSession(){localStorage.setItem(KSM_CLOUD_SESSION_KEY,JSON.stringify(cloudSession))}
function setConnectionStatus(text,mode='local'){ksmRenderConnectionStatus(text,mode);}
function humanSaveAge(){if(!ksmLastSuccessfulSaveAt)return 'Not saved yet';const min=Math.max(0,Math.floor((Date.now()-ksmLastSuccessfulSaveAt)/60000));if(min<1)return '✓ Saved just now';if(min<60)return `✓ Saved ${min} min ago`;return '✓ Saved at '+new Date(ksmLastSuccessfulSaveAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}
function renderPersistentSaveStatus(){ksmRenderSaveStatus(ksmPersistentSaveStatusText());}
function ensureClientIdentity(){if(!cloudSession.clientId)cloudSession.clientId=crypto.randomUUID();if(!cloudSession.clientName)cloudSession.clientName='KSM Device';persistCloudSession()}
function cloudEnvelope(payload=tournamentPayload()){return {schemaVersion:'1.2',tournamentId:cloudSession.tournamentId||null,engineVersion:'3.12.9',revision:cloudSession.revision||0,payload}}
function readOutbox(){
  // F36: this tab's own slot; else a closed tab's work for this tournament (shown, `peeked`; a staff tab
  // takes it over).
  const own=ksmReadOutboxKey(ksmOutboxKey());if(own)return own;
  ksmAdoptOrphanOutbox();  // a staff tab claims it; taken over (and sent) a moment later
  return ksmPeekOrphanOutbox();
}
function writeOutbox(payload,reason='Local change'){if(ksmKeepStaffOutbox())return;const queued={schemaVersion:'1.0',tournamentId:cloudSession.tournamentId,assignedCourt:cloudSession.court||state.currentCourt||'',role:ksmSessionRole,baseRevision:cloudSession.revision||0,basePayload:cloudBaseFor(cloudSession.revision||0),payload,actions:[{type:'snapshot',reason,createdAt:new Date().toISOString()}],queuedAt:new Date().toISOString()};queued.writer=KSM_TAB_ID;ksmReleaseAdoptedOutbox();localStorage.setItem(ksmOutboxKey(),JSON.stringify(queued));localStorage.setItem(KSM_CLOUD_RECOVERY_KEY,JSON.stringify({savedAt:new Date().toISOString(),outbox:queued,serverRevision:cloudSession.revision||0}));ksmSaveStatusMode='offline';renderPersistentSaveStatus()}
function clearOutbox(){
  // F36: only this tab's slot; a closed tab's work it took over but has not merged yet is given back.
  ksmReleaseAdoptedOutbox();
  localStorage.removeItem(ksmOutboxKey());
}
function preserveRecovery(outbox,serverRecord){localStorage.setItem(KSM_CLOUD_RECOVERY_KEY,JSON.stringify({savedAt:new Date().toISOString(),outbox,serverRevision:serverRecord?.revision||0}));ksmSaveStatusMode='error';renderPersistentSaveStatus()}
function downloadJson(value,name){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function recoveryPackage(){const outbox=readOutbox();let stored=null;try{stored=JSON.parse(localStorage.getItem(KSM_CLOUD_RECOVERY_KEY)||'null')}catch(_){}return {fileType:'KSM_RECOVERY',schemaVersion:'1.0',appVersion:'3.17.3-test',engineVersion:'3.12.9',createdAt:new Date().toISOString(),tournamentId:cloudSession.tournamentId||outbox?.tournamentId||null,assignedCourt:cloudSession.court||state.currentCourt||'',role:ksmSessionRole,lastConfirmedCloudRevision:cloudSession.revision||0,latestLocalSnapshot:tournamentPayload(),queuedActions:outbox?.actions||[],outbox:outbox||null,conflictRecovery:stored||null}}
function downloadRecoveryFile(){try{const pack=recoveryPackage();const court=pack.assignedCourt?`_Court-${pack.assignedCourt}`:'';const stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);downloadJson(pack,`KSM_Recovery${court}_${stamp}.ksm`);updateSaveStatus('Recovery file downloaded')}catch(err){console.error(err);alert('Unable to create recovery file.')}}
function downloadCloudRecovery(){downloadRecoveryFile()}
function getSetupSnapshot(){
  const ids=['tName','tHost','tDate','tLocation','tCourts','teamEnabled','teamFormat','teamTournamentFormat','teamCourt','teamAwardMode','exhibitionEnabled','court1Refs','court2Refs','court1RedSide','court2RedSide','timeRegular','timeQuarterfinal','timeSemifinal','timeFinal','timeEncho','court1TimerSound','court2TimerSound','court1TimerEnabled','court2TimerEnabled', 'court1TvRedSide','court2TvRedSide'];
  const data={};
  ids.forEach(id=>{const el=document.getElementById(id); if(el) data[id]=el.value;});
  return data;
}
// Engine code reads tournament settings only through this accessor (app/engine/settings.ts);
// the source is the same `setup` snapshot that tournamentPayload() persists.
function tournamentSettings(setup=getSetupSnapshot()){return KSMEngine.readSettings(setup)}
function applySetupSnapshot(data){
  if(!data) return;
  data={...data,...ksmNormalizeTimerSettings(data)};
  // Old tournaments and unrecognized values retain the original audience orientation.
  data={...data,court1TvRedSide:data.court1TvRedSide==='left'?'left':'right',court2TvRedSide:data.court2TvRedSide==='left'?'left':'right'};
  Object.keys(data).forEach(id=>{const el=document.getElementById(id); if(el) el.value=data[id];});
  applyCourtSides();
  if(!state.teamDivisions&&data.teamCourt)state.divisionCourts['Team Tournament']=data.teamCourt;
  (state.teamDivisions||[]).forEach(d=>state.divisionCourts[d.id]=d.court);
  if(data.teamAwardMode) state.teamAwardMode=data.teamAwardMode;
  ksmSyncLegacyTeamDivision();
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
function updateSaveStatus(text){ksmRenderSaveStatus(text);}
const KSM_AUTOSAVE_CLOUD_ID=KSM_SAVE_KEY+':cloud-id';
// Upgrade existing autosaves while their persisted session still identifies their origin.
if(localStorage.getItem(KSM_SAVE_KEY)&&localStorage.getItem(KSM_AUTOSAVE_CLOUD_ID)===null&&cloudSession.tournamentId){
  localStorage.setItem(KSM_AUTOSAVE_CLOUD_ID,cloudSession.tournamentId);
}
function ksmClearAutosave(){localStorage.removeItem(KSM_SAVE_KEY);localStorage.removeItem(KSM_AUTOSAVE_CLOUD_ID)}
function ksmStoreAutosave(payload,id=cloudSession.tournamentId){
  localStorage.setItem(KSM_AUTOSAVE_CLOUD_ID,id||'');
  localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(payload));
}
function markLocalSave(reason='Local autosave'){try{ksmStoreAutosave(tournamentPayload());return true}catch(err){console.warn('Local save failed',err);ksmSaveStatusMode='error';renderPersistentSaveStatus();return false}}
function autoSaveTournament(reason='Autosave'){if(ksmFileReplace){if(!ksmApplyingRemoteSnapshot&&!isReadOnlySession())scheduleCloudSave(reason);return}if((document.body.classList.contains('ksm-home')&&!cloudSession.tournamentId&&!v316StaffPassword())||(ksmStartupLoadFailed&&!ksmStartupHasCache))return;if(!markLocalSave(reason))return;if(!ksmApplyingRemoteSnapshot&&!isReadOnlySession())scheduleCloudSave(reason)}
// Remote snapshots never echo into cloud: if(!ksmApplyingRemoteSnapshot)scheduleCloudSave()
function scheduleAutoSave(reason='Edit'){
  // Read-only controls must not create mutations or rewrite the autosave/outbox.
  if(reason instanceof Event&&reason.target?.closest?.('#home, .cloud-status-wrap, #ksmCloudModal, .setup-tournament-actions, .setup-short-url, input[type="file"]'))return;
if(ksmStartupLoadFailed&&!ksmStartupHasCache)return;ksmSyncGrandChampions(typeof reason==='string'?reason:'edit');noteLocalMutation();clearTimeout(ksmSaveTimer);ksmSaveTimer=setTimeout(()=>{ksmSaveTimer=null;autoSaveTournament(reason)},2000)}
// F11: the Results awards editor calls saveAuto() (add, remove, edit), which was never defined, so
// every award action threw: award edits were never autosaved and add/remove did not redraw.
// It is an ordinary edit, saved like the others.
function saveAuto(){scheduleAutoSave('Awards')}
async function saveNow(){
  if(ksmStartupLoadFailed&&!ksmStartupHasCache)return;
  if(isReadOnlySession()){
    if(ksmKeepStaffOutbox())return toggleStaffSession();
    return;
  }
  clearTimeout(ksmSaveTimer);ksmSaveTimer=null;clearTimeout(ksmCloudTimer);ksmCloudTimer=null;
  clearTimeout(ksmQueuedSaveRetryTimer);ksmQueuedSaveRetryTimer=null;
  const queued=readOutbox();
  if(queued?.tournamentId&&queued.tournamentId!==cloudSession.tournamentId){showKsmToast('Queued work belongs to another tournament',4000,true);return}
  if(queued)mergeQueuedStaffWork();
  if(!markLocalSave('Manual Save Now')){showKsmToast('Unable to save on this device',3500,true);return}
  showKsmToast('Saving…',0);
  const saved=await saveTournamentToCloudWithReason('Manual Save Now',true);
  if(isReadOnlySession()&&ksmKeepStaffOutbox()){
    showKsmToast('Staff Login required to save queued work',3500,true);
    return toggleStaffSession();
  }
  showKsmToast(saved?'✓ Tournament saved':'Not saved · Changes waiting',saved?2000:3500,!saved);
  return !!saved;
}
function criticalAutoSave(reason){if(ksmStartupLoadFailed&&!ksmStartupHasCache)return;ksmSyncGrandChampions(reason);noteLocalMutation();markLocalSave(reason);if(!isReadOnlySession())saveTournamentToCloudWithReason(reason,true)}

