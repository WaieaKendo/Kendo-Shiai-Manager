// ==========================================================
// KSM v3.9.1 — Results presentation
// ==========================================================
function resultPlacements(div){
  /* ksm:post-split-begin engine-bridge */if(!divisionComplete(div))return [];
  if(isTeamDivision(div)){
    const p=teamFinalPlacements(div);
    if(!p)return [];
    const mode=state.teamAwardMode||'top2';
    const rows=[{place:'1st',name:p.first,tier:'gold'}];
    if(mode!=='top1'&&p.second)rows.push({place:'2nd',name:p.second,tier:'silver'});
    if(mode==='dual3'){
      (p.thirds||[]).forEach(name=>rows.push({place:'3rd',name,tier:'bronze'}));
    }
    return rows;
  }

  const matches=state.allMatches[div]||[];
  return KSMEngine.individualPlacements(matches,isPoolOnlyDivision(div)?()=>poolStandings(state.pools[div][0].label,div):null);
  /* ksm:post-split-end */
}
function addResultAward(){
  state.awards=state.awards||[];
  state.awards.push({award:'Fighting Spirit',name:'',dojo:''});
  saveAuto();
  renderResultsDashboard();
}
function removeResultAward(index){
  state.awards.splice(index,1);
  saveAuto();
  renderResultsDashboard();
}
function renderResultsDashboard(){
/* ksm:post-split-begin react-results */
  // Results is React (app/react/results/, 38-react-results.js): the cards and awards are
  // published to it instead of written (M.13).
  if(!window.resultsBody)return;
  ksmRenderResults();
/* ksm:post-split-end */
}
function openResultsBracket(div){
/* ksm:post-split-begin react-results */
  // The modal's title and body are React (38-react-results.js): the division's detail is
  // published to them; the modal itself stays legacy markup (M.13).
  const modal=document.getElementById('resultsBracketModal');
  if(!modal)return;
  ksmRenderResultsBracket(div);
  modal.classList.remove('hidden');
/* ksm:post-split-end */
}
function closeResultsBracket(){
  const modal=document.getElementById('resultsBracketModal');
  if(modal)modal.classList.add('hidden');
}
const originalShowForResults=show;
show=function(id){
  originalShowForResults(id);
  if(id==='results')renderResultsDashboard();
};
document.addEventListener('keydown',function(event){
  if(event.key==='Escape')closeResultsBracket();
});


