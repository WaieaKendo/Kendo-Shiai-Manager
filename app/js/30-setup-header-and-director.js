// ---------- KSM v3.9.1 Setup header synchronization ----------
function syncSetupHeader(){/* ksm:post-split-begin react-setup */
  // The hero's name is React (app/react/setup/, 42-react-setup.js): the name field's value is
  // published to it instead of written (M.13).
  ksmRenderSetupHeader();/* ksm:post-split-end */}
if(window.tName){
  tName.addEventListener('input',syncSetupHeader);
}
const originalSaveSetupForHeader=saveSetup;
saveSetup=function(){
  originalSaveSetupForHeader();
  syncSetupHeader();
};

let directorRefreshTimer=null;
function directorMatchLabel(m){
  if(!m)return '';
  if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki')return m.position||m.pool||'';
  return m.pool==='Championship'?(m.position||'Championship'):(m.pool?`Pool ${m.pool}`:'');
}
// Director progress is a read-only projection of canonical tournament state.
// Totals intentionally follow the operational units shown in Court Queue/Context:
// - pool divisions: all pool bouts + the complete championship bracket
// - direct individual elimination: all scoreable Court Context bracket nodes
// - 3/5-person teams: team pairings x roster size (+ any created representative playoff)
// - kachinuki: completed bouts only; no fixed total is displayed
function directorTeamFormat(div){
  const matches=state.allMatches?.[div]||[];
  const teamDivision=matches.some(isTeamMatch)||(state.teamBracketNodes?.[div]||[]).length>0||isTeamDivision(div);
  if(!teamDivision)return null;
  if(matches.some(m=>m.type==='kachinuki'))return 'Kachinuki';
  const registered=(state.teams||[]).find(t=>t.division===div||div==='Team Tournament');
  return registered?.type||window.teamFormat?.value||'5-Person Team';
}
function directorTeamSize(div){
  return directorTeamFormat(div)==='3-Person Team'?3:5;
}
function directorPoolTotal(div,court=null){
  const all=state.allMatches?.[div]||[];
  const belongs=m=>!court||matchBelongsToCourt(m,court);
  const poolBouts=all.filter(m=>belongs(m)&&m.type==='individual'&&!m.championship).length;
  const firstRound=championshipLabels(div).length;
  let championshipBouts=0;
  if(firstRound){let round=firstRoundName(firstRound),count=firstRound;while(count>=1){for(let slot=0;slot<count;slot++){let assigned=championshipCourtFor(div,round,slot,count);if(!court||assigned===court)championshipBouts++;}if(round==='Final')break;round=nextRoundFromName(round);count=Math.ceil(count/2)}}
  return poolBouts+championshipBouts;
}
function directorSingleElimTotal(div,court=null){
  const nodes=state.singleElimNodes?.[div]||[];
  if(nodes.length){return nodes.filter(node=>node.left&&node.right&&(!court||(state.divisionCourts?.[div]==='split'?(node.round==='Final'?'A':node.court):(state.divisionCourts?.[div]||'A'))===court)).length}
  const entrants=(state.singleElimComps?.[div]||[]).filter(Boolean).length;
  if(!court||court===(state.divisionCourts?.[div]||'A'))return Math.max(0,entrants-1);
  return 0;
}
function directorTeamPairCount(div,court=null){
  const nodes=state.teamBracketNodes?.[div]||[];
  if(nodes.length){
    return nodes.filter(node=>{
      if(!node.left||!node.right)return false;
      if(!court)return true;
      return (node.court||'A')===court;
    }).length;
  }
  const pairs=new Set((state.allMatches?.[div]||[])
    .filter(m=>m.teamPair&&(!court||matchBelongsToCourt(m,court)))
    .map(m=>m.teamPair));
  return pairs.size;
}
function directorDivisionProgress(div,court=null){
  const all=(state.allMatches?.[div]||[]).filter(m=>!court||matchBelongsToCourt(m,court));
  const isTeam=all.some(isTeamMatch)||(state.teamBracketNodes?.[div]||[]).length>0||isTeamDivision(div);
  const isKachinuki=isTeam&&(directorTeamFormat(div)==='Kachinuki'||all.some(m=>m.type==='kachinuki'));
  if(isKachinuki){
    const completed=all.filter(m=>m.done&&(m.type==='kachinuki'||m.type==='teamPlayoff')).length;
    return {completed,total:null,remaining:null,variable:true};
  }
  if(isTeam){
    const base=directorTeamPairCount(div,court)*directorTeamSize(div);
    const playoffs=all.filter(m=>m.type==='teamPlayoff').length;
    const completed=all.filter(m=>m.done&&(m.type==='teamPosition'||m.type==='teamPlayoff')).length;
    const total=base+playoffs;
    return {completed,total,remaining:Math.max(0,total-completed),variable:false};
  }
  const isSingle=(state.singleElimNodes?.[div]||[]).length>0||all.some(m=>m.singleElim);
  if(isSingle){
    const total=directorSingleElimTotal(div,court);
    const completed=all.filter(m=>m.done&&m.singleElim).length;
    return {completed,total,remaining:Math.max(0,total-completed),variable:false};
  }
  const hasPools=(state.pools?.[div]||[]).length>0;
  if(hasPools){
    const total=directorPoolTotal(div,court);
    const completed=all.filter(m=>m.done&&m.type==='individual').length;
    return {completed,total,remaining:Math.max(0,total-completed),variable:false};
  }
  const completed=all.filter(m=>m.done).length,total=all.length;
  return {completed,total,remaining:Math.max(0,total-completed),variable:false};
}
function courtSummaryFor(court){
  const cs=state.courtState?.[court]||{};
  const div=cs.division||state.courtActiveDivision?.[court]||null;
  const all=div?(state.allMatches?.[div]||[]):[];
  const relevant=all.filter(m=>matchBelongsToCourt(m,court));
  const pending=relevant.filter(m=>!m.done);
  let current=null;
  if(div&&Number.isInteger(cs.index))current=all[cs.index]||null;
  if(!current||current.done||!matchBelongsToCourt(current,court))current=pending[0]||null;
  const ordered=relevant.some(isTeamMatch)?sortTeamMatches(div).filter(m=>matchBelongsToCourt(m,court)):relevant;
  const currentPos=current?ordered.indexOf(current):-1;
  const later=currentPos>=0?ordered.slice(currentPos+1).filter(m=>!m.done):pending.slice(current?1:0);
  const progress=div?directorDivisionProgress(div,court):{completed:0,total:0,remaining:0,variable:false};
  return {court,division:div,round:directorMatchLabel(current),...progress,current,onDeck:later[0]||null,following:later[1]||null};
}
function tournamentSummary(){
  const divisions=Object.keys(state.allMatches||{});
  return divisions.reduce((sum,div)=>{
    const x=directorDivisionProgress(div,null);
    sum.completed+=x.completed||0;
    if(x.total==null){sum.variable=true;return sum;}
    sum.total+=x.total;
    sum.remaining+=x.remaining||0;
    return sum;
  },{completed:0,total:0,remaining:0,variable:false});
}
function renderDirector(){
  /* ksm:post-split-begin react-overview */ksmRenderOverview();
  /* ksm:post-split-end */
}
function startDirectorRefresh(){stopDirectorRefresh();renderDirector();directorRefreshTimer=setInterval(()=>{if(!document.getElementById('director')?.classList.contains('hidden'))renderDirector();},5000)}
function stopDirectorRefresh(){if(directorRefreshTimer){clearInterval(directorRefreshTimer);directorRefreshTimer=null}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopDirectorRefresh();else if(!document.getElementById('director')?.classList.contains('hidden'))startDirectorRefresh()});
const originalRenderAllForDirector=renderAll;
renderAll=function(){originalRenderAllForDirector();if(!document.getElementById('director')?.classList.contains('hidden'))renderDirector();};


