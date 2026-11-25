// @ts-check
import {selectAllMatches,selectCompetitors,selectCourtActiveDivision,selectCourtState,selectCurrentDivision,selectDivisions,selectGenerated,selectGrandChampions,selectPools,selectScore,selectSingleElimComps,selectSingleElimNodes,selectTeamDivisions,selectTournamentField} from '../selectors.js';
import {getState,holdNotifications} from '../../store/index.ts';
import {ksmEmptyScore,ksmSetScore,ksmShowMatch,ksmClearHistory} from '../app-state.js';
import {ksmSetDivisionCourt} from '../setup/divisions-store.js';
import {renderAll} from '../court/court-context-and-pool-editing.js';
import {findNextForCourt,renderDivisions} from '../court/court-match-order.js';
import {ksmSetCourtHistories} from '../court/court-history-store.js';
import {ksmResolveCourts} from '../court/court-pointers-store.js';
import {ksmDeleteDivisionMatches,ksmUpdateMatch,ksmUpdateMatches} from '../court/match-writes.js';
import {enforceUniqueIndividualMatches,maybeAdvanceChampionship,maybeCreateChampionship} from '../engine/engine-championship.js';
import {generateDivisionState} from '../engine/engine-generation.js';
import {KSM_DRAW_KEYS,ksmDrawWith,ksmEditedPools,ksmSetDraw} from '../engine/structure-store.js';
import {completedResultSnapshot} from '../engine/engine-result-integrity.js';
import {maybeAdvanceIndividualSingleElim} from '../engine/engine-single-elim.js';
import {maybeCreateTiebreaks} from '../engine/engine-standings-and-tiebreaks.js';
import {scheduleAutoSave} from '../sync/cloud-session-and-autosave.js';
import {ksmPublishSetup} from '../react-bridges/setup.js';
import {ksmCloseCloudModal,ksmCloudModalOpen,ksmOpenCloudModal} from '../react-bridges/shell.js';
import {ksmDivisionName} from './team-divisions.js';
import {renderTournamentStatus} from './validation.js';
import {divisionComplete} from '../results/results-and-awards.js';
import {ksmSetGrandChampions} from '../results/awards-store.js';
import {resultPlacements} from '../results/results-screen.js';
import {isReadOnlySession} from '../session/staff-session-and-library.js';
import {renderDivisionSetup} from '../setup/division-setup.js';
import {writeCloudDiagnosticsState} from '../sync/cloud-diagnostics.js';
import {ksmApplyingRemoteSnapshot,showKsmToast} from '../sync/cloud-realtime-save-and-load.js';
import * as KSMEngine from '../../engine/index.ts';
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
export function ksmGrandChampions(){return KSMEngine.sortGrandChampions(selectGrandChampions(getState())||[])}
export function ksmGrandChampion(id){return KSMEngine.isGrandChampionId(id)?(selectGrandChampions(getState())||[]).find(g=>g.id===id)||null:null}
export function ksmGrandChampionError(gc){return KSMEngine.grandChampionSetupError(gc,selectDivisions(getState())||[],(selectTeamDivisions(getState())||[]).map(d=>d.id))}
function ksmGrandChampionChanged(reason='Grand champion'){
  renderDivisionSetup();renderDivisions();renderTournamentStatus();scheduleAutoSave(reason);
}
// ---------------------------------------------------------- Setup rows
// Like team divisions: a grand champion match is fixed once it is drawn (divisions, format, court,
// removal); one not drawn yet can be added, changed and removed after generation, and fills in when its
// divisions finish.
function ksmGrandChampionDrawn(id){return (selectAllMatches(getState())?.[id]||[]).length>0}
export function ksmAddGrandChampion(){
  if(isReadOnlySession())return null;
  const rows=ksmGrandChampions(),gc=KSMEngine.newGrandChampion(ksmNewGrandChampionId(),Math.max(-1,...rows.map(r=>r.order))+1);
  ksmSetGrandChampions('grandChampionAdded',[...rows,gc]);ksmSetDivisionCourt(gc.id,gc.court);
  ksmGrandChampionChanged();return gc.id;
}
const KSM_GC_EDITABLE_AFTER_DRAW=['name','awardMode'];
/**
 * The row `gc` with `changes` assigned (a key it lacks is added at its end, as the assignment did), in its place in the
 * list, as one tournament/grandChampionUpdated: a row is store data, never edited in place. Returns the new row.
 */
function ksmReplaceGrandChampion(gc,changes){
  const next={...gc,...changes};
  ksmSetGrandChampions('grandChampionUpdated',(selectGrandChampions(getState())||[]).map(r=>r===gc?next:r));
  return next;
}
/** Changes fields of a row; why not (nothing changed), or null. */
export function ksmUpdateGrandChampion(id,patch){
  const gc=ksmGrandChampion(id);if(!gc)return 'This grand champion match no longer exists.';
  if(isReadOnlySession())return 'Read only';
  if(patch.name!==undefined&&!String(patch.name).trim())return 'Enter a name for the grand champion match.';
  if(ksmGrandChampionDrawn(id)&&Object.keys(patch).some(k=>!KSM_GC_EDITABLE_AFTER_DRAW.includes(k)))return 'Divisions, format and court cannot change once this match is drawn.';
  const next=ksmReplaceGrandChampion(gc,{...patch,id:gc.id,...(patch.name!==undefined?{name:String(patch.name).trim()}:{})});
  if(patch.court)ksmSetDivisionCourt(id,next.court);
  ksmGrandChampionChanged();return null;
}
export function ksmToggleGrandChampionSource(id,div,on){
  const gc=ksmGrandChampion(id);if(!gc)return 'This grand champion match no longer exists.';
  if(!on)return ksmUpdateGrandChampion(id,{sources:gc.sources.filter(s=>s!==div)});
  if(gc.sources.includes(div))return null;
  // The sources are the bracket order (1st plays 2nd, ...). A new one goes in at its place in Setup's running
  // order (before the first source that runs after it), so the director's reordering of the others stays.
  const run=selectDivisions(getState())||[],at=run.indexOf(div),sources=[...gc.sources];
  const before=at<0?-1:sources.findIndex(s=>run.indexOf(s)>at);
  sources.splice(before<0?sources.length:before,0,div);
  return ksmUpdateGrandChampion(id,{sources});
}
// Setup's bracket: two divisions trade places (bracket slots), until the match is drawn.
export function ksmSwapGrandChampionSources(id,a,b){
  const gc=ksmGrandChampion(id);if(!gc)return 'This grand champion match no longer exists.';
  const i=gc.sources.indexOf(a),j=gc.sources.indexOf(b);
  if(i<0||j<0||i===j)return null;
  const sources=[...gc.sources];[sources[i],sources[j]]=[sources[j],sources[i]];
  return ksmUpdateGrandChampion(id,{sources});
}
export function ksmMoveGrandChampion(id,direction){
  const rows=ksmGrandChampions(),i=rows.findIndex(r=>r.id===id),j=i+(direction==='up'?-1:1);
  if(i<0||j<0||j>=rows.length||isReadOnlySession())return;
  [rows[i],rows[j]]=[rows[j],rows[i]];ksmSetGrandChampions('grandChampionMoved',rows.map((r,index)=>({...r,order:index})));ksmGrandChampionChanged();
}
export function ksmRemoveGrandChampion(id){
  if(ksmGrandChampionDrawn(id)||isReadOnlySession()||!ksmGrandChampion(id))return false;
  ksmSetGrandChampions('grandChampionRemoved',ksmGrandChampions().filter(r=>r.id!==id));ksmSetDivisionCourt(id,null);
  ksmClearGrandChampionStructure(id);ksmGrandChampionChanged();return true;
}
// ---------------------------------------------------------- the sources
function ksmGrandChampionEntrantOf(div,name){
  const c=(selectCompetitors(getState())||[]).find(c=>c&&c.division===div&&c.name===name);
  if(c)return {name,dojo:c.dojo||''};
  const m=(selectAllMatches(getState())?.[div]||[]).find(m=>m&&(m.white===name||m.red===name));
  return {name,dojo:m?((m.white===name?m.wdojo:m.rdojo)||''):''};
}
/** A source division's result: complete, its winner and runner-up (Results' placements). */
function ksmGrandChampionSourceResult(div){
  if(!(selectAllMatches(getState())?.[div]||[]).length||!divisionComplete(div))return {complete:false};
  const p=resultPlacements(div),first=p.find(r=>r.place==='1st'),second=p.find(r=>r.place==='2nd');
  if(!first?.name)return {complete:false};
  return {complete:true,winner:ksmGrandChampionEntrantOf(div,first.name),runnerUp:second?.name?ksmGrandChampionEntrantOf(div,second.name):null};
}
function ksmGrandChampionNow(gc){
  return KSMEngine.grandChampionEntrants(gc,Object.fromEntries(gc.sources.map(s=>[s,ksmGrandChampionSourceResult(s)])));
}
/** The draw's competitors (generateDivisionState(id), 08-): the entrants the sources give now. */
export function ksmGrandChampionCompetitors(id){
  const gc=ksmGrandChampion(id);if(!gc)return [];
  return KSMEngine.grandChampionCompetitors(id,ksmGrandChampionNow(gc).entrants.filter(Boolean));
}
function ksmGrandChampionStructure(id){
  let matches=selectAllMatches(getState())?.[id];
  // Points on this court's screen for the grand champion count as started, also before they reach the match.
  const live=selectCurrentDivision(getState())===id&&selectScore(getState())&&((selectScore(getState()).W||[]).length||(selectScore(getState()).R||[]).length||selectScore(getState()).WT||selectScore(getState()).RT);
  if(live&&Array.isArray(matches))matches=[...matches,/** @type {any} */({done:false,wp:selectScore(getState()).W||[],rp:selectScore(getState()).R||[],wt:selectScore(getState()).WT,rt:selectScore(getState()).RT})];
  return {matches,singleElimComps:selectSingleElimComps(getState())?.[id],pools:selectPools(getState())?.[id]};
}
// ---------------------------------------------------------- the draw
const KSM_GC_STRUCTURE_KEYS=['pools','teamPools','allMatches','singleElimNodes','singleElimComps','teamBracketNodes','teamElimTeams','brackets','championshipNodes','byeWinners','currentByDivision'];
// Undo / Redo of a score for a draw that no longer exists must not land on its replacement (the
// bracket match keeps its identity whoever plays it): those parts of the courts' history go too.
// The history is store data (#15 PR 13b): the lists that change go in one court/historyForgotten (none when none does).
function ksmForgetGrandChampionHistory(id){
  /** @type {any} */ const out={};
  ['courtActionHistory','courtRedoHistory'].forEach(key=>['A','B'].forEach(c=>{
    const stack=selectTournamentField(getState(),/** @type {any} */(key))?.[c];if(!Array.isArray(stack))return;
    const next=stack.map(a=>a&&Array.isArray(a.patches)&&(a.patches.some(p=>p?.path?.[0]==='allMatches'&&p.path[1]===id)||a.matchOps?.[id])
      ?{...a,patches:a.patches.filter(p=>!(p?.path?.[0]==='allMatches'&&p.path[1]===id)),...(a.matchOps?.[id]?{matchOps:Object.fromEntries(Object.entries(a.matchOps).filter(([d])=>d!==id))}:{})}:a)
      .filter(a=>!a||!Array.isArray(a.patches)||a.patches.length||Object.keys(a.matchOps||{}).length);
    if(next.length!==stack.length||next.some((a,i)=>a!==stack[i]))(out[key]||={...selectTournamentField(getState(),/** @type {any} */(key))})[c]=next;
  }));
  ksmSetCourtHistories('historyForgotten',out);
}
function ksmClearGrandChampionStructure(id,keepCourts=false){return holdNotifications(()=>{
  // One notification (#15 PR 13c-2): the bouts' delete is its own dispatch, before the draw's tournament/divisionCleared.
  let had=false;
  // The plain parts are deleted, then the draw's own entries go in one tournament/divisionCleared (#15 PR 12a).
  // (`currentByDivision`, the court pointers' map since #15 PR 13a, goes with the draw's entries.)
  KSM_GC_STRUCTURE_KEYS.forEach(k=>{if(selectTournamentField(getState(),/** @type {any} */(k))&&Object.hasOwn(selectTournamentField(getState(),/** @type {any} */(k)),id)){if(k==='allMatches')ksmDeleteDivisionMatches(id);had=true}});
  // A court on the draw is re-resolved in the same tournament/divisionCleared (#15 PR 13b, #201 review L2): no store
  // notification shows it on the deleted list. Its next bout is found on the lists without this draw (allMatches, deleted
  // above), as the court/pointersResolved after the clear found it; a draw already gone keeps that separate action.
  const draw=ksmDrawWith(id,{},[...KSM_DRAW_KEYS,'currentByDivision']),courts=keepCourts?[]:['A','B'].filter(c=>selectCourtState(getState())?.[c]?.division===id);
  if(courts.length&&Object.keys(draw).length){
    const courtState={...selectCourtState(getState())},courtActiveDivision={...selectCourtActiveDivision(getState())};
    for(const c of courts){const cs=findNextForCourt(c,null,0);courtState[c]=cs;courtActiveDivision[c]=cs.division}
    Object.assign(draw,{courtState,courtActiveDivision});courts.length=0;
  }
  ksmSetDraw('divisionCleared',draw);
  if(had)ksmForgetGrandChampionHistory(id);
  if(courts.length)ksmResolveCourts(courts,c=>findNextForCourt(c,null,0));
  if(selectCurrentDivision(getState())===id&&had){ksmSetScore(ksmEmptyScore());ksmClearHistory()}
  // state.matches follows allMatches[currentDivision] (derived, #15 PR 7): [] once the draw is gone.
  if(selectCurrentDivision(getState())===id&&!selectAllMatches(getState())?.[id])ksmShowMatch(0);
  return had;
})}
function ksmDrawGrandChampion(gc){
  const courts=['A','B'].filter(c=>selectCourtState(getState())?.[c]?.division===gc.id);
  ksmClearGrandChampionStructure(gc.id,true);
  ksmSetDivisionCourt(gc.id,gc.court);
  const drawn=generateDivisionState(gc.id);// its queue position starts at 0 with its draw (#15 PR 13a)
  // A court that was on the grand champion stays on it (its new first match); none moves elsewhere.
  ksmResolveCourts(courts,c=>findNextForCourt(c,drawn?gc.id:null,0));
  if(selectCurrentDivision(getState())===gc.id)ksmShowMatch(0);
  return drawn;
}
// A runner-up standing in for a winner who has played nothing yet, in a draw already under way:
// the runner-up takes the winner's place (slot, bouts) and nothing played is touched.
function ksmSubstituteGrandChampion(gc,swaps){
  const same=(name,dojo,e)=>name===e.name&&(dojo||'')===(e.dojo||'');
  // The unplayed bouts' names in one write (#15 PR 13c-1: match-writes.js), each bout's keys in the old order.
  /** @type {import('../court/match-writes.js').MatchUpdate[]} */ const updates=[];
  const swap=(o,set,nameKey,dojoKey)=>{const s=o&&swaps.find(x=>same(o[nameKey],o[dojoKey],x.from));if(s){set[nameKey]=s.to.name;set[dojoKey]=s.to.dojo}};
  (selectAllMatches(getState())?.[gc.id]||[]).forEach((m,index)=>{if(m&&!KSMEngine.grandChampionStarted([m])){const set={};swap(m,set,'white','wdojo');swap(m,set,'red','rdojo');if(Object.keys(set).length)updates.push({index,set})}});
  ksmUpdateMatches(gc.id,updates);
  // The draw's rows are store data (#15 PR 12a): the stand-in is a new row in the entrants and the pools. A bracket node
  // whose winner is the entrant's row itself follows to the new row, as the old in-place swap reached it; the nodes are
  // store data too (PR 12b): new nodes, in the same action.
  /** @type {Map<object,object>} */ const replaced=new Map();
  const swapped=o=>{if(replaced.has(o))return replaced.get(o);const s=o&&swaps.find(x=>same(o.name,o.dojo,x.from));if(!s)return o;const to={...o,name:s.to.name,dojo:s.to.dojo};replaced.set(o,to);return to};
  const comps=selectSingleElimComps(getState())?.[gc.id],nextComps=Array.isArray(comps)?comps.map(swapped):null;
  const pools=ksmEditedPools(gc.id,p=>{const players=(p.players||[]).map(swapped);return players.some((x,i)=>x!==p.players[i])?{...p,players}:p});
  const nodes=selectSingleElimNodes(getState())?.[gc.id]||[],nextNodes=nodes.map(n=>{const to=n&&replaced.get(n.winner);return to?{...n,winner:to}:n});
  ksmSetDraw('drawEntriesUpdated',{...(nextComps&&nextComps.some((c,i)=>c!==comps[i])?ksmDrawWith(gc.id,{singleElimComps:nextComps}):{}),...pools,
    ...(nextNodes.some((n,i)=>n!==nodes[i])?ksmDrawWith(gc.id,{singleElimNodes:nextNodes}):{})});
  ksmForgetGrandChampionHistory(gc.id);
  return true;
}
// A withdrawal by Fusen-sho: the entrant's unplayed bouts are recorded as the court's Fusen-sho
// records them (the winner gets F F), then the bracket or pool moves on as after any result.
function ksmApplyGrandChampionWithdrawals(gc,now){
  const withdrawn=now.entrants.filter(e=>e&&e.via==='fusen-sho');if(!withdrawn.length)return false;
  let changed=false;
  for(let guard=0;guard<40;guard++){
    const arr=selectAllMatches(getState())?.[gc.id]||[],bout=KSMEngine.grandChampionFusenBouts(arr,withdrawn)[0];
    if(!bout)break;
    // The bout's result in one write (#15 PR 13c-1), as Next Match writes it: the snapshot taken before `done`.
    const result={wp:bout.winner==='W'?['F','F']:[],rp:bout.winner==='R'?['F','F']:[],wt:0,rt:0};
    const m=/** @type {Match} */(ksmUpdateMatch(gc.id,bout.index,{...result,completedResult:completedResultSnapshot(/** @type {Match} */({...arr[bout.index],...result})),done:true}));changed=true;
    maybeCreateTiebreaks(m);maybeCreateChampionship(m);maybeAdvanceChampionship(m);maybeAdvanceIndividualSingleElim(m);
    enforceUniqueIndividualMatches(gc.id);
  }
  return changed;
}
/** Decisions waiting for the director on this device (row id -> the plan's ask), for Setup. */
const ksmGrandChampionAsks={};
const ksmGrandChampionAsked=new Set(),ksmGrandChampionToldAt=new Set();
let ksmGrandChampionSyncing=false;
/**
 * Makes every grand champion's draw follow its sources (see the top of this file). Only on a
 * device that saves, once the tournament is generated. Returns whether `state` changed.
 */
export function ksmSyncGrandChampions(source='sync'){
  if(ksmGrandChampionSyncing||!selectGenerated(getState())||!(selectGrandChampions(getState())||[]).length)return false;
  if(typeof isReadOnlySession==='function'&&isReadOnlySession())return false;
  ksmGrandChampionSyncing=true;let changed=false;
  try{
    for(const gc of ksmGrandChampions()){
      delete ksmGrandChampionAsks[gc.id];
      // A row that can no longer be drawn (a source switched off after generation) loses an unplayed
      // draw; a started one is kept as played (never deleted without the director).
      if(ksmGrandChampionError(gc)){if(!KSMEngine.grandChampionStarted(selectAllMatches(getState())?.[gc.id])&&ksmClearGrandChampionStructure(gc.id))changed=true;continue}
      const now=ksmGrandChampionNow(gc),swaps=KSMEngine.grandChampionSubstitutions(now,ksmGrandChampionStructure(gc.id));
      if(swaps&&ksmSubstituteGrandChampion(gc,swaps))changed=true;
      const plan=KSMEngine.grandChampionPlan(gc,now,ksmGrandChampionStructure(gc.id));
      if(plan.kind==='draw'){if(ksmDrawGrandChampion(gc))changed=true}
      else if(plan.kind==='clear'){if(ksmClearGrandChampionStructure(gc.id))changed=true}
      else if(plan.kind==='ask'){ksmGrandChampionAsks[gc.id]=plan;ksmAskGrandChampion(gc,plan);continue}
      if(selectAllMatches(getState())?.[gc.id]&&ksmApplyGrandChampionWithdrawals(gc,now))changed=true;
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
export function ksmNoteGrandChampionPatchDropped(id){
  if(Date.now()-ksmGrandChampionDropNoted<2000)return;
  ksmGrandChampionDropNoted=Date.now();
  // Through window: the rebase is also run outside the page (tests extract it with its dependencies).
  window.writeCloudDiagnosticsState?.({stage:'Grand champion score not saved: players changed on another device',grandChampion:id});
  window.showKsmToast?.(`${ksmGrandChampion(id)?.name||'Grand champion'}: the players changed on another device, so this court's score for the old players was not saved.`,8000,true);
}
// A save conflict (18-, rebaseLocalPayloadOnRecord()): the server copy has no draw for a grand
// champion this device has drawn (it finished the last source, or scored the match, offline or
// meanwhile). The draw comes along so this court's scores replay onto it; afterwards the sync
// compares it with the merged sources (kept as is, or the director is asked once it started).
export function ksmCarryGrandChampionDraws(rebasedState,localState){
  Object.keys(localState?.allMatches||{}).filter(id=>KSMEngine.isGrandChampionId(id)&&(localState.allMatches[id]||[]).length).forEach(id=>{
    if((rebasedState.allMatches?.[id]||[]).length)return;
    if(!(rebasedState.grandChampions||[]).some(g=>g.id===id))return;
    KSM_GC_STRUCTURE_KEYS.forEach(k=>{const v=localState[k]?.[id];if(v===undefined)return;rebasedState[k]=rebasedState[k]||{};rebasedState[k][id]=JSON.parse(JSON.stringify(v))});
  });
}
// Both copies hold a draw of the same players (a bout or tiebreak added here then comes along).
export function ksmSameGrandChampionDraw(localState,rebasedState,id){
  const players=st=>{const d=KSMEngine.drawnEntrants({matches:st?.allMatches?.[id],singleElimComps:st?.singleElimComps?.[id],pools:st?.pools?.[id]});return d?JSON.stringify(d.map(e=>e.name+'|'+e.dojo).sort()):null};
  const mine=players(localState);return !!mine&&mine===players(rebasedState);
}
// ---------------------------------------------------------- the director's questions (in-page)
// One question at a time, in the cloud modal (kind 'grand-champion', app/react/shell/Dialogs.tsx):
// a message and choice buttons, each calling ksmGrandChampionChoose(choice). Closing it decides
// nothing; Setup's row keeps a "Decide" button while a decision is open.
let ksmGrandChampionQuestion=null;
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
  // Asked only where the director decides (Setup on screen), so no two devices answer it; every
  // other saving device (courts, Results, …) is told once and the question waits in Setup.
  if(!force&&document.getElementById('setup')?.classList.contains('hidden')!==false){
    if(!ksmGrandChampionToldAt.has(key)){ksmGrandChampionToldAt.add(key);showKsmToast(`${gc.name}: a source division changed after it started. The director decides in Setup.`,6000,true)}
    return;
  }
  // Another question is open: this one is asked at the next change (Setup's Decide… meanwhile).
  if(!force&&ksmCloudModalOpen())return;
  ksmGrandChampionAsked.add(key);
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
  const now=ksmGrandChampionNow(gc),arr=selectAllMatches(getState())?.[gc.id]||[];
  return gc.sources.map((s,i)=>({source:s,entrant:now.entrants[i]})).filter(({entrant})=>{
    // A runner-up already standing in who cannot play either loses at the court (its Fusen-sho).
    if(!entrant||entrant.via!=='winner')return false;
    // Not once one of their bouts has been played or scored.
    return !arr.some(m=>m&&(m.white===entrant.name||m.red===entrant.name)&&KSMEngine.grandChampionStarted([m]));
  });
}
export function ksmOpenGrandChampionWithdraw(id){
  const gc=ksmGrandChampion(id);if(!gc||isReadOnlySession())return;
  const now=ksmGrandChampionNow(gc);
  const duplicate=now.unavailable[0]||now.duplicates[0];
  if(duplicate)return ksmOpenGrandChampionStandIn(id,duplicate);
  const choices=ksmGrandChampionWithdrawChoices(gc);
  if(!choices.length){showKsmToast('Nobody can withdraw now: every player\'s match has started or is not decided yet.',4000,true);return}
  ksmShowGrandChampionQuestion({kind:'withdraw',id},`${gc.name}: withdraw a player`,'Who withdraws?',
    choices.map(({source,entrant})=>({id:'source:'+source,label:`${entrant.name} (${entrant.via==='runner-up'?'runner-up':'winner'} of ${ksmSourceName(source)})`})));
}
function ksmOpenGrandChampionStandIn(id,source){
  const gc=ksmGrandChampion(id);if(!gc)return;
  const result=ksmGrandChampionSourceResult(source),now=ksmGrandChampionNow(gc),i=gc.sources.indexOf(source);
  // A stand-in whose runner-up is not there: the winner's place is chosen again (Fusen-sho).
  const entrant=now.entrants[i]||(now.unavailable.includes(source)&&result.winner?{...result.winner,source,via:'winner'}:null);
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
export function ksmGrandChampionChoose(choice){
  const q=ksmGrandChampionQuestion;ksmGrandChampionQuestion=null;ksmCloseCloudModal();
  const gc=q&&ksmGrandChampion(q.id);if(!gc||isReadOnlySession())return;
  if(q.kind==='withdraw'&&String(choice).startsWith('source:'))return ksmOpenGrandChampionStandIn(gc.id,String(choice).slice(7));
  if(q.kind==='stand-in'&&(choice==='runner-up'||choice==='fusen-sho')){
    ksmReplaceGrandChampion(gc,{standIns:{...(gc.standIns||{}),[q.source]:{winner:q.winner,kind:choice}}});
  }else if(q.kind==='ask'&&(choice==='keep'||choice==='rebuild')){
    ksmReplaceGrandChampion(gc,choice==='keep'?{keep:q.signature}:{rebuild:q.signature});
  }else return;
  ksmSyncGrandChampions('director decision');
  ksmGrandChampionChanged('Grand champion decision');
}
// Setup's "Decide…" for an open question.
export function ksmDecideGrandChampion(id){
  const gc=ksmGrandChampion(id),plan=ksmGrandChampionAsks[id];
  if(gc&&plan)ksmAskGrandChampion(gc,plan,true);
}
// ---------------------------------------------------------- Setup's island (React)
function ksmGrandChampionRowData(gc,i,rows){
  const error=ksmGrandChampionError(gc),now=ksmGrandChampionNow(gc),arr=selectAllMatches(getState())?.[gc.id]||[];
  const drawn=arr.length>0,complete=drawn&&divisionComplete(gc.id),placements=complete?resultPlacements(gc.id):[];
  return {
    id:gc.id,name:gc.name,sources:[...gc.sources],format:gc.format,court:gc.court,awardMode:gc.awardMode,
    move:{up:i>0,down:i<rows.length-1},
    error,
    waiting:now.waiting.map(ksmSourceName),
    duplicates:now.duplicates.map(ksmSourceName),
    unavailable:now.unavailable.map(ksmSourceName),
    entrants:now.entrants.map((e,j)=>e?{name:e.name,via:e.via,source:ksmSourceName(gc.sources[j])}:null),
    drawn,started:drawn&&KSMEngine.grandChampionStarted(arr),complete,
    champion:placements[0]?.name||null,
    decide:!!ksmGrandChampionAsks[gc.id],
    canWithdraw:!!selectGenerated(getState())&&!complete&&(now.duplicates.length>0||now.unavailable.length>0||ksmGrandChampionWithdrawChoices(gc).length>0),
  };
}
function ksmGrandChampionSetupData(){
  const rows=ksmGrandChampions();
  return {
    locked:rows.some(gc=>ksmGrandChampionDrawn(gc.id)),readOnly:isReadOnlySession(),
    divisions:(selectDivisions(getState())||[]).map(d=>({key:String(d),name:String(d)})),
    rows:rows.map((gc,i)=>ksmGrandChampionRowData(gc,i,rows)),
  };
}
export function ksmRenderGrandChampionSetup(){
  if(typeof ksmPublishSetup==='function')ksmPublishSetup('ksm:setup-grand-champions','ksmGrandChampionSetupInput',ksmGrandChampionSetupData());
}
