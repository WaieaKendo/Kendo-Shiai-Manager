const KSM_EMPTY_STATE=JSON.stringify(state);
// Read by app/modules/session through legacy.js (a module cannot read a `const` of app/js).
function ksmEmptyState(){return KSM_EMPTY_STATE}

function show(id){document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));document.getElementById(id).classList.remove('hidden');renderAll();if(id==='print')previewAllDivisionSheets();ksmRecordScreenPath(id);}
function saveSetup(){
  ksmSyncLegacyTeamDivision();
  if(window.teamCourt)state.divisionCourts['Team Tournament']=teamCourt.value;
  if(window.teamAwardMode)state.teamAwardMode=teamAwardMode.value||'top2';
  renderDivisionSetup();renderDivisions();renderReg();renderTournamentStatus();
}
function setDivisionCourt(d,v){state.divisionCourts[d]=v;ksmReassignDivisionCourt(d);renderDivisions();renderTournamentStatus()}
