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
      // #129 part 3: a cloud tournament this session can write keeps the pre-regenerate copy on the server.
      undo:ksmUndoRegenerateOffered(),
      confirm:async()=>{await manualSaveTournament({throwOnError:true});generatePools({validated:true})}
    }}));
  });
}
// #129: Setup → Advanced → Danger zone holds Regenerate Tournament (the toolbar drops it once the
// tournament is drawn) and Delete tournament (also in Cloud Diagnostics). Both call the existing flows.
function ksmDangerRegenerate(){if(!state.generated||isReadOnlySession())return;requestTournamentGeneration()}
// refresh: the Advanced section was opened (its ontoggle), so the server's restore point is asked again.
function ksmSyncDangerZone(refresh){
  const regen=document.querySelector('[data-testid="setup-regenerate-tournament"]'),del=document.querySelector('[data-testid="setup-delete-tournament"]'),note=document.getElementById('setupDangerReason');
  if(!regen||!del||!note)return;
  const canDelete=typeof ksmCanDeleteTournament==='function'&&!!ksmCanDeleteTournament(),reasons=[];
  regen.disabled=isReadOnlySession()||!state.generated;del.disabled=!canDelete;
  if(!state.generated)reasons.push('Regenerate Tournament is available once the tournament has been generated.');
  if(!canDelete)reasons.push('Delete tournament is available to staff of a saved cloud tournament.');
  note.textContent=reasons.join(' ');note.hidden=!reasons.length;
  ksmRenderUndoRegenerate();
  if(refresh===true)ksmRefreshRestorePoint();
}
// ---- #129 part 3: Undo regenerate ----
// A full Regenerate Tournament of a cloud tournament marks its save (restorePoint: 'regenerate' in the
// PUT body, see performCloudSave); the server then keeps the record it replaced for 24 h. A director or
// admin (staff session in the staff-key mode) restores it from the Danger zone. The mark lives in this
// tab's sessionStorage (it survives a reload) and in the queued outbox entry (a tab that takes over a
// closed tab's work sends it too) until a save carrying it is accepted. Local-only tournaments have no undo.
const KSM_RESTORE_MARK_PREFIX='ksm.restore-mark.v4_1';
const KSM_RESTORE_POINT_TTL_MS=24*60*60*1000;
let ksmRestorePoint=null,ksmRestorePointBusy=false;
function ksmUndoRegenerateOffered(){return Boolean(cloudSession.tournamentId)&&!isReadOnlySession()&&location.protocol!=='file:'}
function ksmRestoreMarkKey(id){return `${KSM_RESTORE_MARK_PREFIX}:${id||''}`}
// The mark names the regenerate's managementRevision: only a payload that contains the regenerate
// carries it (not a save of the older state that was already on its way).
function ksmSetRestoreMark(id,markId,managementRevision){if(!id)return;try{sessionStorage.setItem(ksmRestoreMarkKey(id),JSON.stringify({kind:'regenerate',id:markId||ksmClockId(),managementRevision:Number(managementRevision||0),at:Date.now()}))}catch(_){}}
// {restorePoint:'regenerate',restorePointId,managementRevision} while this tab's regenerate is not saved yet,
// else null. With a payload: only when that payload contains the regenerate.
function ksmPendingRestoreMark(id=cloudSession.tournamentId,payload=null){
  if(!id)return null;
  try{
    const mark=JSON.parse(sessionStorage.getItem(ksmRestoreMarkKey(id))||'null');
    if(mark?.kind!=='regenerate'||!(Date.now()-Number(mark.at||0)<KSM_RESTORE_POINT_TTL_MS))return null;
    if(payload&&Number(payload.state?.managementRevision||0)<Number(mark.managementRevision||0))return null;
    return {restorePoint:'regenerate',restorePointId:String(mark.id||''),managementRevision:Number(mark.managementRevision||0)};
  }catch(_){return null}
}
function ksmClearRestoreMark(id=cloudSession.tournamentId,markId){
  try{const key=ksmRestoreMarkKey(id),mark=JSON.parse(sessionStorage.getItem(key)||'null');if(!markId||mark?.id===markId)sessionStorage.removeItem(key)}catch(_){}
}
function ksmMarkRegenerateSave(){if(ksmUndoRegenerateOffered())ksmSetRestoreMark(cloudSession.tournamentId,'',state.managementRevision)}
// Asks the server whether there is a live restore point this session may restore (GET /status).
async function ksmRefreshRestorePoint(){
  const id=cloudSession.tournamentId;
  if(!ksmUndoRegenerateOffered()){ksmRestorePoint=null;ksmRenderUndoRegenerate();return null}
  if(!navigator.onLine){ksmRenderUndoRegenerate();return ksmRestorePoint}
  try{
    const response=await fetch(`/api/tournaments/${encodeURIComponent(id)}/status`,{cache:'no-store',headers:cloudHeaders()});
    if(id!==cloudSession.tournamentId)return null;
    const info=response.ok?await response.json():null;
    ksmRestorePoint=info?.restorePoint?{...info.restorePoint,tournamentId:id}:null;
  }catch(_){}
  ksmRenderUndoRegenerate();
  return ksmRestorePoint;
}
function ksmLiveRestorePoint(){const point=ksmRestorePoint;return point&&point.tournamentId===cloudSession.tournamentId&&ksmUndoRegenerateOffered()&&Date.parse(point.expiresAt)>Date.now()?point:null}
function ksmRestoreTime(value){const date=new Date(value),today=new Date();const time=date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});return date.toDateString()===today.toDateString()?time:`${date.toLocaleDateString([], {weekday:'short'})} ${time}`}
function ksmMatchWord(n){return `${n} finished ${n===1?'match':'matches'}`}
// The button and its line are added only while there is something to undo (Setup goldens unchanged).
function ksmRenderUndoRegenerate(){
  const zone=document.querySelector('[data-testid="setup-danger-zone"]'),actions=zone?.querySelector('.actions');
  if(!actions)return;
  const point=ksmLiveRestorePoint();
  let button=zone.querySelector('[data-testid="setup-undo-regenerate"]'),info=zone.querySelector('[data-testid="setup-undo-regenerate-info"]');
  if(!point){button?.remove();info?.remove();return}
  if(!button){button=document.createElement('button');button.type='button';button.className='secondary danger';button.dataset.testid='setup-undo-regenerate';button.textContent='Undo regenerate';button.addEventListener('click',()=>ksmUndoRegenerate());actions.prepend(button)}
  if(!info){info=document.createElement('p');info.className='small';info.dataset.testid='setup-undo-regenerate-info';actions.after(info)}
  const offline=!navigator.onLine;
  button.disabled=offline||ksmRestorePointBusy;
  info.textContent=`Regenerated at ${ksmRestoreTime(point.takenAt)}. Undo regenerate brings back the tournament from before it, with ${ksmMatchWord(point.finishedMatches)}; available until ${ksmRestoreTime(point.expiresAt)}.`+(offline?' Undo regenerate needs a connection.':'');
}
window.addEventListener('ksm:regenerate-saved',()=>ksmRefreshRestorePoint());  // performCloudSave: the marked save landed
// A save (or queued save) of this device met another device's Undo regenerate (performCloudSave's 409):
// its work goes to the recovery file and the restored record is applied.
window.addEventListener('ksm:superseded-by-restore',event=>{const {record,payload}=event.detail||{};if(!record)return;ksmDropWorkBeforeRestore(record,payload);applyRemoteCloudRecord(record,true,true)});
window.addEventListener('online',()=>ksmRenderUndoRegenerate());
window.addEventListener('offline',()=>ksmRenderUndoRegenerate());
async function ksmUndoRegenerate(){
  const point=ksmLiveRestorePoint();
  if(!point||ksmRestorePointBusy)return;
  if(!navigator.onLine){alert('Undo regenerate needs a connection.');return}
  const now=KSMEngine.finishedMatchSummary(state.allMatches).total;
  if(!confirm(`Undo regenerate? The tournament goes back to how it was before the regenerate at ${ksmRestoreTime(point.takenAt)} (${ksmMatchWord(point.finishedMatches)}). Everything done since the regenerate (${ksmMatchWord(now)} now) is replaced on every device.`))return;
  ksmRestorePointBusy=true;ksmRenderUndoRegenerate();
  try{
    // This device's own unsaved work is sent first (the server copy is what the undo replaces).
    if(localChangesPending()){clearTimeout(ksmSaveTimer);ksmSaveTimer=null;clearTimeout(ksmCloudTimer);ksmCloudTimer=null;if(readOutbox())await flushCloudOutbox();if(localChangesPending())await saveTournamentToCloudWithReason('Before undo regenerate',true)}
    if(localChangesPending()){alert('This device has changes that are not saved yet. Wait until they are saved, then try again.');return}
    const id=cloudSession.tournamentId;
    let response,parsed=null;
    try{response=await fetch(`/api/tournaments/${encodeURIComponent(id)}/restore-point`,{method:'POST',headers:cloudHeaders(),body:JSON.stringify({revision:Number(cloudSession.revision||0)})})}
    catch(_){alert('Undo regenerate needs a connection. Nothing was changed.');return}
    try{parsed=await response.json()}catch(_){}
    if(id!==cloudSession.tournamentId)return;
    if(response.ok&&parsed?.payload){ksmApplyRestoredRecord(parsed);ksmRestorePoint=null;showKsmToast('✓ Regenerate undone',2600);return}
    if(response.status===409&&parsed?.record){applyRemoteCloudRecord(parsed.record,true,false);alert('Another device saved a change just now. Check the tournament, then press Undo regenerate again.');return}
    if(response.status===410&&parsed?.code==='tournament-deleted'){ksmAnnounceTournamentGone(id);return}
    if(['restore-point-expired','no-restore-point'].includes(parsed?.code)){ksmRestorePoint=null;alert(parsed.code==='restore-point-expired'?'The regenerate can no longer be undone: 24 hours have passed.':'There is no regenerate to undo (it may have been undone on another device).');return}
    alert(`Undo regenerate failed: ${parsed?.error||`HTTP ${response.status}`}. Nothing was changed.`);
  }finally{ksmRestorePointBusy=false;ksmRefreshRestorePoint()}
}
// The restored record replaces this device's tournament as a save would; court positions and current
// matches come from the restored copy (not a court's local division choice).
function ksmApplyRestoredRecord(record){
  clearLocalCourtDivisions();
  ksmApplyingRemoteSnapshot=true;
  try{
    applyTournamentPayload(record.payload,false,{pinnedCourt:pinnedCourt(),preserveLocalDivision:false,source:'undo regenerate'});restorePinnedCourt();ksmStoreAutosave(record.payload);
    cloudSession.revision=Number(record.revision||0);cloudSession.updatedAt=record.updatedAt;persistCloudSession();rememberCloudBase(record);ksmCacheTournament(record);
    ksmConfirmedMutationVersion=Math.max(ksmConfirmedMutationVersion,ksmLocalMutationVersion);ksmLastSuccessfulSaveAt=Date.parse(record.updatedAt)||Date.now();ksmSaveStatusMode='saved';renderPersistentSaveStatus();
  }finally{ksmApplyingRemoteSnapshot=false}
}
// A record whose Undo regenerate this device has not seen yet (record.restored, set by the server).
function ksmRestoredSince(record,revision=cloudSession.revision){return Number(record?.restored?.revision||0)>Number(revision||0)}
// Work this device made before another device's Undo regenerate is not replayed onto the restored
// tournament (matched by identity it could land on the old results): it is kept in the recovery file
// (Setup -> Advanced -> Download Recovery File) and the restored copy is applied.
function ksmDropWorkBeforeRestore(record,payload=tournamentPayload()){
  const outbox=readOutbox();
  try{localStorage.setItem(KSM_CLOUD_RECOVERY_KEY,JSON.stringify({savedAt:new Date().toISOString(),outbox:outbox||{tournamentId:cloudSession.tournamentId,baseRevision:cloudSession.revision||0,payload,queuedAt:new Date().toISOString()},serverRevision:record?.revision||0,reason:'Replaced by Undo regenerate'}))}catch(_){}
  clearOutbox();clearTimeout(ksmSaveTimer);ksmSaveTimer=null;clearTimeout(ksmCloudTimer);ksmCloudTimer=null;clearTimeout(ksmQueuedSaveRetryTimer);ksmQueuedSaveRetryTimer=null;
  const pending=ksmCloudSavePending;ksmCloudSavePending=null;pending?.resolvers.forEach(resolve=>resolve(false));ksmConfirmedMutationVersion=Math.max(ksmConfirmedMutationVersion,ksmLocalMutationVersion);ksmOutboxMutationVersion=0;
  ksmClearRestoreMark();
  writeCloudDiagnosticsState({stage:'Local changes replaced by Undo regenerate',serverRevision:Number(record?.revision||0)});
  showKsmToast('Undo regenerate on another device replaced this device’s unsaved changes (kept in the recovery file).',6000,true);
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
