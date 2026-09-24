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
function courtPinStorageKey(){const id=cloudSession?.tournamentId||new URLSearchParams(location.search).get('tournament')||'unassigned';const role=ksmSessionRole||new URLSearchParams(location.search).get('role')||'local';const view=isTvSession()?'tv':'court';return `${KSM_PINNED_COURT_PREFIX}:${id}:${role}:${view}`}
function pinnedCourt(){const session=sessionStorage.getItem(courtPinStorageKey());if(session)return normalizeCourt(session);const stored=localStorage.getItem(courtPinStorageKey());if(stored)return normalizeCourt(stored);const fromUrl=new URLSearchParams(location.search).get('court');if(fromUrl)return normalizeCourt(fromUrl);return cloudSession?.court?normalizeCourt(cloudSession.court):null}
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
function rebaseLocalPayloadOnRecord(localPayload,serverRecord,originalBaseRevision){
  const rebased=cloneJson(serverRecord.payload),court=pinnedCourt()||normalizeCourt(cloudSession.court||state.currentCourt);
  rebased.state=rebased.state||{};
  const localState=localPayload?.state||{};
  const actions=pendingLocalCourtActionsForRebase(localPayload,serverRecord,originalBaseRevision);
  actions.forEach(action=>(action.patches||[]).forEach(patch=>{const resolved=resolveRebasePatch(localState,rebased.state,patch);if(resolved)applyPatchToStateObject(rebased.state,resolved)}));
  sanitizeLoadedTournamentState(rebased.state,'concurrent rebase');
  normalizeAllIndividualPoolTiebreakOrder(rebased.state,'concurrent rebase');
  repairCompletedMatchResults(rebased.state,'concurrent rebase');
  // Court navigation is owner-scoped runtime state, not a tournament-wide view.
  // Preserve only this device's pinned court while retaining the other court from
  // the newest server record. Recompute the index against the rebased match list.
  preserveOwnedCourtRuntimeState(rebased.state,localState,court);
  rebased.state.courtActionHistory=rebased.state.courtActionHistory||{A:[],B:[]};
  rebased.state.courtRedoHistory=rebased.state.courtRedoHistory||{A:[],B:[]};
  rebased.state.courtActionHistory[court]=mergeHistoryEntries(rebased.state.courtActionHistory[court]||[],localState.courtActionHistory?.[court]||[]);
  rebased.state.courtRedoHistory[court]=mergeHistoryEntries(rebased.state.courtRedoHistory[court]||[],localState.courtRedoHistory?.[court]||[]);
  rebased.savedAt=new Date().toISOString();
  return rebased;
}
