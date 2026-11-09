// @ts-check
import {state} from '../app-state.js';
import {cloudHeaders,ksmCacheTournament} from '../auth/auth0-access.js';
import {isReadOnlySession} from '../session/staff-session-and-library.js';
import {writeCloudDiagnosticsState} from './cloud-diagnostics.js';
import {applyRemoteCloudRecord,applyTournamentPayload,flushCloudOutbox,ksmAnnounceTournamentGone,ksmClockId,ksmCloudSavePending,ksmCloudTimer,ksmConfirmedMutationVersion,ksmLocalMutationVersion,ksmQueuedSaveRetryTimer,ksmSaveTimer,saveTournamentToCloudWithReason,setKsmApplyingRemoteSnapshot,setKsmCloudSavePending,setKsmCloudTimer,setKsmConfirmedMutationVersion,setKsmLastSuccessfulSaveAt,setKsmOutboxMutationVersion,setKsmQueuedSaveRetryTimer,setKsmSaveStatusMode,setKsmSaveTimer,showKsmToast} from './cloud-realtime-save-and-load.js';
import {clearOutbox,cloudSession,ksmStoreAutosave,persistCloudSession,readOutbox,renderPersistentSaveStatus,tournamentPayload} from './cloud-session-and-autosave.js';
import {clearLocalCourtDivisions,ksmKeepRestoreRecovery,localChangesPending,pinnedCourt,rememberCloudBase,restorePinnedCourt} from './sync-state-and-rebase.js';
// #129 part 3: Undo regenerate (step 3d of #136, from app/js/03-undo-regenerate.js). Its listeners are
// initUndoRegenerate(), which app/js/03-undo-regenerate.js runs where this file used to load.
// ---- #129 part 3: Undo regenerate ----
// A full Regenerate Tournament of a cloud tournament marks its save (restorePoint: 'regenerate' in the
// PUT body, see performCloudSave); the server then keeps the record it replaced for 24 h. A director or
// admin (staff session in the staff-key mode) restores it from the Danger zone. The mark lives in this
// tab's sessionStorage (it survives a reload) and in the queued outbox entry (a tab that takes over a
// closed tab's work sends it too) until a save carrying it is accepted. Local-only tournaments have no undo.
const KSM_RESTORE_MARK_PREFIX='ksm.restore-mark.v4_1';
const KSM_RESTORE_POINT_TTL_MS=24*60*60*1000;
let ksmRestorePoint=null,ksmRestorePointBusy=false;
// A module's `let` is read-only to importers: app/js, the window accessors and the other sync modules assign it here.
export function setKsmRestorePoint(value){ksmRestorePoint=value}
export function ksmUndoRegenerateOffered(){return Boolean(cloudSession.tournamentId)&&!isReadOnlySession()&&location.protocol!=='file:'}
function ksmRestoreMarkKey(id){return `${KSM_RESTORE_MARK_PREFIX}:${id||''}`}
// The mark names the regenerate's managementRevision: only a payload that contains the regenerate
// carries it (not a save of the older state that was already on its way).
export function ksmSetRestoreMark(id,markId,managementRevision){if(!id)return;try{sessionStorage.setItem(ksmRestoreMarkKey(id),JSON.stringify({kind:'regenerate',id:markId||ksmClockId(),managementRevision:Number(managementRevision||0),at:Date.now()}))}catch(_){}}
// {restorePoint:'regenerate',restorePointId,managementRevision} while this tab's regenerate is not saved yet,
// else null. With a payload: only when that payload contains the regenerate.
export function ksmPendingRestoreMark(id=cloudSession.tournamentId,payload=null){
  if(!id)return null;
  try{
    const mark=JSON.parse(sessionStorage.getItem(ksmRestoreMarkKey(id))||'null');
    if(mark?.kind!=='regenerate'||!(Date.now()-Number(mark.at||0)<KSM_RESTORE_POINT_TTL_MS))return null;
    if(payload&&Number(payload.state?.managementRevision||0)<Number(mark.managementRevision||0))return null;
    return {restorePoint:'regenerate',restorePointId:String(mark.id||''),managementRevision:Number(mark.managementRevision||0)};
  }catch(_){return null}
}
export function ksmClearRestoreMark(id=cloudSession.tournamentId,markId){
  try{const key=ksmRestoreMarkKey(id),mark=JSON.parse(sessionStorage.getItem(key)||'null');if(!markId||mark?.id===markId)sessionStorage.removeItem(key)}catch(_){}
}
export function ksmMarkRegenerateSave(){if(ksmUndoRegenerateOffered())ksmSetRestoreMark(cloudSession.tournamentId,'',state.managementRevision)}
// Asks the server whether there is a live restore point this session may restore (GET /status).
export async function ksmRefreshRestorePoint(){
  const id=cloudSession.tournamentId;
  if(!ksmUndoRegenerateOffered()){ksmRestorePoint=null;ksmRenderUndoRegenerate();return null}
  if(!navigator.onLine){ksmRenderUndoRegenerate();return ksmRestorePoint}
  try{
    const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}/status`,{cache:'no-store',headers:cloudHeaders()});
    if(id!==cloudSession.tournamentId)return null;
    const info=response.ok?await response.json():null;
    ksmRestorePoint=info?.restorePoint?{...info.restorePoint,tournamentId:id}:null;
  }catch(_){}
  ksmRenderUndoRegenerate();
  return ksmRestorePoint;
}
function ksmLiveRestorePoint(){const point=ksmRestorePoint;return point&&point.tournamentId===cloudSession.tournamentId&&ksmUndoRegenerateOffered()&&Date.parse(point.expiresAt)>Date.now()?point:null}
function ksmRestoreTime(value){const date=new Date(value),today=new Date();const time=date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});return date.toDateString()===today.toDateString()?time:`${date.toLocaleDateString([], {weekday:'short'})} ${time}`}
function ksmMatchWord(n){return `${n} finished ${n===1?'match':'matches'}`}
// The button and its line are added only while there is something to undo (Setup goldens unchanged).
export function ksmRenderUndoRegenerate(){
  const zone=document.querySelector('[data-testid="setup-danger-zone"]'),actions=zone?.querySelector('.actions');
  if(!actions)return;
  const point=ksmLiveRestorePoint();
  let button=/** @type {HTMLButtonElement|null} */(zone.querySelector('[data-testid="setup-undo-regenerate"]')),info=/** @type {HTMLElement|null} */(zone.querySelector('[data-testid="setup-undo-regenerate-info"]'));
  if(!point){button?.remove();info?.remove();return}
  if(!button){button=document.createElement('button');button.type='button';button.className='secondary danger';button.dataset.testid='setup-undo-regenerate';button.textContent='Undo regenerate';button.addEventListener('click',()=>ksmUndoRegenerate());actions.prepend(button)}
  if(!info){info=document.createElement('p');info.className='small';info.dataset.testid='setup-undo-regenerate-info';actions.after(info)}
  const offline=!navigator.onLine;
  button.disabled=offline||ksmRestorePointBusy;
  info.textContent=`Regenerated at ${ksmRestoreTime(point.takenAt)}. Undo regenerate brings back the tournament from before it, with ${ksmMatchWord(point.finishedMatches)}; available until ${ksmRestoreTime(point.expiresAt)}.`+(offline?' Undo regenerate needs a connection.':'');
}
async function ksmUndoRegenerate(){
  // The point shown and confirmed: the server refuses the undo if a newer regenerate replaced it meanwhile.
  const point=ksmLiveRestorePoint();
  if(!point||ksmRestorePointBusy)return;
  if(!navigator.onLine){alert('Undo regenerate needs a connection.');return}
  const now=KSMEngine.finishedMatchSummary(state.allMatches).total;
  if(!confirm(`Undo regenerate? The tournament goes back to how it was before the regenerate at ${ksmRestoreTime(point.takenAt)} (${ksmMatchWord(point.finishedMatches)}). Everything done since the regenerate (${ksmMatchWord(now)} now) is replaced on every device.`))return;
  ksmRestorePointBusy=true;ksmRenderUndoRegenerate();
  try{
    // This device's own unsaved work is sent first (the server copy is what the undo replaces).
    if(localChangesPending()){clearTimeout(ksmSaveTimer);setKsmSaveTimer(null);clearTimeout(ksmCloudTimer);setKsmCloudTimer(null);if(readOutbox())await flushCloudOutbox();if(localChangesPending())await saveTournamentToCloudWithReason('Before undo regenerate',true)}
    if(localChangesPending()){alert('This device has changes that are not saved yet. Wait until they are saved, then try again.');return}
    const id=cloudSession.tournamentId;
    let response,parsed=null;
    try{response=await fetch(`/api/tournaments/${encodeURIComponent(id)}/restore-point`,{method:'POST',headers:cloudHeaders(),body:JSON.stringify({revision:Number(cloudSession.revision||0),restorePointId:String(point.id||'')})})}
    catch(_){alert('Undo regenerate needs a connection. Nothing was changed.');return}
    try{parsed=await response.json()}catch(_){}
    if(id!==cloudSession.tournamentId)return;
    if(response.ok&&parsed?.payload){ksmApplyRestoredRecord(parsed);ksmRestorePoint=null;showKsmToast('✓ Regenerate undone',2600);return}
    if(response.status===409&&parsed?.code==='restore-point-changed'){alert('The regenerate to undo has changed: another regenerate was made after you pressed Undo regenerate. Nothing was changed. Check Undo regenerate again (Setup → Advanced → Danger zone).');return}
    if(response.status===409&&parsed?.record){applyRemoteCloudRecord(parsed.record,true,false);alert('Another device saved a change just now. Check the tournament, then press Undo regenerate again.');return}
    if(response.status===410&&parsed?.code==='tournament-deleted'){ksmAnnounceTournamentGone(id);return}
    if(['restore-point-expired','no-restore-point'].includes(parsed?.code)){ksmRestorePoint=null;alert(parsed.code==='restore-point-expired'?'The regenerate can no longer be undone: 24 hours have passed.':'There is no regenerate to undo (it may have been undone on another device).');return}
    alert(`Undo regenerate failed: ${parsed?.error||`HTTP ${response.status}`}. Nothing was changed.`);
  }finally{ksmRestorePointBusy=false;ksmRefreshRestorePoint()}
}
// The restored record replaces this device's tournament as a save would; court positions and current
// matches come from the restored copy (not a court's local division choice).
function ksmApplyRestoredRecord(record){
  clearLocalCourtDivisions();
  setKsmApplyingRemoteSnapshot(true);
  try{
    applyTournamentPayload(record.payload,false,{pinnedCourt:pinnedCourt(),preserveLocalDivision:false,source:'undo regenerate'});restorePinnedCourt();ksmStoreAutosave(record.payload);
    cloudSession.revision=Number(record.revision||0);cloudSession.updatedAt=record.updatedAt;persistCloudSession();rememberCloudBase(record);ksmCacheTournament(record);
    setKsmConfirmedMutationVersion(Math.max(ksmConfirmedMutationVersion,ksmLocalMutationVersion));setKsmLastSuccessfulSaveAt(Date.parse(record.updatedAt)||Date.now());setKsmSaveStatusMode('saved');renderPersistentSaveStatus();
  }finally{setKsmApplyingRemoteSnapshot(false)}
}
// A record whose Undo regenerate this device has not seen yet (record.restored, set by the server).
export function ksmRestoredSince(record,revision=cloudSession.revision){return Number(record?.restored?.revision||0)>Number(revision||0)}
// Work this device made before another device's Undo regenerate is not replayed onto the restored
// tournament (matched by identity it could land on the old results): it is kept in the recovery file
// (Setup -> Advanced -> Download Recovery File) and the restored copy is applied.
export function ksmDropWorkBeforeRestore(record,payload=tournamentPayload()){
  const outbox=readOutbox();
  ksmKeepWorkBeforeRestore(outbox||{tournamentId:cloudSession.tournamentId,baseRevision:cloudSession.revision||0,payload,queuedAt:new Date().toISOString()},record?.restored?.revision,record?.revision);
  clearOutbox();clearTimeout(ksmSaveTimer);setKsmSaveTimer(null);clearTimeout(ksmCloudTimer);setKsmCloudTimer(null);clearTimeout(ksmQueuedSaveRetryTimer);setKsmQueuedSaveRetryTimer(null);
  const pending=ksmCloudSavePending;setKsmCloudSavePending(null);pending?.resolvers.forEach(resolve=>resolve(false));setKsmConfirmedMutationVersion(Math.max(ksmConfirmedMutationVersion,ksmLocalMutationVersion));setKsmOutboxMutationVersion(0);
  ksmClearRestoreMark();
  writeCloudDiagnosticsState({stage:'Local changes replaced by Undo regenerate',serverRevision:Number(record?.revision||0)});
  showKsmToast('Undo regenerate on another device replaced this device’s unsaved changes (kept in the recovery file).',6000,true);
}
// The dropped work's own copy (one per drop, see ksmKeepRestoreRecovery): a later offline queue, which
// writes the single recovery slot, does not overwrite it.
export function ksmKeepWorkBeforeRestore(outbox,restoredRevision,serverRevision=restoredRevision){
  return ksmKeepRestoreRecovery(outbox?.tournamentId||cloudSession.tournamentId,restoredRevision,{savedAt:new Date().toISOString(),outbox,serverRevision:Number(serverRevision||0),restoredRevision:Number(restoredRevision||0),reason:'Replaced by Undo regenerate'});
}
// Queued work of a closed tab (or of this tab before a reload) made before an Undo regenerate that this
// tab's copy already shows: kept in the recovery file, not merged onto the restored tournament (F36 + #129).
export function ksmDropQueuedWorkBeforeRestore(outbox,restoredRevision){
  ksmKeepWorkBeforeRestore(outbox,restoredRevision,cloudSession.revision);
  writeCloudDiagnosticsState({stage:'Queued work replaced by Undo regenerate',serverRevision:Number(cloudSession.revision||0)});
  showKsmToast('Work queued on this device before Undo regenerate was not merged (kept in the recovery file).',6000,true);
}
// Load-time side effects (the listeners), run from app/js where this file was loaded.
export function initUndoRegenerate(){
window.addEventListener('ksm:regenerate-saved',()=>ksmRefreshRestorePoint());  // performCloudSave: the marked save landed
// A save (or queued save) of this device met another device's Undo regenerate (performCloudSave's 409):
// its work goes to the recovery file and the restored record is applied.
window.addEventListener('ksm:superseded-by-restore',event=>{const {record,payload}=/** @type {CustomEvent} */(event).detail||{};if(!record)return;ksmDropWorkBeforeRestore(record,payload);applyRemoteCloudRecord(record,true,true)});
window.addEventListener('online',()=>ksmRenderUndoRegenerate());
window.addEventListener('offline',()=>ksmRenderUndoRegenerate());
}
