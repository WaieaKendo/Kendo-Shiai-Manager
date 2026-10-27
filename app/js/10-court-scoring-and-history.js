function loadScoreFromMatch(m){
  if(!m || m.done){state.score={W:[],R:[],WT:0,RT:0};return;}
  state.score={W:[...(m.wp||[])],R:[...(m.rp||[])],WT:m.wt||0,RT:m.rt||0};
}
function syncActiveScoreToMatch(){
  let m=state.matches?.[state.current];
  if(!m || m.done)return;
  m.wp=[...(state.score?.W||[])];
  m.rp=[...(state.score?.R||[])];
  m.wt=state.score?.WT||0;
  m.rt=state.score?.RT||0;
}

// ---------- KSM v3.17.8-test Compact action-patch court Undo / Redo ----------
const KSM_HISTORY_LIMIT=100;
const KSM_HISTORY_KEYS=new Set(['courtActionHistory','courtRedoHistory'/* ksm:post-split-begin history-replay */,'courtUndoLog'/* ksm:post-split-end */]);
const KSM_HISTORY_MISSING={__ksmMissing:true};
function ensureCourtHistory(){
  state.courtActionHistory=state.courtActionHistory||{A:[],B:[]};
  state.courtRedoHistory=state.courtRedoHistory||{A:[],B:[]};
  ['A','B'].forEach(c=>{
    if(!Array.isArray(state.courtActionHistory[c]))state.courtActionHistory[c]=[];
    if(!Array.isArray(state.courtRedoHistory[c]))state.courtRedoHistory[c]=[];
    // Legacy snapshot entries are intentionally discarded because they can exceed storage limits.
    state.courtActionHistory[c]=state.courtActionHistory[c].filter(action=>action?.format==='patch-v1');
    state.courtRedoHistory[c]=state.courtRedoHistory[c].filter(action=>action?.format==='patch-v1');
  });
}
function cloneHistoryValue(value){return value===undefined?{...KSM_HISTORY_MISSING}:JSON.parse(JSON.stringify(value))}
function historyComparableState(){const out={};Object.keys(state).forEach(k=>{if(!KSM_HISTORY_KEYS.has(k))out[k]=cloneHistoryValue(state[k])});return out}
function historyValuesEqual(a,b){/* ksm:post-split-begin engine-bridge */return KSMEngine.historyValuesEqual(a,b);// moved to app/engine/sync-helpers.ts
  /* ksm:post-split-end */}
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
function currentHistoryCourt(){const c=String(state.currentCourt||cloudSession?.court||'A').toUpperCase();return c==='B'?'B':'A'}
function stampHistoryPatchMatchIdentity(patch,before,after){
  const path=patch?.path||[];
  if(path[0]!=='allMatches'||typeof path[2]!=='number')return patch;
  const div=path[1],index=path[2];
  const afterMatch=after?.allMatches?.[div]?.[index],beforeMatch=before?.allMatches?.[div]?.[index];
  const match=isValidMatchObject(afterMatch)?afterMatch:(isValidMatchObject(beforeMatch)?beforeMatch:null);
  const matchIdentity=matchSyncIdentity(match);
  return matchIdentity?{...patch,matchIdentity}:patch;
}
function performCourtAction(label,fn){
  ensureCourtHistory();const court=currentHistoryCourt(),before=historyComparableState();
  const result=fn();const after=historyComparableState(),patches=buildHistoryPatches(before,after).map(patch=>stampHistoryPatchMatchIdentity(patch,before,after));
  if(patches.length){
    const stack=state.courtActionHistory[court];
    /* ksm:post-split-begin history-replay was:stack.push({format:'patch-v1',label:label||'Action',court,when:new Date().toISOString(),clientId:cloudSession?.clientId||'',revision:cloudSession?.revision||0,patches}); */stack.push(withCourtHistoryIdentity({format:'patch-v1',label:label||'Action',court,when:new Date().toISOString(),clientId:cloudSession?.clientId||'',tabId:KSM_TAB_ID,revision:cloudSession?.revision||0,patches},before,after));/* ksm:post-split-end */
    if(stack.length>KSM_HISTORY_LIMIT)stack.splice(0,stack.length-KSM_HISTORY_LIMIT);
    state.courtRedoHistory[court]=[];
  }
  updateUndoButton();/* ksm:post-split-begin react-bridge */if(typeof ksmNotifyStateChanged==='function')ksmNotifyStateChanged('court action');/* ksm:post-split-end */return result;
}
function historyPathParent(path){
  let target=state;
  for(let i=0;i<path.length-1;i++){
    const key=path[i],next=path[i+1];
    if(target[key]===undefined||target[key]===null)target[key]=typeof next==='number'?[]:{};
    target=target[key];
  }
  return {target,key:path[path.length-1]};
}
function applyHistoryPatch(patch,direction){
  const value=patch?.[direction],path=patch?.path||[];
  if(!path.length)return;
  const {target,key}=historyPathParent(path),missing=value&&value.__ksmMissing===true;
  if(Array.isArray(target)&&typeof key==='number'){
    if(missing){if(key>=0&&key<target.length)target.splice(key,1)}
    else if(key>=target.length)target.splice(key,0,JSON.parse(JSON.stringify(value)));
    else target[key]=JSON.parse(JSON.stringify(value));
  }else if(missing)delete target[key];
  else target[key]=JSON.parse(JSON.stringify(value));
}
function applyHistoryValues(action,direction){
  if(action?.format==='patch-v1'&&Array.isArray(action.patches)){
    /* ksm:post-split-begin history-replay was:const patches=direction==='before'?[...action.patches].reverse():action.patches; */ksmLastHistoryOutcome=applyCourtHistoryEntry(action,direction);/* ksm:post-split-end */
    /* ksm:post-split-begin history-replay was:patches.forEach(patch=>applyHistoryPatch(patch,direction)); *//* ksm:post-split-end */
  }else return;
  ensureCourtHistory();
  const court=currentHistoryCourt();
  const cs=state.courtState?.[court]||{division:state.currentDivision,index:state.current||0};
  if(cs?.division)applyCourtState(court,cs,true);
  renderAll();
}
function updateUndoButton(){
/* ksm:post-split-begin react-court */
  // The React action row (35-react-court.js) draws the buttons: publish whether Undo/Redo may
  // be pressed (the labels stay plain "Undo"/"Redo").
  ensureCourtHistory();const court=currentHistoryCourt(),undoStack=state.courtActionHistory[court],redoStack=state.courtRedoHistory[court];
  ksmPublishCourtActions({undo:{disabled:!undoStack.length,label:'Undo'},redo:{disabled:!redoStack.length,label:'Redo'}});
/* ksm:post-split-end */
}
/* ksm:post-split-begin history-replay */
// F30: an Undo or Redo removes or re-adds an action instead of adding one, so a save conflict's
// rebase (18-, replayPendingCourtHistory()) had nothing to replay and the server copy brought the
// undone point back. Each Undo/Redo is also logged here (per court, with the action's patches and
// who/when, like a court action) so the rebase replays it in time order with the court actions.
const KSM_UNDO_LOG_LIMIT=40;
/** The match lists of the divisions `action` changes, before its Undo/Redo is applied (for courtUndoMatchOps()). */
function courtUndoMatchesBefore(action){
  const out={};
  (action?.patches||[]).forEach(patch=>{const div=patch?.path?.[0]==='allMatches'?patch.path[1]:null;if(div!=null&&!(div in out)&&Array.isArray(state.allMatches?.[div]))out[div]=cloneJson(state.allMatches[div])});
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
function courtUndoMatchOps(matchesBefore,matchesAfter=state.allMatches){
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
function recordCourtUndoLog(court,kind,action,matchesBefore){
  state.courtUndoLog=state.courtUndoLog||{A:[],B:[]};
  const log=Array.isArray(state.courtUndoLog[court])?state.courtUndoLog[court]:(state.courtUndoLog[court]=[]);
  const entry={format:'history-op-v1',kind,court,when:new Date().toISOString(),clientId:cloudSession?.clientId||'',tabId:KSM_TAB_ID,revision:cloudSession?.revision||0,
    target:historyEntryIdentity(action),label:action.label||'Action',patches:cloneJson(action.patches||[])};
  const matchOps=courtUndoMatchOps(matchesBefore);if(matchOps)entry.matchOps=matchOps;
  log.push(entry);
  if(log.length>KSM_UNDO_LOG_LIMIT)log.splice(0,log.length-KSM_UNDO_LOG_LIMIT);
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
/** The index `ref` points to in the current match list (the recorded `value` when that match is gone). */
function resolveHistoryIndexRef(ref,value){
  const arr=state.allMatches?.[ref?.division];
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
    const arr=state.allMatches?.[div],op=matchOps[div];
    if(!Array.isArray(arr)||list.some(patch=>!patch.matchIdentity)){mode[div]='index';return}
    if(op&&((op.insert||[]).length||(op.remove||[]).length)){ops[div]=undoing?invertCourtMatchOps(op):op;mode[div]=ops[div]?'ops':'skip';return}
    const inPlace=list.every(patch=>{const want=identityNow(patch),i=patch.path[2];return want?matchHasSyncIdentity(arr[i],want):i>=arr.length});
    if(inPlace)mode[div]='index';
    else if(list.some(patch=>patch.path.length<4))mode[div]=action.identityStamps?'skip':'index'; // whole matches by index: only an entry recorded before identities still does that
    else mode[div]='identity';
  });
  const applied=[];let skipped=0;
  Object.entries(ops).forEach(([div,op])=>{
    if(!op)return;
    const result=replayCourtMatchOps(state,{[div]:op})||{applied:[],skipped:0};
    skipped+=result.skipped;
    result.applied.forEach(patch=>applied.push(undoing?{...patch,before:patch.after,after:patch.before}:patch));
  });
  const aliased=Object.keys(byDivision).find(div=>state.matches&&state.matches===state.allMatches?.[div]);
  const ordered=undoing?[...all].reverse():all,indexFields=[];
  ordered.forEach(patch=>{
    const path=patch?.path||[],div=divOf(patch);
    // state.matches is the same list as allMatches.<div>: its patches repeat those, at indexes that may be stale.
    if(path[0]==='matches'&&aliased!=null&&mode[aliased]!=='index')return;
    if(div==null){if(patch.indexRefs?.[direction])indexFields.push(patch);else{applyHistoryPatch(patch,direction);applied.push(patch)}return}
    if(mode[div]==='ops')return;
    if(mode[div]==='skip'){skipped++;return}
    if(mode[div]==='identity'){
      const arr=state.allMatches[div],ids=[identityNow(patch),patch.matchIdentity,patch.matchIdentities?.[other]].filter(Boolean);
      let i=-1;for(const id of ids){i=arr.findIndex(match=>matchHasSyncIdentity(match,id));if(i>=0)break}
      if(i<0){skipped++;return}
      const resolved={...patch,path:['allMatches',div,i,...path.slice(3)]};
      applyHistoryPatch(resolved,direction);applied.push(resolved);return;
    }
    applyHistoryPatch(patch,direction);applied.push(patch);
  });
  // The match-index fields last, once the match lists are as they will be.
  indexFields.forEach(patch=>{const value=resolveHistoryIndexRef(patch.indexRefs[direction],patch[direction]);applyHistoryPatch({...patch,[direction]:value},direction);applied.push(patch)});
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
/* ksm:post-split-end */
function undo(){
  ensureCourtHistory();const court=currentHistoryCourt(),stack=state.courtActionHistory[court];const action=stack.pop();
  if(!action){updateSaveStatus('Nothing to undo');updateUndoButton();return}
  /* ksm:post-split-begin history-replay */const matchesBefore=courtUndoMatchesBefore(action);/* ksm:post-split-end */applyHistoryValues(action,'before');/* ksm:post-split-begin history-replay */recordCourtUndoLog(court,'UNDO',courtHistoryAppliedEntry(action),matchesBefore);/* ksm:post-split-end */state.courtRedoHistory[court].push(action);if(state.courtRedoHistory[court].length>KSM_HISTORY_LIMIT)state.courtRedoHistory[court].shift();
  updateUndoButton();/* ksm:post-split-begin history-replay was:updateSaveStatus('Undid '+action.label); */updateSaveStatus('Undid '+action.label+courtHistorySkippedNote('Undo'));/* ksm:post-split-end */criticalAutoSave('Undo: '+action.label);
}
function redo(){
  ensureCourtHistory();const court=currentHistoryCourt(),stack=state.courtRedoHistory[court];const action=stack.pop();
  if(!action){updateSaveStatus('Nothing to redo');updateUndoButton();return}
  /* ksm:post-split-begin history-replay */const matchesBefore=courtUndoMatchesBefore(action);/* ksm:post-split-end */applyHistoryValues(action,'after');/* ksm:post-split-begin history-replay */recordCourtUndoLog(court,'REDO',courtHistoryAppliedEntry(action),matchesBefore);/* ksm:post-split-end */state.courtActionHistory[court].push(action);if(state.courtActionHistory[court].length>KSM_HISTORY_LIMIT)state.courtActionHistory[court].shift();
  updateUndoButton();/* ksm:post-split-begin history-replay was:updateSaveStatus('Redid '+action.label); */updateSaveStatus('Redid '+action.label+courtHistorySkippedNote('Redo'));/* ksm:post-split-end */criticalAutoSave('Redo: '+action.label);
}
function point(side,letter){performCourtAction(`${side==='W'?'White':'Red'} ${letter}`,()=>{state.score[side].push(letter);/* ksm:post-split-begin match-timer */window.dispatchEvent(new Event('ksm:timer-point'));/* ksm:post-split-end */syncActiveScoreToMatch();renderScore()})}
function hansoku(side){performCourtAction(`${side==='W'?'White':'Red'} Hansoku`,()=>{/* ksm:post-split-begin match-timer */window.dispatchEvent(new Event('ksm:timer-point'));/* ksm:post-split-end */if(side==='W'){state.score.WT++;if(state.score.WT%2===0)state.score.R.push('H')}else{state.score.RT++;if(state.score.RT%2===0)state.score.W.push('H')}syncActiveScoreToMatch();renderScore()})}
function fusen(side){performCourtAction(`${side==='W'?'White':'Red'} Fusen-gachi`,()=>{if(side==='W'){state.score.W=[];state.score.R=['F','F']}else{state.score.R=[];state.score.W=['F','F']}syncActiveScoreToMatch();renderScore()})}
function matchRequiresWinner(m){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.matchRequiresWinner(m);
  /* ksm:post-split-end */
}
function nextMatch(){
  let m=state.matches[state.current];
  if(m){
    let attemptedTie=state.score.W.length===state.score.R.length;
    let tieNotAllowed=matchRequiresWinner(m);
    if(attemptedTie&&tieNotAllowed){alert('Ties are not allowed for this match. Please enter a winning point before advancing.');return;}
  }
  const completedLabel=m?`Next Match: ${m.white||m.teamWhite||'White'} vs ${m.red||m.teamRed||'Red'}`:'Next Match';
  performCourtAction(completedLabel,()=>{
    if(m){
      // Commit the final score and winner as one atomic result snapshot. Point taps
      // may have been autosaved under an earlier cloud revision; the completion
      // action must still carry everything needed to reconstruct the winner safely.
      m.wp=[...state.score.W];m.rp=[...state.score.R];m.wt=state.score.WT||0;m.rt=state.score.RT||0;
      m.completedResult=completedResultSnapshot(m);
      m.done=true;
      maybeCreateTiebreaks(m);maybeCreateTeamTiebreak(m);maybeCreateKachinukiNext(m);maybeAdvanceTeamBracket(m);maybeCreateChampionship(m);maybeAdvanceChampionship(m);maybeAdvanceIndividualSingleElim(m);
      enforceUniqueIndividualMatches(m.division);
    }
    let c=state.currentCourt||'A';let next=findNextForCourt(c,state.currentDivision,0);applyCourtState(c,next,false);
    renderScore();renderPools();renderProgress();renderPublic();
  });
  if(m)criticalAutoSave(`Completed match: ${m.white||m.teamWhite||'White'} vs ${m.red||m.teamRed||'Red'}`);
}


