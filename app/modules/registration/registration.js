// @ts-check
import {DIVISION_PRESETS,state} from '../app-state.js';
import {renderDivisions} from '../court/court-match-order.js';
import {eligibleIndividuals,eligibleTeams} from '../engine/engine-pools.js';
import {applyIndividualNoShow,applyWholeTeamNoShow,ksmCloseShellDialog,ksmConfirmNoShow,ksmContinueRegenerateDivision,ksmOpenRegenerateDialog,ksmRenderExhibitions,ksmRenderRegistration,ksmRenderTeams,renderAll,scheduleAutoSave} from '../legacy.js';
import {ksmDefaultTeamDivisionId,ksmNewTeamIdentity,ksmNewTeamRows,ksmTeamDivision,ksmTeamSettings} from './team-divisions.js';
import {renderTournamentStatus} from './validation.js';
export function addRow(n=1){for(let i=0;i<n;i++)state.competitors.push({name:'',dojo:'',division:state.divisions[0]||'',seed:'',status:'Registered'});if(window.regFilter)regFilter.value='';renderReg()}
export function addTeamRow(n=1){for(let i=0;i<n;i++)state.teams.push({team:'',division:'Team Tournament',id:ksmNewTeamIdentity(),teamDivisionId:ksmDefaultTeamDivisionId(),type:ksmTeamSettings().teamFormat,senpo:'',jiho:'',chuken:'',fukusho:'',taisho:'',status:'Registered'});if(window.teamFilter)teamFilter.value='';renderTeams()}
export function addAutoTeam(){let n=(state.teams||[]).length+1;let team='Auto Team '+n;state.teams.push({team,division:'Team Tournament',id:ksmNewTeamIdentity(),teamDivisionId:ksmDefaultTeamDivisionId(),type:ksmTeamSettings().teamFormat,senpo:team,jiho:team,chuken:team,fukusho:team,taisho:team,status:'Checked'});renderTeams()}
export function statusCycle(s){return KSMEngine.statusCycle(s);// moved to app/engine/registration.ts
  }
function divisionHasCompletedMatches(div){return (state.allMatches?.[div]||[]).some(m=>m&&m.done)}
export function closeManagementModal(id){if(!ksmCloseShellDialog(id))document.getElementById(id)?.classList.add('hidden');}
export function structuralNoShowAllowed(div){return !!state.generated && !!(state.allMatches?.[div]) && !divisionHasCompletedMatches(div)}
export function cycleCompetitorStatus(i){
  let c=state.competitors[i];if(!c)return;let next=statusCycle(c.status);
  if(next==='NoShow'&&state.generated&&structuralNoShowAllowed(c.division)&&!ksmConfirmNoShow(c.name||'this player',c.division))return;
  c.status=next;
  if(next==='NoShow'&&state.generated){
    if(structuralNoShowAllowed(c.division))applyIndividualNoShow(c.division,c.name);
    else if(state.allMatches?.[c.division])alert('This division has already started. The bracket or pools were not changed; handle the absence with Fusen-sho.');
  }
  renderAll();scheduleAutoSave();
}
export function cycleTeamStatus(i){
  let t=state.teams[i];if(!t)return;let next=statusCycle(t.status);if(next==='NoShow'&&state.generated&&structuralNoShowAllowed(t.teamDivisionId||'Team Tournament')&&!ksmConfirmNoShow(t.team||'this team',t.teamDivisionId||'Team Tournament'))return;t.status=next;
  if(next==='NoShow'&&state.generated){
    let div=t.teamDivisionId||'Team Tournament';
    if(structuralNoShowAllowed(div))applyWholeTeamNoShow(div,t.team);
    else if(state.allMatches?.[div])alert('This team division has already started. The bracket was not changed; handle remaining absences through normal match procedures.');
  }
  renderAll();scheduleAutoSave();
}
export function divisionRegenerationStatus(div){if(!state.allMatches?.[div])return state.generated&&((ksmTeamDivision(div)?eligibleTeams(div):eligibleIndividuals(div))||[]).length?'new':'not-generated';return divisionHasCompletedMatches(div)?'started':'ready'}
export function openRegenerateDivisionDialog(){
  ksmOpenRegenerateDialog();
}
export function continueRegenerateDivision(){ksmContinueRegenerateDivision();}
export function renderReg(){ksmRenderRegistration();renderTournamentStatus();}
export function renderTeams(){ksmRenderTeams();renderTournamentStatus();}
export function addExhibitionRow(n=1){for(let i=0;i<n;i++)state.exhibitions.push({white:'',red:'',division:'Exhibition Matches',status:'Registered'});renderExhibitions()}
export function renderExhibitions(){ksmRenderExhibitions();renderTournamentStatus();}
export function updateComp(i,k,v){state.competitors[i][k]=v;if(k==='division'&&v&&!state.divisions.includes(v)){state.divisions.push(v);renderDivisions()}renderTournamentStatus()}
export function loadSamples(){if(state.competitors.length&&!confirm('Replace all individual competitors with the sample players?'))return;state.competitors=[{name:'Riku Tanaka',dojo:'Aiea Taiheiji',division:'Women’s Open',seed:'1',status:'Checked'},{name:'Hana Sato',dojo:'Waipahu Seibukan',division:'Women’s Open',seed:'2',status:'Checked'},{name:'Mika Ito',dojo:'Honolulu Myohoji',division:'Women’s Open',seed:'',status:'Checked'},{name:'Emi Nakamura',dojo:'Mililani',division:'Women’s Open',seed:'',status:'Checked'},{name:'Yui Watanabe',dojo:'Maui',division:'Women’s Open',seed:'',status:'Checked'},{name:'Aiko Kimura',dojo:'Kailua',division:'Women’s Open',seed:'',status:'Checked'},{name:'Mai Kobayashi',dojo:'Honolulu Myohoji',division:'Women’s Open',seed:'',status:'Checked'},{name:'Sora Yamamoto',dojo:'Aiea Taiheiji',division:'Women’s Open',seed:'',status:'Checked'},{name:'Ken Suzuki',dojo:'Aiea Taiheiji',division:'Yudansha 1–3 Dan',seed:'1',status:'Checked'},{name:'Daichi Mori',dojo:'Waipahu Seibukan',division:'Yudansha 1–3 Dan',seed:'2',status:'Checked'},{name:'Ren Watanabe',dojo:'Maui',division:'Yudansha 1–3 Dan',seed:'',status:'Checked'}];renderReg()}
export function loadTeamSamples(){if(state.teams.length&&!confirm('Replace all teams with the sample teams?'))return;state.teams=[{team:'Aiea Team A',senpo:'Tanaka',jiho:'Ito',chuken:'Suzuki',fukusho:'Nakamura',taisho:'Kato',status:'Checked'},{team:'Waipahu Team A',senpo:'Sato',jiho:'Kimura',chuken:'Yamamoto',fukusho:'Lee',taisho:'Chen',status:'Checked'},{team:'Maui Team A',senpo:'Mori',jiho:'Miura',chuken:'Maeda',fukusho:'Goto',taisho:'Higa',status:'Checked'},{team:'University of Hawaii',senpo:'Arai',jiho:'Ono',chuken:'Kondo',fukusho:'Shima',taisho:'Ueda',status:'Checked'}];state.teams=ksmNewTeamRows(state.teams);renderTeams()}
export function loadFullTournament(){
  if((state.competitors.length||state.teams.length)&&!confirm('Replace the divisions, competitors and teams with the sample tournament?'))return;
  state.divisions=DIVISION_PRESETS.map(x=>x[0]);state.divisionCourts={};DIVISION_PRESETS.forEach(([d,f,c])=>{state.divisionTypes[d]=f;state.divisionCourts[d]=c});state.divisionCourts['Team Tournament']='Both';
  state.divisionTypes={};DIVISION_PRESETS.forEach(([d,f,c])=>state.divisionTypes[d]=f);
  const dojos=['Aiea Taiheiji','Waipahu Seibukan','Honolulu Myohoji','Mililani','Maui','Kailua','Hilo','Kauai','Manoa','Palolo'];
  const first=['Riku','Hana','Mika','Emi','Yui','Aiko','Mai','Sora','Ken','Daichi','Ren','Haruto','Kaito','Yuna','Mei','Akira','Naoki','Takumi','Satoshi','Kei','Nori','Yoshi','Taro','Hiro','Aya','Mina','Noa','Kai','Leo','Ema','Mao','Rena','Kota','Sena','Rei','Shun','Yuto','Nana','Mio','Asa','Ryo','Koki','Sho','Kazu','Miki','Sara','Toma','Haru','Yuki','Kenta'];
  const last=['Tanaka','Sato','Ito','Nakamura','Watanabe','Kimura','Kobayashi','Yamamoto','Suzuki','Mori','Fujimoto','Takahashi','Kondo','Matsuda','Inoue','Hayashi','Oda','Miura','Kato','Shimizu','Ishikawa','Okada','Goto','Higa','Uehara','Arakaki','Nishimura','Tamura','Yoshida','Maeda'];
  const divPlan=/** @type {[string,number][]} */([[DIVISION_PRESETS[0][0],8],[DIVISION_PRESETS[1][0],8],['Women’s Open',8],['Yudansha 1–3 Dan',12],['Yudansha 4 Dan+',8],[DIVISION_PRESETS[6][0],6]]);
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
export function clearCompetitors(){if(confirm(ksmClearQuestion(state.competitors.length,'individual competitor','individual competitors'))){state.competitors=[];renderReg()}}
// F8: Clear Teams and Clear Exhibitions ask first, like Clear Registration (clearCompetitors).
export function clearTeams(){if(confirm(ksmClearQuestion(state.teams.length,'team','teams'))){state.teams=[];renderTeams()}}
export function clearExhibitions(){if(confirm(ksmClearQuestion(state.exhibitions.length,'exhibition match','exhibition matches'))){state.exhibitions=[];renderExhibitions()}}
