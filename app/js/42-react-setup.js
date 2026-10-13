/* ksm:post-split-begin react-setup */
// ==========================================================
// React Setup screen (app/react/setup/, roadmap M.13)
// Setup (#setup) draws two parts with React islands, mounted by app/react/setup/main.tsx: the
// Individual Divisions table's rows (#divisionSetupRows) and the tournament name in the hero
// (#setupTournamentName). The legacy code still decides what is shown and runs every action:
// renderDivisionSetup() (01-state-and-setup.js) calls ksmRenderSetupDivisions() below, which
// publishes a row per preset division and per custom division as plain data
// (ksm:setup-divisions, window.ksmSetupDivisionsInput); syncSetupHeader()
// (30-setup-header-and-director.js) publishes the name field's value (ksm:setup-header,
// window.ksmSetupHeaderInput). tests/golden/setup/*.json (recorded from the legacy renderer) pin
// the result. Text is what esc() showed (ksmText(), String(x||'')), a division passed to the
// handlers what jsArg() passed (String(x??'')). The rows' controls call toggleDivision(),
// setDivisionFormat(), setDivisionCourt() (01) on their change event and × calls
// ksmRemoveSetupDivision() below, as the inline handlers did.
// Every other part of Setup stays legacy markup (app/index.html): the fields are read and
// written synchronously by id (getSetupSnapshot()/applySetupSnapshot() in 20-, tournamentSettings(),
// saveSetup(), the test API's configure(), print and the header) and 30- adds the name's input
// listener while app.js runs, before the React module. The legacy Setup renderer (the innerHTML of
// renderDivisionSetup(), divisionSetupRow(), syncSetupHeader()'s textContent) was removed in M.13.
// If the React module does not load, Setup shows a notice in place of the divisions table (the end
// of this file).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmPublishSetup(event,key,input){
  window[key]=input;
  window.dispatchEvent(new CustomEvent(event));
}
// renderDivisionSetup() (01) as data, as the removed divisionSetupRow() read it.
// Issue #31 (was: the presets in their order, then the enabled custom divisions): the enabled
// divisions in their running order (state.divisions: the order generation, each court's division
// dropdown, Continue and the TV's Up next use), each with whether it can move up / down, then the
// switched-off presets in their order, then (owner decision 12) the switched-off custom divisions:
// switching one off keeps its format and court in state (toggleDivision()), so a custom division
// with a format that is not in state.divisions is listed, unchecked, until × removes it.
function ksmSetupDivisionsData(){
  const preset=d=>DIVISION_PRESETS.some(p=>p[0]===d),on=state.divisions;
  const row=(d,enabled,custom,move)=>({division:String(d??''),name:ksmText(d),enabled:!!enabled,custom:!!custom,
    format:state.divisionTypes[d]??null,court:state.divisionCourts[d]||'A',move});
  const off=DIVISION_PRESETS.map(([d])=>d).filter(d=>!on.includes(d));
  const customOff=Object.keys(state.divisionTypes||{}).filter(d=>d&&!preset(d)&&!on.includes(d)&&d!=='Team Tournament'&&d!=='Exhibition Matches');
  return {rows:[...on.map((d,i)=>row(d,true,!preset(d),{up:i>0,down:i<on.length-1})),...off.map(d=>row(d,false,false,null)),...customOff.map(d=>row(d,false,true,null))]};
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
function ksmRenderSetupDivisions(){
  ksmPublishSetup('ksm:setup-divisions','ksmSetupDivisionsInput',ksmSetupDivisionsData());
}
// syncSetupHeader() (30) as data: the name field's value (the island shows 'Kendo Tournament'
// when it is empty).
function ksmRenderSetupHeader(){
  ksmPublishSetup('ksm:setup-header','ksmSetupHeaderInput',{name:window.tName?String(tName.value):''});
}
// × of a custom division row: what its inline handler ran. A switched-off custom division (owner
// decision 12) is not in state.divisions (removeDivision(-1) would remove the last division):
// its format and court are forgotten, as removeDivision() does.
function ksmRemoveSetupDivision(d){
  const i=state.divisions.indexOf(d);
  if(i>=0){removeDivision(i);return}
  delete state.divisionTypes[d];delete state.divisionCourts[d];renderDivisionSetup();renderDivisions();renderReg();
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
/* ksm:post-split-end */
