
const DIVISION_PRESETS=[['Yonenbu (11 years and under)','Round Robin','A'],['Shonenbu (12–14 years old)','Round Robin','A'],['Seinenbu (15+ years without dan)','Round Robin','A'],['Women’s Open','Round Robin','B'],['Yudansha 1–3 Dan','Round Robin','A'],['Yudansha 4 Dan+','Round Robin','B'],['Masters Open (50+ years old)','Round Robin','B']];
/** @type {TournamentState} */
const state={brackets:{},championshipNodes:{},teamBracketState:{},teamBracketNodes:{},singleElimNodes:{},divisions:DIVISION_PRESETS.map(x=>x[0]),divisionTypes:{},divisionCourts:{},competitors:[],teams:[],exhibitions:[],awards:[],pools:{},teamPools:{},allMatches:{},currentByDivision:{},courtState:{A:{division:null,index:0},B:{division:null,index:0}},matches:[],current:0,score:{W:[],R:[],WT:0,RT:0},history:[],currentDivision:'Women’s Open',poolViewDivision:'Women’s Open',currentCourt:'A',publicCourt:'A',courtActiveDivision:{A:null,B:null},regMode:'individual',contextMode:'pool',teamAwardMode:'top2',generated:false,teamElimTeams:{},managementRevision:0,courtActionHistory:{A:[],B:[]},courtRedoHistory:{A:[],B:[]}};
DIVISION_PRESETS.forEach(([d,f,c])=>{state.divisionTypes[d]=f;state.divisionCourts[d]=c});state.divisionCourts['Team Tournament']='Both';
function show(id){document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));document.getElementById(id).classList.remove('hidden');renderAll();if(id==='print')previewAllDivisionSheets()}
function saveSetup(){
  if(window.teamCourt)state.divisionCourts['Team Tournament']=teamCourt.value;
  if(window.teamAwardMode)state.teamAwardMode=teamAwardMode.value||'top2';
  renderDivisionSetup();renderDivisions();renderReg();renderTournamentStatus();
}
function addDivision(v){v=v||customDivName?.value?.trim()||newDiv?.value?.trim();if(!v)return;if(!state.divisions.includes(v)){state.divisions.push(v);state.divisionTypes[v]=customDivFormat?.value||newDivType?.value||'Round Robin';state.divisionCourts[v]=customDivCourt?.value||'A'}if(window.customDivName)customDivName.value='';renderDivisionSetup();renderDivisions();renderReg()}
function addCustomDivision(){addDivision()}
function removeDivision(i){let d=state.divisions[i];state.divisions.splice(i,1);delete state.divisionTypes[d];delete state.divisionCourts[d];renderDivisionSetup();renderDivisions();renderReg()}
function toggleDivision(d,on){if(on&&!state.divisions.includes(d)){state.divisions.push(d);let p=DIVISION_PRESETS.find(x=>x[0]===d);state.divisionTypes[d]=p?p[1]:'Round Robin';state.divisionCourts[d]=p?p[2]:'A'}if(!on&&state.divisions.includes(d)){state.divisions=state.divisions.filter(x=>x!==d)}renderDivisionSetup();renderDivisions();renderReg()}
function setDivisionFormat(d,v){state.divisionTypes[d]=v;renderReg()}
function setDivisionCourt(d,v){state.divisionCourts[d]=v;renderDivisions();renderTournamentStatus()}
function renderDivisionSetup(){if(!window.divisionSetupRows)return;let custom=state.divisions.filter(d=>!DIVISION_PRESETS.some(p=>p[0]===d));let rows=DIVISION_PRESETS.map(([d,fmt,c])=>divisionSetupRow(d,state.divisions.includes(d),false)).join('')+custom.map(d=>divisionSetupRow(d,true,true)).join('');divisionSetupRows.innerHTML=rows;if(window.teamCourt)teamCourt.value=state.divisionCourts['Team Tournament']||'Both';if(window.teamAwardMode)teamAwardMode.value=state.teamAwardMode||'top2'}
function divisionSetupRow(d,enabled,custom){let court=state.divisionCourts[d]||'A';return `<tr data-testid="setup-division-row"><td><input type="checkbox" ${enabled?'checked':''} onchange="toggleDivision(${jsArg(d)},this.checked)" data-testid="setup-division-enabled"></td><td><b data-testid="setup-division-name">${esc(d)}</b>${custom?' <span class="small">custom</span>':''}</td><td><select ${enabled?'':'disabled'} onchange="setDivisionFormat(${jsArg(d)},this.value)" data-testid="setup-division-format"><option ${state.divisionTypes[d]==='Round Robin'?'selected':''}>Round Robin</option><option ${state.divisionTypes[d]==='Single Elimination'?'selected':''}>Single Elimination</option></select></td><td><select ${enabled?'':'disabled'} onchange="setDivisionCourt(${jsArg(d)},this.value)" data-testid="setup-division-court"><option value="A" ${court==='A'?'selected':''}>Court A</option><option value="B" ${court==='B'?'selected':''}>Court B</option><option value="split" ${court==='split'?'selected':''}>Split Between Courts</option></select>${custom?` <button onclick="removeDivision(state.divisions.indexOf(${jsArg(d)}))">×</button>`:''}</td></tr>`}
function courtEligibleDivisions(court){
  let all=[...new Set([...Object.keys(state.allMatches||{}),...state.divisions])];
  return all.filter(d=>{
    let arr=state.allMatches[d]||[];
    if(!arr.length)return false;
    return arr.some(m=>!m.done && matchBelongsToCourt(m,court));
  });
}
