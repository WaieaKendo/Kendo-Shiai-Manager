
const DIVISION_PRESETS=[['Yonenbu (11 years and under)','Round Robin','A'],['Shonenbu (12–14 years old)','Round Robin','A'],['Seinenbu (15+ years without dan)','Round Robin','A'],['Women’s Open','Round Robin','B'],['Yudansha 1–3 Dan','Round Robin','A'],['Yudansha 4 Dan+','Round Robin','B'],['Masters Open (50+ years old)','Round Robin','B']];
/** @type {TournamentState} */
const state={brackets:{},championshipNodes:{},teamBracketState:{},teamBracketNodes:{},singleElimNodes:{},divisions:DIVISION_PRESETS.map(x=>x[0]),divisionTypes:{},divisionCourts:{},competitors:[],teams:[],exhibitions:[],awards:[],pools:{},teamPools:{},allMatches:{},currentByDivision:{},courtState:{A:{division:null,index:0},B:{division:null,index:0}},matches:[],current:0,score:{W:[],R:[],WT:0,RT:0},history:[],currentDivision:'Women’s Open',poolViewDivision:'Women’s Open',currentCourt:'A',publicCourt:'A',courtActiveDivision:{A:null,B:null},regMode:'individual',contextMode:'pool',teamAwardMode:'top2',generated:false,teamElimTeams:{},managementRevision:0,courtActionHistory:{A:[],B:[]},courtRedoHistory:{A:[],B:[]}};
DIVISION_PRESETS.forEach(([d,f,c])=>{state.divisionTypes[d]=f;state.divisionCourts[d]=c});state.divisionCourts['Team Tournament']='Both';
/* ksm:post-split-begin tournament-switcher */
const KSM_EMPTY_STATE=JSON.stringify(state);
/* ksm:post-split-end */

function show(id){document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));document.getElementById(id).classList.remove('hidden');renderAll();if(id==='print')previewAllDivisionSheets();/* ksm:post-split-begin path-urls */ksmRecordScreenPath(id);/* ksm:post-split-end */}
function saveSetup(){
  if(window.teamCourt)state.divisionCourts['Team Tournament']=teamCourt.value;
  if(window.teamAwardMode)state.teamAwardMode=teamAwardMode.value||'top2';
  renderDivisionSetup();renderDivisions();renderReg();renderTournamentStatus();
}
function addDivision(v){v=v||customDivName?.value?.trim()||/* ksm:post-split-begin add-division was:newDiv?.value?.trim() */window.newDiv?.value?.trim()/* ksm:post-split-end */;if(!v)return;if(!state.divisions.includes(v)){state.divisions.push(v);state.divisionTypes[v]=customDivFormat?.value||/* ksm:post-split-begin add-division was:newDivType?.value */window.newDivType?.value/* ksm:post-split-end */||'Round Robin';state.divisionCourts[v]=customDivCourt?.value||'A'}if(window.customDivName)customDivName.value='';renderDivisionSetup();renderDivisions();renderReg()}
function addCustomDivision(){/* ksm:post-split-begin library-setup */const name=customDivName.value.trim();const added=name&&!state.divisions.includes(name);/* ksm:post-split-end */addDivision()/* ksm:post-split-begin library-setup */;document.querySelector('[data-testid="custom-division-add"]').disabled=true;if(added)ksmAnnounceAddedDivision(name);/* ksm:post-split-end */}
function removeDivision(i){let d=state.divisions[i];state.divisions.splice(i,1);delete state.divisionTypes[d];delete state.divisionCourts[d];renderDivisionSetup();renderDivisions();renderReg()}
function toggleDivision(d,on){if(on&&!state.divisions.includes(d)){state.divisions.push(d);let p=DIVISION_PRESETS.find(x=>x[0]===d);/* ksm:post-split-begin quirks-setup was:state.divisionTypes[d]=p?p[1]:'Round Robin';state.divisionCourts[d]=p?p[2]:'A' */state.divisionTypes[d]=state.divisionTypes[d]||(p?p[1]:'Round Robin');state.divisionCourts[d]=state.divisionCourts[d]||(p?p[2]:'A')/* ksm:post-split-end */}if(!on&&state.divisions.includes(d)){state.divisions=state.divisions.filter(x=>x!==d)}renderDivisionSetup();renderDivisions();renderReg()}
function setDivisionFormat(d,v){state.divisionTypes[d]=v;renderReg()}
function setDivisionCourt(d,v){state.divisionCourts[d]=v;renderDivisions();renderTournamentStatus()}
function renderDivisionSetup(){/* ksm:post-split-begin react-setup */
  // The divisions table's rows are React (app/react/setup/, 42-react-setup.js): they are published
  // to it instead of written (M.13). The team court and awards fields stay legacy markup.
  if(!window.divisionSetupRows)return;ksmRenderSetupDivisions();if(window.teamCourt)teamCourt.value=state.divisionCourts['Team Tournament']||'Both';if(window.teamAwardMode)teamAwardMode.value=state.teamAwardMode||'top2'/* ksm:post-split-end */}
function courtEligibleDivisions(court){
  let all=[...new Set([...Object.keys(state.allMatches||{}),...state.divisions])];
  return all.filter(d=>{
    let arr=state.allMatches[d]||[];
    if(!arr.length)return false;
    return arr.some(m=>!m.done && matchBelongsToCourt(m,court));
  });
}

/* ksm:post-split-begin library-setup */
function ksmAnnounceAddedDivision(name){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const row=[...document.querySelectorAll('[data-testid="setup-division-row"]')].find(row=>row.querySelector('[data-testid="setup-division-name"]')?.textContent===name);
    if(row){row.scrollIntoView({block:'center'});row.classList.add('setup-division-added');row.addEventListener('animationend',()=>row.classList.remove('setup-division-added'),{once:true})}
    showKsmToast('Added division: '+name);
  }));
}
/* ksm:post-split-end */
