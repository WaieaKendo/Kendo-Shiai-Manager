// @ts-check
import {state} from '../app-state.js';
import {eligibleIndividuals,eligibleTeams,isTeamDivision} from '../engine/engine-pools.js';
import {generatePools,ksmRenderTournamentStatus,ksmShowValidationDialog,ksmUndoRegenerateOffered,manualSaveTournament,tournamentSettings} from '../legacy.js';
import {ksmGrandChampionError,ksmGrandChampions} from './grand-champion.js';
import {ksmDivisionName,ksmTeamDivisions} from './team-divisions.js';
function validationIssue(severity,code,divisionId,message,suggestedAction=''){return KSMEngine.validationIssue(severity,code,divisionId,message,suggestedAction);// moved to app/engine/registration.ts
  }
export function validateTournament(options={}){
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
export function renderTournamentStatus(){
  let el=window.tournamentStatusCard;if(!el)return;let v=validateTournament();let competitors=state.competitors.filter(c=>c.name&&c.status!=='NoShow').length;let divs=state.divisions.filter(d=>eligibleIndividuals(d).length).length+((teamEnabled?.value||'Enabled')==='Enabled'?ksmTeamDivisions().filter(d=>eligibleTeams(d.id).length).length:0);
  el.className='tournament-status-card '+(v.valid?'ready':'attention');
  ksmRenderTournamentStatus(v.valid,competitors,divs,v.issues.filter(x=>x.severity==='error').length);
}
export function showValidationDialog(result,onConfirm){
  ksmShowValidationDialog(result,onConfirm);
}
export function requestTournamentGeneration(){
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
