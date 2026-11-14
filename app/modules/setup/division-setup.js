// @ts-check
import {DIVISION_PRESETS,state} from '../app-state.js';
import {findNextForCourt,isTeamMatch,renderDivisions} from '../court/court-match-order.js';
import {matchBelongsToCourt} from '../engine/engine-generation.js';
import {championshipCourtFor,divisionCourtMode,poolCourtFor} from '../engine/engine-pools.js';
import {ksmRenderSetupDivisions,ksmRenderSetupHeader} from '../react-bridges/setup.js';
import {ksmRenderGrandChampionSetup} from '../registration/grand-champion.js';
import {renderReg} from '../registration/registration.js';
import {ksmRenderTeamDivisions,ksmSyncLegacyTeamDivision} from '../registration/team-divisions.js';
import {renderTournamentStatus} from '../registration/validation.js';
import {ksmRefreshTournamentChip} from '../session/tournament-switcher.js';
import {showKsmToast} from '../sync/cloud-realtime-save-and-load.js';
import {ksmSetSetting,ksmSetting} from '../sync/cloud-session-and-autosave.js';
function addDivision(v){v=v||customDivName?.value?.trim()||window.newDiv?.value?.trim();if(!v)return;if(!state.divisions.includes(v)){state.divisions.push(v);state.divisionTypes[v]=customDivFormat?.value||window.newDivType?.value||'Round Robin';state.divisionCourts[v]=/** @type {any} */(customDivCourt?.value||'A')}if(window.customDivName)customDivName.value='';renderDivisionSetup();renderDivisions();renderReg()}
export function addCustomDivision(){const name=customDivName.value.trim();const added=name&&!state.divisions.includes(name);addDivision();/** @type {HTMLButtonElement} */(document.querySelector('[data-testid="custom-division-add"]')).disabled=true;if(added)ksmAnnounceAddedDivision(name);}
export function removeDivision(i){let d=state.divisions[i];state.divisions.splice(i,1);delete state.divisionTypes[d];delete state.divisionCourts[d];renderDivisionSetup();renderDivisions();renderReg()}
export function toggleDivision(d,on){if(on&&!state.divisions.includes(d)){state.divisions.push(d);let p=DIVISION_PRESETS.find(x=>x[0]===d);state.divisionTypes[d]=state.divisionTypes[d]||(p?p[1]:'Round Robin');state.divisionCourts[d]=state.divisionCourts[d]||(p?p[2]:'A')}if(!on&&state.divisions.includes(d)){state.divisions=state.divisions.filter(x=>x!==d)}renderDivisionSetup();renderDivisions();renderReg()}
// A division's court changed after the draw: its unplayed matches move with it (before, every
// match kept the court it was drawn with, so the court screens and Overview still showed the old
// court). Pools, pool championships and single elimination get the court the draw would have given
// them (split: the same A/B rule); played matches stay where they were. A court left showing this
// division, or one now holding the division's next match while idle, picks its next match again.
export function ksmReassignDivisionCourt(d){
  const all=state.allMatches?.[d];if(!all)return;
  const mode=divisionCourtMode(d);
  if(mode!=='split')(state.pools[d]||[]).forEach(p=>{delete p.court});
  const roundSize={};all.forEach(m=>{if(m&&m.championship&&!m.singleElim)roundSize[m.position]=(roundSize[m.position]||0)+1});
  const elimNodes=state.singleElimNodes?.[d]||[];
  all.forEach(m=>{
    if(!m||m.done||isTeamMatch(m))return;
    if(m.singleElim){const node=elimNodes.find(n=>n.id===m.elimNodeId);m.court=mode==='split'?(m.position==='Final'?'A':(node?.court||'A')):/** @type {any} */(mode)}
    else if(m.championship)m.court=championshipCourtFor(d,m.position,m.bracketSlot,roundSize[m.position]||1);
    else m.court=poolCourtFor(d,m.pool);
  });
  ['A','B'].forEach(c=>{
    const cs=state.courtState?.[c];
    if(cs&&cs.division===d){state.courtState[c]=findNextForCourt(c,null,0);state.courtActiveDivision[c]=state.courtState[c].division}
  });
}
export function setDivisionFormat(d,v){state.divisionTypes[d]=v;renderReg()}
export function renderDivisionSetup(){
  // The divisions table's rows are React (app/react/setup/, 42-react-setup.js): they are published
  // to it instead of written (M.13). The team court and awards fields stay legacy markup.
  if(!window.divisionSetupRows)return;ksmRenderSetupDivisions();ksmRenderTeamDivisions();ksmRenderGrandChampionSetup();ksmSetSetting('teamCourt',state.divisionCourts['Team Tournament']||'Both');ksmSetSetting('teamAwardMode',state.teamAwardMode||'top2')}
function courtEligibleDivisions(court){
  let all=[...new Set([...Object.keys(state.allMatches||{}),...state.divisions])];
  return all.filter(d=>{
    let arr=state.allMatches[d]||[];
    if(!arr.length)return false;
    return arr.some(m=>!m.done && matchBelongsToCourt(m,court));
  });
}
function ksmAnnounceAddedDivision(name){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const row=[...document.querySelectorAll('[data-testid="setup-division-row"]')].find(row=>row.querySelector('[data-testid="setup-division-name"]')?.textContent===name);
    if(row){row.scrollIntoView({block:'center'});row.classList.add('setup-division-added');row.addEventListener('animationend',()=>row.classList.remove('setup-division-added'),{once:true})}
    showKsmToast('Added division: '+name);
  }));
}
// ---------- KSM v3.9.1 Setup header synchronization ----------
export function syncSetupHeader(){
  // The hero's name is React (app/react/setup/, 42-react-setup.js): the name field's value is
  // published to it instead of written (M.13).
  ksmRenderSetupHeader();ksmRefreshTournamentChip();}

// saveSetup() and setDivisionCourt() (step 4a of #136; were app/js/01-state-and-setup.js). saveSetup() is ONE final function:
// 30-setup-header-and-director.js used to wrap it at load to end with syncSetupHeader(); that call is the last line below.
// No load-time call of saveSetup() ran before 30- (renderAll(), its only caller there, is first called after it).
export function saveSetup(){
  ksmSyncLegacyTeamDivision();
  state.divisionCourts['Team Tournament']=/** @type {any} */(ksmSetting('teamCourt'));
  state.teamAwardMode=ksmSetting('teamAwardMode')||'top2';
  renderDivisionSetup();renderDivisions();renderReg();renderTournamentStatus();
  syncSetupHeader();
}
// A `let`: tests replace window.setDivisionCourt (a spy under an inline onclick), so its window accessor writes through setSetDivisionCourt().
export let setDivisionCourt=function setDivisionCourt(d,v){state.divisionCourts[d]=v;ksmReassignDivisionCourt(d);renderDivisions();renderTournamentStatus()};
export function setSetDivisionCourt(value){setDivisionCourt=value}
// The tournament-name listener (app/js, where 30- used to load).
export function initSetupHeader(){
if(window.tName){
  tName.addEventListener('input',syncSetupHeader);
}
}
