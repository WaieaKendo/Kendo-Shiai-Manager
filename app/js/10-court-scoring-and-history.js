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
function historyValuesEqual(a,b){return a===b||(Number.isNaN(a)&&Number.isNaN(b))}
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
    stack.push({format:'patch-v1',label:label||'Action',court,when:new Date().toISOString(),clientId:cloudSession?.clientId||'',revision:cloudSession?.revision||0,patches});
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
    const patches=direction==='before'?[...action.patches].reverse():action.patches;
    patches.forEach(patch=>applyHistoryPatch(patch,direction));
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
function recordCourtUndoLog(court,kind,action){
  state.courtUndoLog=state.courtUndoLog||{A:[],B:[]};
  const log=Array.isArray(state.courtUndoLog[court])?state.courtUndoLog[court]:(state.courtUndoLog[court]=[]);
  log.push({format:'history-op-v1',kind,court,when:new Date().toISOString(),clientId:cloudSession?.clientId||'',revision:cloudSession?.revision||0,
    target:historyEntryIdentity(action),label:action.label||'Action',patches:cloneJson(action.patches||[])});
  if(log.length>KSM_UNDO_LOG_LIMIT)log.splice(0,log.length-KSM_UNDO_LOG_LIMIT);
}
/* ksm:post-split-end */
function undo(){
  ensureCourtHistory();const court=currentHistoryCourt(),stack=state.courtActionHistory[court];const action=stack.pop();
  if(!action){updateSaveStatus('Nothing to undo');updateUndoButton();return}
  applyHistoryValues(action,'before');/* ksm:post-split-begin history-replay */recordCourtUndoLog(court,'UNDO',action);/* ksm:post-split-end */state.courtRedoHistory[court].push(action);if(state.courtRedoHistory[court].length>KSM_HISTORY_LIMIT)state.courtRedoHistory[court].shift();
  updateUndoButton();updateSaveStatus('Undid '+action.label);criticalAutoSave('Undo: '+action.label);
}
function redo(){
  ensureCourtHistory();const court=currentHistoryCourt(),stack=state.courtRedoHistory[court];const action=stack.pop();
  if(!action){updateSaveStatus('Nothing to redo');updateUndoButton();return}
  applyHistoryValues(action,'after');/* ksm:post-split-begin history-replay */recordCourtUndoLog(court,'REDO',action);/* ksm:post-split-end */state.courtActionHistory[court].push(action);if(state.courtActionHistory[court].length>KSM_HISTORY_LIMIT)state.courtActionHistory[court].shift();
  updateUndoButton();updateSaveStatus('Redid '+action.label);criticalAutoSave('Redo: '+action.label);
}
function point(side,letter){performCourtAction(`${side==='W'?'White':'Red'} ${letter}`,()=>{state.score[side].push(letter);syncActiveScoreToMatch();renderScore()})}
function hansoku(side){performCourtAction(`${side==='W'?'White':'Red'} Hansoku`,()=>{if(side==='W'){state.score.WT++;if(state.score.WT%2===0)state.score.R.push('H')}else{state.score.RT++;if(state.score.RT%2===0)state.score.W.push('H')}syncActiveScoreToMatch();renderScore()})}
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


