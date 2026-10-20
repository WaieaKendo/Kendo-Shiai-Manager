/* ksm:post-split-begin team-divisions */
function ksmNewTeamRows(rows){const division=ksmTeamDivisions()[0];return rows.map(t=>({...t,id:ksmNewTeamIdentity(),teamDivisionId:division?.id||''}))}
// The saved format this app understands (team divisions = 2), sent with every save (cloudHeaders(), 33).
// The server refuses saves from apps below its MIN_CLIENT_SCHEMA (src-worker.js): raise both together.
const KSM_CLIENT_SCHEMA=2;
function ksmNewTeamIdentity(){return 'team:'+Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('')}
function ksmTeamDivisionPayload(payload){return payload?.state?{...payload,state:KSMEngine.migrateTeamDivisions(payload.state,payload.setup||{})}:payload}
// #95 review: a loaded copy whose teams name a team division it does not have (an older client, a
// removed division) has them moved to the first division; say so in the diagnostics, not silently.
function ksmNoteTeamsReassigned(before,after,source){
  const known=new Set((after.teamDivisions||[]).map(d=>d.id));
  const moved=(before?.teams||[]).filter(t=>t?.teamDivisionId&&!known.has(t.teamDivisionId)).map(t=>t.team||t.id);
  if(!moved.length)return;
  console.warn('[KSM Team divisions] Teams of an unknown team division moved to the first one',source||'load',moved);
  writeCloudDiagnosticsState({stage:'Team division assignment repaired on load',teamsReassigned:moved});
}
function ksmTeamDivisions(){
  if(!state.teamDivisions)Object.assign(state,KSMEngine.migrateTeamDivisions(state,getSetupSnapshot()));
  return [...state.teamDivisions].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
}
function ksmTeamDivision(id){return (state.teamDivisions||[]).find(d=>d.id===id)}
function ksmDivisionName(id){return KSMEngine.teamDivisionName(state.teamDivisions,id)}
// Legacy controls serialize old files, but cannot override authoritative division records.
function ksmSyncLegacyTeamDivision(){
  const d=ksmTeamDivision('Team Tournament');if(!d)return;
  state.teamAwardMode=d.awardMode;state.divisionCourts[d.id]=d.court;
  for(const [key,value] of Object.entries({teamFormat:d.teamFormat,teamTournamentFormat:d.teamTournamentFormat,teamCourt:d.court,teamAwardMode:d.awardMode})){
    const el=document.getElementById(key);if(el)el.value=value;
  }
}
function ksmTeamSettings(id){
  const d=ksmTeamDivision(id)||(!id?ksmTeamDivisions()[0]:null),settings=tournamentSettings();
  return d?{...settings,teamFormat:d.teamFormat,teamTournamentFormat:d.teamTournamentFormat,teamCourt:d.court,teamAwardMode:d.awardMode}:settings;
}
function ksmAddTeamDivision(name='Team division'){
  if(state.generated){alert('Team divisions cannot be added after generation.');return null}
  const divisions=ksmTeamDivisions(),id=ksmNewTeamIdentity();
  state.teamDivisions.push({id,name,teamFormat:'3-Person Team',teamTournamentFormat:'Single Elimination',court:'Both',awardMode:'top2',order:Math.max(-1,...divisions.map(d=>d.order))+1});
  state.divisionCourts[id]='Both';
  if(!divisions.length)state.teams.filter(t=>!t.teamDivisionId).forEach(t=>t.teamDivisionId=id);
  ksmTeamDivisionChanged();return id;
}
function ksmUpdateTeamDivision(id,patch){
  const d=ksmTeamDivision(id);if(!d)return 'Team division no longer exists';
  if(patch.name!==undefined&&!String(patch.name).trim())return 'Enter a division name';
  if(state.generated&&Object.keys(patch).some(k=>!['name','order','awardMode'].includes(k)))return 'Match format and court cannot change after generation';
  Object.assign(d,patch,{id:d.id,name:String(patch.name??d.name).trim()});
  if(patch.court)state.divisionCourts[id]=d.court;
  if(patch.teamFormat)state.teams.filter(t=>t.teamDivisionId===id).forEach(t=>t.type=d.teamFormat);
  if(id==='Team Tournament')ksmSyncLegacyTeamDivision();
  if(patch.awardMode)ksmAddDaihyosenForTeamAwards();
  ksmTeamDivisionChanged();return null;
}
function ksmMoveTeamDivision(id,direction){
  const rows=ksmTeamDivisions(),i=rows.findIndex(d=>d.id===id),j=i+(direction==='up'?-1:1);
  if(i<0||j<0||j>=rows.length)return;
  [rows[i],rows[j]]=[rows[j],rows[i]];rows.forEach((d,index)=>d.order=index);ksmTeamDivisionChanged();
}
function ksmRemoveTeamDivision(id){
  const rows=ksmTeamDivisions(),d=rows.find(d=>d.id===id);if(!d)return false;
  if(state.generated){alert('Team divisions cannot be removed after generation.');return false}
  const fallback=rows.find(d=>d.id!==id),teams=state.teams.filter(t=>t.teamDivisionId===id);
  if(teams.length&&!fallback){alert('Add another team division before removing one with teams.');return false}
  if(teams.length&&!confirm(`Remove ${d.name}? Its ${teams.length} ${teams.length===1?'team':'teams'} will move to ${fallback.name}.`))return false;
  state.teamDivisions=rows.filter(d=>d.id!==id);teams.forEach(t=>t.teamDivisionId=fallback.id);
  delete state.divisionCourts[id];ksmTeamDivisionChanged();return true;
}
function ksmAssignTeamDivision(team,id){
  const d=ksmTeamDivision(id);if(!d)return false;
  if(state.generated){alert('Team assignments cannot change after generation.');return false}
  team.teamDivisionId=id;team.type=d.teamFormat;ksmTeamDivisionChanged();return true;
}
function ksmTeamDivisionChanged(){
  ksmRenderTeamDivisions();renderDivisions();renderTeams();renderTournamentStatus();scheduleAutoSave('Team divisions');
}
function ksmRenderTeamDivisions(){
  const root=document.getElementById('teamDivisionSetup');if(!root)return;
  const rows=ksmTeamDivisions(),off=tournamentSettings().teamEnabled==='Disabled'||isReadOnlySession();
  const add=document.querySelector('[data-testid="team-division-add"]');if(add)add.disabled=off||!!state.generated;
  const key=JSON.stringify(rows.map(d=>d.id));
  // Keep existing controls while typing. A sync redraw must not discard an uncommitted name
  // or remove the button receiving the click that commits it.
  if(root.dataset.divisionIds===key){
    rows.forEach((d,i)=>{
      const row=root.querySelectorAll('[data-testid="team-division-row"]')[i];if(!row)return;
      for(const field of ['name','teamFormat','teamTournamentFormat','court','awardMode']){
        const input=row.querySelector(`[data-testid="team-division-${field}"]`);
        if(document.activeElement!==input)input.value=d[field];
        if(field!=='name')input.setAttribute('aria-label',input.getAttribute('aria-label').split(' — ')[0]+' — '+d.name);
        input.disabled=off||(!!state.generated&&!['name','awardMode'].includes(field));
      }
      row.querySelector('[data-testid="team-division-up"]').disabled=off||i===0;
      row.querySelector('[data-testid="team-division-down"]').disabled=off||i===rows.length-1;
      row.querySelector('[data-testid="team-division-remove"]').disabled=off||!!state.generated;
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
    input.disabled=off||(!!state.generated&&key!=='awardMode');
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
    [['up','Move up',i===0],['down','Move down',i===rows.length-1],['remove','Remove',!!state.generated]].forEach(([action,text,disabled])=>{
      const button=document.createElement('button');button.textContent=action==='up'?'↑':action==='down'?'↓':'×';button.className='setup-move-btn';button.title=text+' — '+d.name;button.setAttribute('aria-label',text+' — '+d.name);button.disabled=off||!!disabled;button.dataset.testid='team-division-'+action;
      button.onclick=()=>action==='remove'?ksmRemoveTeamDivision(d.id):ksmMoveTeamDivision(d.id,action);buttons.append(button);
    });row.append(actions);body.append(row);
  });
}
/* ksm:post-split-end */
