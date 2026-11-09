// @ts-check
import {state} from '../app-state.js';
import {toggleStaffSession} from '../auth/auth0-access.js';
import {ksmNormalizeTimerSettings} from '../court/match-timer.js';
import {ksmPersistentSaveStatusText,ksmRenderConnectionStatus,ksmRenderSaveStatus} from '../react-bridges/shell.js';
import {ksmSyncLegacyTeamDivision} from '../registration/team-divisions.js';
import {isReadOnlySession,ksmKeepStaffOutbox,v316StaffPassword} from '../session/staff-session-and-library.js';
import {ksmStartupHasCache,ksmStartupLoadFailed} from '../session/tournament-switcher.js';
import {ksmApplyingRemoteSnapshot,ksmCloudTimer,ksmFileReplace,ksmLastSuccessfulSaveAt,ksmQueuedSaveRetryTimer,ksmSaveTimer,mergeQueuedStaffWork,saveTournamentToCloudWithReason,scheduleCloudSave,setKsmCloudTimer,setKsmQueuedSaveRetryTimer,setKsmSaveStatusMode,setKsmSaveTimer,showKsmToast} from './cloud-realtime-save-and-load.js';
import {KSM_AUTOSAVE_CLOUD_ID,KSM_CLOUD_RECOVERY_KEY,KSM_CLOUD_SESSION_KEY,KSM_SAVE_KEY,applyCourtSides,cloudBaseFor,ksmRestoreRecoveries} from './sync-state-and-rebase.js';
import {KSM_TAB_ID,ksmAdoptOrphanOutbox,ksmOutboxKey,ksmPeekOrphanOutbox,ksmReadOutboxKey,ksmReleaseAdoptedOutbox} from './two-tabs.js';
import {ksmPendingRestoreMark} from './undo-regenerate.js';
// The cloud session, the outbox and the local autosave (step 3d of #136, from app/js/20-cloud-session-and-autosave.js).
// cloudSession is read from localStorage by initCloudSession(), which app/js/20- runs where this file used to load.
// scheduleAutoSave(), saveAuto() and criticalAutoSave() stay in app/js (tests wrap them through window).
export let cloudSession;
export let ksmSessionRole='local';
// A module's `let` is read-only to importers: app/js, the window accessors and the other sync modules assign it here.
export function setKsmSessionRole(value){ksmSessionRole=value}
function loadCloudSession(){try{return JSON.parse(localStorage.getItem(KSM_CLOUD_SESSION_KEY)||'{}')}catch(_){return {}}}
export function persistCloudSession(){localStorage.setItem(KSM_CLOUD_SESSION_KEY,JSON.stringify(cloudSession))}
export function setConnectionStatus(text,mode='local'){ksmRenderConnectionStatus(text,mode);}
export function humanSaveAge(){if(!ksmLastSuccessfulSaveAt)return 'Not saved yet';const min=Math.max(0,Math.floor((Date.now()-ksmLastSuccessfulSaveAt)/60000));if(min<1)return '✓ Saved just now';if(min<60)return `✓ Saved ${min} min ago`;return '✓ Saved at '+new Date(ksmLastSuccessfulSaveAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}
export function renderPersistentSaveStatus(){ksmRenderSaveStatus(ksmPersistentSaveStatusText());}
export function ensureClientIdentity(){if(!cloudSession.clientId)cloudSession.clientId=crypto.randomUUID();if(!cloudSession.clientName)cloudSession.clientName='KSM Device';persistCloudSession()}
export function cloudEnvelope(payload=tournamentPayload()){return {schemaVersion:'1.2',tournamentId:cloudSession.tournamentId||null,engineVersion:'3.12.9',revision:cloudSession.revision||0,payload}}
export function readOutbox(){
  // F36: this tab's own slot; else a closed tab's work for this tournament (shown, `peeked`; a staff tab
  // takes it over).
  const own=ksmReadOutboxKey(ksmOutboxKey());if(own)return own;
  ksmAdoptOrphanOutbox();  // a staff tab claims it; taken over (and sent) a moment later
  return ksmPeekOrphanOutbox();
}
export function writeOutbox(payload,reason='Local change'){if(ksmKeepStaffOutbox())return;const queued={schemaVersion:'1.0',tournamentId:cloudSession.tournamentId,assignedCourt:cloudSession.court||state.currentCourt||'',role:ksmSessionRole,baseRevision:cloudSession.revision||0,basePayload:cloudBaseFor(cloudSession.revision||0),payload,actions:[{type:'snapshot',reason,createdAt:new Date().toISOString()}],queuedAt:new Date().toISOString()};queued.writer=KSM_TAB_ID;
  // #129 part 3: a queued regenerate keeps its mark (sent with the queued snapshot, or by the tab that takes it over).
  const restoreMark=ksmPendingRestoreMark(cloudSession.tournamentId,payload);if(restoreMark){queued.restorePoint='regenerate';queued.restorePointId=restoreMark.restorePointId;queued.restorePointRevision=restoreMark.managementRevision}
ksmReleaseAdoptedOutbox();localStorage.setItem(ksmOutboxKey(),JSON.stringify(queued));
  // The recovery slot is a second copy of the queue: a full storage there must not fail the queue itself.
  try{localStorage.setItem(KSM_CLOUD_RECOVERY_KEY,JSON.stringify({savedAt:new Date().toISOString(),outbox:queued,serverRevision:cloudSession.revision||0}))}catch(_){}
  setKsmSaveStatusMode('offline');renderPersistentSaveStatus()}
export function clearOutbox(){
  // F36: only this tab's slot; a closed tab's work it took over but has not merged yet is given back.
  ksmReleaseAdoptedOutbox();
  localStorage.removeItem(ksmOutboxKey());
}
export function preserveRecovery(outbox,serverRecord){localStorage.setItem(KSM_CLOUD_RECOVERY_KEY,JSON.stringify({savedAt:new Date().toISOString(),outbox,serverRevision:serverRecord?.revision||0}));setKsmSaveStatusMode('error');renderPersistentSaveStatus()}
export function downloadJson(value,name){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function recoveryPackage(){const outbox=readOutbox();let stored=null;try{stored=JSON.parse(localStorage.getItem(KSM_CLOUD_RECOVERY_KEY)||'null')}catch(_){}return {fileType:'KSM_RECOVERY',schemaVersion:'1.0',appVersion:'3.17.3-test',engineVersion:'3.12.9',createdAt:new Date().toISOString(),tournamentId:cloudSession.tournamentId||outbox?.tournamentId||null,assignedCourt:cloudSession.court||state.currentCourt||'',role:ksmSessionRole,lastConfirmedCloudRevision:cloudSession.revision||0,latestLocalSnapshot:tournamentPayload(),queuedActions:outbox?.actions||[],outbox:outbox||null,conflictRecovery:stored||null,restoreRecovery:ksmRestoreRecoveries(cloudSession.tournamentId||outbox?.tournamentId||'')}}
export function downloadRecoveryFile(){try{const pack=recoveryPackage();const court=pack.assignedCourt?`_Court-${pack.assignedCourt}`:'';const stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);downloadJson(pack,`KSM_Recovery${court}_${stamp}.ksm`);updateSaveStatus('Recovery file downloaded')}catch(err){console.error(err);alert('Unable to create recovery file.')}}
function downloadCloudRecovery(){downloadRecoveryFile()}
export function getSetupSnapshot(){
  const ids=['tName','tHost','tDate','tLocation','tCourts','teamEnabled','teamFormat','teamTournamentFormat','teamCourt','teamAwardMode','exhibitionEnabled','court1Refs','court2Refs','court1RedSide','court2RedSide','timeRegular','timeQuarterfinal','timeSemifinal','timeFinal','timeEncho','court1TimerSound','court2TimerSound','court1TimerEnabled','court2TimerEnabled', 'court1TvRedSide','court2TvRedSide'];
  const data={};
  ids.forEach(id=>{const el=/** @type {HTMLInputElement|null} */(document.getElementById(id)); if(el) data[id]=el.value;});
  return data;
}
// Engine code reads tournament settings only through this accessor (app/engine/settings.ts);
// the source is the same `setup` snapshot that tournamentPayload() persists.
export function tournamentSettings(setup=getSetupSnapshot()){return KSMEngine.readSettings(setup)}
export function applySetupSnapshot(data){
  if(!data) return;
  data={...data,...ksmNormalizeTimerSettings(data)};
  // Old tournaments and unrecognized values retain the original audience orientation.
  data={...data,court1TvRedSide:data.court1TvRedSide==='left'?'left':'right',court2TvRedSide:data.court2TvRedSide==='left'?'left':'right'};
  Object.keys(data).forEach(id=>{const el=/** @type {HTMLInputElement|null} */(document.getElementById(id)); if(el) el.value=data[id];});
  applyCourtSides();
  if(!state.teamDivisions&&data.teamCourt)state.divisionCourts['Team Tournament']=data.teamCourt;
  (state.teamDivisions||[]).forEach(d=>state.divisionCourts[d.id]=/** @type {any} */(d.court));
  if(data.teamAwardMode) state.teamAwardMode=data.teamAwardMode;
  ksmSyncLegacyTeamDivision();
}
export function tournamentPayload(){
  return {
    schemaVersion:'1.1',
    engineVersion:'3.12.9',
    templateVersion:'2026.1',
    savedAt:new Date().toISOString(),
    setup:getSetupSnapshot(),
    state:JSON.parse(JSON.stringify(state))
  };
}
export function updateSaveStatus(text){ksmRenderSaveStatus(text);}
export function ksmClearAutosave(){localStorage.removeItem(KSM_SAVE_KEY);localStorage.removeItem(KSM_AUTOSAVE_CLOUD_ID)}
export function ksmStoreAutosave(payload,id=cloudSession.tournamentId){
  localStorage.setItem(KSM_AUTOSAVE_CLOUD_ID,id||'');
  localStorage.setItem(KSM_SAVE_KEY,JSON.stringify(payload));
}
export function markLocalSave(reason='Local autosave'){try{ksmStoreAutosave(tournamentPayload());return true}catch(err){console.warn('Local save failed',err);setKsmSaveStatusMode('error');renderPersistentSaveStatus();return false}}
export function autoSaveTournament(reason='Autosave'){if(ksmFileReplace){if(!ksmApplyingRemoteSnapshot&&!isReadOnlySession())scheduleCloudSave(reason);return}if((document.body.classList.contains('ksm-home')&&!cloudSession.tournamentId&&!v316StaffPassword())||(ksmStartupLoadFailed&&!ksmStartupHasCache))return;if(!markLocalSave(reason))return;if(!ksmApplyingRemoteSnapshot&&!isReadOnlySession())scheduleCloudSave(reason)}
export async function saveNow(){
  if(ksmStartupLoadFailed&&!ksmStartupHasCache)return;
  if(isReadOnlySession()){
    if(ksmKeepStaffOutbox())return toggleStaffSession();
    return;
  }
  clearTimeout(ksmSaveTimer);setKsmSaveTimer(null);clearTimeout(ksmCloudTimer);setKsmCloudTimer(null);
  clearTimeout(ksmQueuedSaveRetryTimer);setKsmQueuedSaveRetryTimer(null);
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
// Load-time side effects (the session read from localStorage, the autosave upgrade), run from app/js where this
// file was loaded: after 19-'s resetLegacyTournamentDataOnce(), which may clear the stored session first.
export function initCloudSession(){
cloudSession=loadCloudSession();
// Upgrade existing autosaves while their persisted session still identifies their origin.
if(localStorage.getItem(KSM_SAVE_KEY)&&localStorage.getItem(KSM_AUTOSAVE_CLOUD_ID)===null&&cloudSession.tournamentId){
  localStorage.setItem(KSM_AUTOSAVE_CLOUD_ID,cloudSession.tournamentId);
}
}
