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
// renderDivisionSetup() (01) as data, as the removed divisionSetupRow() read it: the presets in their order, then the
// custom divisions (enabled ones only: a custom division is listed while it is in state.divisions).
function ksmSetupDivisionsData(){
  const custom=state.divisions.filter(d=>!DIVISION_PRESETS.some(p=>p[0]===d));
  const row=(d,enabled,custom)=>({division:String(d??''),name:ksmText(d),enabled:!!enabled,custom:!!custom,
    format:state.divisionTypes[d]??null,court:state.divisionCourts[d]||'A'});
  return {rows:[...DIVISION_PRESETS.map(([d])=>row(d,state.divisions.includes(d),false)),...custom.map(d=>row(d,true,true))]};
}
function ksmRenderSetupDivisions(){
  ksmPublishSetup('ksm:setup-divisions','ksmSetupDivisionsInput',ksmSetupDivisionsData());
}
// syncSetupHeader() (30) as data: the name field's value (the island shows 'Kendo Tournament'
// when it is empty).
function ksmRenderSetupHeader(){
  ksmPublishSetup('ksm:setup-header','ksmSetupHeaderInput',{name:window.tName?String(tName.value):''});
}
// × of a custom division row: what its inline handler ran.
function ksmRemoveSetupDivision(d){removeDivision(state.divisions.indexOf(d))}

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
