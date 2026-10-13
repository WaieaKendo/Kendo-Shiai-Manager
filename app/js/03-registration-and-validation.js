function addRow(n=1){for(let i=0;i<n;i++)state.competitors.push({name:'',dojo:'',division:state.divisions[0]||'',seed:'',status:'Registered'});renderReg()}
function addTeamRow(n=1){for(let i=0;i<n;i++)state.teams.push({team:'',division:'Team Tournament',type:(teamFormat?.value||'5-Person Team'),senpo:'',jiho:'',chuken:'',fukusho:'',taisho:'',status:'Registered'});renderTeams()}
function addAutoTeam(){let n=(state.teams||[]).length+1;let team='Auto Team '+n;state.teams.push({team,division:'Team Tournament',type:(teamFormat?.value||'3-Person Team'),senpo:team,jiho:team,chuken:team,fukusho:team,taisho:team,status:'Checked'});renderTeams()}
function statusCycle(s){return s==='Checked'?'NoShow':s==='NoShow'?'Registered':'Checked'}

function divisionHasCompletedMatches(div){return (state.allMatches?.[div]||[]).some(m=>m&&m.done)}
function closeManagementModal(id){/* ksm:post-split-begin react-shell */if(!ksmCloseShellDialog(id))document.getElementById(id)?.classList.add('hidden');/* ksm:post-split-end */}
function structuralNoShowAllowed(div){return !!state.generated && !!(state.allMatches?.[div]) && !divisionHasCompletedMatches(div)}
function cycleCompetitorStatus(i){
  let c=state.competitors[i];if(!c)return;let next=statusCycle(c.status);
  c.status=next;
  if(next==='NoShow'&&state.generated){
    if(structuralNoShowAllowed(c.division))applyIndividualNoShow(c.division,c.name);
    else if(state.allMatches?.[c.division])alert(/* ksm:post-split-begin owner-decisions was:'This division has already started. The bracket or pools were not changed; handle the absence with Fusen-gachi.' */'This division has already started. The bracket or pools were not changed; handle the absence with Fusen-sho.'/* ksm:post-split-end */);
  }
  renderAll();scheduleAutoSave();
}
function cycleTeamStatus(i){
  let t=state.teams[i];if(!t)return;let next=statusCycle(t.status);t.status=next;
  if(next==='NoShow'&&state.generated){
    let div='Team Tournament';
    if(structuralNoShowAllowed(div))applyWholeTeamNoShow(div,t.team);
    else if(state.allMatches?.[div])alert('This team division has already started. The bracket was not changed; handle remaining absences through normal match procedures.');
  }
  renderAll();scheduleAutoSave();
}
function validationIssue(severity,code,divisionId,message,suggestedAction=''){return {severity,code,divisionId,message,suggestedAction}}
function validateTournament(options={}){
  let issues=[],target=options.division||null;
  let divisions=target?[target]:state.divisions.filter(d=>eligibleIndividuals(d).length||state.competitors.some(c=>c.division===d));
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
  if(!target&&(teamEnabled?.value||'Enabled')==='Enabled'){
    let teams=eligibleTeams('Team Tournament'),fmt=teamTournamentFormat?.value||'Single Elimination';
    if(teams.length===1)issues.push(validationIssue('error','TEAM_COUNT','Team Tournament','At least two teams are required.','Add another team or disable the team tournament.'));
    if(fmt==='Single Elimination'&&teams.length>32)issues.push(validationIssue('error','TEAM_TEMPLATE','Team Tournament','Single elimination supports no more than 32 teams.','Reduce the number of teams.'));
  }
  /* ksm:post-split-begin owner-decisions */
  // Owner decision 2 (#29): nothing to generate (no individual, team or exhibition entry that is
  // not a No Show) is an error of the check itself, so Generate cannot proceed (it alerted after).
  if(!target){
    const st=tournamentSettings(),teamsOn=(st.teamEnabled||'Enabled')==='Enabled',exOn=st.exhibitionEnabled==='Enabled';
    const any=state.divisions.some(d=>eligibleIndividuals(d).length)||(teamsOn&&eligibleTeams('Team Tournament').length)||(exOn&&(state.exhibitions||[]).some(e=>e&&e.status!=='NoShow'&&e.white&&e.red));
    if(!any)issues.push(validationIssue('error','NO_ENTRIES',null,'No competitors registered.','Register competitors or teams first (No Show entries are excluded).'));
  }
  /* ksm:post-split-end */
  return {valid:!issues.some(x=>x.severity==='error'),issues};
}
function renderTournamentStatus(){
  let el=window.tournamentStatusCard;if(!el)return;let v=validateTournament();let competitors=state.competitors.filter(c=>c.name&&c.status!=='NoShow').length;let divs=state.divisions.filter(d=>eligibleIndividuals(d).length).length+(((teamEnabled?.value||'Enabled')==='Enabled'&&eligibleTeams('Team Tournament').length)?1:0);
  el.className='tournament-status-card '+(v.valid?'ready':'attention');
  /* ksm:post-split-begin react-registration */ksmRenderTournamentStatus(v.valid,competitors,divs,v.issues.filter(x=>x.severity==='error').length);
  /* ksm:post-split-end */
}
function showValidationDialog(result,onConfirm){
  /* ksm:post-split-begin react-shell */ksmShowValidationDialog(result,onConfirm);/* ksm:post-split-end */
}
function requestTournamentGeneration(){let result=validateTournament();showValidationDialog(result,()=>generatePools({validated:true}))}
function divisionRegenerationStatus(div){if(!state.allMatches?.[div])return 'not-generated';return divisionHasCompletedMatches(div)?'started':'ready'}
function openRegenerateDivisionDialog(){
  /* ksm:post-split-begin react-shell */ksmOpenRegenerateDialog();/* ksm:post-split-end */
}
function continueRegenerateDivision(){/* ksm:post-split-begin react-shell */ksmContinueRegenerateDivision();/* ksm:post-split-end */}
function renderReg(){/* ksm:post-split-begin react-registration */ksmRenderRegistration();/* ksm:post-split-end *//* ksm:post-split-begin quirks-registration */renderTournamentStatus();/* ksm:post-split-end */}
function renderTeams(){/* ksm:post-split-begin react-registration */ksmRenderTeams();/* ksm:post-split-end *//* ksm:post-split-begin quirks-registration */renderTournamentStatus();/* ksm:post-split-end */}
function addExhibitionRow(n=1){for(let i=0;i<n;i++)state.exhibitions.push({white:'',red:'',division:'Exhibition Matches',status:'Registered'});renderExhibitions()}
function renderExhibitions(){/* ksm:post-split-begin react-registration */ksmRenderExhibitions();/* ksm:post-split-end *//* ksm:post-split-begin quirks-registration */renderTournamentStatus();/* ksm:post-split-end */}
function updateComp(i,k,v){state.competitors[i][k]=v;if(k==='division'&&v&&!state.divisions.includes(v)){state.divisions.push(v);renderDivisions()}renderTournamentStatus()}
function loadSamples(){/* ksm:post-split-begin quirks-registration */if(state.competitors.length&&!confirm('Replace all individual competitors with the sample players?'))return;/* ksm:post-split-end */state.competitors=[{name:'Riku Tanaka',dojo:'Aiea Taiheiji',division:'Women’s Open',seed:'1',status:'Checked'},{name:'Hana Sato',dojo:'Waipahu Seibukan',division:'Women’s Open',seed:'2',status:'Checked'},{name:'Mika Ito',dojo:'Honolulu Myohoji',division:'Women’s Open',seed:'',status:'Checked'},{name:'Emi Nakamura',dojo:'Mililani',division:'Women’s Open',seed:'',status:'Checked'},{name:'Yui Watanabe',dojo:'Maui',division:'Women’s Open',seed:'',status:'Checked'},{name:'Aiko Kimura',dojo:'Kailua',division:'Women’s Open',seed:'',status:'Checked'},{name:'Mai Kobayashi',dojo:'Honolulu Myohoji',division:'Women’s Open',seed:'',status:'Checked'},{name:'Sora Yamamoto',dojo:'Aiea Taiheiji',division:'Women’s Open',seed:'',status:'Checked'},{name:'Ken Suzuki',dojo:'Aiea Taiheiji',division:'Yudansha 1–3 Dan',seed:'1',status:'Checked'},{name:'Daichi Mori',dojo:'Waipahu Seibukan',division:'Yudansha 1–3 Dan',seed:'2',status:'Checked'},{name:'Ren Watanabe',dojo:'Maui',division:'Yudansha 1–3 Dan',seed:'',status:'Checked'}];renderReg()}
function loadTeamSamples(){/* ksm:post-split-begin quirks-registration */if(state.teams.length&&!confirm('Replace all teams with the sample teams?'))return;/* ksm:post-split-end */state.teams=[{team:'Aiea Team A',senpo:'Tanaka',jiho:'Ito',chuken:'Suzuki',fukusho:'Nakamura',taisho:'Kato',status:'Checked'},{team:'Waipahu Team A',senpo:'Sato',jiho:'Kimura',chuken:'Yamamoto',fukusho:'Lee',taisho:'Chen',status:'Checked'},{team:'Maui Team A',senpo:'Mori',jiho:'Miura',chuken:'Maeda',fukusho:'Goto',taisho:'Higa',status:'Checked'},{team:'University of Hawaii',senpo:'Arai',jiho:'Ono',chuken:'Kondo',fukusho:'Shima',taisho:'Ueda',status:'Checked'}];renderTeams()}

function loadFullTournament(){
  /* ksm:post-split-begin quirks-registration */if((state.competitors.length||state.teams.length)&&!confirm('Replace the divisions, competitors and teams with the sample tournament?'))return;/* ksm:post-split-end */
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
  state.currentDivision='Women’s Open';
  renderAll();
  alert('Loaded 50 individual competitors across 6 divisions plus sample team entries.');
}

function clearCompetitors(){if(confirm('Clear all individual competitors?')){state.competitors=[];renderReg()}}
/* ksm:post-split-begin clear-confirm */
// F8: Clear Teams and Clear Exhibitions ask first, like Clear Registration (clearCompetitors).
function clearTeams(){if(confirm('Clear all teams?')){state.teams=[];renderTeams()}}
function clearExhibitions(){if(confirm('Clear all exhibition matches?')){state.exhibitions=[];renderExhibitions()}}
/* ksm:post-split-end */
