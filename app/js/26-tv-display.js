// ==========================================================
// KSM v3.15.14 — clean-room fixed-grid TV renderer
// ==========================================================
function tv3Side(match,side,teamMode){
  if(teamMode)return side==='white'?(match.teamWhite||match.wdojo||teamSideLabel(match.right,match.division)||'TBD'):(match.teamRed||match.rdojo||teamSideLabel(match.left,match.division)||'TBD');
  return tvIndividualSideLabel(match,side);
}
function tv3UpcomingModel(court,current,teamMode){
  const found=(tvUpcomingMatches(court,current,teamMode)||[]).slice(0,2).map(m=>({
    left:tv3Side(m,'white',teamMode),right:tv3Side(m,'red',teamMode),
    leftSub:teamMode?(m.position||m.round||''):(m.wdojo||m.position||''),
    rightSub:teamMode?'':(m.rdojo||''),round:teamMode?(m.position||m.round||''):''
  }));
  while(found.length<2)found.push(null);
  return found;
}
function buildTV3ViewModel(court){
  const data=courtCurrentMatch(court);
  const division=state.courtActiveDivision?.[court]||state.courtState?.[court]?.division||null;
  if(!data){
    if(division&&divisionComplete(division)&&resultPlacements(division).length){
      return {court,empty:false,division,format:'results',meta:{division,line:'Final Results'},upcoming:[null,null]};
    }
    return {court,empty:true,division,upcoming:[null,null]};
  }
  const m=data.match,meta=audienceMeta(m),teamMode=isTeamMatch(m);
  return {court,empty:false,division:m.division,data,match:m,meta,teamMode,format:m.type==='kachinuki'?'kachinuki':(teamMode?'team':'individual'),upcoming:tv3UpcomingModel(court,m,teamMode)};
}
function renderTvDisplay(){
/* ksm:post-split-begin react-tv */
  // The TV display is React (app/react/tv/, 37-react-tv.js): what buildTV3ViewModel() chose is
  // published to it instead of written (M.13).
  ksmRenderTv();
/* ksm:post-split-end */
}

