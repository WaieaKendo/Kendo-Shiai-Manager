// ==========================================================
// React Setup screen (app/react/features/setup/, roadmap M.13, #136 step 2)
// Setup (#setup) draws two parts with React islands, mounted by app/react/features/setup/main.tsx:
// the Individual Divisions table's rows (#divisionSetupRows) and the tournament name in the hero
// (#setupTournamentName). The islands' input is computed by the module (publish.ts: the rows from
// the divisions in state, the name from the Setup field, as plain data in
// window.ksmSetupDivisionsInput / window.ksmSetupHeaderInput); legacy only signals.
// renderDivisionSetup() (01-state-and-setup.js) calls ksmRenderSetupDivisions() below and
// syncSetupHeader() (30-setup-header-and-director.js) ksmRenderSetupHeader(); each sets a
// ksmSetup...Requested flag and dispatches ksm:setup-divisions / ksm:setup-header. They must not
// call a function defined in the module: this script runs before it (the module may not exist yet,
// or at all). The flags tell the module, when it loads, that a signal came earlier.
// tests/golden/setup/*.json (recorded from the legacy renderer) pin what the islands draw.
// What stays here, and why: the ACTIONS the rows call (React calls legacy): ksmMoveSetupDivision,
// ksmRenameSetupDivision, ksmRemoveSetupDivision, ksmRestoreStandardDivisions, ksmDivisionRenameError
// and ksmDivisionRenameBlocked; the helpers classic code also calls or the module reads through
// shared/legacy.ts: ksmDivisionPresetNames, ksmDivisionRemoveBlocked (ksmRemoveSetupDivision uses
// both); and ksmPublishSetup, which 01-grand-champion.js still calls to publish the grand-champion
// setup (not part of this step). The rows' controls call toggleDivision(),
// setDivisionFormat(), setDivisionCourt() (01) on their change event and x calls
// ksmRemoveSetupDivision().
// Every other part of Setup stays legacy markup (app/index.html): the fields are read and
// written synchronously by id (getSetupSnapshot()/applySetupSnapshot() in 20-, tournamentSettings(),
// saveSetup(), the test API's configure(), print and the header) and 30- adds the name's input
// listener while app.js runs, before the React module. If the React module does not load, Setup
// shows a notice in place of the divisions table (the end of this file).
// ==========================================================
// Still used by 01-grand-champion.js (ksmRenderGrandChampionSetup).
function ksmPublishSetup(event,key,input){
  window[key]=input;
  window.dispatchEvent(new CustomEvent(event));
}
// Issue #31: a row's move up / down button. Swaps the division with its neighbour in the running
// order (state.divisions), saved and synced like every Setup edit (the button's click asks for the
// autosave, the document-wide listener in 21-).
function ksmMoveSetupDivision(d,direction){
  const i=state.divisions.indexOf(d),j=i+(direction==='up'?-1:1);
  if(i<0||j<0||j>=state.divisions.length)return;
  [state.divisions[i],state.divisions[j]]=[state.divisions[j],state.divisions[i]];
  renderDivisionSetup();renderDivisions();renderReg();
}
// Issue #25: rename a division (a row's Rename, app/react/setup/Setup.tsx), preset or custom,
// before the draw. The rules and the rewrite are app/engine/divisions.ts: the name is trimmed,
// non-empty and unique among the divisions (case-insensitive; the team event's and exhibitions'
// names are taken); once the tournament is generated nothing is renamed. The rename changes the
// name everywhere it is used (the running order position kept, the format and court, every
// competitor of the division, this device's views and court choices) and is recorded in
// state.divisionRenames, so a save conflict replays it whole (rebaseLocalPayloadOnRecord(), 18-).
// Returns why it was refused (shown in the row; nothing changed), or null. Saved and synced like
// every Setup edit.
function ksmDivisionPresetNames(){return KSMEngine.presetNames(DIVISION_PRESETS.map(p=>p[0]),state.divisionRenames)}
function ksmDivisionRenameError(from,to){return KSMEngine.divisionRenameError(state,DIVISION_PRESETS.map(p=>p[0]),String(from??''),String(to??''))}
// Why the row's Rename cannot open (after the draw), or null.
function ksmDivisionRenameBlocked(d){return ksmDivisionRenameError(d,d)}
function ksmRenameSetupDivision(from,to){
  from=String(from??'');const name=String(to??'').trim();
  const error=ksmDivisionRenameError(from,name);
  if(error)return error;
  if(name===from)return null;
  const client=(typeof cloudSession==='object'&&cloudSession?.clientId)||'local';
  const record={id:`${client}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,8)}`,from,to:name};
  Object.assign(state,KSMEngine.renamedDivisionState(state,from,name,record));
  ['A','B'].forEach(c=>{if(ksmLocalCourtDivision[c]===from)ksmLocalCourtDivision[c]=name});
  renderDivisionSetup();renderDivisions();renderReg();renderTournamentStatus();
  scheduleAutoSave('Division renamed');
  return null;
}
function ksmRenderSetupDivisions(){
  window.ksmSetupDivisionsRequested=true;
  window.dispatchEvent(new CustomEvent('ksm:setup-divisions'));
}
function ksmRenderSetupHeader(){
  window.ksmSetupHeaderRequested=true;
  window.dispatchEvent(new CustomEvent('ksm:setup-header'));
}
// × of a custom division row: what its inline handler ran. A switched-off custom division (owner
// decision 12) is not in state.divisions (removeDivision(-1) would remove the last division):
// its format and court are forgotten, as removeDivision() does.
// Owner request (4.0): every row has × before its draw, presets too. A removed preset is hidden for
// this tournament (state.hiddenPresets, merged like the other Setup lists on a save conflict); its
// registered players stay in Registration without a division, after a question.
function ksmDivisionRemoveBlocked(d){return (state.allMatches?.[d]||[]).length?`${d} is drawn: it can no longer be removed.`:null}
function ksmRemoveSetupDivision(d){
  if(isReadOnlySession())return;
  const blocked=ksmDivisionRemoveBlocked(d);if(blocked){alert(blocked);return}
  const players=(state.competitors||[]).filter(c=>c.division===d&&c.name).length;
  if(players&&!confirm(`Remove ${d}? Its ${players} registered ${players===1?'player stays':'players stay'} in Registration without a division.`))return;
  if(ksmDivisionPresetNames().includes(d)&&!(state.hiddenPresets||[]).includes(d))state.hiddenPresets=[...(state.hiddenPresets||[]),d];
  const i=state.divisions.indexOf(d);
  if(i>=0){removeDivision(i);scheduleAutoSave('Division removed');return}
  delete state.divisionTypes[d];delete state.divisionCourts[d];renderDivisionSetup();renderDivisions();renderReg();scheduleAutoSave('Division removed');
}
function ksmRestoreStandardDivisions(){
  if(isReadOnlySession())return;
  state.hiddenPresets=[];renderDivisionSetup();scheduleAutoSave('Standard divisions restored');
}

// If the React module (app/react/main.tsx, a module script after app.js) did not run, say so in
// Setup instead of an empty divisions table, which nothing fills any more (e.g. an offline device
// whose cached copy lacks the module). The Setup fields, Add Custom Division and Save Setup &
// Continue stay; the hero keeps the static "Kendo Tournament". Module scripts run before
// DOMContentLoaded, so a working page never shows this. Existing styles only (.muted-card, .small).
function ksmShowSetupModuleMissing(){
  if(window.ksmSetupMounted)return;
  const table=document.querySelector('#setup .setup-division-table-wrap');
  if(!table||document.getElementById('setupModuleMissing'))return;
  const notice=document.createElement('div');
  notice.id='setupModuleMissing';notice.className='muted-card';notice.setAttribute('role','alert');notice.setAttribute('data-testid','setup-module-missing');
  notice.innerHTML='<b>Divisions could not load</b><div class="small">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</div>';
  table.style.display='none';
  table.before(notice);
}
document.addEventListener('DOMContentLoaded',ksmShowSetupModuleMissing);
