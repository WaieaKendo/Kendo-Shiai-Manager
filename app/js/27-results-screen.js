// ==========================================================
// KSM v3.9.1 — Results presentation
// ==========================================================
/* ksm:post-split-begin team-rr-daihyosen */
/** A team round robin's place with an award whose teams are still level (external PR review, #35). */
const KSM_TEAM_PLACE_TIED='Tied — daihyosen needed';
/* ksm:post-split-end */
function resultPlacements(div){
  /* ksm:post-split-begin engine-bridge */if(!divisionComplete(div))return [];
  if(isTeamDivision(div)){
    const p=teamFinalPlacements(div);
    if(!p)return [];
    const mode=ksmTeamSettings(div).teamAwardMode||'top2';
    // External PR review (#35): a place with an award still level is never named alphabetically.
    const tied=new Set(p.undecided||[]),named=(place,name)=>tied.has(place)?KSM_TEAM_PLACE_TIED:name;
    const rows=[{place:'1st',name:named(1,p.first),tier:'gold'}];
    if(mode!=='top1'&&(p.second||tied.has(2)))rows.push({place:'2nd',name:named(2,p.second),tier:'silver'});
    if(mode==='dual3'){
      (tied.has(3)?[KSM_TEAM_PLACE_TIED]:(p.thirds||[])).forEach(name=>rows.push({place:'3rd',name,tier:'bronze'}));
    }
    return rows;
  }

  const matches=state.allMatches[div]||[];
  const placements=KSMEngine.individualPlacements(matches,isPoolOnlyDivision(div)?()=>poolStandings(state.pools[div][0].label,div):null);
  // #86: a grand champion's places are its awards (Grand Champion, and Runner-up when the row gives it).
  const gc=ksmGrandChampion(div);
  return gc?KSMEngine.grandChampionPlacements(placements,gc.awardMode,KSMEngine.grandChampionWithdrawn(gc)):placements;
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


