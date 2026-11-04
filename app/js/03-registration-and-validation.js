function addRow(n=1){for(let i=0;i<n;i++)state.competitors.push({name:'',dojo:'',division:state.divisions[0]||'',seed:'',status:'Registered'});if(window.regFilter)regFilter.value='';renderReg()}
function addTeamRow(n=1){for(let i=0;i<n;i++)state.teams.push({team:'',division:'Team Tournament',id:ksmNewTeamIdentity(),teamDivisionId:ksmDefaultTeamDivisionId(),type:ksmTeamSettings().teamFormat,senpo:'',jiho:'',chuken:'',fukusho:'',taisho:'',status:'Registered'});if(window.teamFilter)teamFilter.value='';renderTeams()}
function addAutoTeam(){let n=(state.teams||[]).length+1;let team='Auto Team '+n;state.teams.push({team,division:'Team Tournament',id:ksmNewTeamIdentity(),teamDivisionId:ksmDefaultTeamDivisionId(),type:ksmTeamSettings().teamFormat,senpo:team,jiho:team,chuken:team,fukusho:team,taisho:team,status:'Checked'});renderTeams()}
function statusCycle(s){return KSMEngine.statusCycle(s);// moved to app/engine/registration.ts
  }

function divisionHasCompletedMatches(div){return (state.allMatches?.[div]||[]).some(m=>m&&m.done)}
function closeManagementModal(id){if(!ksmCloseShellDialog(id))document.getElementById(id)?.classList.add('hidden');}
function structuralNoShowAllowed(div){return !!state.generated && !!(state.allMatches?.[div]) && !divisionHasCompletedMatches(div)}
function cycleCompetitorStatus(i){
  let c=state.competitors[i];if(!c)return;let next=statusCycle(c.status);
  if(next==='NoShow'&&state.generated&&structuralNoShowAllowed(c.division)&&!ksmConfirmNoShow(c.name||'this player',c.division))return;
  c.status=next;
  if(next==='NoShow'&&state.generated){
    if(structuralNoShowAllowed(c.division))applyIndividualNoShow(c.division,c.name);
    else if(state.allMatches?.[c.division])alert('This division has already started. The bracket or pools were not changed; handle the absence with Fusen-sho.');
  }
  renderAll();scheduleAutoSave();
}
function cycleTeamStatus(i){
  let t=state.teams[i];if(!t)return;let next=statusCycle(t.status);if(next==='NoShow'&&state.generated&&structuralNoShowAllowed(t.teamDivisionId||'Team Tournament')&&!ksmConfirmNoShow(t.team||'this team',t.teamDivisionId||'Team Tournament'))return;t.status=next;
  if(next==='NoShow'&&state.generated){
    let div=t.teamDivisionId||'Team Tournament';
    if(structuralNoShowAllowed(div))applyWholeTeamNoShow(div,t.team);
    else if(state.allMatches?.[div])alert('This team division has already started. The bracket was not changed; handle remaining absences through normal match procedures.');
  }
  renderAll();scheduleAutoSave();
}
function validationIssue(severity,code,divisionId,message,suggestedAction=''){return KSMEngine.validationIssue(severity,code,divisionId,message,suggestedAction);// moved to app/engine/registration.ts
  }
function validateTournament(options={}){
  let issues=[],target=options.division||null;
  let divisions=target?(isTeamDivision(target)?[]:[target]):state.divisions.filter(d=>eligibleIndividuals(d).length||state.competitors.some(c=>c.division===d));
  let seenNames=new Map();
  state.competitors.forEach((c,i)=>{
    if(target&&c.division!==target)return;
    if((c.name||c.dojo||c.seed)&&!String(c.name||'').trim())issues.push(validationIssue('error','MISSING_NAME',c.division,'Registration row '+(i+1)+' is missing a competitor name.','Enter a name or remove the row.'));
    if(c.name&&!state.divisions.includes(c.division))issues.push(validationIssue('error','INVALID_DIVISION',c.division,`${c.name} references an unavailable division.`,`Choose an enabled division.`));
    if(c.name){let key=(c.division+'|'+c.name).toLowerCase();if(seenNames.has(key))issues.push(validationIssue('error','DUPLICATE_ENTRY',c.division,`${c.name} appears more than once in ${c.division}.`,'Remove the duplicate registration.'));else seenNames.set(key,true)}
  });
  divisions.forEach(div=>{
    let comps=eligibleIndividuals(div),n=comps.length,fmt=state.divisionTypes[div]||'Round Robin',court=state.divisionCourts[div]||'A';
    if(!['A','B','split'].includes(court))issues.push(validationIssue('error','INVALID_COURT',div,`${div} has an invalid court assignment.`,'Choose Court A, Court B, or Split Between Courts.'));
    if(court==='split'&&n<4)issues.push(validationIssue('error','SPLIT_MINIMUM',div,`${div} has ${n} competitors. Split Between Courts requires at least 4.`,'Add competitors or choose one court.'));
    if(fmt==='Single Elimination'&&(n<2||n>32))issues.push(validationIssue('error','ELIM_COUNT',div,`${div} single elimination supports 2–32 competitors; found ${n}.`,'Adjust registration or format.'));
    if(fmt!=='Single Elimination'&&(n<2||n>32))issues.push(validationIssue('error','POOL_COUNT',div,`${div} pool play supports 2–32 competitors in the current engine; found ${n}.`,'Adjust registration or format.'));
    let seeds=comps.map(c=>String(c.seed||'').trim()).filter(Boolean);let nums=seeds.map(Number);
    if(nums.some(x=>!Number.isInteger(x)||x<1))issues.push(validationIssue('error','INVALID_SEED',div,`${div} contains an invalid seed.`,'Use positive whole numbers.'));
    if(new Set(seeds).size!==seeds.length)issues.push(validationIssue('error','DUPLICATE_SEED',div,`${div} contains duplicate seed numbers.`,'Use each seed once.'));
  });
  if((teamEnabled?.value||'Enabled')==='Enabled')ksmTeamDivisions().filter(d=>!target||d.id===target).forEach(d=>{
    const teams=eligibleTeams(d.id);
    if(teams.length===1)issues.push(validationIssue('error','TEAM_COUNT',d.id,d.name+': at least two teams are required.','Add another team or disable the team tournament.'));
    if(d.teamTournamentFormat==='Single Elimination'&&teams.length>32)issues.push(validationIssue('error','TEAM_TEMPLATE',d.id,d.name+': single elimination supports no more than 32 teams.','Reduce the number of teams.'));
  });
  
  // #86: a grand champion row that cannot be drawn as set up stops Generate, like a division's error.
  if(!target)ksmGrandChampions().forEach(gc=>{const error=ksmGrandChampionError(gc);if(error)issues.push(validationIssue('error','GRAND_CHAMPION',gc.id,`${gc.name||'Grand Champion'}: ${error}`,'Fix the grand champion row in Setup, or remove it.'))});
  
  // Owner decision 2 (#29): nothing to generate (no individual, team or exhibition entry that is
  // not a No Show) is an error of the check itself, so Generate cannot proceed (it alerted after).
  if(!target){
    const st=tournamentSettings(),teamsOn=(st.teamEnabled||'Enabled')==='Enabled',exOn=st.exhibitionEnabled==='Enabled';
    const any=state.divisions.some(d=>eligibleIndividuals(d).length)||(teamsOn&&ksmTeamDivisions().some(d=>eligibleTeams(d.id).length))||(exOn&&(state.exhibitions||[]).some(e=>e&&e.status!=='NoShow'&&e.white&&e.red));
    if(!any)issues.push(validationIssue('error','NO_ENTRIES',null,'No competitors registered.','Register competitors or teams first (No Show entries are excluded).'));
  }
  return {valid:!issues.some(x=>x.severity==='error'),issues};
}
function renderTournamentStatus(){
  let el=window.tournamentStatusCard;if(!el)return;let v=validateTournament();let competitors=state.competitors.filter(c=>c.name&&c.status!=='NoShow').length;let divs=state.divisions.filter(d=>eligibleIndividuals(d).length).length+((teamEnabled?.value||'Enabled')==='Enabled'?ksmTeamDivisions().filter(d=>eligibleTeams(d.id).length).length:0);
  el.className='tournament-status-card '+(v.valid?'ready':'attention');
  ksmRenderTournamentStatus(v.valid,competitors,divs,v.issues.filter(x=>x.severity==='error').length);
}
function showValidationDialog(result,onConfirm){
  ksmShowValidationDialog(result,onConfirm);
}
function requestTournamentGeneration(){
  const result=validateTournament();
  showValidationDialog(result,()=>{
    const summary=KSMEngine.finishedMatchSummary(state.allMatches);
    if(!state.generated||!summary.total){generatePools({validated:true});return}
    window.dispatchEvent(new CustomEvent('ksm:regenerate-warning',{detail:{
      total:summary.total,divisions:summary.divisions.map(ksmDivisionName),
      confirm:async()=>{await manualSaveTournament({throwOnError:true});generatePools({validated:true})}
    }}));
  });
}
// #129: Setup → Advanced → Danger zone holds Regenerate Tournament (the toolbar drops it once the
// tournament is drawn) and Delete tournament (also in Cloud Diagnostics). Both call the existing flows.
function ksmDangerRegenerate(){if(!state.generated||isReadOnlySession())return;requestTournamentGeneration()}
function ksmSyncDangerZone(){
  const regen=document.querySelector('[data-testid="setup-regenerate-tournament"]'),del=document.querySelector('[data-testid="setup-delete-tournament"]'),note=document.getElementById('setupDangerReason');
  if(!regen||!del||!note)return;
  const canDelete=typeof ksmCanDeleteTournament==='function'&&!!ksmCanDeleteTournament(),reasons=[];
  regen.disabled=isReadOnlySession()||!state.generated;del.disabled=!canDelete;
  if(!state.generated)reasons.push('Regenerate Tournament is available once the tournament has been generated.');
  if(!canDelete)reasons.push('Delete tournament is available to staff of a saved cloud tournament.');
  note.textContent=reasons.join(' ');note.hidden=!reasons.length;
}
function divisionRegenerationStatus(div){if(!state.allMatches?.[div])return state.generated&&((ksmTeamDivision(div)?eligibleTeams(div):eligibleIndividuals(div))||[]).length?'new':'not-generated';return divisionHasCompletedMatches(div)?'started':'ready'}
function openRegenerateDivisionDialog(){
  ksmOpenRegenerateDialog();
}
function continueRegenerateDivision(){ksmContinueRegenerateDivision();}
function renderReg(){ksmRenderRegistration();renderTournamentStatus();}
function renderTeams(){ksmRenderTeams();renderTournamentStatus();}
function addExhibitionRow(n=1){for(let i=0;i<n;i++)state.exhibitions.push({white:'',red:'',division:'Exhibition Matches',status:'Registered'});renderExhibitions()}
function renderExhibitions(){ksmRenderExhibitions();renderTournamentStatus();}
function updateComp(i,k,v){state.competitors[i][k]=v;if(k==='division'&&v&&!state.divisions.includes(v)){state.divisions.push(v);renderDivisions()}renderTournamentStatus()}
function loadSamples(){if(state.competitors.length&&!confirm('Replace all individual competitors with the sample players?'))return;state.competitors=[{name:'Riku Tanaka',dojo:'Aiea Taiheiji',division:'Women’s Open',seed:'1',status:'Checked'},{name:'Hana Sato',dojo:'Waipahu Seibukan',division:'Women’s Open',seed:'2',status:'Checked'},{name:'Mika Ito',dojo:'Honolulu Myohoji',division:'Women’s Open',seed:'',status:'Checked'},{name:'Emi Nakamura',dojo:'Mililani',division:'Women’s Open',seed:'',status:'Checked'},{name:'Yui Watanabe',dojo:'Maui',division:'Women’s Open',seed:'',status:'Checked'},{name:'Aiko Kimura',dojo:'Kailua',division:'Women’s Open',seed:'',status:'Checked'},{name:'Mai Kobayashi',dojo:'Honolulu Myohoji',division:'Women’s Open',seed:'',status:'Checked'},{name:'Sora Yamamoto',dojo:'Aiea Taiheiji',division:'Women’s Open',seed:'',status:'Checked'},{name:'Ken Suzuki',dojo:'Aiea Taiheiji',division:'Yudansha 1–3 Dan',seed:'1',status:'Checked'},{name:'Daichi Mori',dojo:'Waipahu Seibukan',division:'Yudansha 1–3 Dan',seed:'2',status:'Checked'},{name:'Ren Watanabe',dojo:'Maui',division:'Yudansha 1–3 Dan',seed:'',status:'Checked'}];renderReg()}
function loadTeamSamples(){if(state.teams.length&&!confirm('Replace all teams with the sample teams?'))return;state.teams=[{team:'Aiea Team A',senpo:'Tanaka',jiho:'Ito',chuken:'Suzuki',fukusho:'Nakamura',taisho:'Kato',status:'Checked'},{team:'Waipahu Team A',senpo:'Sato',jiho:'Kimura',chuken:'Yamamoto',fukusho:'Lee',taisho:'Chen',status:'Checked'},{team:'Maui Team A',senpo:'Mori',jiho:'Miura',chuken:'Maeda',fukusho:'Goto',taisho:'Higa',status:'Checked'},{team:'University of Hawaii',senpo:'Arai',jiho:'Ono',chuken:'Kondo',fukusho:'Shima',taisho:'Ueda',status:'Checked'}];state.teams=ksmNewTeamRows(state.teams);renderTeams()}

function loadFullTournament(){
  if((state.competitors.length||state.teams.length)&&!confirm('Replace the divisions, competitors and teams with the sample tournament?'))return;
  state.divisions=DIVISION_PRESETS.map(x=>x[0]);state.divisionCourts={};DIVISION_PRESETS.forEach(([d,f,c])=>{state.divisionTypes[d]=f;state.divisionCourts[d]=c});state.divisionCourts['Team Tournament']='Both';
  state.divisionTypes={};DIVISION_PRESETS.forEach(([d,f,c])=>state.divisionTypes[d]=f);
  const dojos=['Aiea Taiheiji','Waipahu Seibukan','Honolulu Myohoji','Mililani','Maui','Kailua','Hilo','Kauai','Manoa','Palolo'];
  const first=['Riku','Hana','Mika','Emi','Yui','Aiko','Mai','Sora','Ken','Daichi','Ren','Haruto','Kaito','Yuna','Mei','Akira','Naoki','Takumi','Satoshi','Kei','Nori','Yoshi','Taro','Hiro','Aya','Mina','Noa','Kai','Leo','Ema','Mao','Rena','Kota','Sena','Rei','Shun','Yuto','Nana','Mio','Asa','Ryo','Koki','Sho','Kazu','Miki','Sara','Toma','Haru','Yuki','Kenta'];
  const last=['Tanaka','Sato','Ito','Nakamura','Watanabe','Kimura','Kobayashi','Yamamoto','Suzuki','Mori','Fujimoto','Takahashi','Kondo','Matsuda','Inoue','Hayashi','Oda','Miura','Kato','Shimizu','Ishikawa','Okada','Goto','Higa','Uehara','Arakaki','Nishimura','Tamura','Yoshida','Maeda'];
  const divPlan=[[DIVISION_PRESETS[0][0],8],[DIVISION_PRESETS[1][0],8],['Women’s Open',8],['Yudansha 1–3 Dan',12],['Yudansha 4 Dan+',8],[DIVISION_PRESETS[6][0],6]];
  let comps=[]; let idx=0;
  divPlan.forEach(([division,count])=>{
    for(let i=0;i<count;i++){
      const dojo=dojos[(i*3+idx)%dojos.length];
      comps.push({name:first[idx%first.length]+' '+last[(idx*2)%last.length], dojo, division, seed:(i<4?String(i+1):''), status:'Registered'});
      idx++;
    }
  });
  state.competitors=comps;
  state.teams=[
    {team:'Aiea Team A',senpo:'Tanaka',jiho:'Ito',chuken:'Suzuki',fukusho:'Nakamura',taisho:'Kato',status:'Registered'},
    {team:'Waipahu Team A',senpo:'Sato',jiho:'Kimura',chuken:'Yamamoto',fukusho:'Lee',taisho:'Chen',status:'Registered'},
    {team:'Maui Team A',senpo:'Mori',jiho:'Miura',chuken:'Maeda',fukusho:'Goto',taisho:'Higa',status:'Registered'},
    {team:'University of Hawaii',senpo:'Arai',jiho:'Ono',chuken:'Kondo',fukusho:'Shima',taisho:'Ueda',status:'Registered'}
  ];
  state.teams=ksmNewTeamRows(state.teams);
  state.currentDivision='Women’s Open';
  renderAll();
  alert('Loaded 50 individual competitors across 6 divisions plus sample team entries.');
}

// #129: Clear says how many entries go. After the draw the matches, pools and results keep the names
// they were drawn with (checked in a browser test), so clearing leaves drawn divisions consistent; the
// confirm says so.
function ksmClearQuestion(count,one,many){
  const n=count===1?`the 1 ${one}`:`all ${count} ${many}`;
  return `Clear ${n}? This cannot be undone.`+(state.generated?'\n\nDrawn divisions keep their matches and results. To redraw a division later you will need to register its entries again.':'');
}
function clearCompetitors(){if(confirm(ksmClearQuestion(state.competitors.length,'individual competitor','individual competitors'))){state.competitors=[];renderReg()}}
// F8: Clear Teams and Clear Exhibitions ask first, like Clear Registration (clearCompetitors).
function clearTeams(){if(confirm(ksmClearQuestion(state.teams.length,'team','teams'))){state.teams=[];renderTeams()}}
function clearExhibitions(){if(confirm(ksmClearQuestion(state.exhibitions.length,'exhibition match','exhibition matches'))){state.exhibitions=[];renderExhibitions()}}
