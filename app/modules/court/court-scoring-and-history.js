// @ts-check
import {ksmEmptyScore,ksmSetScore,state,stateFieldIsDerived,storeFieldPath} from '../app-state.js';
import {maybeCreateKachinukiNext,renderAll} from './court-context-and-pool-editing.js';
import {applyCourtState,findNextForCourt,syncOwnCourtPointer} from './court-match-order.js';
import {KSM_UNDO_LOG_LIMIT,ksmMoveCourtHistory,ksmRecordCourtAction,ksmSetCourtHistories} from './court-history-store.js';
import {ksmPlanMatchPaths,ksmUpdateMatch,ksmWriteMatchPath} from './match-writes.js';
import {getState,holdNotifications} from '../../store/index.ts';
import {selectAllMatches,selectCourtActionHistory,selectCourtRedoHistory,selectCourtState,selectCurrentCourt,selectCurrentDivision,selectCurrentIndex,selectMatches,selectScore,selectTournamentField} from '../selectors.js';
import {renderScore} from './scorekeeper-screen.js';
import {enforceUniqueIndividualMatches,maybeAdvanceChampionship,maybeCreateChampionship} from '../engine/engine-championship.js';
import {renderPools} from '../engine/engine-generation.js';
import {completedResultSnapshot} from '../engine/engine-result-integrity.js';
import {maybeAdvanceIndividualSingleElim} from '../engine/engine-single-elim.js';
import {maybeCreateTeamTiebreak,maybeCreateTiebreaks} from '../engine/engine-standings-and-tiebreaks.js';
import {maybeAdvanceTeamBracket} from '../engine/engine-team-bracket.js';
import {criticalAutoSave} from '../sync/cloud-session-and-autosave.js';
import {renderProgress} from '../navigation.js';
import {ksmSignalCourtActions} from '../react-bridges/court.js';
import {renderPublic} from '../results/live-scores.js';
import {showKsmToast} from '../sync/cloud-realtime-save-and-load.js';
import {cloudSession,updateSaveStatus} from '../sync/cloud-session-and-autosave.js';
import {KSM_LOCAL_VIEW_STATE_KEYS,cloneJson,courtMatchOpsWrites,historyEntryIdentity,matchHasSyncIdentity,matchSyncIdentity} from '../sync/sync-state-and-rebase.js';
import {KSM_TAB_ID} from '../sync/two-tabs.js';
import * as KSMEngine from '../../engine/index.ts';
export function loadScoreFromMatch(m){
  if(!m || m.done){ksmSetScore(ksmEmptyScore());return;}
  ksmSetScore({W:[...(m.wp||[])],R:[...(m.rp||[])],WT:m.wt||0,RT:m.rt||0});
}
// A point's four fields in one write (#15 PR 13c-1: app/modules/court/match-writes.js); state.matches is
// allMatches[currentDivision], so the shown bout is that division's entry at state.current.
function syncActiveScoreToMatch(){
  let m=selectMatches(getState())?.[selectCurrentIndex(getState())];
  if(!m || m.done)return;
  ksmUpdateMatch(/** @type {string} */(selectCurrentDivision(getState())),selectCurrentIndex(getState()),{wp:[...(selectScore(getState())?.W||[])],rp:[...(selectScore(getState())?.R||[])],wt:selectScore(getState())?.WT||0,rt:selectScore(getState())?.RT||0});
}

// ---------- KSM v3.17.8-test Compact action-patch court Undo / Redo ----------
// The history is store data since #15 PR 13b (app/modules/court/court-history-store.js): each court's Undo and Redo lists
// hold at most KSM_HISTORY_LIMIT entries, the Undo log KSM_UNDO_LOG_LIMIT (court-history-store.js).
const KSM_HISTORY_KEYS=new Set(['courtActionHistory','courtRedoHistory','courtUndoLog']);
const KSM_HISTORY_MISSING={__ksmMissing:true};
/**
 * Both courts' Undo and Redo lists exist and hold only `patch-v1` entries: one court/historyNormalized with the maps that
 * were not so (a load of an old save), none when both are (every other call: the render runs it).
 */
export function ensureCourtHistory(){
  /** @type {any} */ const out={};
  for(const key of ['courtActionHistory','courtRedoHistory']){
    const map=/** @type {any} */ (selectTournamentField(getState(),/** @type {any} */ (key)));let changed=!map;const next={...(map||{A:[],B:[]})};
    for(const c of ['A','B']){
      const list=Array.isArray(next[c])?next[c]:(changed=true,[]);
      // Legacy snapshot entries are intentionally discarded because they can exceed storage limits.
      const kept=list.filter(action=>action?.format==='patch-v1');
      if(kept.length!==list.length)changed=true;
      next[c]=kept.length===list.length?list:kept;
    }
    if(changed)out[key]=next;
  }
  ksmSetCourtHistories('historyNormalized',out);
}
function cloneHistoryValue(value){return value===undefined?{...KSM_HISTORY_MISSING}:JSON.parse(JSON.stringify(value))}
// A key whose value is undefined is left out, as an absent key was before its group moved into the store (a moved key is a
// getter that is always a key of `state`): comparing two "missing" markers made a no-op patch for it in every court action.
function historyComparableState(){const out={};historyKeyOrder(Object.keys(state)).forEach(k=>{if(!KSM_HISTORY_KEYS.has(k)&&state[k]!==undefined)out[k]=cloneHistoryValue(state[k])});return out}
/**
 * `state`'s keys in the order they had while `allMatches` was a plain key (#15 PR 13c-2), so a court action's patches keep
 * their order in its saved entry. A load (ksmLoadTournamentState()) deletes the plain keys and adds them back after the store
 * getters, in the payload's order, where `allMatches` came right before `history` and `contextMode`; as a getter it keeps
 * its place in the literal. So once the plain keys are behind it (a load happened), it moves back among them.
 * @param {string[]} keys
 */
export function historyKeyOrder(keys){
  const at=keys.indexOf('allMatches'),plain=keys.filter(k=>!storeFieldPath(k,state)&&!stateFieldIsDerived(k,state));
  if(at<0||!plain.length||plain.some(k=>keys.indexOf(k)<at))return keys;
  const rest=keys.filter(k=>k!=='allMatches'),before=rest.findIndex(k=>k==='history'||k==='contextMode');
  rest.splice(before<0?rest.length:before,0,'allMatches');
  return rest;
}
function historyValuesEqual(a,b){return KSMEngine.historyValuesEqual(a,b);// moved to app/engine/sync-helpers.ts
  }
function buildHistoryPatches(before,after,path=[],patches=[]){
  if(historyValuesEqual(before,after))return patches;
  const beforeMissing=before&&before.__ksmMissing===true;
  const afterMissing=after&&after.__ksmMissing===true;
  if(beforeMissing||afterMissing){patches.push({path:[...path],before:cloneHistoryValue(before),after:cloneHistoryValue(after)});return patches}
  const beforeArray=Array.isArray(before),afterArray=Array.isArray(after);
  const beforeObject=before!==null&&typeof before==='object',afterObject=after!==null&&typeof after==='object';
  if(beforeArray&&afterArray){
    const length=Math.max(before.length,after.length);
    for(let i=0;i<length;i++)buildHistoryPatches(i<before.length?before[i]:KSM_HISTORY_MISSING,i<after.length?after[i]:KSM_HISTORY_MISSING,[...path,i],patches);
    return patches;
  }
  if(beforeObject&&afterObject&&!beforeArray&&!afterArray){
    const keys=new Set([...Object.keys(before),...Object.keys(after)]);
    keys.forEach(key=>buildHistoryPatches(Object.prototype.hasOwnProperty.call(before,key)?before[key]:KSM_HISTORY_MISSING,Object.prototype.hasOwnProperty.call(after,key)?after[key]:KSM_HISTORY_MISSING,[...path,key],patches));
    return patches;
  }
  patches.push({path:[...path],before:cloneHistoryValue(before),after:cloneHistoryValue(after)});
  return patches;
}
function currentHistoryCourt(){const c=String(selectCurrentCourt(getState())||cloudSession?.court||'A').toUpperCase();return c==='B'?'B':'A'}
function stampHistoryPatchMatchIdentity(patch,before,after){return KSMEngine.stampHistoryPatchMatchIdentity(patch,before,after);// moved to app/engine/sync-helpers.ts
  }
/**
 * A court action (a point, a hansoku, Next Match, a representative, …): `fn` runs between two copies of the state, and the
 * difference is recorded as the court's `patch-v1` entry. Its dispatches (the pad, the bout, the bracket nodes, the
 * pointer, the entry: #15 PR 13c-2) notify the store's subscribers once, at its end (holdNotifications()), so no
 * subscriber sees a bout finished whose node has not got its winner yet (the sync writes the bouts, then the nodes).
 */
export function performCourtAction(label,fn){return holdNotifications(()=>{
  // A division picked before Staff Login reaches the court's pointer with this action's save (not its Undo entry).
  syncOwnCourtPointer();
  ensureCourtHistory();const court=currentHistoryCourt(),before=historyComparableState();
  const result=fn();const after=historyComparableState(),patches=buildHistoryPatches(before,after).map(patch=>stampHistoryPatchMatchIdentity(patch,before,after));
  // The entry is built whole, then recorded with the Redo list cleared, in one court/actionRecorded (#15 PR 13b).
  if(patches.length)ksmRecordCourtAction(court,withCourtHistoryIdentity({format:'patch-v1',label:label||'Action',court,when:new Date().toISOString(),clientId:cloudSession?.clientId||'',tabId:KSM_TAB_ID,revision:cloudSession?.revision||0,patches},before,after));
  updateUndoButton();return result;
})}
function historyPathParent(path,root=state){
  let target=root;
  for(let i=0;i<path.length-1;i++){
    const key=path[i],next=path[i+1];
    // (Under `state` only a plain key comes here: applyHistoryPatch() writes a store-owned key into its own copy.)
    if(target[key]===undefined||target[key]===null)target[key]=typeof next==='number'?[]:{};
    target=target[key];
  }
  return {target,key:path[path.length-1]};
}
/**
 * Writes one patch-v1 patch's `direction` value ('before' for an Undo, 'after' for a Redo) into `state`.
 * #15 PR 3 (docs/STORE.md section 2 point 6): Undo/Redo write tournament data only.
 *   - A patch on a device key (KSM_LOCAL_VIEW_STATE_KEYS, the set the rebase skips: currentCourt, publicCourt,
 *     currentDivision, matches, current, score) is skipped. New entries and entries saved by 4.0 still carry them
 *     (historyComparableState() records every key, so the saved format is unchanged). Nothing is lost:
 *     applyHistoryValues() rebuilds the court view after the entry with applyCourtState(), which sets currentDivision,
 *     matches and current from courtState and reloads score from the match (as it already overwrote them before);
 *     `matches` is the alias of allMatches.<currentDivision>, so its patches repeat the same entry's allMatches patches.
 *   - A patch on a key moveToStore() owns is not written into `state` (its non-configurable getter throws on a
 *     `delete state[key]` / an assignment, and the store's value is frozen data): a top-level one sets the key's new value
 *     (undefined for a missing one), a deeper one (#15 PR 9: e.g. ['divisionCourts', d], recorded when a court action's
 *     render gave a division its default court) is written into a copy of the key. Same values as the old in-place writes.
 *     The new values are collected in ksmHistoryStoreValues and go to the store in the entry's one court/undo or
 *     court/redo (#15 PR 13b), with the entry's bouts (allMatches, PR 13c-2). A patch is only applied inside an entry
 *     (applyHistoryValues()); since #15 item 14a a store-owned patch outside one throws (it had a fallback write, never reached).
 */
function applyHistoryPatch(patch,direction){
  const value=patch?.[direction],path=patch?.path||[];
  if(!path.length||KSM_LOCAL_VIEW_STATE_KEYS.has(path[0]))return;
  const missing=value&&value.__ksmMissing===true,key=String(path[0]);
  // `allMatches` through its one write module (#15 PR 13c-1), with writeHistoryValue()'s rules. (An Undo/Redo entry's bout
  // patches never come here: applyCourtHistoryEntry() batches them into the entry's court/undo or court/redo.)
  if(key==='allMatches'){ksmWriteMatchPath(path,missing?undefined:JSON.parse(JSON.stringify(value)),missing,'history');return}
  if(!storeFieldPath(key,state)){writeHistoryValue(state,path,value,missing);return}
  const values=historyStoreValues();
  if(path.length===1)values[key]=missing?undefined:JSON.parse(JSON.stringify(value));
  else{
    // The key's copy: the one an earlier patch of this entry made, else the store's value.
    const owned={[key]:Object.hasOwn(values,key)?values[key]:JSON.parse(JSON.stringify(state[key]??null))};
    writeHistoryValue(owned,path,value,missing);
    values[key]=owned[key];
  }
}
/** Writes a patch's value (or removes it, `missing`) at `path` under `root`, creating missing parents. */
function writeHistoryValue(root,path,value,missing){
  const {target,key}=historyPathParent(path,root);
  if(Array.isArray(target)&&typeof key==='number'){
    if(missing){if(key>=0&&key<target.length)target.splice(key,1)}
    else if(key>=target.length)target.splice(key,0,JSON.parse(JSON.stringify(value)));
    else target[key]=JSON.parse(JSON.stringify(value));
  }else if(missing)delete target[key];
  else target[key]=JSON.parse(JSON.stringify(value));
}
/** The store-owned keys an Undo/Redo entry's patches change, while it is applied: key → its new value (#15 PR 13b). */
/** @type {Record<string,unknown>|null} */ let ksmHistoryStoreValues=null;
/** The entry's store values being collected; a store write outside an Undo/Redo entry is a bug (no action carries it). */
function historyStoreValues(){if(!ksmHistoryStoreValues)throw new Error('A court history patch on store data outside an Undo/Redo entry');return ksmHistoryStoreValues}
/**
 * Applies `action`'s patches for an Undo ('before') or a Redo ('after'): the new values of every store-owned key they
 * change are returned (dispatched by the caller with the history move), `allMatches` among them since #15 PR 13c-2 (the
 * bouts as the entry's one batch leaves them). Null for an entry without patches (nothing applied, no court view to
 * rebuild).
 * @returns {Record<string,unknown>|null}
 */
function applyHistoryValues(action,direction){
  if(!(action?.format==='patch-v1'&&Array.isArray(action.patches)))return null;
  ksmHistoryStoreValues={};
  // A throw anywhere in it (before the bouts' batch, inside it, or after it with the index fields) makes no store write:
  // every store value, the bouts' too, goes to the store only in the caller's court/undo or court/redo, so the entry stays
  // on its list as it was (docs/STORE.md section 3 item 13; #206 re-review L-a). Patches on the plain (dead) keys made
  // before the throw stay written in place (writeHistoryValue()), as before.
  try{ksmLastHistoryOutcome=applyCourtHistoryEntry(action,direction);return ksmHistoryStoreValues}finally{ksmHistoryStoreValues=null}
}
/** After an Undo/Redo: the court view rebuilt from the court's pointer (applyCourtState() reloads the pad from the match), everything drawn. */
function rebuildCourtViewAfterHistory(){
  ensureCourtHistory();
  const court=currentHistoryCourt();
  const cs=selectCourtState(getState())?.[court]||{division:selectCurrentDivision(getState()),index:selectCurrentIndex(getState())||0};
  if(cs?.division)applyCourtState(court,cs,true);
  renderAll();
}
export function updateUndoButton(){
  // The React action row (35-react-court.js) draws the buttons: signal whether Undo/Redo may
  // be pressed (the labels stay plain "Undo"/"Redo").
  ensureCourtHistory();const court=currentHistoryCourt(),undoStack=selectCourtActionHistory(getState())[court],redoStack=selectCourtRedoHistory(getState())[court];
  ksmSignalCourtActions({undo:{disabled:!undoStack.length,label:'Undo'},redo:{disabled:!redoStack.length,label:'Redo'}});
}
// F30: an Undo or Redo removes or re-adds an action instead of adding one, so a save conflict's
// rebase (18-, replayPendingCourtHistory()) had nothing to replay and the server copy brought the
// undone point back. Each Undo/Redo is also logged (per court, with the action's patches and
// who/when, like a court action: courtUndoLogEntry()) so the rebase replays it in time order with the court actions.
export {KSM_UNDO_LOG_LIMIT};
/** The match lists of the divisions `action` changes, before its Undo/Redo is applied (for courtUndoMatchOps()). */
function courtUndoMatchesBefore(action){
  const out={};
  (action?.patches||[]).forEach(patch=>{const div=patch?.path?.[0]==='allMatches'?patch.path[1]:null;if(div!=null&&!(div in out)&&Array.isArray(selectAllMatches(getState())?.[div]))out[div]=cloneJson(selectAllMatches(getState())[div])});
  return out;
}
/**
 * External PR #33 review: an action that inserts or removes matches (Next Match creating a playoff
 * or tiebreak, appendApprovedDynamicMatches() in 13-) is recorded as index patches: every match
 * after the insertion is "changed" into its neighbour. Replayed on the server copy by match
 * identity those patches overwrite the wrong matches: backwards (an Undo) they left the playoff in,
 * forwards (the action, or its Redo) they put the division's last match back as it was then, losing
 * the other court's points on it. So for each division whose matches (by identity, in order) differ
 * before and after, the court action (performCourtAction(), withCourtMatchOps()) and the Undo/Redo
 * log entry also keep what it did by identity: the matches it removed, the ones it inserted (with
 * the match they follow) and the field changes of the others. The rebase replays these for that
 * division instead of the index patches (replayCourtMatchOps(), 18-).
 * matchesBefore: the touched divisions' matches before; matchesAfter: all divisions' matches after.
 */
function courtUndoMatchOps(matchesBefore,matchesAfter=selectAllMatches(getState())){
  const ops={};
  Object.keys(matchesBefore||{}).forEach(div=>{
    const before=matchesBefore[div],after=Array.isArray(matchesAfter?.[div])?matchesAfter[div]:[];
    if(!Array.isArray(before))return;
    const beforeIds=before.map(matchSyncIdentity),afterIds=after.map(matchSyncIdentity);
    if(beforeIds.join('\n')===afterIds.join('\n'))return; // same matches in the same order: the index patches replay it
    if(beforeIds.some(id=>!id)||afterIds.some(id=>!id)||new Set(beforeIds).size!==beforeIds.length||new Set(afterIds).size!==afterIds.length)return;
    const op={remove:beforeIds.filter(id=>!afterIds.includes(id)),insert:[],patches:[]};
    // The removed matches themselves (with the match they followed), so an Undo on the device can put them back (invertCourtMatchOps()).
    if(op.remove.length)op.restore=beforeIds.map((id,i)=>afterIds.includes(id)?null:{after:i?beforeIds[i-1]:null,match:cloneJson(before[i])}).filter(Boolean);
    afterIds.forEach((id,i)=>{
      const was=beforeIds.indexOf(id);
      if(was<0){op.insert.push({after:i?afterIds[i-1]:null,match:cloneJson(after[i])});return}
      buildHistoryPatches(cloneHistoryValue(before[was]),cloneHistoryValue(after[i]),['allMatches',div,i]).forEach(patch=>op.patches.push({...patch,matchIdentity:id}));
    });
    ops[div]=op;
  });
  return Object.keys(ops).length?ops:null;
}
/** A new court action's entry, with its matchOps when it inserted or removed matches (beforeAll/afterAll: allMatches before and after). */
function withCourtMatchOps(entry,beforeAll,afterAll){
  const divisions={};
  (entry.patches||[]).forEach(patch=>{const div=patch?.path?.[0]==='allMatches'?patch.path[1]:null;if(div!=null&&Array.isArray(beforeAll?.[div]))divisions[div]=beforeAll[div]});
  const matchOps=courtUndoMatchOps(divisions,afterAll);if(matchOps)entry.matchOps=matchOps;
  return entry;
}
/** The F30 Undo log entry of an Undo/Redo (`action` as it applied, courtHistoryAppliedEntry(); `matchesAfter`: the bouts as it leaves them), recorded with its history move. */
function courtUndoLogEntry(court,kind,action,matchesBefore,matchesAfter){
  const entry={format:'history-op-v1',kind,court,when:new Date().toISOString(),clientId:cloudSession?.clientId||'',tabId:KSM_TAB_ID,revision:cloudSession?.revision||0,
    target:historyEntryIdentity(action),label:action.label||'Action',patches:cloneJson(action.patches||[])};
  const matchOps=courtUndoMatchOps(matchesBefore,matchesAfter);if(matchOps)entry.matchOps=matchOps;
  return entry;
}
/**
 * External PR #33 review: an ordinary Undo/Redo on the device applied the entry's patches by array
 * index (allMatches.<div>[i]). When the other court's matches changed the list meanwhile (its Next
 * Match inserted a playoff earlier in the division, and that reached this device by a live update or
 * a rebase), the indexes had shifted and the Undo/Redo changed the wrong bouts (a Redo of a playoff
 * Next Match replaced "A 3 vs A 4" with the playoff). So a new court action also records, per patch,
 * the match identity at its index before and after (matchIdentities, when they differ) and, for the
 * fields that hold a match index (courtState.<court>.index, current, currentByDivision.<div>), the
 * match that index pointed to (indexRefs); applyCourtHistoryEntry() resolves them by identity.
 * before/after: historyComparableState() before and after the action.
 */
function withCourtHistoryIdentity(entry,before,after){
  entry.patches=(entry.patches||[]).map(patch=>{
    const path=patch?.path||[];
    if(path[0]==='allMatches'&&typeof path[2]==='number'){
      const was=matchSyncIdentity(before?.allMatches?.[path[1]]?.[path[2]])||'',is=matchSyncIdentity(after?.allMatches?.[path[1]]?.[path[2]])||'';
      return was===is?patch:{...patch,matchIdentities:{before:was,after:is}};
    }
    const refs={before:historyIndexRef(before,historyIndexDivision(path,before),patch.before),after:historyIndexRef(after,historyIndexDivision(path,after),patch.after)};
    return refs.before||refs.after?{...patch,indexRefs:refs}:patch;
  });
  entry.identityStamps=1;
  return withCourtMatchOps(entry,before?.allMatches,after?.allMatches);
}
/** The division whose match list a match-index field (courtState.<court>.index, current, currentByDivision.<div>) points into, in `st`. */
function historyIndexDivision(path,st){
  if(path.length===3&&path[0]==='courtState'&&path[2]==='index')return st?.courtState?.[path[1]]?.division??null;
  if(path.length===1&&path[0]==='current')return st?.currentDivision??null;
  if(path.length===2&&path[0]==='currentByDivision')return path[1];
  return null;
}
/** What match index `value` points to in `st`'s list of `division`: {division,id}, {division,end:true} past the last match, or null. */
function historyIndexRef(st,division,value){
  const arr=division!=null?st?.allMatches?.[division]:null;
  if(!Array.isArray(arr)||!Number.isInteger(value))return null;
  if(value>=arr.length)return {division,end:true};
  const id=matchSyncIdentity(arr[value]);
  return id?{division,id}:null;
}
/** The index `ref` points to in the match list of `all` (the recorded `value` when that match is gone). */
function resolveHistoryIndexRef(ref,value,all=selectAllMatches(getState())){
  const arr=all?.[ref?.division];
  if(!Array.isArray(arr))return value;
  if(ref.end)return arr.length;
  const i=arr.findIndex(match=>matchHasSyncIdentity(match,ref.id));
  return i>=0?i:value;
}
/** The Undo of a division's matchOps (courtUndoMatchOps()): the inserted matches removed, the removed ones put back, the field changes reversed. Null when the removed matches were not kept. */
function invertCourtMatchOps(op){
  if(!op||((op.remove||[]).length&&!Array.isArray(op.restore)))return null;
  return {remove:(op.insert||[]).map(item=>matchSyncIdentity(item?.match)).filter(Boolean),insert:cloneJson(op.restore||[]),
    patches:[...(op.patches||[])].reverse().map(patch=>({...patch,before:patch.after,after:patch.before}))};
}
let ksmLastHistoryOutcome=null,ksmLastHistorySkipped=0;
/**
 * Applies a court action's patches for an Undo (direction 'before') or a Redo ('after') to `state`, each match by its identity.
 * Per division: a division whose matches the action inserted or removed (entry.matchOps) is applied by identity like the rebase
 * (replayCourtMatchOps(), inverted for an Undo): only the fields the action changed, wherever the matches now are. Otherwise, while
 * every patched index still holds the match it was recorded on, the patches apply by index as before (also an entry recorded
 * before identities, or a reorder); when the list has shifted each patch goes to its match's current index, and a patch whose
 * match is gone is skipped. A match-index field (courtState.<court>.index ...) is set to where its match is now.
 * Returns {patches: the patches applied, in the action's direction, at the indexes they applied to; skipped: how many were not}.
 */
function applyCourtHistoryEntry(action,direction){
  const undoing=direction==='before',now=undoing?'after':'before',other=undoing?'before':'after';
  const all=Array.isArray(action?.patches)?action.patches:[],matchOps=action?.matchOps&&typeof action.matchOps==='object'?action.matchOps:{};
  const divOf=patch=>patch?.path?.[0]==='allMatches'&&typeof patch.path[2]==='number'?patch.path[1]:null;
  const byDivision={};all.forEach(patch=>{const div=divOf(patch);if(div!=null)(byDivision[div]=byDivision[div]||[]).push(patch)});
  const identityNow=patch=>patch.matchIdentities?patch.matchIdentities[now]:patch.matchIdentity;
  const mode={},ops={};
  Object.entries(byDivision).forEach(([div,list])=>{
    const arr=selectAllMatches(getState())?.[div],op=matchOps[div];
    if(!Array.isArray(arr)||list.some(patch=>!patch.matchIdentity)){mode[div]='index';return}
    if(op&&((op.insert||[]).length||(op.remove||[]).length)){ops[div]=undoing?invertCourtMatchOps(op):op;mode[div]=ops[div]?'ops':'skip';return}
    const inPlace=list.every(patch=>{const want=identityNow(patch),i=patch.path[2];return want?matchHasSyncIdentity(arr[i],want):i>=arr.length});
    if(inPlace)mode[div]='index';
    else if(list.some(patch=>patch.path.length<4))mode[div]=action.identityStamps?'skip':'index'; // whole matches by index: only an entry recorded before identities still does that
    else mode[div]='identity';
  });
  // Every `allMatches` write of the entry (its match ops first, then its patches in order) is one batch through
  // match-writes.js (#206 review M2), planned and dispatched with the entry's court/undo or court/redo (#15 PR 13c-2: no
  // notification shows half an Undo); each look-up by
  // identity sees the writes before it. `applied` keeps a placeholder per batched write, in the old order, filled after.
  const applied=[],writes=[],slots=[];let skipped=0;
  const batch=(write,record)=>{writes.push(write);slots.push(record);applied.push(slots.length-1)};
  const historyWrite=(patch,path)=>{const value=patch[direction];return {path,value,missing:Boolean(value&&value.__ksmMissing===true),how:'history',clone:true}};
  Object.entries(ops).forEach(([div,op])=>{
    if(!op)return;
    const built=courtMatchOpsWrites(state,{[div]:op});
    skipped+=built.skipped;
    built.writes.forEach((write,i)=>{const patch=built.patches[i];if(patch)batch(write,result=>{const done={...patch,path:result.path};return undoing?{...done,before:done.after,after:done.before}:done});else{writes.push(write);slots.push(null)}});
  });
  // `matches` (a device key) is never written (applyHistoryPatch()); which of its patches count as applied is kept as
  // before, so the Undo log entry (courtUndoLogEntry()) is the same as 4.0 writes.
  // (state.matches is allMatches[currentDivision] when that list exists: the test by division, not list identity.)
  const aliased=Object.keys(byDivision).find(div=>div===selectCurrentDivision(getState())&&Array.isArray(selectAllMatches(getState())?.[div]));
  const ordered=undoing?[...all].reverse():all,indexFields=[];
  ordered.forEach(patch=>{
    const path=patch?.path||[],div=divOf(patch);
    // state.matches is the same list as allMatches.<div>: its patches repeat those, at indexes that may be stale.
    if(path[0]==='matches'&&aliased!=null&&mode[aliased]!=='index')return;
    if(div==null){
      if(patch.indexRefs?.[direction])indexFields.push(patch);
      else if(path[0]==='allMatches')batch(historyWrite(patch,path),()=>patch);
      else{applyHistoryPatch(patch,direction);applied.push(patch)}
      return;
    }
    if(mode[div]==='ops')return;
    if(mode[div]==='skip'){skipped++;return}
    if(mode[div]==='identity'){
      const ids=[identityNow(patch),patch.matchIdentity,patch.matchIdentities?.[other]].filter(Boolean);
      batch({...historyWrite(patch,null),path:undefined,division:div,ids,rest:path.slice(3)},result=>({...patch,path:result.path}));
      return;
    }
    batch(historyWrite(patch,path),()=>patch);
  });
  // Not dispatched here (#15 PR 13c-2): the map as the batch leaves it is read by the index fields below and the Undo log,
  // and goes to the store with the entry's other keys in its one court/undo or court/redo.
  const planned=ksmPlanMatchPaths(writes),results=planned.results;
  if(planned.allMatches!==selectAllMatches(getState()))historyStoreValues().allMatches=planned.allMatches;
  for(let i=applied.length-1;i>=0;i--){
    if(typeof applied[i]!=='number')continue;
    const k=applied[i],result=results[k];
    if(result.applied)applied[i]=slots[k](result);else{applied.splice(i,1);skipped++}
  }
  // The match-index fields last, once the match lists are as they will be.
  indexFields.forEach(patch=>{const value=resolveHistoryIndexRef(patch.indexRefs[direction],patch[direction],planned.allMatches);applyHistoryPatch({...patch,[direction]:value},direction);applied.push(patch)});
  if(undoing)applied.reverse();
  return {patches:applied,skipped};
}
/** `action` as its Undo/Redo was applied (for the Undo log the rebase replays): only the patches that applied, at the indexes they applied to. */
function courtHistoryAppliedEntry(action){
  const outcome=ksmLastHistoryOutcome;ksmLastHistoryOutcome=null;ksmLastHistorySkipped=outcome?.skipped||0;
  return outcome?{...action,patches:outcome.patches}:action;
}
/** The note added to "Undid …"/"Redid …" when part of it could not be applied (its match no longer exists); also shown as a toast. */
function courtHistorySkippedNote(kind){
  const skipped=ksmLastHistorySkipped;ksmLastHistorySkipped=0;
  if(!skipped)return '';
  if(typeof showKsmToast==='function')showKsmToast(`${kind}: a match it changed no longer exists, so that part was not applied`,3500,true);
  return ' (part of it was not applied: a match it changed no longer exists)';
}
/**
 * An Undo ('undo': `action` is the court's last action) or a Redo ('redo': its last undone one), #15 PR 13b and 13c-2: one
 * court/undo or court/redo moves the entry to the other list, appends the F30 log entry and puts every key the entry
 * changed in place, its bouts (`allMatches`, one batch) with its bracket nodes, pointers, …, so no store notification
 * shows half an entry (#199 review L1: a node's winner before its bout). Then the court view is rebuilt from the court's
 * pointer and everything is drawn, as before (undo() / redo() hold the notifications until then).
 */
function moveCourtHistory(kind,court,action){
  const matchesBefore=courtUndoMatchesBefore(action),values=applyHistoryValues(action,kind==='undo'?'before':'after');
  const matchesAfter=values&&Object.hasOwn(values,'allMatches')?values.allMatches:selectAllMatches(getState());
  ksmMoveCourtHistory(kind,court,courtUndoLogEntry(court,kind==='undo'?'UNDO':'REDO',courtHistoryAppliedEntry(action),matchesBefore,matchesAfter),values||{});
  if(values)rebuildCourtViewAfterHistory();
}
export function undo(){holdNotifications(()=>{
  syncOwnCourtPointer();
  ensureCourtHistory();const court=currentHistoryCourt(),stack=selectCourtActionHistory(getState())[court],action=stack[stack.length-1];
  if(!action){updateSaveStatus('Nothing to undo');updateUndoButton();return}
  moveCourtHistory('undo',court,action);
  updateUndoButton();updateSaveStatus('Undid '+action.label+courtHistorySkippedNote('Undo'));criticalAutoSave('Undo: '+action.label);
})}
export function redo(){holdNotifications(()=>{
  syncOwnCourtPointer();
  ensureCourtHistory();const court=currentHistoryCourt(),stack=selectCourtRedoHistory(getState())[court],action=stack[stack.length-1];
  if(!action){updateSaveStatus('Nothing to redo');updateUndoButton();return}
  moveCourtHistory('redo',court,action);
  updateUndoButton();updateSaveStatus('Redid '+action.label+courtHistorySkippedNote('Redo'));criticalAutoSave('Redo: '+action.label);
})}
// The score pad is store data (selectScore(getState()), device/scoreChanged, #15 PR 7): each change builds a new pad.
export function point(side,letter){performCourtAction(`${side==='W'?'White':'Red'} ${letter}`,()=>{const s=selectScore(getState());ksmSetScore({...s,[side]:[...s[side],letter]});window.dispatchEvent(new Event('ksm:timer-point'));syncActiveScoreToMatch();renderScore()})}
export function hansoku(side){performCourtAction(`${side==='W'?'White':'Red'} Hansoku`,()=>{window.dispatchEvent(new Event('ksm:timer-point'));const s=selectScore(getState());if(side==='W'){const WT=s.WT+1;ksmSetScore({...s,WT,R:WT%2===0?[...s.R,'H']:s.R})}else{const RT=s.RT+1;ksmSetScore({...s,RT,W:RT%2===0?[...s.W,'H']:s.W})}syncActiveScoreToMatch();renderScore()})}
export function fusen(side){performCourtAction(`${side==='W'?'White':'Red'} Fusen-gachi`,()=>{const s=selectScore(getState());ksmSetScore(side==='W'?{...s,W:[],R:['F','F']}:{...s,R:[],W:['F','F']});syncActiveScoreToMatch();renderScore()})}
export function matchRequiresWinner(m){
  return KSMEngine.matchRequiresWinner(m);
}
export function nextMatch(){
  // `m` is looked up again inside the action (KSMEngine.findMatchAgain(): by sync identity, the held index on a tie or a renamed bout), so
  // the writes go to the list's match even when the list holds new objects by then (#15, before 13c).
  const div=selectCurrentDivision(getState()),index=selectCurrentIndex(getState());
  let m=selectMatches(getState())[selectCurrentIndex(getState())];
  if(m){
    let attemptedTie=selectScore(getState()).W.length===selectScore(getState()).R.length;
    let tieNotAllowed=matchRequiresWinner(m);
    if(attemptedTie&&tieNotAllowed){alert('Ties are not allowed for this match. Please enter a winning point before advancing.');return;}
  }
  const completedLabel=m?`Next Match: ${m.white||m.teamWhite||'White'} vs ${m.red||m.teamRed||'Red'}`:'Next Match';
  performCourtAction(completedLabel,()=>{
    const at=m?KSMEngine.matchIndexIn(selectAllMatches(getState())?.[div],m,index):-1;
    if(at>=0)m=selectAllMatches(getState())[div][at];
    if(m){
      // Commit the final score and winner as one atomic result snapshot. Point taps
      // may have been autosaved under an earlier cloud revision; the completion
      // action must still carry everything needed to reconstruct the winner safely.
      // One write (#15 PR 13c-1, app/modules/court/match-writes.js), the fields in the old order; the snapshot is taken
      // from the bout with its final points, before `done`, as before. The write returns the bout as it is after it
      // (a new object since #15 PR 13c-2: the held `m` keeps its old values); every read after it uses that.
      const result={wp:[...selectScore(getState()).W],rp:[...selectScore(getState()).R],wt:selectScore(getState()).WT||0,rt:selectScore(getState()).RT||0};
      const final={...result,completedResult:completedResultSnapshot(/** @type {Match} */({...m,...result})),done:true};
      // A bout no longer in its list (none is today: nothing writes between the look-up and here) gets the result on a copy.
      m=at>=0?ksmUpdateMatch(div,at,final)||m:{...m,...final};
      maybeCreateTiebreaks(m);maybeCreateTeamTiebreak(m);maybeCreateKachinukiNext(m,m.division===div?index:undefined);maybeAdvanceTeamBracket(m);maybeCreateChampionship(m);maybeAdvanceChampionship(m);maybeAdvanceIndividualSingleElim(m);
      enforceUniqueIndividualMatches(m.division);
    }
    let c=selectCurrentCourt(getState())||'A';let next=findNextForCourt(c,selectCurrentDivision(getState()),0);applyCourtState(c,next,false);
    renderScore();renderPools();renderProgress();renderPublic();
  });
  if(m)criticalAutoSave(`Completed match: ${m.white||m.teamWhite||'White'} vs ${m.red||m.teamRed||'Red'}`);
}
