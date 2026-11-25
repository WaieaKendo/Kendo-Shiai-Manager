// @ts-check
import {state} from '../app-state.js';
import {ksmLoadPeople,ksmSetPeople,ksmUpdatePerson} from './people-store.js';
import {ksmSetDivisionCourt} from '../setup/divisions-store.js';
import {renderDivisions} from '../court/court-match-order.js';
import {ksmAddDaihyosenForTeamAwards} from '../engine/engine-standings-and-tiebreaks.js';
import {scheduleAutoSave} from '../sync/cloud-session-and-autosave.js';
import {divisionHasCompletedMatches,renderTeams} from './registration.js';
import {renderTournamentStatus} from './validation.js';
import {isReadOnlySession} from '../session/staff-session-and-library.js';
import {writeCloudDiagnosticsState} from '../sync/cloud-diagnostics.js';
import {getSetupSnapshot,ksmSetSetting,tournamentSettings} from '../sync/cloud-session-and-autosave.js';
import * as KSMEngine from '../../engine/index.ts';
export function ksmNewTeamRows(rows){const division=ksmDefaultTeamDivisionId();return rows.map(t=>({...t,id:ksmNewTeamIdentity(),teamDivisionId:division}))}
// The saved format this app understands (team divisions = 2, grand champion #86 = 3), sent with every
// save (cloudHeaders(), 33). The server refuses saves from apps below its MIN_CLIENT_SCHEMA
// (src-worker.js): raise both together.
export const KSM_CLIENT_SCHEMA=3;
export function ksmNewTeamIdentity(){return 'team:'+Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('')}
export function ksmTeamDivisionPayload(payload){return payload?.state?{...payload,state:KSMEngine.migrateGrandChampions(KSMEngine.migrateTeamDivisions(payload.state,payload.setup||{}))}:payload}
// #95 review: a loaded copy whose teams name a team division it does not have (an older client, a
// removed division) has them moved to the first division; say so in the diagnostics, not silently.
export function ksmNoteTeamsReassigned(before,after,source){
  const known=new Set((after.teamDivisions||[]).map(d=>d.id));
  const moved=(before?.teams||[]).filter(t=>t?.teamDivisionId&&!known.has(t.teamDivisionId)).map(t=>t.team||t.id);
  if(!moved.length)return;
  console.warn('[KSM Team divisions] Teams of an unknown team division moved to the first one',source||'load',moved);
  writeCloudDiagnosticsState({stage:'Team division assignment repaired on load',teamsReassigned:moved});
}
// The load-time migration (a 4.0 save, the reset's empty state): the team divisions built and every team given an id and a
// team division, one tournament/peopleLoaded with the two lists it changed (#15 PR 10; it assigned the whole state before).
export function ksmTeamDivisions(){
  if(!state.teamDivisions){const {teamDivisions,teams}=KSMEngine.migrateTeamDivisions(/** @type {any} */(state),getSetupSnapshot());ksmLoadPeople({teamDivisions,teams})}
  return [...state.teamDivisions].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
}
export function ksmTeamDivision(id){return (state.teamDivisions||[]).find(d=>d.id===id)}
// #86: a grand champion's division shows its row's name.
export function ksmDivisionName(id){return KSMEngine.grandChampionName(state.grandChampions,id)??KSMEngine.teamDivisionName(state.teamDivisions,id)}
// Legacy controls serialize old files, but cannot override authoritative division records.
// state.teamAwardMode is a getter over the Setup field (#15 PR 8b), and the team court goes through ksmSetTeamCourt().
export function ksmSyncLegacyTeamDivision(){
  const d=ksmTeamDivision(KSMEngine.LEGACY_TEAM_DIVISION_ID);if(!d)return;
  for(const [key,value] of Object.entries({teamFormat:d.teamFormat,teamTournamentFormat:d.teamTournamentFormat,teamAwardMode:d.awardMode})){
    ksmSetSetting(key,value);
  }
  ksmSetTeamCourt(d.court);
}
/**
 * The team court (#15 PR 8b, PR 9): the Setup field settings.teamCourt is the value, and the legacy team division's entry
 * state.divisionCourts['Team Tournament'] (the copy 4.0 devices, the court lists and the generation read) is derived from
 * it in the store (withTeamCourt(), app/store/slices/tournament.ts: equal after every action). So this is
 * tournament/settingChanged alone; the entry gets the field's value as its select holds it.
 * @param {string} court
 */
export function ksmSetTeamCourt(court){
  ksmSetSetting('teamCourt',court);
}
export function ksmTeamSettings(id){
  const d=ksmTeamDivision(id)||(!id?ksmTeamDivisions()[0]:null),settings=tournamentSettings();
  return d?{...settings,teamFormat:d.teamFormat,teamTournamentFormat:d.teamTournamentFormat,teamCourt:d.court,teamAwardMode:d.awardMode}:settings;
}
// A team division is fixed once it has a draw (its matches refer to its teams by position): format,
// court, removal and its team list. Like individual divisions, a team division without a draw can still
// be added, changed and removed after the tournament is generated, and drawn on its own
// (Regenerate Single Division).
function ksmTeamDivisionDrawn(id){return Boolean(id)&&(state.allMatches?.[id]||[]).length>0}
/** Where a new team goes: the first team division without a draw (after generation), else the first. */
export function ksmDefaultTeamDivisionId(){const rows=ksmTeamDivisions();return (rows.find(d=>!ksmTeamDivisionDrawn(d.id))||rows[0])?.id||''}
// #15 PR 10: the team divisions are store data. Each edit below computes the new lists from the current ones (rows are
// copied, never written in place; the stored array keeps its order, as the in-place writes kept it) and dispatches one
// tournament/teamDivision… action with the lists it changed: `teamDivisions` and, when its teams change with it, `teams`.
/** `teams` with `change(team)` merged into each team `pick(team)` selects (other teams kept as they are). */
const teamsWith=(/** @type {(t:any)=>boolean} */ pick,/** @type {(t:any)=>object} */ change)=>(state.teams||[]).map(t=>pick(t)?{...t,...change(t)}:t);
export function ksmAddTeamDivision(name='Team division'){
  const divisions=ksmTeamDivisions(),id=ksmNewTeamIdentity();
  const added={id,name,teamFormat:'3-Person Team',teamTournamentFormat:'Single Elimination',court:'Both',awardMode:'top2',order:Math.max(-1,...divisions.map(d=>d.order))+1};
  // The first team division takes the teams that have none.
  ksmSetPeople('teamDivisionAdded',{teamDivisions:[...state.teamDivisions,/** @type {any} */ (added)],...(divisions.length?{}:{teams:teamsWith(t=>!t.teamDivisionId,()=>({teamDivisionId:id}))})});
  ksmSetDivisionCourt(id,'Both');
  ksmTeamDivisionChanged();return id;
}
export function ksmUpdateTeamDivision(id,patch){
  const d=ksmTeamDivision(id);if(!d)return 'Team division no longer exists';
  if(patch.name!==undefined&&!String(patch.name).trim())return 'Enter a division name';
  if(ksmTeamDivisionDrawn(id)&&Object.keys(patch).some(k=>!['name','order','awardMode'].includes(k)))return 'Match format and court cannot change once this division is drawn';
  const next={...d,...patch,id:d.id,name:String(patch.name??d.name).trim()};
  // Its teams take a new match format with it (one action).
  ksmSetPeople('teamDivisionUpdated',{teamDivisions:state.teamDivisions.map(x=>x===d?next:x),...(patch.teamFormat?{teams:teamsWith(t=>t.teamDivisionId===id,()=>({type:next.teamFormat}))}:{})});
  if(patch.court)ksmSetDivisionCourt(id,next.court);// 'Team Tournament': the Setup's team court (ksmSetTeamCourt())
  if(id==='Team Tournament')ksmSyncLegacyTeamDivision();
  if(patch.awardMode)ksmAddDaihyosenForTeamAwards();
  ksmTeamDivisionChanged();return null;
}
export function ksmMoveTeamDivision(id,direction){
  const rows=ksmTeamDivisions(),i=rows.findIndex(d=>d.id===id),j=i+(direction==='up'?-1:1);
  if(i<0||j<0||j>=rows.length)return;
  [rows[i],rows[j]]=[rows[j],rows[i]];
  // Each division's `order` is its place in the new running order; the stored array keeps its own order.
  const order=new Map(rows.map((d,index)=>[d.id,index]));
  ksmSetPeople('teamDivisionMoved',{teamDivisions:state.teamDivisions.map(d=>d.order===order.get(d.id)?d:{...d,order:/** @type {number} */ (order.get(d.id))})});
  ksmTeamDivisionChanged();
}
export function ksmRemoveTeamDivision(id){
  const rows=ksmTeamDivisions(),d=rows.find(d=>d.id===id);if(!d)return false;
  if(ksmTeamDivisionDrawn(id)){alert(`${d.name} is drawn: it cannot be removed.`);return false}
  // Its teams move to a division without a draw (moving them into a drawn one would change its draw).
  const fallback=rows.find(x=>x.id!==id&&!ksmTeamDivisionDrawn(x.id))||(state.generated?null:rows.find(x=>x.id!==id)),teams=state.teams.filter(t=>t.teamDivisionId===id);
  if(teams.length&&!fallback){alert(state.generated?'Its teams need a team division without a draw: add one, or move them first.':'Add another team division before removing one with teams.');return false}
  if(teams.length&&!confirm(`Remove ${d.name}? Its ${teams.length} ${teams.length===1?'team':'teams'} will move to ${fallback.name}.`))return false;
  // The rest in running order (as before: the sorted list is what is kept), its teams moved, one action.
  ksmSetPeople('teamDivisionRemoved',{teamDivisions:rows.filter(d=>d.id!==id),...(teams.length?{teams:teamsWith(t=>t.teamDivisionId===id,()=>({teamDivisionId:fallback.id}))}:{})});
  // The 'Team Tournament' entry stays: it is the Setup's team court (ksmSetTeamCourt()), which saveSetup() wrote back on the next render.
  if(id!==KSMEngine.LEGACY_TEAM_DIVISION_ID)ksmSetDivisionCourt(id,null);
  ksmTeamDivisionChanged();return true;
}
/** Whether a team is part of a division's draw (in its bracket or pools), not just assigned to it.
 * A team added after the draw is not, until the division is regenerated. */
function ksmTeamInDraw(team,div){return ksmTeamDivisionDrawn(div)&&ksmTeamInDrawOf(state,team,div)}
/** ksmTeamInDraw() for any state (the sync merge checks the merged one). Draw entries are team copies
 * (matched by id, else name) or, in older data, plain ids or names. */
export function ksmTeamInDrawOf(st,team,div){
  if(!team||!div)return false;
  const name=String(team.team||'').trim();
  const same=x=>x!=null&&(typeof x==='string'?Boolean((team.id&&x===team.id)||(name&&x.trim()===name)):Boolean((team.id&&x.id===team.id)||(name&&String(typeof x.team==='string'?x.team:x.name||'').trim()===name)));
  if((st?.teamElimTeams?.[div]||[]).some(same))return true;
  return (st?.teamPools?.[div]||[]).some(p=>(p?.players||[]).some(same));
}
// The team is the row object the caller read from state.teams (its index there names it, #15 PR 10).
export function ksmAssignTeamDivision(team,id){
  const d=ksmTeamDivision(id);if(!d)return false;
  if(team.teamDivisionId===id)return true;
  const from=ksmTeamDivision(team.teamDivisionId);
  // Teams in a draw stay in it (its matches refer to them). A team not drawn yet (added after the draw)
  // can join a drawn division until that division has played a match; Regenerate Single Division
  // then puts it in the bracket.
  if(ksmTeamInDraw(team,team.teamDivisionId)){alert(`${team.team||'This team'} is in the ${from?.name||'division'} draw: it cannot move to another division.`);ksmTeamDivisionChanged();return false}
  if(ksmTeamDivisionDrawn(id)&&divisionHasCompletedMatches(id)){alert(`${d.name} has started: new teams cannot join it.`);ksmTeamDivisionChanged();return false}
  ksmUpdatePerson('team',(state.teams||[]).indexOf(team),{teamDivisionId:id,type:d.teamFormat});ksmTeamDivisionChanged();
  if(ksmTeamDivisionDrawn(id))ksmTeamNeedsRedraw(d);
  return true;
}
/** Tell the director once per division that a team added after the draw needs a redraw to play. */
const ksmRedrawTold=new Set();
function ksmTeamNeedsRedraw(d){
  if(typeof isReadOnlySession==='function'&&isReadOnlySession())return;
  if(ksmRedrawTold.has(d.id))return;
  ksmRedrawTold.add(d.id);
  alert(`${d.name} is already drawn. To add this team to its bracket, use Regenerate Single Division on ${d.name} (before any of its matches are played).`);
}
function ksmTeamDivisionChanged(){
  ksmRenderTeamDivisions();renderDivisions();renderTeams();renderTournamentStatus();scheduleAutoSave('Team divisions');
}
// Why a team division's control is off (shown as its tooltip): drawn divisions keep format, court and teams.
function ksmTeamDivisionLockTip(d){return ksmTeamDivisionDrawn(d.id)?`Fixed: ${d.name} is drawn, so its match format and court can't change and its drawn teams stay in it. Its name, awards and order can still change.`:''}
export function ksmRenderTeamDivisions(){
  const root=document.getElementById('teamDivisionSetup');if(!root)return;
  const rows=ksmTeamDivisions(),off=tournamentSettings().teamEnabled==='Disabled'||isReadOnlySession();
  const add=/** @type {HTMLButtonElement|null} */(document.querySelector('[data-testid="team-division-add"]'));if(add)add.disabled=off;
  // Say why the team setup can't change (it looked editable while disabled): teams off, or fixed by the draw.
  const teamsOff=tournamentSettings().teamEnabled==='Disabled';
  if(teamsOff)root.dataset.teamsOff='1';else delete root.dataset.teamsOff;
  const text=isReadOnlySession()?'':teamsOff?'Teams are disabled. Set Teams enabled to Enabled to set up team divisions.'
    :rows.some(d=>ksmTeamDivisionDrawn(d.id))?'Drawn team divisions keep their match format and court, and drawn teams stay in their division. Names, awards and order can still change. New teams can join a drawn division before it starts: then use Regenerate Single Division on it. A new team division can be added and drawn the same way.':'';
  let note=document.getElementById('teamDivisionNote');
  if(!text)note?.remove();
  else if(add){
    if(!note){note=document.createElement('p');note.id='teamDivisionNote';note.className='small team-division-note';note.dataset.testid='team-division-note';note.setAttribute('role','status');add.after(note)}
    note.textContent=text;
  }
  const key=JSON.stringify(rows.map(d=>d.id));
  // Keep existing controls while typing. A sync redraw must not discard an uncommitted name
  // or remove the button receiving the click that commits it.
  if(root.dataset.divisionIds===key){
    rows.forEach((d,i)=>{
      const row=root.querySelectorAll('[data-testid="team-division-row"]')[i];if(!row)return;
      for(const field of ['name','teamFormat','teamTournamentFormat','court','awardMode']){
        const input=/** @type {HTMLInputElement} */(row.querySelector(`[data-testid="team-division-${field}"]`));
        if(document.activeElement!==input)input.value=d[field];
        if(field!=='name')input.setAttribute('aria-label',input.getAttribute('aria-label').split(' — ')[0]+' — '+d.name);
        input.disabled=off||(ksmTeamDivisionDrawn(d.id)&&!['name','awardMode'].includes(field));
        input.title=input.disabled&&!off?ksmTeamDivisionLockTip(d):'';
      }
      /** @type {HTMLButtonElement} */(row.querySelector('[data-testid="team-division-up"]')).disabled=off||i===0;
      /** @type {HTMLButtonElement} */(row.querySelector('[data-testid="team-division-down"]')).disabled=off||i===rows.length-1;
      const remove=/** @type {HTMLButtonElement} */(row.querySelector('[data-testid="team-division-remove"]'));remove.disabled=off||ksmTeamDivisionDrawn(d.id);
      remove.title=remove.disabled&&!off?ksmTeamDivisionLockTip(d):'Remove — '+d.name;
    });return;
  }
  root.dataset.divisionIds=key;root.replaceChildren();root.className='setup-division-table-wrap';
  const table=document.createElement('table');table.className='setup-division-table setup-team-division-table';
  const head=document.createElement('thead'),headRow=document.createElement('tr');
  ['Division','Match format','Tournament format','Court','Awards','Order'].forEach(label=>{const th=document.createElement('th');th.textContent=label;headRow.append(th)});
  head.append(headRow);table.append(head);const body=document.createElement('tbody');table.append(body);root.append(table);
  const select=(d,key,label,values)=>{
    const cell=document.createElement('td'),input=document.createElement('select');
    input.dataset.testid='team-division-'+key;input.setAttribute('aria-label',label+' — '+d.name);
    values.forEach(([value,name])=>input.add(new Option(name,value)));input.value=d[key];
    input.disabled=off||(ksmTeamDivisionDrawn(d.id)&&key!=='awardMode');if(input.disabled&&!off)input.title=ksmTeamDivisionLockTip(d);
    input.onchange=()=>{const error=ksmUpdateTeamDivision(d.id,{[key]:input.value});if(error)alert(error)};
    cell.append(input);return cell;
  };
  rows.forEach((d,i)=>{
    const row=document.createElement('tr');row.dataset.testid='team-division-row';row.dataset.divisionId=d.id;
    const cell=document.createElement('td'),name=document.createElement('input');
    name.value=d.name;name.dataset.testid='team-division-name';name.setAttribute('aria-label','Team division name');name.disabled=off;
    name.onchange=()=>{const error=ksmUpdateTeamDivision(d.id,{name:name.value});if(error){alert(error);name.value=ksmTeamDivision(d.id)?.name||''}};
    cell.append(name);row.append(cell,select(d,'teamFormat','Match format',['3-Person Team','5-Person Team','Kachinuki'].map(x=>[x,x])),select(d,'teamTournamentFormat','Tournament format',['Single Elimination','Round Robin'].map(x=>[x,x])),select(d,'court','Court',['A','B','Both'].map(x=>[x,x])),select(d,'awardMode','Awards',[['top1','Champion only'],['top2','Champion + Runner-up'],['dual3','Champion + Runner-up + 3rd place(s)']]));
    const actions=document.createElement('td'),buttons=document.createElement('span');buttons.className='setup-division-moves';actions.append(buttons);
    [['up','Move up',i===0],['down','Move down',i===rows.length-1],['remove','Remove',ksmTeamDivisionDrawn(d.id)]].forEach(([action,text,disabled])=>{
      const button=document.createElement('button');button.textContent=action==='up'?'↑':action==='down'?'↓':'×';button.className='setup-move-btn';button.title=text+' — '+d.name;button.setAttribute('aria-label',text+' — '+d.name);button.disabled=off||!!disabled;button.dataset.testid='team-division-'+action;if(action==='remove'&&button.disabled&&!off)button.title=ksmTeamDivisionLockTip(d);
      button.onclick=()=>action==='remove'?ksmRemoveTeamDivision(d.id):ksmMoveTeamDivision(d.id,action);buttons.append(button);
    });row.append(actions);body.append(row);
  });
}
