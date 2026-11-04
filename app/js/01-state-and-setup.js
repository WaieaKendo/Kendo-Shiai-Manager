
const DIVISION_PRESETS=[['Yonenbu (11 years and under)','Round Robin','A'],['Shonenbu (12–14 years old)','Round Robin','A'],['Seinenbu (15+ years without dan)','Round Robin','A'],['Women’s Open','Round Robin','B'],['Yudansha 1–3 Dan','Round Robin','A'],['Yudansha 4 Dan+','Round Robin','B'],['Masters Open (50+ years old)','Round Robin','B']];
/** @type {TournamentState} */
const state={brackets:{},championshipNodes:{},teamBracketState:{},teamBracketNodes:{},singleElimNodes:{},divisions:DIVISION_PRESETS.map(x=>x[0]),divisionTypes:{},divisionCourts:{},competitors:[],teams:[],exhibitions:[],awards:[],pools:{},teamPools:{},allMatches:{},currentByDivision:{},courtState:{A:{division:null,index:0},B:{division:null,index:0}},matches:[],current:0,score:{W:[],R:[],WT:0,RT:0},history:[],currentDivision:'Women’s Open',poolViewDivision:'Women’s Open',currentCourt:'A',publicCourt:'A',courtActiveDivision:{A:null,B:null},regMode:'individual',contextMode:'pool',teamAwardMode:'top2',generated:false,teamElimTeams:{},managementRevision:0,courtActionHistory:{A:[],B:[]},courtRedoHistory:{A:[],B:[]}};
DIVISION_PRESETS.forEach(([d,f,c])=>{state.divisionTypes[d]=f;state.divisionCourts[d]=c});state.divisionCourts['Team Tournament']='Both';
const KSM_EMPTY_STATE=JSON.stringify(state);

function show(id){document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));document.getElementById(id).classList.remove('hidden');renderAll();if(id==='print')previewAllDivisionSheets();ksmRecordScreenPath(id);}
function saveSetup(){
  ksmSyncLegacyTeamDivision();
  if(window.teamCourt)state.divisionCourts['Team Tournament']=teamCourt.value;
  if(window.teamAwardMode)state.teamAwardMode=teamAwardMode.value||'top2';
  renderDivisionSetup();renderDivisions();renderReg();renderTournamentStatus();
}
function addDivision(v){v=v||customDivName?.value?.trim()||window.newDiv?.value?.trim();if(!v)return;if(!state.divisions.includes(v)){state.divisions.push(v);state.divisionTypes[v]=customDivFormat?.value||window.newDivType?.value||'Round Robin';state.divisionCourts[v]=customDivCourt?.value||'A'}if(window.customDivName)customDivName.value='';renderDivisionSetup();renderDivisions();renderReg()}
function addCustomDivision(){const name=customDivName.value.trim();const added=name&&!state.divisions.includes(name);addDivision();document.querySelector('[data-testid="custom-division-add"]').disabled=true;if(added)ksmAnnounceAddedDivision(name);}
function removeDivision(i){let d=state.divisions[i];state.divisions.splice(i,1);delete state.divisionTypes[d];delete state.divisionCourts[d];renderDivisionSetup();renderDivisions();renderReg()}
function toggleDivision(d,on){if(on&&!state.divisions.includes(d)){state.divisions.push(d);let p=DIVISION_PRESETS.find(x=>x[0]===d);state.divisionTypes[d]=state.divisionTypes[d]||(p?p[1]:'Round Robin');state.divisionCourts[d]=state.divisionCourts[d]||(p?p[2]:'A')}if(!on&&state.divisions.includes(d)){state.divisions=state.divisions.filter(x=>x!==d)}renderDivisionSetup();renderDivisions();renderReg()}
// A division's court changed after the draw: its unplayed matches move with it (before, every
// match kept the court it was drawn with, so the court screens and Overview still showed the old
// court). Pools, pool championships and single elimination get the court the draw would have given
// them (split: the same A/B rule); played matches stay where they were. A court left showing this
// division, or one now holding the division's next match while idle, picks its next match again.
function ksmReassignDivisionCourt(d){
  const all=state.allMatches?.[d];if(!all)return;
  const mode=divisionCourtMode(d);
  if(mode!=='split')(state.pools[d]||[]).forEach(p=>{delete p.court});
  const roundSize={};all.forEach(m=>{if(m&&m.championship&&!m.singleElim)roundSize[m.position]=(roundSize[m.position]||0)+1});
  const elimNodes=state.singleElimNodes?.[d]||[];
  all.forEach(m=>{
    if(!m||m.done||isTeamMatch(m))return;
    if(m.singleElim){const node=elimNodes.find(n=>n.id===m.elimNodeId);m.court=mode==='split'?(m.position==='Final'?'A':(node?.court||'A')):mode}
    else if(m.championship)m.court=championshipCourtFor(d,m.position,m.bracketSlot,roundSize[m.position]||1);
    else m.court=poolCourtFor(d,m.pool);
  });
  ['A','B'].forEach(c=>{
    const cs=state.courtState?.[c];
    if(cs&&cs.division===d){state.courtState[c]=findNextForCourt(c,null,0);state.courtActiveDivision[c]=state.courtState[c].division}
  });
}
function setDivisionFormat(d,v){state.divisionTypes[d]=v;renderReg()}
function setDivisionCourt(d,v){state.divisionCourts[d]=v;ksmReassignDivisionCourt(d);renderDivisions();renderTournamentStatus()}
function renderDivisionSetup(){
  // The divisions table's rows are React (app/react/setup/, 42-react-setup.js): they are published
  // to it instead of written (M.13). The team court and awards fields stay legacy markup.
  if(!window.divisionSetupRows)return;ksmRenderSetupDivisions();ksmRenderTeamDivisions();ksmRenderGrandChampionSetup();if(window.teamCourt)teamCourt.value=state.divisionCourts['Team Tournament']||'Both';if(window.teamAwardMode)teamAwardMode.value=state.teamAwardMode||'top2'}
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
