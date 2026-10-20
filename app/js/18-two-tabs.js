/* ksm:post-split-begin two-tabs */
// F36 (#81): every tab of a browser shares localStorage, so the device's clientId, the outbox and
// the autosave were shared too. One tab's save cleared another tab's queued work, and one tab took
// another tab's live update for its own echo (same clientId): it kept its older copy at the new
// revision, so its next save went out without a conflict and overwrote the other tab's points.
//
// Each page load is one writer: KSM_TAB_ID (new on every load, so a duplicated tab or a reload never
// shares it). cloudSession.clientId stays the device's identity (presence, history); the tab is added
// where a writer has to be told apart:
// - saves send x-ksm-client-id = ksmWriterId() (clientId/tabId), which the server records as
//   updatedBy.clientId, so an echo is "own" only for the tab that saved it;
// - court history entries carry tabId; a rebase replays (and keeps as truth) only this tab's entries
//   (ksmOwnHistoryEntry). Entries without tabId (older versions, other devices) keep today's rule;
// - the outbox has one slot per tab (ksmOutboxKey()). A tab only writes and clears its own slot. A slot
//   whose tab is gone (closed, reloaded, crashed: no heartbeat) is an orphan; the next staff tab of
//   that tournament adopts it (ksmAdoptOrphanOutbox()), merges it into its copy and saves it. The old
//   single outbox key (written before this version) is an orphan from the start.
// The autosave (KSM_SAVE_KEY) stays one copy per browser, last writer wins: it is only a cache for
// startup, and every tab's unsaved work is kept in its own outbox slot until the server has it.
const KSM_TAB_ID=(()=>{try{return crypto.randomUUID()}catch(_){return Math.random().toString(36).slice(2)+Date.now().toString(36)}})();
const KSM_TAB_ALIVE_PREFIX='ksm.tab.alive.v1:';
// A hidden tab's timers can be slowed to once a minute; a tab is gone after three missed minutes.
const KSM_TAB_BEAT_MS=20000,KSM_TAB_GONE_MS=180000;
function ksmOutboxKey(tabId=KSM_TAB_ID){return tabId?KSM_CLOUD_OUTBOX_KEY+':'+tabId:KSM_CLOUD_OUTBOX_KEY}
function ksmWriterId(){return `${cloudSession.clientId||''}/${KSM_TAB_ID}`}
// This tab's entries, and this device's entries of a tab that is gone (an earlier load of this tab after a
// crash, whose cached copy still holds them; a closed tab's work): another live tab's entries are its own.
function ksmOwnHistoryEntry(entry){return Boolean(entry)&&entry.clientId===cloudSession.clientId&&(!entry.tabId||entry.tabId===KSM_TAB_ID||!ksmTabAlive(entry.tabId))}
/** The other court, when this tab has actions or Undo/Redo there that the server copy lacks (see rebaseLocalPayloadOnRecord()). */
function ksmOtherRebaseCourts(localPayload,serverRecord,originalBaseRevision,court){
  const other=normalizeCourt(court)==='A'?'B':'A';
  return pendingLocalCourtActionsForRebase(localPayload,serverRecord,originalBaseRevision,other).length||pendingLocalUndoLogForRebase(localPayload,serverRecord,originalBaseRevision,other).length?[other]:[];
}
let ksmTabHidden=false;
function ksmTabBeat(){if(ksmTabHidden)return;try{localStorage.setItem(KSM_TAB_ALIVE_PREFIX+KSM_TAB_ID,String(Date.now()))}catch(_){}}
function ksmTabAlive(tabId){if(tabId===KSM_TAB_ID)return true;const at=Number(localStorage.getItem(KSM_TAB_ALIVE_PREFIX+tabId)||0);return at>0&&Date.now()-at<KSM_TAB_GONE_MS}
function ksmReadOutboxKey(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}}
// readOutbox() runs often; a gone tab's slot (a whole tournament copy) is parsed once per content.
const ksmOrphanMeta=new Map();
/** Outbox slots of tabs that are gone (and the pre-F36 single outbox): {key, tabId, meta}, oldest first. */
function ksmOrphanOutboxes(){
  const slots=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    const tabId=key===KSM_CLOUD_OUTBOX_KEY?'':key?.startsWith(KSM_CLOUD_OUTBOX_KEY+':')?key.slice(KSM_CLOUD_OUTBOX_KEY.length+1):null;
    if(tabId===null||tabId===KSM_TAB_ID||(tabId&&ksmTabAlive(tabId)))continue;
    const raw=localStorage.getItem(key);
    let meta=ksmOrphanMeta.get(key);
    if(!meta||meta.raw!==raw){
      let entry=null;try{entry=JSON.parse(raw||'null')}catch(_){}
      meta=entry&&typeof entry==='object'?{raw,tournamentId:entry.tournamentId||'',role:entry.role,queuedAt:String(entry.queuedAt||'')}:{raw,invalid:true};
      ksmOrphanMeta.set(key,meta);
    }
    if(!meta.invalid)slots.push({key,tabId,meta});
  }
  return slots.sort((a,b)=>a.meta.queuedAt.localeCompare(b.meta.queuedAt));
}
/** An orphan this tab may take over: queued for the tournament it has open (or both have none). */
function ksmOrphanForThisTab(slot){return slot.meta.tournamentId===(cloudSession.tournamentId||'')}
/**
 * Moves the oldest orphan of this tab's tournament into this tab's (empty) slot, marked adoptedFrom
 * until it is merged into this tab's copy (mergeQueuedStaffWork()) or sent as it is. Its history entries
 * become this tab's, so a rebase replays them; their identity (clientId, time, court, label) is unchanged,
 * so one the server already has is never applied twice. Only staff tabs adopt: a spectator or TV tab
 * would keep the work and never send it.
 */
let ksmTabClosing=false;
window.addEventListener('beforeunload',()=>{ksmTabClosing=true;setTimeout(()=>{ksmTabClosing=false},1000)});
// localStorage has no compare-and-set across tabs: two live tabs could both take one orphan. A tab first
// claims it (KSM_OUTBOX_CLAIM_KEY), and takes it only if its claim is still the one stored a moment later.
const KSM_OUTBOX_CLAIM_KEY='ksm.cloud.outbox.claim.v1',KSM_OUTBOX_CLAIM_MS=250;
let ksmOutboxClaimTimer=null;
function ksmNewId(){try{return crypto.randomUUID()}catch(_){return Math.random().toString(36).slice(2)+Date.now().toString(36)}}
function ksmAdoptOrphanOutbox(){
  // Not during a Replace from a file (F37): it replaces that work.
  if(ksmSessionRole!=='staff'||ksmTabClosing||ksmOutboxClaimTimer||ksmFileReplace||localStorage.getItem(ksmOutboxKey()))return;
  const slot=ksmOrphanOutboxes().find(ksmOrphanForThisTab);
  if(!slot)return;
  const held=ksmReadOutboxKey(KSM_OUTBOX_CLAIM_KEY);
  if(held&&held.by!==KSM_TAB_ID&&Date.now()-Number(held.at||0)<KSM_OUTBOX_CLAIM_MS*8&&ksmTabAlive(held.by))return;
  const claim={by:KSM_TAB_ID,key:slot.key,at:Date.now(),id:ksmNewId()};
  localStorage.setItem(KSM_OUTBOX_CLAIM_KEY,JSON.stringify(claim));
  ksmOutboxClaimTimer=setTimeout(()=>{
    ksmOutboxClaimTimer=null;
    if(ksmReadOutboxKey(KSM_OUTBOX_CLAIM_KEY)?.id!==claim.id)return;
    localStorage.removeItem(KSM_OUTBOX_CLAIM_KEY);
    // Sent by the listener below (an event, so the outbox reads stay apart from the save code).
    if(ksmTakeOrphan(slot))window.dispatchEvent(new Event('ksm:outbox-adopted'));
  },KSM_OUTBOX_CLAIM_MS);
}
function ksmTakeOrphan(slot){
  const entry=ksmReadOutboxKey(slot.key);
  if(!entry||ksmSessionRole!=='staff'||ksmFileReplace||localStorage.getItem(ksmOutboxKey())||(entry.tournamentId||'')!==(cloudSession.tournamentId||''))return null;
  ksmRetagHistory(entry,KSM_TAB_ID);
  const adopted={...entry,writer:KSM_TAB_ID,adoptedFrom:slot.tabId};
  localStorage.setItem(ksmOutboxKey(),JSON.stringify(adopted));
  localStorage.removeItem(slot.key);
  return adopted;
}
/**
 * Startup, Staff Login and Save Now merge queued work at once (mergeQueuedStaffWork()): they take a gone
 * tab's work without waiting for a claim, unless another live tab has just claimed it.
 */
function ksmTakeOrphanNow(){
  if(ksmSessionRole!=='staff'||ksmFileReplace||localStorage.getItem(ksmOutboxKey()))return null;
  const slot=ksmOrphanOutboxes().find(ksmOrphanForThisTab);
  if(!slot)return null;
  const held=ksmReadOutboxKey(KSM_OUTBOX_CLAIM_KEY);
  if(held&&held.by!==KSM_TAB_ID&&held.key===slot.key&&Date.now()-Number(held.at||0)<KSM_OUTBOX_CLAIM_MS*8&&ksmTabAlive(held.by))return null;
  clearTimeout(ksmOutboxClaimTimer);ksmOutboxClaimTimer=null;
  if(held?.by===KSM_TAB_ID)localStorage.removeItem(KSM_OUTBOX_CLAIM_KEY);
  return ksmTakeOrphan(slot);
}
/**
 * The queued entry's own history entries (its writer's; before F36: this device's without tabId) become
 * `to`'s. Those made since its base revision (its unsaved work) are also stamped with the current
 * revision: this tab's later saves start from a newer base, and a rebase replays only entries made at
 * or after the save's base. Older entries keep their stamp (one the server has dropped from its last
 * 80 must not be replayed again).
 */
function ksmRetagHistory(outbox,to){
  const st=outbox?.payload?.state,from=outbox?.writer||'',base=Number(outbox?.baseRevision||0),now=Number(cloudSession.revision||0);
  if(!st)return;
  ['courtActionHistory','courtRedoHistory','courtUndoLog'].forEach(k=>Object.values(st[k]||{}).forEach(list=>(Array.isArray(list)?list:[]).forEach(e=>{
    if(!e||e.clientId!==cloudSession.clientId||(from?e.tabId!==from:Boolean(e.tabId)))return;
    e.tabId=to;
    if(Number(e.revision||0)>=base)e.revision=Math.max(Number(e.revision||0),now);
  })));
}
/**
 * A tab with no work of its own still shows a gone tab's queued work for its tournament (a staff tab
 * until it has taken it over). Marked `peeked`: it is not this tab's to send, merge or clear.
 */
function ksmPeekOrphanOutbox(){const slot=ksmOrphanOutboxes().find(ksmOrphanForThisTab);const entry=slot&&ksmReadOutboxKey(slot.key);return entry?{...entry,peeked:true}:null}
/**
 * An adopted orphan is merged into this tab's copy first (its court actions replayed, its other edits
 * merged against its own base), then saved like any change of this tab.
 */
let ksmSendingAdoptedOutbox=false;
async function ksmSendAdoptedOutbox(){
  const outbox=JSON.parse(localStorage.getItem(ksmOutboxKey())||'null');
  if(!outbox||outbox.adoptedFrom==null||ksmSendingAdoptedOutbox||isReadOnlySession()||!cloudSession.tournamentId)return false;
  // Not onto an empty screen: a failed startup without a cached copy has no tournament to merge into
  // (Retry loads it; the work stays queued meanwhile).
  if(ksmStartupLoadFailed&&!ksmStartupHasCache)return false;
  // Merged once this tab's own save has answered (its result replaces the state).
  if(ksmCloudSaveInFlight){setTimeout(ksmSendAdoptedOutbox,1000);return false}
  ksmSendingAdoptedOutbox=true;
  try{
    if(!mergeQueuedStaffWork())return false;
    noteLocalMutation();
    return await saveTournamentToCloudWithReason('Queued work from a closed tab',true);
  }finally{ksmSendingAdoptedOutbox=false}
}
/** A merged (or replaced) adopted entry is this tab's own from then on. */
function ksmMarkOutboxMerged(){const own=ksmReadOutboxKey(ksmOutboxKey());if(own?.adoptedFrom!=null){delete own.adoptedFrom;localStorage.setItem(ksmOutboxKey(),JSON.stringify(own))}}
/**
 * Before this tab's slot is overwritten or cleared while it holds adopted work not yet merged: give that
 * work back, as an orphan under a new key (never over a slot that may hold newer work).
 */
function ksmReleaseAdoptedOutbox(){
  const own=ksmReadOutboxKey(ksmOutboxKey());
  if(own?.adoptedFrom==null)return;
  const {adoptedFrom,...entry}=own;
  localStorage.setItem(ksmOutboxKey('released-'+ksmNewId()),JSON.stringify(entry));
  localStorage.removeItem(ksmOutboxKey());
}
/** Tournament deleted: this tab's slot and every gone tab's slot for it. */
function ksmDropOutboxesFor(id){
  if(!id)return;
  if(ksmReadOutboxKey(ksmOutboxKey())?.tournamentId===id)localStorage.removeItem(ksmOutboxKey());
  ksmOrphanOutboxes().filter(slot=>slot.meta.tournamentId===id).forEach(slot=>localStorage.removeItem(slot.key));
}
// F37: while a Replace from a file is unsettled, the tab keeps its queued work here instead of its slot.
// If the tab died meanwhile (no beforeunload: a crash), the work is released as a closed tab's.
const KSM_REPLACE_BACKUP_PREFIX='ksm.cloud.replace-backup.v1:';
function ksmReleaseReplaceBackups(){
  try{Object.keys(localStorage).forEach(key=>{
    if(!key.startsWith(KSM_REPLACE_BACKUP_PREFIX))return;
    const tabId=key.slice(KSM_REPLACE_BACKUP_PREFIX.length);
    if(ksmTabAlive(tabId))return;
    const raw=localStorage.getItem(key);
    if(raw)localStorage.setItem(ksmOutboxKey('released-'+ksmNewId()),raw);
    localStorage.removeItem(key);
  })}catch(_){}
}
setTimeout(ksmReleaseReplaceBackups,0);
window.addEventListener('ksm:outbox-adopted',()=>ksmSendAdoptedOutbox());
ksmTabBeat();
setInterval(()=>{
  ksmTabBeat();ksmReleaseReplaceBackups();
  // Work left by a tab that closed while this one stays open and idle.
  if(ksmSessionRole==='staff'&&navigator.onLine&&!ksmCloudSaveInFlight&&cloudSession.tournamentId&&readOutbox()?.adoptedFrom!=null)ksmSendAdoptedOutbox();
},KSM_TAB_BEAT_MS);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')ksmTabBeat()});
// Closed or reloaded: the next tab may take over this tab's queued work at once. (A closing page's
// last visibilitychange comes after pagehide: no heartbeat after it.)
window.addEventListener('pagehide',()=>{ksmTabHidden=true;try{localStorage.removeItem(KSM_TAB_ALIVE_PREFIX+KSM_TAB_ID)}catch(_){}});
window.addEventListener('pageshow',event=>{if(event.persisted){ksmTabHidden=false;ksmTabBeat()}});
// Heartbeats of tabs gone long ago (closed without pagehide) are dropped.
try{Object.keys(localStorage).forEach(key=>{if(key.startsWith(KSM_TAB_ALIVE_PREFIX)&&Date.now()-Number(localStorage.getItem(key)||0)>86400000)localStorage.removeItem(key)})}catch(_){}
/* ksm:post-split-end */
