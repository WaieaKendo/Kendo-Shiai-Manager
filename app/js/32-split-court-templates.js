
const renderScore_v3121=renderScore;
renderScore=function(){
  const div=state.currentDivision;
  const current=state.matches?.[state.current];
  if(div&&divisionComplete(div)&&(!current||current.done||!matchBelongsToCourt(current,state.currentCourt||'A'))){
    updateScoreTournamentName();ksmSignalCourtHeader({divisionTitle:div,matchLine:'Division complete'});setCourtCompletePresentation(div,true);renderQueue();renderPublic();renderContext();return;
  }
  setCourtCompletePresentation(div,false);renderScore_v3121();
};

const KSM_EMPTY_SETUP=getSetupSnapshot();
if(!restoreAutoSaveIfWanted()) renderAll();
setConnectionStatus(cloudSession.tournamentId?'Sync connecting…':'Local only',cloudSession.tournamentId?'connecting':'local');



