function generateDivisionState(div){
  /* ksm:post-split-begin engine-bridge */const settings=tournamentSettings();
  const plan=KSMEngine.generateDivision({division:div,competitors:state.competitors,teams:state.teams,exhibitions:state.exhibitions,divisionType:state.divisionTypes[div],courtMode:state.divisionCourts[div],settings,bracketNodesForCount:teamBracketNodesForCount});
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
  if((/* ksm:post-split-begin engine-settings was:teamEnabled?.value */tournamentSettings().teamEnabled/* ksm:post-split-end */||'Enabled')==='Enabled'&&generateDivisionState('Team Tournament'))generated++;
  if(generateDivisionState('Exhibition Matches'))generated++;
  if(!generated){alert('No registered or checked-in competitors, teams, or exhibitions found. No-show entries are excluded.');return}
  initCourtStates();let chosen=(poolDiv&&state.allMatches[poolDiv.value])?poolDiv.value:(state.courtState.A.division||Object.keys(state.allMatches)[0]);setActiveDivision(chosen,true);state.generated=true;state.managementRevision=(state.managementRevision||0)+1;if(window.generateBtn)generateBtn.textContent='Regenerate Tournament';renderAll();show('registration');regTab('pools');scheduleAutoSave();
}
function regenerateSingleDivision(div){
  if(divisionRegenerationStatus(div)!=='ready'){alert('This division cannot be regenerated after matches have started.');return}
  let validation=validateTournament({division:div});if(!validation.valid){closeManagementModal('regenerateModal');showValidationDialog(validation,()=>{});return}
  let snapshot=JSON.parse(JSON.stringify({pools:state.pools[div],teamPools:state.teamPools[div],allMatches:state.allMatches[div],teamBracketNodes:state.teamBracketNodes[div],singleElimNodes:state.singleElimNodes[div],singleElimComps:state.singleElimComps?.[div],teamElimTeams:state.teamElimTeams?.[div],brackets:state.brackets[div],championshipNodes:state.championshipNodes?.[div],byeWinners:state.byeWinners?.[div],currentByDivision:state.currentByDivision[div]}));
  try{
    delete state.pools[div];delete state.teamPools[div];delete state.allMatches[div];delete state.teamBracketNodes[div];delete state.singleElimNodes[div];if(state.singleElimComps)delete state.singleElimComps[div];if(state.teamElimTeams)delete state.teamElimTeams[div];delete state.brackets[div];if(state.championshipNodes)delete state.championshipNodes[div];if(state.byeWinners)delete state.byeWinners[div];delete state.currentByDivision[div];
    if(!generateDivisionState(div))throw new Error('No eligible entrants remain in this division.');
    initCourtStates();state.managementRevision=(state.managementRevision||0)+1;renderAll();scheduleAutoSave();regenerateModalTitle.textContent='Division Regenerated';regenerateModalBody.innerHTML=`<div class="muted-card"><b>${esc(div)} successfully regenerated.</b><div class="small" style="margin-top:6px">Pools/bracket, Match Objects, queues, Court Context, Results, and Director progress were updated. Other divisions were not changed.</div></div>`;regenerateModalActions.innerHTML='<button class="primary" onclick="closeManagementModal(\'regenerateModal\')">OK</button>';
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
    pool.players=pool.players.filter(x=>x.name!==name);pool.size=pool.players.length;
    // Template order is immutable after generation. Remove only the affected
    // pool matches and leave every surviving Match Object in its original slot.
    state.allMatches[div]=(state.allMatches[div]||[]).filter(m=>
      m.championship || m.pool!==pool.label || (m.white!==name && m.red!==name)
    );
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
  let div=poolDiv?.value||state.poolViewDivision||state.currentDivision;state.poolViewDivision=div;let pools=state.pools[div]||[];
  let poolHtml=pools.length?pools.map(p=>`<div class="pool" data-testid="pool" ondragover="event.preventDefault();this.classList.add('drop-target')" ondragleave="this.classList.remove('drop-target')" ondrop="if(event.target===this)dropPoolPlayer(event,${jsArg(p.label)});this.classList.remove('drop-target')"><h3 data-testid="pool-title">${isTeamDivision(div)?'Team Pool':'Pool'} ${p.label}</h3>${p.players.map((x,idx)=>`<div class="drag-player" draggable="true" ondragstart="dragPoolPlayer(event,${jsArg(p.label)},${idx})"><span class="pool-slot-badge" data-testid="pool-slot">${esc(poolPlayerSlot(x,idx))}</span><b data-testid="pool-player">${esc(x.name)}</b><span class="small" style="float:right">${esc(x.dojo)}</span></div>`).join('')}</div>`).join(''):(isTeamDivision(div)&&state.allMatches[div]?.length?'<div class="muted-card">Single-elimination team bracket created. Team position matches are available in the Court queue.</div>':((state.divisionTypes[div]==='Single Elimination'&&state.allMatches[div]?.length)?'<div class="muted-card">Single-elimination bracket created. Matches are available in the Court queue.</div>':'<div class="muted-card">No pools generated yet.</div>'));
  let edit=pools.length&&!isTeamRoundRobinDivision(div)?'<div class="toolbar"><button onclick="toggleEditPools()" data-testid="pool-edit">Edit Pool</button></div>':'';
  let rightTitle=isTeamRoundRobinDivision(div)?'Team Standings':'Championship Preview';
  poolOutput.className='pools-layout';
  poolOutput.innerHTML=`<div><h2>Pools</h2>${edit}<div class="pool-list">${poolHtml}</div></div><div><h2>${rightTitle}</h2>${bracketHtml(div)}</div>`;
  renderResultsDashboard();
}
