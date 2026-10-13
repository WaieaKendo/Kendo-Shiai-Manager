// ---------- KSM v3.1 Save / Load ----------
const KSM_SAVE_KEY='ksm.local.autosave.v3_1';
const KSM_CLOUD_SESSION_KEY='ksm.cloud.session.v3_15';
const KSM_CLOUD_OUTBOX_KEY='ksm.cloud.outbox.v3_15';
const KSM_CLOUD_RECOVERY_KEY='ksm.cloud.recovery.v3_15';
const KSM_CLOUD_DIAGNOSTICS_KEY='ksm.cloud.diagnostics.v3_17_1';
let ksmSaveTimer=null;
let ksmCloudTimer=null;
let ksmCloudSocket=null;
let ksmCloudReconnectTimer=null;
let ksmTvInitialSyncTimer=null;
let ksmTvVerificationTimer=null;
let ksmTvRefreshInFlight=null;
let ksmTvLastVerifiedAt=0;
let ksmApplyingRemoteSnapshot=false;
let ksmCloudSaveInFlight=false;
let ksmCloudSavePending=null;
let ksmLastSuccessfulSaveAt=null;
let ksmSaveStatusMode='idle';
let ksmCloudAttemptCounter=0;
let ksmLocalMutationVersion=0;
let ksmConfirmedMutationVersion=0;
let ksmDeferredSyncRecord=null;
let ksmDeferredSyncTimer=null;
const KSM_PINNED_COURT_PREFIX='ksm.pinned.court.v3_17_11';
// Scorekeeper division selection is device-local. A remote Court B snapshot must not
// move Court A back to whichever division Court B last rendered. Keep one local
// preference per pinned court outside the serialized tournament state.
const ksmLocalCourtDivision={A:null,B:null};
const KSM_LOCAL_VIEW_STATE_KEYS=new Set(['currentCourt','publicCourt','currentDivision','matches','current','score']);
function normalizeCourt(value){return String(value||'').toUpperCase()==='B'?'B':'A'}
// Red/White sides are mirrored per court to match the scoring table's view (Setup → Referees).
function redOnLeftForCourt(court){return document.getElementById(normalizeCourt(court)==='B'?'court2RedSide':'court1RedSide')?.value==='left'}
function applyCourtSides(){document.body.classList.toggle('ksm-red-left',redOnLeftForCourt(state.currentCourt))}
function rememberLocalCourtDivision(court,division){const c=normalizeCourt(court);if(division&&typeof division==='string')ksmLocalCourtDivision[c]=division;return ksmLocalCourtDivision[c]}
function localCourtDivision(court){return ksmLocalCourtDivision[normalizeCourt(court)]||null}
function clearLocalCourtDivisions(){ksmLocalCourtDivision.A=null;ksmLocalCourtDivision.B=null}
/* ksm:post-split-begin court-pin */
// F3: the pin belongs to the device, not the session role: a scorekeeper reloads as a spectator
// until Staff Login and must come back on the same court. TV displays keep their own key.
function storedCourtPin(tournamentId){const key=courtPinStorageKey(tournamentId),value=sessionStorage.getItem(key)||localStorage.getItem(key);return value?normalizeCourt(value):null}
/* ksm:post-split-end */
function courtPinStorageKey(/* ksm:post-split-begin court-pin was: */tournamentId/* ksm:post-split-end */){/* ksm:post-split-begin court-pin was:const id=cloudSession?.tournamentId||new URLSearchParams(location.search).get('tournament')||'unassigned';const role=ksmSessionRole||new URLSearchParams(location.search).get('role')||'local';const view=isTvSession()?'tv':'court';return `${KSM_PINNED_COURT_PREFIX}:${id}:${role}:${view}` */const id=tournamentId||cloudSession?.tournamentId||ksmLinkParams().get('tournament')||'unassigned';const view=isTvSession()?'tv':'court';return `${KSM_PINNED_COURT_PREFIX}:${id}:${view}`/* ksm:post-split-end */}
function pinnedCourt(){/* ksm:post-split-begin court-pin was:const session=sessionStorage.getItem(courtPinStorageKey());if(session)return normalizeCourt(session);const stored=localStorage.getItem(courtPinStorageKey());if(stored)return normalizeCourt(stored);const fromUrl=new URLSearchParams(location.search).get('court');if(fromUrl)return normalizeCourt(fromUrl);return cloudSession?.court?normalizeCourt(cloudSession.court):null */const stored=storedCourtPin();if(stored)return stored;const fromUrl=ksmLinkParams().get('court');if(fromUrl)return normalizeCourt(fromUrl);return cloudSession?.court?normalizeCourt(cloudSession.court):null/* ksm:post-split-end */}
function pinCourtLocally(court){const normalized=normalizeCourt(court),key=courtPinStorageKey();sessionStorage.setItem(key,normalized);localStorage.setItem(key,normalized);cloudSession.court=normalized;persistCloudSession();return normalized}
function restorePinnedCourt(){const court=pinnedCourt();if(!court)return null;cloudSession.court=court;state.currentCourt=court;if(isTvSession())state.publicCourt=court;return court}
function noteLocalMutation(){ksmLocalMutationVersion+=1}
function localChangesPending(){return ksmLocalMutationVersion>ksmConfirmedMutationVersion||Boolean(ksmSaveTimer||ksmCloudTimer||ksmCloudSaveInFlight||ksmCloudSavePending||readOutbox())}
function deferRemoteRecord(record,reason='Local changes pending'){if(!record)return false;if(!ksmDeferredSyncRecord||Number(record.revision||0)>Number(ksmDeferredSyncRecord.revision||0))ksmDeferredSyncRecord=record;clearTimeout(ksmDeferredSyncTimer);ksmDeferredSyncTimer=setTimeout(applyDeferredSyncRecord,1800);writeCloudDiagnosticsState({stage:'Remote snapshot deferred',deferredRevision:Number(record.revision||0),deferredReason:reason,pinnedCourt:pinnedCourt()||''});return false}
function applyDeferredSyncRecord(){if(!ksmDeferredSyncRecord||localChangesPending())return false;const record=ksmDeferredSyncRecord;ksmDeferredSyncRecord=null;clearTimeout(ksmDeferredSyncTimer);ksmDeferredSyncTimer=null;return applyRemoteCloudRecord(record,true,false)}
function cloneJson(value){return JSON.parse(JSON.stringify(value))}
function isValidMatchObject(match){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.isValidMatchObject(match);
  /* ksm:post-split-end */
}
function legacyTiebreakSyncIdentity(match){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.legacyTiebreakSyncIdentity(match);
  /* ksm:post-split-end */
}
function matchSyncIdentity(match){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.matchSyncIdentity(match);
  /* ksm:post-split-end */
}
function matchHasSyncIdentity(match,identity){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.matchHasSyncIdentity(match,identity);
  /* ksm:post-split-end */
}
function matchBelongsToCourtInState(targetState,m,c){
  if(!m)return false;
  if(m.court)return m.court===c;
  const mode=targetState?.divisionCourts?.[m.division]||'A';
  return mode==='split'?c==='A':mode===c;
}
function nextReadyIndexInState(targetState,div,court){
  const arr=targetState?.allMatches?.[div]||[];
  const idx=arr.findIndex(m=>individualMatchReady(m)&&matchBelongsToCourtInState(targetState,m,court));
  return idx<0?arr.length:idx;
}
function preserveOwnedCourtRuntimeState(rebasedState,localState,court){
  const c=normalizeCourt(court);
  const localCs=localState?.courtState?.[c];
  const div=localCs?.division||localState?.courtActiveDivision?.[c]||(localState?.currentCourt===c?localState?.currentDivision:null);
  if(!div||!Array.isArray(rebasedState?.allMatches?.[div]))return false;
  const idx=nextReadyIndexInState(rebasedState,div,c);
  rebasedState.courtState=rebasedState.courtState||{};
  rebasedState.courtActiveDivision=rebasedState.courtActiveDivision||{};
  rebasedState.courtState[c]={division:div,index:idx};
  rebasedState.courtActiveDivision[c]=div;
  return true;
}
function applyPatchToStateObject(targetState,patch){
  const path=patch?.path||[];
  if(!path.length||KSM_LOCAL_VIEW_STATE_KEYS.has(path[0]))return false;
  let target=targetState;
  for(let i=0;i<path.length-1;i++){
    const key=path[i],next=path[i+1];
    if(Array.isArray(target)&&typeof key==='number'){
      // Never manufacture a sparse array during conflict replay. Sparse slots become
      // `null` after JSON serialization and can make a tournament unloadable.
      if(key<0||key>=target.length)return false;
      if(target[key]===undefined||target[key]===null)return false;
    }else if(target[key]===undefined||target[key]===null){
      target[key]=typeof next==='number'?[]:{};
    }
    target=target[key];
    if(target===undefined||target===null)return false;
  }
  const key=path[path.length-1],value=patch.after,missing=value&&value.__ksmMissing===true;
  if(Array.isArray(target)&&typeof key==='number'){
    if(key<0)return false;
    if(missing){if(key>=0&&key<target.length){target.splice(key,1);return true}return false}
    if(key>target.length)return false;
    if(key===target.length)target.push(cloneJson(value));else target[key]=cloneJson(value);
    return true;
  }
  if(missing)delete target[key];else target[key]=cloneJson(value);
  return true;
}
function resolveRebasePatch(localState,rebasedState,patch){
  const path=patch?.path||[];
  if(path[0]!=='allMatches'||typeof path[2]!=='number')return patch;
  const div=path[1],localArr=localState?.allMatches?.[div];
  let remoteArr=rebasedState?.allMatches?.[div];
  if(!Array.isArray(localArr)||!Array.isArray(remoteArr))return null;
  // v3.17.16 stamps the match identity when the action occurs. This remains
  // correct even if later sorting/tiebreak insertion changes numeric indexes.
  const identity=patch.matchIdentity||matchSyncIdentity(localArr[path[2]]);
  if(!identity)return null;
  const localMatch=localArr.find(match=>matchHasSyncIdentity(match,identity))||localArr[path[2]];
  if(!isValidMatchObject(localMatch))return null;
  let remoteIndex=remoteArr.findIndex(match=>matchHasSyncIdentity(match,identity));
  if(remoteIndex<0){
    // A local action may have created a new dynamic/tiebreak match after the remote
    // snapshot revision. Add the complete valid object without ever creating a sparse
    // array. Individual pool tiebreaks are then normalized back into their own pool's
    // timeline rather than being left at the end of the division after a conflict.
    remoteArr.push(cloneJson(localMatch));
    if(isIndividualPoolTiebreakMatch(localMatch)){
      normalizeIndividualPoolTiebreakOrderInState(rebasedState,div,'concurrent rebase insertion');
      remoteArr=rebasedState?.allMatches?.[div]||remoteArr;
    }
    remoteIndex=remoteArr.findIndex(match=>matchHasSyncIdentity(match,identity));
    if(remoteIndex<0)return null;
  }
  return {...patch,path:[path[0],div,remoteIndex,...path.slice(3)]};
}
function sanitizeLoadedTournamentState(targetState,source='load'){
  const all=targetState?.allMatches;
  if(!all||typeof all!=='object')return {repaired:0,divisions:[]};
  let repaired=0;const divisions=[];
  for(const [div,arr] of Object.entries(all)){
    if(!Array.isArray(arr))continue;
    const invalid=[];arr.forEach((m,i)=>{if(!isValidMatchObject(m))invalid.push(i)});
    if(!invalid.length)continue;
    const adjust=index=>{const n=Number(index);if(!Number.isFinite(n))return index;return Math.max(0,n-invalid.filter(i=>i<n).length)};
    all[div]=arr.filter(isValidMatchObject);
    if(targetState.currentByDivision&&targetState.currentByDivision[div]!=null)targetState.currentByDivision[div]=Math.min(adjust(targetState.currentByDivision[div]),all[div].length);
    for(const court of ['A','B'])if(targetState.courtState?.[court]?.division===div)targetState.courtState[court].index=Math.min(adjust(targetState.courtState[court].index),all[div].length);
    repaired+=invalid.length;divisions.push({division:div,removed:invalid.length,indexes:invalid});
  }
  if(repaired)console.warn(`[KSM State Integrity] Removed ${repaired} invalid match entr${repaired===1?'y':'ies'} from ${source}`,divisions);
  return {repaired,divisions};
}
function mergeHistoryEntries(remoteEntries=[],localEntries=[]){const map=new Map();[...remoteEntries,...localEntries].forEach(entry=>{if(!entry||entry.format!=='patch-v1')return;const key=[entry.clientId||'',entry.when||'',entry.court||'',entry.label||''].join('|');map.set(key,cloneJson(entry))});return [...map.values()].sort((a,b)=>String(a.when||'').localeCompare(String(b.when||''))).slice(-80)}
const KSM_CLOUD_REBASE_MAX_ATTEMPTS=4;
function historyEntryIdentity(entry){return [entry?.clientId||'',entry?.when||'',entry?.court||'',entry?.label||''].join('|')}
function pendingLocalCourtActionsForRebase(localPayload,serverRecord,originalBaseRevision){
  const court=pinnedCourt()||normalizeCourt(cloudSession.court||state.currentCourt);
  const localEntries=localPayload?.state?.courtActionHistory?.[court]||[];
  const remoteEntries=serverRecord?.payload?.state?.courtActionHistory?.[court]||[];
  const remoteKeys=new Set(remoteEntries.map(historyEntryIdentity));
  return localEntries.filter(action=>action?.format==='patch-v1'&&action.clientId===cloudSession.clientId&&Number(action.revision||0)>=Number(originalBaseRevision||0)&&!remoteKeys.has(historyEntryIdentity(action)));
}
/* ksm:post-split-begin history-replay */
// F30: this device's Undo/Redo since the save's base revision (10-, recordCourtUndoLog()) that the
// server copy does not have yet.
function undoLogEntryIdentity(entry){return [entry?.clientId||'',entry?.when||'',entry?.court||'',entry?.kind||'',entry?.target||''].join('|')}
function pendingLocalUndoLogForRebase(localPayload,serverRecord,originalBaseRevision,court){
  const local=localPayload?.state?.courtUndoLog?.[court]||[],remote=serverRecord?.payload?.state?.courtUndoLog?.[court]||[];
  const remoteKeys=new Set(remote.map(undoLogEntryIdentity));
  return local.filter(entry=>entry?.format==='history-op-v1'&&entry.clientId===cloudSession.clientId&&Number(entry.revision||0)>=Number(originalBaseRevision||0)&&!remoteKeys.has(undoLogEntryIdentity(entry)));
}
/**
 * Replays this device's pending court actions and Undo/Redo onto `rebasedState` (the server copy) in
 * the order they happened. An Undo applies its action's patches backwards only while the server copy
 * holds the action (in its Undo stack, or replayed here); a Redo applies them forwards only while
 * the server copy has it undone (in its Redo stack, or undone here). So an Undo of a point the server
 * never had (it was undone before it was saved) changes nothing, and nothing is applied twice.
 */
function replayPendingCourtHistory(actions,undoLog,localState,rebasedState,serverState,court){
  const applied=new Set((serverState?.courtActionHistory?.[court]||[]).map(historyEntryIdentity));
  const undone=new Set((serverState?.courtRedoHistory?.[court]||[]).map(historyEntryIdentity));
  const apply=patch=>{const resolved=resolveRebasePatch(localState,rebasedState,patch);if(resolved)applyPatchToStateObject(rebasedState,resolved)};
  const steps=[...actions.map(entry=>({entry,op:null})),...undoLog.map(entry=>({entry,op:entry.kind}))]
    .map((step,i)=>({...step,i})).sort((a,b)=>String(a.entry.when||'').localeCompare(String(b.entry.when||''))||a.i-b.i);
  steps.forEach(({entry,op})=>{
    const patches=entry.patches||[];
    // A division whose matches the action or the Undo/Redo inserted or removed is replayed by identity (entry.matchOps), not by its index patches.
    const matchOps=entry.matchOps&&typeof entry.matchOps==='object'?entry.matchOps:null;
    const byIndex=patch=>!(matchOps&&patch?.path?.[0]==='allMatches'&&Object.prototype.hasOwnProperty.call(matchOps,patch.path[1]));
    if(!op){patches.filter(byIndex).forEach(apply);if(matchOps)replayCourtMatchOps(rebasedState,matchOps);const id=historyEntryIdentity(entry);applied.add(id);undone.delete(id);return}
    if(op==='UNDO'&&applied.has(entry.target)){
      [...patches].reverse().filter(byIndex).forEach(patch=>apply({...patch,before:patch.after,after:patch.before}));
      if(matchOps)replayCourtMatchOps(rebasedState,matchOps);
      applied.delete(entry.target);undone.add(entry.target);
    }else if(op==='REDO'&&undone.has(entry.target)){
      patches.filter(byIndex).forEach(apply);
      if(matchOps)replayCourtMatchOps(rebasedState,matchOps);
      undone.delete(entry.target);applied.add(entry.target);
    }
  });
}
/**
 * Applies an Undo/Redo's match changes by identity (recordCourtUndoLog()'s matchOps, 10-) to the server copy, wherever its
 * matches are now (another device may have inserted or moved matches meanwhile): the removed matches are taken out, the
 * inserted ones put back after the match they followed (at the end when it is gone; never twice), the others' fields set.
 */
function replayCourtMatchOps(targetState,matchOps){
  Object.entries(matchOps||{}).forEach(([div,op])=>{
    const arr=targetState?.allMatches?.[div];
    if(!Array.isArray(arr)||!op)return;
    const indexOf=identity=>identity?arr.findIndex(match=>matchHasSyncIdentity(match,identity)):-1;
    (op.remove||[]).forEach(identity=>{const i=indexOf(identity);if(i>=0)arr.splice(i,1)});
    (op.insert||[]).forEach(({after,match})=>{
      if(!isValidMatchObject(match)||indexOf(matchSyncIdentity(match))>=0)return;
      const anchor=after?indexOf(after):-1;
      arr.splice(after?(anchor>=0?anchor+1:arr.length):0,0,cloneJson(match));
    });
    (op.patches||[]).forEach(patch=>{
      const i=indexOf(patch?.matchIdentity);
      if(i>=0)applyPatchToStateObject(targetState,{...patch,path:['allMatches',div,i,...(patch.path||[]).slice(3)]});
    });
  });
}
/**
 * The Undo/Redo stacks after a rebase: both devices' entries, but an action undone here stays undone (F30) and a redone one stays redone.
 * This device's stacks are the truth for its own entries: one of its entries that the server copy still lists but its own stacks
 * no longer hold was taken off here (undone, redone, or its Redo dropped by a new action), so it is not offered again. Only another
 * device's entries for this court (a replaced tablet) are added from the server copy.
 * The Undo stack is in the order the actions happened (merged by time). The Redo stack is in Undo order (the last undone on top),
 * not by action time (external PR #33 review: sorted by time, Redo after two Undos redid the earlier point first and lost one):
 * this device's Redo stack is kept as it is, in its order, with the other device's entries below it in the server's order, so a
 * Redo first redoes this device's latest Undo.
 */
function mergeCourtHistoryStacks(rebasedState,localState,court){
  const localDoneList=(localState.courtActionHistory?.[court]||[]).filter(e=>e?.format==='patch-v1');
  const localUndoneList=(localState.courtRedoHistory?.[court]||[]).filter(e=>e?.format==='patch-v1');
  const localDone=new Set(localDoneList.map(historyEntryIdentity)),localUndone=new Set(localUndoneList.map(historyEntryIdentity));
  const fromOtherDevice=e=>e?.format==='patch-v1'&&e.clientId!==cloudSession.clientId&&!localDone.has(historyEntryIdentity(e))&&!localUndone.has(historyEntryIdentity(e));
  rebasedState.courtActionHistory[court]=mergeHistoryEntries((rebasedState.courtActionHistory[court]||[]).filter(fromOtherDevice),localDoneList);
  const seen=new Set();
  rebasedState.courtRedoHistory[court]=[...(rebasedState.courtRedoHistory[court]||[]).filter(fromOtherDevice),...localUndoneList]
    .filter(e=>{const id=historyEntryIdentity(e);if(seen.has(id))return false;seen.add(id);return true}).map(cloneJson).slice(-80);
  const byKey=new Map();[...(rebasedState.courtUndoLog?.[court]||[]),...(localState.courtUndoLog?.[court]||[])].forEach(e=>{if(e?.format==='history-op-v1')byKey.set(undoLogEntryIdentity(e),e)});
  if(byKey.size){rebasedState.courtUndoLog=rebasedState.courtUndoLog||{A:[],B:[]};rebasedState.courtUndoLog[court]=[...byKey.values()].sort((a,b)=>String(a.when||'').localeCompare(String(b.when||''))).slice(-KSM_UNDO_LOG_LIMIT)}
}
/* ksm:post-split-end */
/* ksm:post-split-begin edit-merge */
// F4: director/staff edits that are not court actions (Setup fields, registration, divisions,
// awards) are merged three-way against the cloud copy the local edit started from, so a
// conflicting court save no longer drops them. Structural edits (generate, regenerate, pool
// edits) are replayed division by division instead (F10, replayStructuralEdit() below); the
// registration half of such an edit merges only when its structure was replayed.
const KSM_MERGED_STATE_KEYS=['divisions','divisionTypes','divisionCourts','competitors','teams','exhibitions','awards','teamAwardMode'];
const KSM_MERGE_LABELS={tName:'Tournament name',tHost:'Host',tDate:'Date',tLocation:'Location',tCourts:'Courts',tType:'Tournament type',teamEnabled:'Team tournament',teamFormat:'Team format',teamTournamentFormat:'Team tournament format',teamCourt:'Team court',teamAwardMode:'Team awards',exhibitionEnabled:'Exhibition matches',court1Refs:'Court A referees',court2Refs:'Court B referees',court1RedSide:'Court A red side',court2RedSide:'Court B red side',divisions:'Divisions',divisionTypes:'Division formats',divisionCourts:'Division courts',competitors:'Registration',teams:'Teams',exhibitions:'Exhibitions',awards:'Awards'};
/** The cloud copy the local state was last reconciled with (merge base), by revision. */
const KSM_CLOUD_BASE={revision:-1,payload:null};
function cloudBaseSubset(payload){
  if(!payload)return null;
  const st=payload.state||{};
  // F10: also each division's structure (pools, matches, brackets), to tell which divisions a
  // structural edit changed and whether the server copy changed them too.
  return {setup:cloneJson(payload.setup||{}),state:Object.fromEntries(KSM_MERGED_STATE_KEYS.concat(KSM_STRUCTURAL_DIVISION_KEYS).filter(k=>st[k]!==undefined).map(k=>[k,cloneJson(st[k])]).concat([['managementRevision',st.managementRevision||0]]))};
}
function rememberCloudBase(record){if(!record?.payload)return;KSM_CLOUD_BASE.revision=Number(record.revision||0);KSM_CLOUD_BASE.payload=cloudBaseSubset(record.payload)}
function cloudBaseFor(revision){return KSM_CLOUD_BASE.payload&&KSM_CLOUD_BASE.revision===Number(revision||0)?KSM_CLOUD_BASE.payload:null}
function sameJsonValue(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function isPlainJsonObject(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)}
function mergeValueThreeWay(server,local,base,label,conflicts){
  if(sameJsonValue(local,base)||sameJsonValue(local,server))return server;
  if(sameJsonValue(server,base))return local===undefined?undefined:cloneJson(local);
  if(isPlainJsonObject(server)&&isPlainJsonObject(local)&&isPlainJsonObject(base)){
    const out={...server};
    new Set([...Object.keys(server),...Object.keys(local)]).forEach(k=>{const v=mergeValueThreeWay(server[k],local[k],base[k],label,conflicts);if(v===undefined)delete out[k];else out[k]=v});
    return out;
  }
  if(!conflicts.includes(label))conflicts.push(label);
  return server;
}
/**
 * Merge local non-court edits (vs basePayload) into `rebased` (a copy of the server payload); returns the conflicting field labels.
 * structuralReplayed: the divisions a local structural edit replayed onto `rebased` (F10), so its registration half merges too (split by division, F32).
 */
function mergeLocalEditsThreeWay(rebased,localPayload,basePayload,structuralReplayed=false){
  const conflicts=[];
  if(!basePayload||!localPayload)return conflicts;
  const serverSetup=rebased.setup||{},localSetup=localPayload.setup||{},baseSetup=basePayload.setup||{};
  const setup={...serverSetup};
  Object.keys(localSetup).forEach(k=>{const v=mergeValueThreeWay(serverSetup[k],localSetup[k],baseSetup[k],KSM_MERGE_LABELS[k]||k,conflicts);if(v!==undefined)setup[k]=v});
  rebased.setup=setup;
  const localState=localPayload.state||{},baseState=basePayload.state||{};
  // A local structural edit changes matches/pools too; merging only its registration half would
  // split it, so that half merges only when the structure was replayed (F10).
  if(structuralReplayed||(localState.managementRevision||0)===(baseState.managementRevision||0)){
    rebased.state=rebased.state||{};
    KSM_MERGED_STATE_KEYS.forEach(k=>{const v=/* F32 */Array.isArray(structuralReplayed)&&registrationListSplits(rebased.state[k],localState[k],baseState[k],k,structuralReplayed)?mergeRegistrationListSplit(rebased.state[k],localState[k],baseState[k],structuralReplayed,KSM_MERGE_LABELS[k]||k,conflicts,k):mergeValueThreeWay(rebased.state[k],localState[k],baseState[k],KSM_MERGE_LABELS[k]||k,conflicts);if(v===undefined)delete rebased.state[k];else rebased.state[k]=v});
  }
  return conflicts;
}
// F32: a replayed division's registration entries (players, teams) belong to its structure: when
// both devices changed the list, the replayed divisions' entries are this device's (the matches
// were built from them) and only the other divisions' entries merge three-way (server kept on a
// conflict, with the notice); replayStructuralEdit() asks first when the other device changed a
// replayed division's entries. Never a structure without the registration it was built from.
const KSM_REGISTRATION_LIST_KEYS=['competitors','teams'];
// Every team belongs to the team event, as the engine treats them (eligibleTeams(state.teams)): sample
// and older teams have no division field, so a team's division is always 'Team Tournament'.
function registrationEntryDivision(e,key){return key==='teams'?'Team Tournament':e?.division}
function registrationEntriesIn(list,divisions,inside=true,key='competitors'){return (Array.isArray(list)?list:[]).filter(e=>divisions.includes(registrationEntryDivision(e,key))===inside)}
/** True when list key `k` changed on both sides (a whole-list conflict) and divisions were replayed: it is merged split by division. */
function registrationListSplits(server,local,base,k,divisions){
  return KSM_REGISTRATION_LIST_KEYS.includes(k)&&divisions.length>0&&!sameJsonValue(local,base)&&!sameJsonValue(local,server)&&!sameJsonValue(server,base);
}
/** Replayed divisions whose entries the other device changed in a list that conflicts as a whole (the question's registration half). */
function registrationConflictDivisions(serverState,localState,baseState,divisions){
  const out=new Set();
  KSM_REGISTRATION_LIST_KEYS.forEach(k=>{
    if(!registrationListSplits(serverState?.[k],localState?.[k],baseState?.[k],k,divisions))return;
    divisions.forEach(d=>{if(!sameJsonValue(registrationEntriesIn(serverState?.[k],[d],true,k),registrationEntriesIn(baseState?.[k],[d],true,k)))out.add(d)});
  });
  return [...out];
}
function mergeRegistrationListSplit(server,local,base,divisions,label,conflicts,key='competitors'){
  const outside=mergeValueThreeWay(registrationEntriesIn(server,divisions,false,key),registrationEntriesIn(local,divisions,false,key),registrationEntriesIn(base,divisions,false,key),label,conflicts)||[];
  const inside=cloneJson(registrationEntriesIn(local,divisions,true,key));
  // In the server list's order: the replayed divisions' entries where its first one was (else at the end).
  const at=(Array.isArray(server)?server:[]).findIndex(e=>divisions.includes(registrationEntryDivision(e,key)));
  const before=at<0?outside.length:Math.min(at,outside.length);
  return outside.slice(0,before).concat(inside,outside.slice(before));
}
function noteMergeConflicts(conflicts){
  if(!conflicts.length)return;
  const message=`Changed on another device at the same time, their version was kept: ${conflicts.join(', ')}`;
  writeCloudDiagnosticsState({stage:'Edit conflict: server version kept',mergeConflicts:conflicts});
  showKsmToast(message,10000,true);
}
/* ksm:post-split-end */
/* ksm:post-split-begin structural-replay */
// F10: a structural director edit (Generate/Regenerate Tournament, Regenerate Single Division,
// Edit Pool's Save Pool Changes, a no-show that rebuilds a division) raises managementRevision and
// replaces divisions' pools and matches. On a save conflict (409 rebase) it is replayed onto the
// server copy: every division whose structure this device changed since the merge base is copied
// over whole, when the server's copy of it still equals the base (no other device played in it
// or changed it meanwhile). Otherwise the director is asked: re-apply the change (it replaces the
// other device's version of those divisions, their new results included) or keep the other
// device's version (the change is dropped, with a notice). Never silently. Limits: whole
// divisions, not operations (the operation-based sync is issues #15/#16); without a merge base
// that holds the structure (an outbox queued by an older version) the server copy is kept, as
// before, with a notice.
const KSM_STRUCTURAL_DIVISION_KEYS=['pools','teamPools','allMatches','teamBracketNodes','singleElimNodes','singleElimComps','teamElimTeams','brackets','championshipNodes','byeWinners'];
function structuralDivisionNames(...states){const names=new Set();states.forEach(st=>KSM_STRUCTURAL_DIVISION_KEYS.forEach(k=>Object.keys(st?.[k]||{}).forEach(d=>names.add(d))));return [...names]}
function structuralDivisionSnapshot(st,div){return KSM_STRUCTURAL_DIVISION_KEYS.map(k=>st?.[k]?.[div]??null)}
function copyStructuralDivision(target,source,div){
  KSM_STRUCTURAL_DIVISION_KEYS.concat(['currentByDivision']).forEach(k=>{
    const value=source?.[k]?.[div];
    if(value===undefined){if(target[k])delete target[k][div];return}
    target[k]=target[k]||{};target[k][div]=cloneJson(value);
  });
}
function playedMatchCount(st,div){return (st?.allMatches?.[div]||[]).filter(m=>m&&m.done).length}
function noteStructuralEditDropped(divisions){
  writeCloudDiagnosticsState({stage:'Structural edit conflict: server version kept',structuralConflict:divisions});
  showKsmToast(divisions.length
    ?`Your change to ${divisions.join(', ')} was not saved: another device changed it at the same time, their version was kept.`
    :'Your change to the pools and matches was not saved: it could not be combined with another device\'s save, their version was kept.',10000,true);
}
/** Replays this device's structural edit (vs basePayload) onto `rebased`; the replayed division names when applied (F32), else false. */
function replayStructuralEdit(rebased,localPayload,basePayload,serverPayload){
  const localState=localPayload?.state,baseState=basePayload?.state,serverState=serverPayload?.state||{};
  if(!localState||!baseState)return false;
  const localRev=Number(localState.managementRevision||0),baseRev=Number(baseState.managementRevision||0);
  if(localRev===baseRev)return false;
  if(baseState.allMatches===undefined){noteStructuralEditDropped([]);return false}
  const changed=structuralDivisionNames(localState,baseState).filter(d=>!sameJsonValue(structuralDivisionSnapshot(localState,d),structuralDivisionSnapshot(baseState,d)));
  const structuralConflicts=changed.filter(d=>!sameJsonValue(structuralDivisionSnapshot(serverState,d),structuralDivisionSnapshot(baseState,d)));
  // F32: the other device also changed the registration entries of a division this edit rebuilt.
  const conflicting=structuralConflicts.concat(registrationConflictDivisions(serverState,localState,baseState,changed).filter(d=>!structuralConflicts.includes(d)));
  if(conflicting.length){
    const names=conflicting.join(', '),played=conflicting.reduce((n,d)=>n+Math.max(0,playedMatchCount(serverState,d)-playedMatchCount(baseState,d)),0);
    const results=played?` and recorded ${played} match result${played===1?'':'s'}`:'';
    if(!confirm(`Re-apply your change to ${names}?\n\nAnother device changed ${names} at the same time${results}.\n\nOK: re-apply your change. It replaces the other device's version of ${names}${played?' (those results are deleted)':''}.\nCancel: keep the other device's version. Your change is not saved.`)){
      noteStructuralEditDropped(changed);
      return false;
    }
  }
  rebased.state=rebased.state||{};
  changed.forEach(d=>copyStructuralDivision(rebased.state,localState,d));
  if(localState.generated)rebased.state.generated=true;
  rebased.state.managementRevision=Math.max(Number(serverState.managementRevision||0),baseRev)+Math.max(1,localRev-baseRev);
  // Court pointers into a replayed (or removed) division are re-resolved, as the edit does.
  rebased.state.courtState=rebased.state.courtState||{};rebased.state.courtActiveDivision=rebased.state.courtActiveDivision||{};
  ['A','B'].forEach(c=>{
    const div=rebased.state.courtState[c]?.division;
    if(div&&!changed.includes(div))return;
    const target=div&&Array.isArray(rebased.state.allMatches?.[div])?div:localState.courtState?.[c]?.division;
    if(!target||!Array.isArray(rebased.state.allMatches?.[target]))return;
    rebased.state.courtState[c]={division:target,index:nextReadyIndexInState(rebased.state,target,c)};
    rebased.state.courtActiveDivision[c]=target;
  });
  writeCloudDiagnosticsState({stage:conflicting.length?'Structural edit re-applied over a conflict':'Structural edit replayed',structuralReplay:changed});
  return changed; // F32: the replayed divisions (truthy), for the registration merge
}
/* ksm:post-split-end */
function rebaseLocalPayloadOnRecord(localPayload,serverRecord,originalBaseRevision/* ksm:post-split-begin edit-merge */,basePayload=null/* ksm:post-split-end */){
  const rebased=cloneJson(serverRecord.payload),court=pinnedCourt()||normalizeCourt(cloudSession.court||state.currentCourt);
  rebased.state=rebased.state||{};
  const localState=localPayload?.state||{};
  const actions=pendingLocalCourtActionsForRebase(localPayload,serverRecord,originalBaseRevision);
  /* ksm:post-split-begin history-replay was:actions.forEach(action=>(action.patches||[]).forEach(patch=>{const resolved=resolveRebasePatch(localState,rebased.state,patch);if(resolved)applyPatchToStateObject(rebased.state,resolved)})); */replayPendingCourtHistory(actions,pendingLocalUndoLogForRebase(localPayload,serverRecord,originalBaseRevision,court),localState,rebased.state,serverRecord.payload?.state,court);/* ksm:post-split-end */
  sanitizeLoadedTournamentState(rebased.state,'concurrent rebase');
  normalizeAllIndividualPoolTiebreakOrder(rebased.state,'concurrent rebase');
  repairCompletedMatchResults(rebased.state,'concurrent rebase');
  // Court navigation is owner-scoped runtime state, not a tournament-wide view.
  // Preserve only this device's pinned court while retaining the other court from
  // the newest server record. Recompute the index against the rebased match list.
  preserveOwnedCourtRuntimeState(rebased.state,localState,court);
  rebased.state.courtActionHistory=rebased.state.courtActionHistory||{A:[],B:[]};
  rebased.state.courtRedoHistory=rebased.state.courtRedoHistory||{A:[],B:[]};
  /* ksm:post-split-begin history-replay was:rebased.state.courtActionHistory[court]=mergeHistoryEntries(rebased.state.courtActionHistory[court]||[],localState.courtActionHistory?.[court]||[]);rebased.state.courtRedoHistory[court]=mergeHistoryEntries(rebased.state.courtRedoHistory[court]||[],localState.courtRedoHistory?.[court]||[]); */mergeCourtHistoryStacks(rebased.state,localState,court);/* ksm:post-split-end */
  /* ksm:post-split-begin edit-merge */noteMergeConflicts(mergeLocalEditsThreeWay(rebased,localPayload,basePayload,replayStructuralEdit(rebased,localPayload,basePayload,serverRecord.payload)));/* ksm:post-split-end */
  rebased.savedAt=new Date().toISOString();
  return rebased;
}
