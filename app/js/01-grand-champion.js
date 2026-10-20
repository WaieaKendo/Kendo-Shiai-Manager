/* ksm:post-split-begin grand-champion */
// ==========================================================
// Grand champion (#86): the winners of chosen individual divisions meet for a Grand Champion
// award. Rules and data shape: app/engine/grand-champion.ts.
// state.grandChampions[]: one row per grand champion, edited in Setup (React island,
// app/react/setup/GrandChampions.tsx): its sources, format, court and award are fixed once the
// tournament is generated (name and award stay editable). Its court is also kept in
// state.divisionCourts[id], like a team division's.
// The draw lives under the row's id (state.allMatches[id], pools / singleElimNodes /
// singleElimComps …), made by generateDivisionState(id) (08-) from the winners, and is derived:
// ksmSyncGrandChampions() makes it follow the sources on every device that saves, after court
// actions and edits (scheduleAutoSave / criticalAutoSave, 20-) and after every load, live update
// and rebase (applyTournamentPayload, 21-). Idempotent: the same sources give the same draw on
// every device. A change after the grand champion started is asked (an in-page question): the
// decision is saved in the row (keep / rebuild), so every device then does the same.
// ==========================================================
function ksmNewGrandChampionId(){return KSMEngine.GRAND_CHAMPION_PREFIX+Array.from(crypto.getRandomValues(new Uint8Array(12)),n=>n.toString(16).padStart(2,'0')).join('')}
function ksmGrandChampions(){return KSMEngine.sortGrandChampions(state.grandChampions||[])}
function ksmGrandChampion(id){return KSMEngine.isGrandChampionId(id)?(state.grandChampions||[]).find(g=>g.id===id)||null:null}
function ksmGrandChampionError(gc){return KSMEngine.grandChampionSetupError(gc,state.divisions||[],(state.teamDivisions||[]).map(d=>d.id))}
function ksmGrandChampionChanged(reason='Grand champion'){
  renderDivisionSetup();renderDivisions();renderTournamentStatus();scheduleAutoSave(reason);
}
// ---------------------------------------------------------- Setup rows
function ksmAddGrandChampion(){
  if(state.generated||isReadOnlySession())return null;
  const rows=ksmGrandChampions(),gc=KSMEngine.newGrandChampion(ksmNewGrandChampionId(),Math.max(-1,...rows.map(r=>r.order))+1);
  state.grandChampions=[...rows,gc];state.divisionCourts[gc.id]=gc.court;
  ksmGrandChampionChanged();return gc.id;
}
const KSM_GC_EDITABLE_AFTER_DRAW=['name','awardMode'];
/** Changes fields of a row; why not (nothing changed), or null. */
function ksmUpdateGrandChampion(id,patch){
  const gc=ksmGrandChampion(id);if(!gc)return 'This grand champion match no longer exists.';
  if(isReadOnlySession())return 'Read only';
  if(patch.name!==undefined&&!String(patch.name).trim())return 'Enter a name for the grand champion match.';
  if(state.generated&&Object.keys(patch).some(k=>!KSM_GC_EDITABLE_AFTER_DRAW.includes(k)))return 'Divisions, format and court cannot change after generation.';
  Object.assign(gc,patch,{id:gc.id},patch.name!==undefined?{name:String(patch.name).trim()}:{});
  if(patch.court)state.divisionCourts[id]=gc.court;
  ksmGrandChampionChanged();return null;
}
function ksmToggleGrandChampionSource(id,div,on){
  const gc=ksmGrandChampion(id);if(!gc)return 'This grand champion match no longer exists.';
  const sources=on?(gc.sources.includes(div)?gc.sources:[...gc.sources,div]):gc.sources.filter(s=>s!==div);
  // Sources follow Setup's running order, so the draw does not depend on the clicking order.
  return ksmUpdateGrandChampion(id,{sources:(state.divisions||[]).filter(d=>sources.includes(d)).concat(sources.filter(s=>!(state.divisions||[]).includes(s)))});
}
function ksmMoveGrandChampion(id,direction){
  const rows=ksmGrandChampions(),i=rows.findIndex(r=>r.id===id),j=i+(direction==='up'?-1:1);
  if(i<0||j<0||j>=rows.length||isReadOnlySession())return;
  [rows[i],rows[j]]=[rows[j],rows[i]];rows.forEach((r,index)=>r.order=index);state.grandChampions=rows;ksmGrandChampionChanged();
}
function ksmRemoveGrandChampion(id){
  if(state.generated||isReadOnlySession()||!ksmGrandChampion(id))return false;
  state.grandChampions=ksmGrandChampions().filter(r=>r.id!==id);delete state.divisionCourts[id];
  ksmClearGrandChampionStructure(id);ksmGrandChampionChanged();return true;
}
// ---------------------------------------------------------- the sources
function ksmGrandChampionEntrantOf(div,name){
  const c=(state.competitors||[]).find(c=>c&&c.division===div&&c.name===name);
  if(c)return {name,dojo:c.dojo||''};
  const m=(state.allMatches?.[div]||[]).find(m=>m&&(m.white===name||m.red===name));
  return {name,dojo:m?((m.white===name?m.wdojo:m.rdojo)||''):''};
}
/** A source division's result: complete, its winner and runner-up (Results' placements). */
function ksmGrandChampionSourceResult(div){
  if(!(state.allMatches?.[div]||[]).length||!divisionComplete(div))return {complete:false};
  const p=resultPlacements(div),first=p.find(r=>r.place==='1st'),second=p.find(r=>r.place==='2nd');
  if(!first?.name)return {complete:false};
  return {complete:true,winner:ksmGrandChampionEntrantOf(div,first.name),runnerUp:second?.name?ksmGrandChampionEntrantOf(div,second.name):null};
}
function ksmGrandChampionNow(gc){
  return KSMEngine.grandChampionEntrants(gc,Object.fromEntries(gc.sources.map(s=>[s,ksmGrandChampionSourceResult(s)])));
}
/** The draw's competitors (generateDivisionState(id), 08-): the entrants the sources give now. */
function ksmGrandChampionCompetitors(id){
  const gc=ksmGrandChampion(id);if(!gc)return [];
  return KSMEngine.grandChampionCompetitors(id,ksmGrandChampionNow(gc).entrants.filter(Boolean));
}
function ksmGrandChampionStructure(id){
  return {matches:state.allMatches?.[id],singleElimComps:state.singleElimComps?.[id],pools:state.pools?.[id]};
}
// ---------------------------------------------------------- the draw
const KSM_GC_STRUCTURE_KEYS=['pools','teamPools','allMatches','singleElimNodes','singleElimComps','teamBracketNodes','teamElimTeams','brackets','championshipNodes','byeWinners','currentByDivision'];
function ksmClearGrandChampionStructure(id){
  let had=false;
  KSM_GC_STRUCTURE_KEYS.forEach(k=>{if(state[k]&&Object.hasOwn(state[k],id)){delete state[k][id];had=true}});
  ['A','B'].forEach(c=>{
    if(state.courtState?.[c]?.division!==id)return;
    state.courtState[c]=findNextForCourt(c,null,0);state.courtActiveDivision[c]=state.courtState[c].division;
  });
  if(state.currentDivision===id&&!state.allMatches?.[id]){state.matches=[];state.current=0}
  return had;
}
function ksmDrawGrandChampion(gc){
  ksmClearGrandChampionStructure(gc.id);
  state.divisionCourts[gc.id]=gc.court;
  if(!generateDivisionState(gc.id))return false;
  state.currentByDivision[gc.id]=0;
  if(state.currentDivision===gc.id)state.matches=state.allMatches[gc.id];
  return true;
}
// A withdrawal by Fusen-sho: the entrant's unplayed bouts are recorded as the court's Fusen-sho
// records them (the winner gets F F), then the bracket or pool moves on as after any result.
function ksmApplyGrandChampionWithdrawals(gc,now){
  const withdrawn=now.entrants.filter(e=>e&&e.via==='fusen-sho');if(!withdrawn.length)return false;
  let changed=false;
  for(let guard=0;guard<40;guard++){
    const arr=state.allMatches?.[gc.id]||[],bout=KSMEngine.grandChampionFusenBouts(arr,withdrawn)[0];
    if(!bout)break;
    const m=arr[bout.index];
    m.wp=bout.winner==='W'?['F','F']:[];m.rp=bout.winner==='R'?['F','F']:[];m.wt=0;m.rt=0;
    m.completedResult=completedResultSnapshot(m);m.done=true;changed=true;
    maybeCreateTiebreaks(m);maybeCreateChampionship(m);maybeAdvanceChampionship(m);maybeAdvanceIndividualSingleElim(m);
    enforceUniqueIndividualMatches(gc.id);
  }
  return changed;
}
/** Decisions waiting for the director on this device (row id -> the plan's ask), for Setup. */
const ksmGrandChampionAsks={};
const ksmGrandChampionAsked=new Set();
let ksmGrandChampionSyncing=false;
/**
 * Makes every grand champion's draw follow its sources (see the top of this file). Only on a
 * device that saves, once the tournament is generated. Returns whether `state` changed.
 */
function ksmSyncGrandChampions(source='sync'){
  if(ksmGrandChampionSyncing||!state.generated||!(state.grandChampions||[]).length)return false;
  if(typeof isReadOnlySession==='function'&&isReadOnlySession())return false;
  ksmGrandChampionSyncing=true;let changed=false;
  try{
    for(const gc of ksmGrandChampions()){
      delete ksmGrandChampionAsks[gc.id];
      if(ksmGrandChampionError(gc)){if(ksmClearGrandChampionStructure(gc.id))changed=true;continue}
      const now=ksmGrandChampionNow(gc),plan=KSMEngine.grandChampionPlan(gc,now,ksmGrandChampionStructure(gc.id));
      if(plan.kind==='draw'){if(ksmDrawGrandChampion(gc))changed=true}
      else if(plan.kind==='clear'){if(ksmClearGrandChampionStructure(gc.id))changed=true}
      else if(plan.kind==='ask'){ksmGrandChampionAsks[gc.id]=plan;ksmAskGrandChampion(gc,plan);continue}
      if(state.allMatches?.[gc.id]&&ksmApplyGrandChampionWithdrawals(gc,now))changed=true;
    }
    if(changed){
      writeCloudDiagnosticsState({stage:'Grand champion draw updated',source});
      if(!ksmApplyingRemoteSnapshot)renderAll();
    }
  }finally{ksmGrandChampionSyncing=false}
  return changed;
}
// A save conflict (18-, resolveRebasePatch()): this court's points for players the grand champion no
// longer has (another device drew it again) are not saved; say so once per rebase.
let ksmGrandChampionDropNoted=0;
function ksmNoteGrandChampionPatchDropped(id){
  if(Date.now()-ksmGrandChampionDropNoted<2000)return;
  ksmGrandChampionDropNoted=Date.now();
  // Through window: the rebase is also run outside the page (tests extract it with its dependencies).
  window.writeCloudDiagnosticsState?.({stage:'Grand champion score not saved: players changed on another device',grandChampion:id});
  window.showKsmToast?.(`${ksmGrandChampion(id)?.name||'Grand champion'}: the players changed on another device, so this court's score for the old players was not saved.`,8000,true);
}
// ---------------------------------------------------------- the director's questions (in-page)
// One question at a time, in the cloud modal (kind 'grand-champion', app/react/shell/Dialogs.tsx):
// a message and choice buttons, each calling ksmGrandChampionChoose(choice). Closing it decides
// nothing; Setup's row keeps a "Decide" button while a decision is open.
let ksmGrandChampionQuestion=null;
function ksmGrandChampionDialogOpen(){return !!(typeof ksmShellDialogs==='object'&&ksmShellDialogs?.cloud)}
function ksmShowGrandChampionQuestion(question,title,message,choices){
  ksmGrandChampionQuestion=question;
  ksmOpenCloudModal(title,{kind:'grand-champion',message,choices});
}
function ksmSourceName(div){return ksmDivisionName(div)}
function ksmEntrantsText(entrants){return entrants.filter(Boolean).map(e=>e.name).join(' vs ')}
// A source corrected after the grand champion started.
function ksmAskGrandChampion(gc,plan,force=false){
  const key=gc.id+plan.signature;
  if(!force&&ksmGrandChampionAsked.has(key))return;
  ksmGrandChampionAsked.add(key);
  // A court device is not interrupted while scoring: it is told, the question waits in Setup.
  if(!force&&document.getElementById('score')&&!document.getElementById('score').classList.contains('hidden')){
    showKsmToast(`${gc.name}: a source division changed after it started. The director decides in Setup.`,6000,true);return;
  }
  if(!force&&ksmGrandChampionDialogOpen())return;
  const now=ksmGrandChampionNow(gc),changed=gc.sources.filter((s,i)=>{
    const drawn=KSMEngine.drawnEntrants(ksmGrandChampionStructure(gc.id))||[],e=now.entrants[i];
    return !e||!drawn.some(d=>d.name===e.name&&d.dojo===e.dojo);
  }).map(ksmSourceName);
  const message=`${changed.join(', ')||'A source division'} changed after ${gc.name} started.`
    +(plan.ready?` The players are now ${ksmEntrantsText(now.entrants)}.`:` ${now.waiting.map(ksmSourceName).join(', ')||'A division'} is no longer decided.`);
  ksmShowGrandChampionQuestion({kind:'ask',id:gc.id,signature:plan.signature},`${gc.name}: source changed`,message,[
    {id:'keep',label:'Keep the match as played',primary:true},
    {id:'rebuild',label:plan.ready?`Draw again: ${ksmEntrantsText(now.entrants)} (its results are deleted)`:'Remove the match until the divisions are decided (its results are deleted)'},
  ]);
}
// Setup's "Withdraw…": first who, then how.
function ksmGrandChampionWithdrawChoices(gc){
  const now=ksmGrandChampionNow(gc),arr=state.allMatches?.[gc.id]||[];
  return gc.sources.map((s,i)=>({source:s,entrant:now.entrants[i]})).filter(({entrant})=>{
    if(!entrant||entrant.via==='fusen-sho')return false;
    // Not once one of their bouts has been played or scored.
    return !arr.some(m=>m&&(m.white===entrant.name||m.red===entrant.name)&&KSMEngine.grandChampionStarted([m]));
  });
}
function ksmOpenGrandChampionWithdraw(id){
  const gc=ksmGrandChampion(id);if(!gc||isReadOnlySession())return;
  const now=ksmGrandChampionNow(gc);
  const duplicate=now.duplicates[0];
  if(duplicate)return ksmOpenGrandChampionStandIn(id,duplicate);
  const choices=ksmGrandChampionWithdrawChoices(gc);
  if(!choices.length){showKsmToast('Nobody can withdraw now: every player\'s match has started or is not decided yet.',4000,true);return}
  ksmShowGrandChampionQuestion({kind:'withdraw',id},`${gc.name}: withdraw a player`,'Who withdraws?',
    choices.map(({source,entrant})=>({id:'source:'+source,label:`${entrant.name} (${entrant.via==='runner-up'?'runner-up':'winner'} of ${ksmSourceName(source)})`})));
}
function ksmOpenGrandChampionStandIn(id,source){
  const gc=ksmGrandChampion(id);if(!gc)return;
  const result=ksmGrandChampionSourceResult(source),now=ksmGrandChampionNow(gc),i=gc.sources.indexOf(source),entrant=now.entrants[i];
  if(!result.complete||!entrant)return;
  const duplicate=now.duplicates.includes(source);
  const choices=[];
  if(result.runnerUp&&entrant.via!=='runner-up')choices.push({id:'runner-up',label:`${result.runnerUp.name} plays instead (runner-up of ${ksmSourceName(source)})`,primary:true});
  if(!duplicate)choices.push({id:'fusen-sho',label:`Fusen-sho: ${entrant.name}'s ${KSMEngine.grandChampionFormat(gc)==='Round Robin'?'bouts are':'match is'} lost by default`});
  choices.push({id:'cancel',label:'Cancel'});
  const message=duplicate
    ?`${entrant.name} won ${ksmSourceName(source)} and an earlier division. Who plays for ${ksmSourceName(source)}?`
    :`${entrant.name} withdraws from ${gc.name}. This cannot be undone once the match is decided.`;
  ksmShowGrandChampionQuestion({kind:'stand-in',id,source,winner:result.winner.name},`${gc.name}: ${ksmSourceName(source)}`,message,choices);
}
function ksmGrandChampionChoose(choice){
  const q=ksmGrandChampionQuestion;ksmGrandChampionQuestion=null;ksmCloseCloudModal();
  const gc=q&&ksmGrandChampion(q.id);if(!gc||isReadOnlySession())return;
  if(q.kind==='withdraw'&&String(choice).startsWith('source:'))return ksmOpenGrandChampionStandIn(gc.id,String(choice).slice(7));
  if(q.kind==='stand-in'&&(choice==='runner-up'||choice==='fusen-sho')){
    gc.standIns={...(gc.standIns||{}),[q.source]:{winner:q.winner,kind:choice}};
  }else if(q.kind==='ask'&&(choice==='keep'||choice==='rebuild')){
    if(choice==='keep')gc.keep=q.signature;else gc.rebuild=q.signature;
  }else return;
  ksmSyncGrandChampions('director decision');
  ksmGrandChampionChanged('Grand champion decision');
}
// Setup's "Decide…" for an open question.
function ksmDecideGrandChampion(id){
  const gc=ksmGrandChampion(id),plan=ksmGrandChampionAsks[id];
  if(gc&&plan)ksmAskGrandChampion(gc,plan,true);
}
// ---------------------------------------------------------- Setup's island (React)
function ksmGrandChampionRowData(gc,i,rows){
  const error=ksmGrandChampionError(gc),now=ksmGrandChampionNow(gc),arr=state.allMatches?.[gc.id]||[];
  const drawn=arr.length>0,complete=drawn&&divisionComplete(gc.id),placements=complete?resultPlacements(gc.id):[];
  return {
    id:gc.id,name:gc.name,sources:[...gc.sources],format:gc.format,court:gc.court,awardMode:gc.awardMode,
    move:{up:i>0,down:i<rows.length-1},
    error,
    waiting:now.waiting.map(ksmSourceName),
    duplicates:now.duplicates.map(ksmSourceName),
    entrants:now.entrants.map((e,j)=>e?{name:e.name,via:e.via,source:ksmSourceName(gc.sources[j])}:null),
    drawn,started:drawn&&KSMEngine.grandChampionStarted(arr),complete,
    champion:placements[0]?.name||null,
    decide:!!ksmGrandChampionAsks[gc.id],
    canWithdraw:!!state.generated&&!complete&&(now.duplicates.length>0||ksmGrandChampionWithdrawChoices(gc).length>0),
  };
}
function ksmGrandChampionSetupData(){
  const rows=ksmGrandChampions();
  return {
    locked:!!state.generated,readOnly:isReadOnlySession(),
    divisions:(state.divisions||[]).map(d=>({key:String(d),name:String(d)})),
    rows:rows.map((gc,i)=>ksmGrandChampionRowData(gc,i,rows)),
  };
}
function ksmRenderGrandChampionSetup(){
  if(typeof ksmPublishSetup==='function')ksmPublishSetup('ksm:setup-grand-champions','ksmGrandChampionSetupInput',ksmGrandChampionSetupData());
}
/* ksm:post-split-end */
