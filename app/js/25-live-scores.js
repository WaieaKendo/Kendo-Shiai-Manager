// ==========================================================
// KSM v3.9.1 — Live Scores render modes
// ==========================================================
function audienceMeta(m){
  if(!m)return {division:'—',line:'No active match'};
  let line='';
  if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'){
    line=m.position||m.pool||'Team Match';
  }else if(m.championship||m.pool==='Championship'){
    line=m.position||'Championship';
  }else{
    line=`Pool ${m.pool||'A'}`;
  }
  return {division:m.division||state.currentDivision||'—',line};
}
function renderPublic(){
/* ksm:post-split-begin react-live */
  // Live Scores is React (app/react/live-scores/, 36-react-live-scores.js): the screen is
  // published to it instead of written (M.13); on a TV device the TV display is redrawn too.
  ksmRenderLiveScores();
/* ksm:post-split-end */
}
const KSM_TV_ASSIGNED_COURT=(()=>{const value=(new URLSearchParams(location.search).get('court')||'A').toUpperCase();return value==='B'?'B':'A'})();
function tvAssignedCourt(){return KSM_TV_ASSIGNED_COURT}
function tvIndividualSideLabel(match,side){
  const direct=side==='white'?match?.white:match?.red;if(direct)return direct;
  if(match?.championship){
    const node=(state.championshipNodes?.[match.division]||[]).find(n=>n.id===match.champNodeId);
    if(node){const source=side==='white'?node.right:node.left;if(source?.seed)return source.seed;if(source?.ref){const prev=(state.championshipNodes?.[match.division]||[]).find(n=>n.id===source.ref);return `Winner of ${prev?.round||'Previous Round'} Match ${(prev?.slot??0)+1}`}}
    if(match.position&&match.position!==firstRoundName(championshipLabels(match.division).length)){const prev=previousRoundName(match.position);const slot=(match.bracketSlot||0)*2+(side==='white'?1:0);return sourceLabelForRound(match.division,prev,slot).name}
  }
  if(match?.singleElim&&match.elimNodeId){const node=(state.singleElimNodes?.[match.division]||[]).find(n=>n.id===match.elimNodeId);if(node)return sideLabelGeneric(side==='white'?node.right:node.left,match.division)}
  return 'TBD';
}
function tvTeamNodeEntries(court,current){
  const div=current.division,nodes=state.teamBracketNodes?.[div]||[],all=state.allMatches?.[div]||[],entries=[],seen=new Set();
  let currentNodeIndex=nodes.findIndex(n=>n.id===current.teamNodeId);
  if(currentNodeIndex<0&&current.teamPair){
    const sibling=all.find(x=>x.teamPair===current.teamPair&&x.teamNodeId);
    if(sibling)currentNodeIndex=nodes.findIndex(n=>n.id===sibling.teamNodeId);
  }
  nodes.forEach((node,nodeIndex)=>{
    if(nodeIndex<=currentNodeIndex||node.winner)return;
    const nodeCourt=String(node.court||'').toUpperCase();
    if(nodeCourt&&nodeCourt!=='BOTH'&&nodeCourt!==court)return;
    const matches=all.filter(m=>isTeamMatch(m)&&m.teamNodeId===node.id&&!m.done);
    const m=matches[0];
    const white=m?(m.teamWhite||m.wdojo||teamSideLabel(node.right,div)):teamSideLabel(node.right,div);
    const red=m?(m.teamRed||m.rdojo||teamSideLabel(node.left,div)):teamSideLabel(node.left,div);
    const key=m?.teamPair||node.id;
    if(seen.has(key))return;
    seen.add(key);
    entries.push({teamWhite:white||'TBD',teamRed:red||'TBD',position:node.round||m?.position||'',teamNodeId:node.id,teamPair:m?.teamPair||'',placeholder:!m});
  });
  return entries;
}
function tvUpcomingMatches(court,current,teamMode=false){
  let all=state.allMatches[current.division]||[];
  if(all.some(isTeamMatch))all=sortTeamMatches(current.division);else all=sortIndividualDivisionMatches(current.division,all);
  const idx=all.indexOf(current);
  let candidates=all.slice(Math.max(0,idx+1)).filter(x=>!x.done&&matchBelongsToCourt(x,court));
  if(teamMode){
    const seen=new Set(),actual=[];
    candidates.forEach(x=>{
      const key=x.teamPair||x.teamNodeId||`${x.teamWhite}|${x.teamRed}`;
      if(!isTeamMatch(x)||key===current.teamPair||seen.has(key))return;
      seen.add(key);actual.push(x);
    });
    tvTeamNodeEntries(court,current).forEach(x=>{
      const key=x.teamPair||x.teamNodeId||`${x.teamWhite}|${x.teamRed}`;
      if(!seen.has(key)){seen.add(key);actual.push(x)}
    });
    return actual.slice(0,2);
  }
  return candidates.slice(0,2);
}
async function launchTvDisplay(court){closeNavMenus();if(!cloudSession.tournamentId)await saveNow();if(!cloudSession.tournamentId){alert('Save the tournament to cloud before opening TV Display.');return}window.open(tvLink(court),'_blank','noopener')}






