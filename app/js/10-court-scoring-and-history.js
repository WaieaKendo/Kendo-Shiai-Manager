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
function renderScore(){updateScoreTournamentName();let m=state.matches[state.current];if(m && !matchBelongsToCourt(m,state.currentCourt||'A'))m=null;if(!m){whiteName.textContent='—';redName.textContent='—';matchMeta.textContent='No active match';whitePts.textContent='';redPts.textContent='';whiteTri.textContent='';redTri.textContent='';renderQueue();renderPublic();renderContext();return}if(m.type==='teamPlayoff'){whiteName.innerHTML=repSelect('W',m.teamWhite,m.white);redName.innerHTML=repSelect('R',m.teamRed,m.red)}else{whiteName.textContent=m.white;redName.textContent=m.red}matchMeta.textContent=m.type==='teamPosition'?`${m.division} • ${m.teamWhite} vs ${m.teamRed} • ${m.position}`:(m.type==='teamPlayoff'?`${m.division} • ${m.teamWhite} vs ${m.teamRed} • ${m.position}`:`${m.division} • ${m.pool==='Championship'?(m.position||'Championship'):'Pool '+m.pool}`);whitePts.textContent=state.score.W.join(' ');redPts.textContent=state.score.R.join(' ');whiteTri.textContent='△ '.repeat(state.score.WT);redTri.textContent='△ '.repeat(state.score.RT);renderQueue();renderPublic();renderContext()}

// ---------- KSM v3.17.8-test Compact action-patch court Undo / Redo ----------
const KSM_HISTORY_LIMIT=100;
const KSM_HISTORY_KEYS=new Set(['courtActionHistory','courtRedoHistory']);
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
  ensureCourtHistory();const court=currentHistoryCourt(),undoStack=state.courtActionHistory[court],redoStack=state.courtRedoHistory[court];
/* ksm:post-split-begin react-court */
  // React action row (35-react-court.js): publish the buttons instead of writing them.
  if(ksmReactCourtActionsActive())return ksmPublishCourtActions({undo:{disabled:!undoStack.length,label:'Undo'},redo:{disabled:!redoStack.length,label:'Redo'}});
/* ksm:post-split-end */
  const undoBtn=document.getElementById('undoBtn'),redoBtn=document.getElementById('redoBtn');
  if(undoBtn){undoBtn.disabled=!undoStack.length;undoBtn.innerHTML=`<svg class="action-svg undo-svg" viewBox="0 0 64 64" aria-hidden="true"><path d="M24 14H10v14" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 27c4-10 14-17 26-17 15 0 27 12 27 27S52 64 37 64c-11 0-21-7-25-17" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg><span class="action-label">Undo</span>`}
  if(redoBtn){redoBtn.disabled=!redoStack.length;redoBtn.innerHTML=`<svg class="action-svg undo-svg" viewBox="0 0 64 64" aria-hidden="true" style="transform:scaleX(-1)"><path d="M24 14H10v14" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 27c4-10 14-17 26-17 15 0 27 12 27 27S52 64 37 64c-11 0-21-7-25-17" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg><span class="action-label">Redo</span>`}
}
function undo(){
  ensureCourtHistory();const court=currentHistoryCourt(),stack=state.courtActionHistory[court];const action=stack.pop();
  if(!action){updateSaveStatus('Nothing to undo');updateUndoButton();return}
  applyHistoryValues(action,'before');state.courtRedoHistory[court].push(action);if(state.courtRedoHistory[court].length>KSM_HISTORY_LIMIT)state.courtRedoHistory[court].shift();
  updateUndoButton();updateSaveStatus('Undid '+action.label);criticalAutoSave('Undo: '+action.label);
}
function redo(){
  ensureCourtHistory();const court=currentHistoryCourt(),stack=state.courtRedoHistory[court];const action=stack.pop();
  if(!action){updateSaveStatus('Nothing to redo');updateUndoButton();return}
  applyHistoryValues(action,'after');state.courtActionHistory[court].push(action);if(state.courtActionHistory[court].length>KSM_HISTORY_LIMIT)state.courtActionHistory[court].shift();
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


