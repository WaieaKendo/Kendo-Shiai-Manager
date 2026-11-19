// Generation, the no-show rebuilds, the court helpers and the Pools view entry (step 4a of #136; was app/js/08-engine-generation.js).
import {ksmSetPoolViewDivision,ksmShowDivision,ksmShowMatch,state} from '../app-state.js';
import {ksmSetDivisionCourt} from '../setup/divisions-store.js';
import {holdNotifications} from '../../store/index.ts';
import {renderAll} from '../court/court-context-and-pool-editing.js';
import {individualMatchReady,initCourtStates,isCourtScorekeeper,isTeamMatch,renderDivisions,sortIndividualDivisionMatches,setCourtPointer,sortTeamMatches} from '../court/court-match-order.js';
import {loadScoreFromMatch} from '../court/court-scoring-and-history.js';
import {ksmDeleteDivisionMatches,ksmSetAllMatches,ksmSetDivisionMatches} from '../court/match-writes.js';
import {renderScore} from '../court/scorekeeper-screen.js';
import {renderContext,syncIndividualSingleElim} from '../court/split-court-templates.js';
import {syncChampionshipTemplate} from './engine-championship.js';
import {buildPoolMatches} from './engine-pools.js';
import {buildIndividualSingleElimMatches} from './engine-single-elim.js';
import {teamBracketNodesForCount} from './engine-team-bracket.js';
import {syncTeamBracket} from './engine-team-matches.js';
import {criticalAutoSave,scheduleAutoSave} from '../sync/cloud-session-and-autosave.js';
import {regTab,renderProgress,show} from '../navigation.js';
import {ksmRenderPools} from '../react-bridges/pools.js';
import {ksmRegenerateDone} from '../react-bridges/shell.js';
import {ksmGrandChampion,ksmGrandChampionCompetitors} from '../registration/grand-champion.js';
import {closeManagementModal,divisionRegenerationStatus,structuralNoShowAllowed} from '../registration/registration.js';
import {ksmTeamDivision,ksmTeamDivisions,ksmTeamSettings} from '../registration/team-divisions.js';
import {requestTournamentGeneration,showValidationDialog,validateTournament} from '../registration/validation.js';
import {renderResultsDashboard} from '../results/results-screen.js';
import {isReadOnlySession} from '../session/staff-session-and-library.js';
import {tournamentSettings} from '../sync/cloud-session-and-autosave.js';
import {rememberLocalCourtDivision} from '../sync/sync-state-and-rebase.js';
import {ksmMarkRegenerateSave} from '../sync/undo-regenerate.js';
import {KSM_DRAW_KEYS,ksmDrawWith,ksmEditedPools,ksmNextManagementRevision,ksmSetDraw} from './structure-store.js';
import * as KSMEngine from '../../engine/index.ts';
/**
 * One division drawn from the engine's plan (KSMEngine.generateDivision()): its matches (`allMatches`, through
 * app/modules/court/match-writes.js since #15 PR 13c-1) are
 * written first, then its pools, team pools, template, entrants, bracket nodes and queue position (`currentByDivision`)
 * (with the winners the bracket's first sync gave them, on the plan's own lists) in one tournament/… action (`how.type`,
 * default divisionGenerated), so no store notification shows the division half drawn; the steps that read the new draw
 * from the store (the championship template's seeds, the division court) follow. `how.fresh`: the division's old entries are removed in the same action (Regenerate Single
 * Division); `how.lists`: more of the slice set with it when the division was drawn (the regenerate's managementRevision).
 * @param {string} div
 * @param {{type?:import('./structure-store.js').DrawAction,fresh?:boolean,lists?:import('./structure-store.js').DrawLists}} [how]
 */
export function generateDivisionState(div,how={}){return holdNotifications(()=>{
  // One notification for the division's bouts and its draw (#15 PR 13c-2: the bouts are their own dispatches before it).
  const settings=ksmTeamSettings(div);
  const plan=KSMEngine.generateDivision({division:div,teamDivisionId:ksmTeamDivision(div)?.id,competitors:ksmGrandChampion(div)?ksmGrandChampionCompetitors(div):state.competitors,teams:state.teams,exhibitions:state.exhibitions,divisionType:ksmGrandChampion(div)?KSMEngine.grandChampionFormat(ksmGrandChampion(div)):state.divisionTypes[div],courtMode:state.divisionCourts[div],settings,bracketNodesForCount:teamBracketNodesForCount});
  if(!plan)return false;
  // The division's queue position (currentByDivision, #15 PR 13a) starts at 0 with its draw, in the same action.
  const draw=(/** @type {Record<string,unknown>} */ entries,drawn=true)=>ksmSetDraw(how.type||'divisionGenerated',{...ksmDrawWith(div,{...entries,currentByDivision:0},how.fresh?[...KSM_DRAW_KEYS,'currentByDivision']:[]),...(drawn?how.lists:{})});
  if(plan.kind==='team'){
    const m=/** @type {Match[]} */(plan.matches),draft={teamBracketNodes:plan.teamBracketNodes||undefined};
    // A bracket's sync puts the list in place (sorted, with its first bouts); a round robin's list is put as it is.
    if(plan.teamBracketNodes)syncTeamBracket(div,m,plan.teamElimTeams,draft);else ksmSetDivisionMatches(div,m);
    // A team round robin's pools are its team pools (one list; KSMEngine.generateDivision()).
    draw({teamElimTeams:plan.teamElimTeams,...(draft.teamBracketNodes?{teamBracketNodes:draft.teamBracketNodes}:{}),pools:plan.pools,teamPools:plan.teamPools});
    // The legacy team division's court is the Setup's team court too (#15 PR 8b).
    ksmSetDivisionCourt(div,plan.divisionCourt);return true;// the legacy team division's is the Setup's team court (ksmSetTeamCourt())
  }
  if(plan.kind==='exhibition'){
    ksmSetDivisionMatches(div,/** @type {Match[]} */(plan.matches));draw({pools:plan.pools},plan.generated);ksmSetDivisionCourt(div,plan.divisionCourt);return plan.generated;
  }
  if(plan.kind==='singleElim'){
    const arr=/** @type {Match[]} */(plan.matches),draft={singleElimNodes:plan.singleElimNodes};// The sync puts the list in place (a new bracket has nothing to dedupe: the list is `arr` sorted, as the old
    // assignment after the sync put it again).
    syncIndividualSingleElim(div,arr,plan.singleElimComps,draft);
    draw({singleElimNodes:draft.singleElimNodes,pools:[],singleElimComps:plan.singleElimComps});
  }else{
    ksmSetDivisionMatches(div,/** @type {Match[]} */(plan.matches));
    draw({...(plan.championshipNodes?{championshipNodes:plan.championshipNodes}:{}),pools:plan.pools,brackets:plan.brackets});
    syncChampionshipTemplate(div);// reads the pools' seeds and the template from the store
  }
  return true;
})}
export function generatePools(options={}){
  if(!options.validated){requestTournamentGeneration();return}
  const regenerating=Boolean(state.generated);
  // Every bout and every draw emptied, one notification (#15 PR 13c-2: the bouts are their own dispatch).
  holdNotifications(()=>{ksmSetAllMatches({});
    ksmSetDraw('drawReset',{currentByDivision:{},pools:{},teamPools:{},singleElimComps:{},brackets:{},byeWinners:{},teamBracketNodes:{},singleElimNodes:{},teamElimTeams:{},championshipNodes:{}})});let generated=0;
  state.divisions.forEach(div=>{if(generateDivisionState(div))generated++});
  if(tournamentSettings().teamEnabled!=='Disabled')ksmTeamDivisions().forEach(d=>{if(generateDivisionState(d.id))generated++});
  if(generateDivisionState('Exhibition Matches'))generated++;
  if(!generated){alert('No registered or checked-in competitors, teams, or exhibitions found. No-show entries are excluded.');return}
  initCourtStates();let chosen=state.courtState[state.currentCourt||'A']?.division||Object.keys(state.allMatches)[0];setActiveDivision(chosen,true);ksmSetDraw('tournamentGenerated',{generated:true,managementRevision:ksmNextManagementRevision()});if(window.generateBtn)generateBtn.textContent='Regenerate Tournament';
  // #129 part 3: a full regenerate marks its save, so the server keeps the copy it replaces (Undo regenerate).
  if(regenerating)ksmMarkRegenerateSave();
  renderAll();show('registration');regTab('pools');scheduleAutoSave();
}
export function regenerateSingleDivision(div){
  if(!['ready','new'].includes(divisionRegenerationStatus(div))){alert('This division cannot be regenerated after matches have started.');return}
  let validation=validateTournament({division:div});if(!validation.valid){closeManagementModal('regenerateModal');showValidationDialog(validation,()=>{});return}
  let snapshot=JSON.parse(JSON.stringify({pools:state.pools[div],teamPools:state.teamPools[div],allMatches:state.allMatches[div],teamBracketNodes:state.teamBracketNodes[div],singleElimNodes:state.singleElimNodes[div],singleElimComps:state.singleElimComps?.[div],teamElimTeams:state.teamElimTeams?.[div],brackets:state.brackets[div],championshipNodes:state.championshipNodes?.[div],byeWinners:state.byeWinners?.[div],currentByDivision:state.currentByDivision[div]}));
  // The managementRevision bump goes with the new draw (one tournament/divisionRegenerated); a failure before the
  // court pointers were re-resolved puts the old revision back with the old draw, as the bump came after them.
  const revision=state.managementRevision;let bumped=false;
  // The old bouts' delete, the new draw (or the old one put back) notify once (#15 PR 13c-2); a failure's alert comes after
  // that notification, so the restored draw is announced before the alert waits for the director (#207 review L3).
  /** @type {any} */ let failed=null;
  holdNotifications(()=>{try{
    // The bracket nodes and `teamElimTeams` go with the rest of the draw: removed and drawn again in the one action.
    ksmDeleteDivisionMatches(div);
    if(!generateDivisionState(div,{type:'divisionRegenerated',fresh:true,lists:{managementRevision:ksmNextManagementRevision()}}))throw new Error('No eligible entrants remain in this division.');
    initCourtStates();bumped=true;renderAll();scheduleAutoSave();ksmRegenerateDone(div);
  }catch(err){
    ksmSetDivisionMatches(div,snapshot.allMatches);
    ksmSetDraw('divisionCleared',{...ksmDrawWith(div,{currentByDivision:snapshot.currentByDivision,teamBracketNodes:snapshot.teamBracketNodes,singleElimNodes:snapshot.singleElimNodes,teamElimTeams:snapshot.teamElimTeams,championshipNodes:snapshot.championshipNodes,pools:snapshot.pools,teamPools:snapshot.teamPools,singleElimComps:snapshot.singleElimComps,brackets:snapshot.brackets,byeWinners:snapshot.byeWinners},[...KSM_DRAW_KEYS,'currentByDivision']),...(bumped?{}:{managementRevision:revision})});
    failed=err;
  }});
  if(failed)alert('Unable to regenerate '+div+': '+failed.message);
}
// A No Show: the division's bouts and its draw notify once (#15 PR 13c-2).
export function applyIndividualNoShow(div,name){return holdNotifications(()=>{
  if(!structuralNoShowAllowed(div))return false;
  let fmt=state.divisionTypes[div]||'Round Robin';
  if(fmt==='Single Elimination'){
    const comps=state.singleElimComps?.[div]||[];const idx=comps.findIndex(c=>c&&c.name===name);if(idx<0)return false;
    // The entrant's place is empty (null): a new list, the bracket built again from it.
    const next=comps.map((c,i)=>i===idx?null:c),draft={};
    ksmSetDivisionMatches(div,buildIndividualSingleElimMatches(div,next,draft));
    ksmSetDraw('drawEntriesUpdated',{...ksmDrawWith(div,{singleElimNodes:draft.singleElimNodes,singleElimComps:next}),managementRevision:ksmNextManagementRevision()});
  }else{
    const pool=(state.pools[div]||[]).find(p=>p.players.some(x=>x.name===name));if(!pool)return false;
    // #24 (product owner): the pool's bouts are rebuilt in the standard order for its new size
    // (4 -> 3: A-B, C-B, C-A, nobody changes tasuki between consecutive bouts), the remaining
    // players keep their slots; other pools and the championship template are unchanged
    // (KSMEngine.poolNoShowPlan). Refused when a bout of the pool was played.
    const plan=KSMEngine.poolNoShowPlan(div,state.pools[div]||[],state.allMatches[div]||[],name);if(!plan)return false;
    ksmSetDivisionMatches(div,/** @type {Match[]} */(plan.matches));
    ksmSetDraw('drawEntriesUpdated',{...ksmEditedPools(div,p=>p===pool?{...p,players:plan.players,size:plan.players.length}:p),managementRevision:ksmNextManagementRevision()});
    syncChampionshipTemplate(div);
  }
  initCourtStates();return true;
})}
export function applyWholeTeamNoShow(div,teamName){return holdNotifications(()=>{
  if(!structuralNoShowAllowed(div))return false;
  let nodes=state.teamBracketNodes?.[div]||[];
  if(nodes.length){
    let teams=state.teamElimTeams?.[div]||[];let idx=teams.findIndex(t=>t&&t.team===teamName);if(idx<0)return false;
    // The team's place is empty (null) and the bracket starts again: new lists and nodes, in one action with the bump.
    const nextTeams=teams.map((t,i)=>i===idx?null:t),draft={teamBracketNodes:nodes.map(n=>({...n,winner:null}))};
    ksmSetDivisionMatches(div,[]);syncTeamBracket(div,state.allMatches[div],nextTeams,draft);
    ksmSetDraw('drawEntriesUpdated',{...ksmDrawWith(div,{teamElimTeams:nextTeams,teamBracketNodes:draft.teamBracketNodes}),managementRevision:ksmNextManagementRevision()});
  }
  else{
    ksmSetDivisionMatches(div,(state.allMatches[div]||[]).filter(m=>m.teamWhite!==teamName&&m.teamRed!==teamName));
    // The first pool without the team (a team round robin's pools are its team pools: both, ksmEditedPools()).
    const first=state.pools?.[div]?.[0];
    ksmSetDraw('drawEntriesUpdated',{...(first?ksmEditedPools(div,p=>p===first?{...p,players:p.players.filter(x=>x.name!==teamName)}:p):{}),managementRevision:ksmNextManagementRevision()});
  }
  initCourtStates();return true;
})}
export function matchBelongsToCourt(m,c){if(!m)return false;if(m.court)return m.court===c;let mode=state.divisionCourts[m.division]||'A';return mode==='split'?c==='A':mode===c}
export function eliminationFinalDone(div){let arr=state.allMatches[div]||[];return arr.some(m=>m&&m.singleElim&&m.position==='Final'&&m.done)}
function nextIndexForCourt(div,c,start=0){let arr=state.allMatches[div]||[];if(eliminationFinalDone(div))return arr.length;if(arr.some(isTeamMatch)){arr=sortTeamMatches(div);start=0;}else{arr=sortIndividualDivisionMatches(div,arr);start=0;}let idx=arr.findIndex((m,i)=>i>=start && individualMatchReady(m) && matchBelongsToCourt(m,c));return idx<0?arr.length:idx}
export function setActiveDivision(div,keepScore=false){
  if(state.currentCourt)rememberLocalCourtDivision(state.currentCourt,div);
  ksmShowDivision(div); // state.matches is now allMatches[div] (derived, #15 PR 7)
  let idx=nextIndexForCourt(div,state.currentCourt||'A',state.currentByDivision[div]||0);
  ksmShowMatch(idx);
  // The court's shared pointer moves only on the court's own scorekeeper (isCourtScorekeeper(), docs/STORE.md 1.2):
  // a spectator or TV picking a division changes only what this device shows.
  if(state.currentCourt&&isCourtScorekeeper(state.currentCourt))setCourtPointer(state.currentCourt,{division:div,index:idx},'divisionSelected',idx);
  // Show the points the landed match already has (an empty pad for a fresh or finished match), so the
  // next tapped point is added to them instead of overwriting them via syncActiveScoreToMatch().
  // state.history is only this pad's local tap list (court Undo/Redo is separate), so a switch starts it empty.
  loadScoreFromMatch(state.matches[state.current]);
  if(!keepScore)state.history=[];
  renderDivisions();renderScore();renderPools();renderProgress();renderContext();
}
export function selectScorekeeperDivision(div){
  // A court's active division is operational shared state: the local scorekeeper
  // owns the selection, while spectator/TV clients must follow it. Publish the
  // change immediately so a TV window does not wait for the next scored point.
  setActiveDivision(div);
  if(!isReadOnlySession())criticalAutoSave(`Court ${state.currentCourt||'A'} division changed: ${div}`);
}
function makeMatches(div){ksmSetDivisionMatches(div,buildPoolMatches(div,state.pools[div]||[]));setActiveDivision(div)}
export function renderPools(){
  // The Pools view is React (app/react/pools/, 41-react-pools.js): #poolOutput's contents are
  // published to it instead of written (M.13).
  let div=poolDiv?.value||state.poolViewDivision||state.currentDivision;ksmSetPoolViewDivision(div);
  poolOutput.className='pools-layout';
  ksmRenderPools(div);
  renderResultsDashboard();
}
