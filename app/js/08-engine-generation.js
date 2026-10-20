function generateDivisionState(div){
  /* ksm:post-split-begin engine-bridge */const settings=ksmTeamSettings(div);
  const plan=KSMEngine.generateDivision({division:div,teamDivisionId:ksmTeamDivision(div)?.id,competitors:ksmGrandChampion(div)?ksmGrandChampionCompetitors(div):state.competitors,teams:state.teams,exhibitions:state.exhibitions,divisionType:ksmGrandChampion(div)?KSMEngine.grandChampionFormat(ksmGrandChampion(div)):state.divisionTypes[div],courtMode:state.divisionCourts[div],settings,bracketNodesForCount:teamBracketNodesForCount});
  if(!plan)return false;
  if(plan.kind==='team'){
    state.pools[div]=plan.pools;state.teamPools[div]=plan.teamPools;
    state.teamElimTeams=state.teamElimTeams||{};state.teamElimTeams[div]=plan.teamElimTeams;
    const m=/** @type {Match[]} */(plan.matches);
    if(plan.teamBracketNodes){state.teamBracketNodes=state.teamBracketNodes||{};state.teamBracketNodes[div]=plan.teamBracketNodes;syncTeamBracket(div,m,state.teamElimTeams[div]);}
    state.allMatches[div]=m;state.currentByDivision[div]=0;state.divisionCourts[div]=plan.divisionCourt;return true;
  }
  if(plan.kind==='exhibition'){
    state.pools[div]=plan.pools;state.allMatches[div]=/** @type {Match[]} */(plan.matches);state.currentByDivision[div]=0;state.divisionCourts[div]=plan.divisionCourt;return plan.generated;
  }
  if(plan.kind==='singleElim'){
    state.pools[div]=[];state.singleElimComps[div]=plan.singleElimComps;
    state.singleElimNodes=state.singleElimNodes||{};state.singleElimNodes[div]=plan.singleElimNodes;
    const arr=/** @type {Match[]} */(plan.matches);syncIndividualSingleElim(div,arr,plan.singleElimComps);state.allMatches[div]=arr;
  }else{
    state.pools[div]=plan.pools;state.brackets[div]=plan.brackets;
    if(plan.championshipNodes){state.championshipNodes=state.championshipNodes||{};state.championshipNodes[div]=plan.championshipNodes;}
    state.allMatches[div]=/** @type {Match[]} */(plan.matches);syncChampionshipTemplate(div);
  }
  state.currentByDivision[div]=0;return true;
  /* ksm:post-split-end */
}
function generatePools(options={}){
  if(!options.validated){requestTournamentGeneration();return}
  state.pools={};state.teamPools={};state.allMatches={};state.teamBracketNodes={};state.singleElimNodes={};state.singleElimComps={};state.teamElimTeams={};state.brackets={};state.championshipNodes={};state.byeWinners={};state.currentByDivision={};let generated=0;
  state.divisions.forEach(div=>{if(generateDivisionState(div))generated++});
  /* ksm:post-split-begin team-divisions was:if((teamEnabled?.value||'Enabled')==='Enabled'&&generateDivisionState('Team Tournament'))generated++; */
  if(tournamentSettings().teamEnabled!=='Disabled')ksmTeamDivisions().forEach(d=>{if(generateDivisionState(d.id))generated++});
  /* ksm:post-split-end */
  if(generateDivisionState('Exhibition Matches'))generated++;
  if(!generated){alert('No registered or checked-in competitors, teams, or exhibitions found. No-show entries are excluded.');return}
  initCourtStates();let chosen=(poolDiv&&state.allMatches[poolDiv.value])?poolDiv.value:(state.courtState.A.division||Object.keys(state.allMatches)[0]);setActiveDivision(chosen,true);state.generated=true;state.managementRevision=(state.managementRevision||0)+1;if(window.generateBtn)generateBtn.textContent='Regenerate Tournament';renderAll();show('registration');regTab('pools');scheduleAutoSave();
}
function regenerateSingleDivision(div){
  if(/* ksm:post-split-begin draw-new-division was:divisionRegenerationStatus(div)!=='ready' */!['ready','new'].includes(divisionRegenerationStatus(div))/* ksm:post-split-end */){alert('This division cannot be regenerated after matches have started.');return}
  let validation=validateTournament({division:div});if(!validation.valid){closeManagementModal('regenerateModal');showValidationDialog(validation,()=>{});return}
  let snapshot=JSON.parse(JSON.stringify({pools:state.pools[div],teamPools:state.teamPools[div],allMatches:state.allMatches[div],teamBracketNodes:state.teamBracketNodes[div],singleElimNodes:state.singleElimNodes[div],singleElimComps:state.singleElimComps?.[div],teamElimTeams:state.teamElimTeams?.[div],brackets:state.brackets[div],championshipNodes:state.championshipNodes?.[div],byeWinners:state.byeWinners?.[div],currentByDivision:state.currentByDivision[div]}));
  try{
    delete state.pools[div];delete state.teamPools[div];delete state.allMatches[div];delete state.teamBracketNodes[div];delete state.singleElimNodes[div];if(state.singleElimComps)delete state.singleElimComps[div];if(state.teamElimTeams)delete state.teamElimTeams[div];delete state.brackets[div];if(state.championshipNodes)delete state.championshipNodes[div];if(state.byeWinners)delete state.byeWinners[div];delete state.currentByDivision[div];
    if(!generateDivisionState(div))throw new Error('No eligible entrants remain in this division.');
    initCourtStates();state.managementRevision=(state.managementRevision||0)+1;renderAll();scheduleAutoSave();/* ksm:post-split-begin react-shell */ksmRegenerateDone(div);/* ksm:post-split-end */
  }catch(err){
    state.pools[div]=snapshot.pools;state.teamPools[div]=snapshot.teamPools;state.allMatches[div]=snapshot.allMatches;state.teamBracketNodes[div]=snapshot.teamBracketNodes;state.singleElimNodes[div]=snapshot.singleElimNodes;state.singleElimComps=state.singleElimComps||{};state.singleElimComps[div]=snapshot.singleElimComps;state.teamElimTeams=state.teamElimTeams||{};state.teamElimTeams[div]=snapshot.teamElimTeams;state.brackets[div]=snapshot.brackets;state.championshipNodes=state.championshipNodes||{};state.championshipNodes[div]=snapshot.championshipNodes;state.byeWinners=state.byeWinners||{};state.byeWinners[div]=snapshot.byeWinners;state.currentByDivision[div]=snapshot.currentByDivision;alert('Unable to regenerate '+div+': '+err.message);
  }
}
function applyIndividualNoShow(div,name){
  if(!structuralNoShowAllowed(div))return false;
  let fmt=state.divisionTypes[div]||'Round Robin';
  if(fmt==='Single Elimination'){
    let comps=state.singleElimComps?.[div]||[];let idx=comps.findIndex(c=>c&&c.name===name);if(idx<0)return false;comps[idx]=null;state.allMatches[div]=buildIndividualSingleElimMatches(div,comps);
  }else{
    let pool=(state.pools[div]||[]).find(p=>p.players.some(x=>x.name===name));if(!pool)return false;
    /* ksm:post-split-begin pool-no-show */
    // #24 (product owner): the pool's bouts are rebuilt in the standard order for its new size
    // (4 -> 3: A-B, C-B, C-A, nobody changes tasuki between consecutive bouts), the remaining
    // players keep their slots; other pools and the championship template are unchanged
    // (KSMEngine.poolNoShowPlan). Refused when a bout of the pool was played.
    const plan=KSMEngine.poolNoShowPlan(div,state.pools[div]||[],state.allMatches[div]||[],name);if(!plan)return false;
    /* ksm:post-split-end */
    pool.players=/* ksm:post-split-begin pool-no-show was:pool.players.filter(x=>x.name!==name) */plan.players/* ksm:post-split-end */;pool.size=pool.players.length;
    state.allMatches[div]=/* ksm:post-split-begin pool-no-show was:(state.allMatches[div]||[]).filter(m=>m.championship || m.pool!==pool.label || (m.white!==name && m.red!==name)) *//** @type {Match[]} */(plan.matches)/* ksm:post-split-end */;
    syncChampionshipTemplate(div);
  }
  initCourtStates();state.managementRevision=(state.managementRevision||0)+1;return true;
}
function applyWholeTeamNoShow(div,teamName){
  if(!structuralNoShowAllowed(div))return false;
  let nodes=state.teamBracketNodes?.[div]||[];
  if(nodes.length){let teams=state.teamElimTeams?.[div]||[];let idx=teams.findIndex(t=>t&&t.team===teamName);if(idx<0)return false;teams[idx]=null;nodes.forEach(n=>n.winner=null);state.allMatches[div]=[];syncTeamBracket(div,state.allMatches[div],teams);}
  else{state.allMatches[div]=(state.allMatches[div]||[]).filter(m=>m.teamWhite!==teamName&&m.teamRed!==teamName);let pool=state.pools?.[div]?.[0];if(pool)pool.players=pool.players.filter(p=>p.name!==teamName)}
  initCourtStates();state.managementRevision=(state.managementRevision||0)+1;return true;
}
function matchBelongsToCourt(m,c){if(!m)return false;if(m.court)return m.court===c;let mode=state.divisionCourts[m.division]||'A';return mode==='split'?c==='A':mode===c}
function eliminationFinalDone(div){let arr=state.allMatches[div]||[];return arr.some(m=>m&&m.singleElim&&m.position==='Final'&&m.done)}
function nextIndexForCourt(div,c,start=0){let arr=state.allMatches[div]||[];if(eliminationFinalDone(div))return arr.length;if(arr.some(isTeamMatch)){arr=sortTeamMatches(div);start=0;}else{arr=sortIndividualDivisionMatches(div,arr);start=0;}let idx=arr.findIndex((m,i)=>i>=start && individualMatchReady(m) && matchBelongsToCourt(m,c));return idx<0?arr.length:idx}
function setActiveDivision(div,keepScore=false){
  if(state.currentCourt)rememberLocalCourtDivision(state.currentCourt,div);
  state.currentDivision=div;
  state.matches=state.allMatches[div]||[];
  let idx=nextIndexForCourt(div,state.currentCourt||'A',state.currentByDivision[div]||0);
  state.current=idx;
  state.currentByDivision[div]=idx;
  if(state.currentCourt){state.courtState[state.currentCourt]={division:div,index:idx};state.courtActiveDivision[state.currentCourt]=div;}
  if(keepScore){loadScoreFromMatch(state.matches[state.current]);}
  else{state.score={W:[],R:[],WT:0,RT:0};state.history=[]}
  renderDivisions();renderScore();renderPools();renderProgress();renderContext();
}
function selectScorekeeperDivision(div){
  // A court's active division is operational shared state: the local scorekeeper
  // owns the selection, while spectator/TV clients must follow it. Publish the
  // change immediately so a TV window does not wait for the next scored point.
  setActiveDivision(div);
  if(!isReadOnlySession())criticalAutoSave(`Court ${state.currentCourt||'A'} division changed: ${div}`);
}
function makeMatches(div){state.allMatches[div]=buildPoolMatches(div,state.pools[div]||[]);setActiveDivision(div)}
function renderPools(){
/* ksm:post-split-begin react-pools */
  // The Pools view is React (app/react/pools/, 41-react-pools.js): #poolOutput's contents are
  // published to it instead of written (M.13).
  let div=poolDiv?.value||state.poolViewDivision||state.currentDivision;state.poolViewDivision=div;
  poolOutput.className='pools-layout';
  ksmRenderPools(div);
  renderResultsDashboard();
/* ksm:post-split-end */
}
