// ==========================================================
// KSM v3.12.4 — Split-Court Template Consolidation
// ==========================================================
function splitTemplateContextHtml(div){
  const nodes=state.singleElimNodes?.[div]||[];
  if(!nodes.length)return '<div class="muted-card">Single-elimination bracket will appear after generation.</div>';
  const rounds=[...new Set(nodes.map(n=>n.round))];
  return `<div class="single-elim-context-grid split-template-context"><div class="single-elim-context-column">${rounds.map(round=>singleElimRoundCardHtml(div,round)).join('')}</div></div>`;
}
const renderSingleElimContext_v3121=renderSingleElimContext;
renderSingleElimContext=function(div){
  return divisionCourtMode(div)==='split'?splitTemplateContextHtml(div):renderSingleElimContext_v3121(div);
};

function syncSingleElimNodeWinnerFromMatch(div,node,match){
  if(!match||!match.done)return false;
  const winner=winnerOf(match);
  if(!winner||winner==='Hikiwake')return false;
  const next=winner===match.red?{name:match.red,dojo:match.rdojo}:{name:match.white,dojo:match.wdojo};
  if(!node.winner||node.winner.name!==next.name){node.winner=next;return true;}
  return false;
}
function canonicalSingleElimMatch(div,node,arr){
  const matches=arr.filter(m=>m.singleElim&&m.elimNodeId===node.id);
  if(!matches.length)return null;
  const kept=matches.find(m=>m.done)||matches[0];
  matches.forEach(m=>{if(m!==kept){const i=arr.indexOf(m);if(i>=0)arr.splice(i,1);}});
  return kept;
}
function syncIndividualSingleElim(div,arr,comps){
  state.singleElimNodes=state.singleElimNodes||{};
  const nodes=state.singleElimNodes[div]||[];
  const courtMode=state.divisionCourts[div]||'A';
  let changed=true,guard=0;
  while(changed&&guard++<50){
    changed=false;
    for(const node of nodes){
      const match=arr.find(m=>m.singleElim&&m.elimNodeId===node.id);
      if(!match){
        console.error('KSM template invariant: missing Match Object for',div,node.id);
        continue;
      }
      if(match.done){
        const winner=winnerOf(match);
        if(winner&&winner!=='Hikiwake'){
          const next=winner===match.red?{name:match.red,dojo:match.rdojo}:{name:match.white,dojo:match.wdojo};
          if(!node.winner||node.winner.name!==next.name){node.winner=next;changed=true;}
        }
        continue;
      }
      if(node.winner){match.ready=false;continue;}
      const red=indivSide(node.left,comps,div),white=indivSide(node.right,comps,div);
      if(red&&!white&&!node.right?.ref){node.winner=red;match.ready=false;changed=true;continue;}
      if(white&&!red&&!node.left?.ref){node.winner=white;match.ready=false;changed=true;continue;}
      match.position=node.round;
      match.court=courtMode==='split'?(node.round==='Final'?'A':node.court):courtMode;
      match.bracketSlot=node.slot||0;
      if(red&&white){
        match.red=red.name;match.rdojo=red.dojo||'';
        match.white=white.name;match.wdojo=white.dojo||'';
        match.ready=true;
      }else{
        match.red=red?.name||'';match.rdojo=red?.dojo||'';
        match.white=white?.name||'';match.wdojo=white?.dojo||'';
        match.ready=false;
      }
    }
  }
  sortIndividualSingleElimMatches(div,arr);
  state.allMatches[div]=arr;
  return enforceUniqueIndividualMatches(div);
}
function canonicalSingleElimQueue(div,court,current){
  const nodes=state.singleElimNodes?.[div]||[];
  const arr=enforceUniqueIndividualMatches(div);
  const rows=[];
  nodes.forEach(node=>{
    const nodeCourt=divisionCourtMode(div)==='split'?(node.round==='Final'?'A':node.court):(state.divisionCourts?.[div]||'A');
    if(nodeCourt!==court)return;
    const m=arr.find(x=>x.singleElim&&x.elimNodeId===node.id);
    if(m?.done||m===current||node.winner)return;
    if(m&&m.ready)rows.push({round:node.round,html:renderGroupedQueueRow(m)});
    else rows.push({round:node.round,html:alignedPlaceholderRowHtml(sideLabelGeneric(node.right,div),sideLabelGeneric(node.left,div),(!node.left||!node.right)?'BYE':'awaiting',true)});
  });
  return rows;
}
const renderQueue_v3121=renderQueue;
renderQueue=function(){
  const target=document.getElementById('queue');if(!target)return;
  const div=state.currentDivision,court=state.currentCourt||'A';
  if(!div){target.innerHTML='';return;}
  if(divisionComplete(div)){target.innerHTML='';return;}
  if((state.singleElimNodes?.[div]||[]).length&&divisionCourtMode(div)==='split'){
    const current=state.matches?.[state.current]||null;
    const rows=canonicalSingleElimQueue(div,court,current),groups=[];
    rows.forEach(row=>{let g=groups.find(x=>x.label===row.round);if(!g){g={label:row.round,rows:[]};groups.push(g)}g.rows.push(row.html)});
    target.innerHTML=groups.map(g=>groupedQueueSection(g.label,g.rows)).join('');return;
  }
  renderQueue_v3121();
};

function contextDivisionForCourt(){
  return state.currentDivision||state.courtActiveDivision?.[state.currentCourt||'A']||state.courtState?.[state.currentCourt||'A']?.division||null;
}
function persistentContextHtml(div,current){
  if(!div)return '<div class="muted-card">No division selected.</div>';
  if((state.singleElimNodes?.[div]||[]).length)return renderSingleElimContext(div);
  if((state.pools?.[div]||[]).length)return orderedPoolContextHtml(div,current||null);
  if(isTeamDivision(div))return teamResultsBracketHtml(div);
  return bracketHtml(div);
}
const renderContext_v3121=renderContext;
renderContext=function(){
  if(!window.courtContext)return;
  const m=state.matches?.[state.current];
  if(m&&matchBelongsToCourt(m,state.currentCourt||'A')){renderContext_v3121();return;}
  const div=contextDivisionForCourt();
  setCourtSupportMode((state.singleElimNodes?.[div]||[]).length?'singleElim':'standard');
  courtContext.innerHTML=persistentContextHtml(div,null);
};

function divisionCompletePanelHtml(div){
  const placements=resultPlacements(div);
  if(!placements.length)return `<div class="division-complete-panel" data-testid="division-complete"><div class="small">Final results are available in Results.</div></div>`;
  return `<div class="division-complete-panel" data-testid="division-complete"><div class="division-complete-list">${placements.map(p=>`<div class="division-complete-row" data-testid="division-complete-row"><b class="${esc(p.tier||'')}">${esc(p.place)}</b><span>${esc(p.name)}</span></div>`).join('')}</div></div>`;
}
function setCourtCompletePresentation(div,complete){
  const card=document.querySelector('#score .scoreboard-card');if(!card)return;
  let panel=card.querySelector('.division-complete-panel');
  if(complete){
    card.classList.add('division-complete');
    if(!panel){panel=document.createElement('div');panel.className='division-complete-panel';card.appendChild(panel)}
    panel.outerHTML=divisionCompletePanelHtml(div);
  }else{card.classList.remove('division-complete');if(panel)panel.remove();}
}
const renderScore_v3121=renderScore;
renderScore=function(){
  const div=state.currentDivision;
  const current=state.matches?.[state.current];
  if(div&&divisionComplete(div)&&(!current||current.done||!matchBelongsToCourt(current,state.currentCourt||'A'))){
    updateScoreTournamentName();setCourtCompletePresentation(div,true);renderQueue();renderPublic();renderContext();return;
  }
  setCourtCompletePresentation(div,false);renderScore_v3121();
};
const renderPublic_v3121=renderPublic;
renderPublic=function(){
  const court=state.publicCourt||'A';
  const div=state.courtActiveDivision?.[court]||state.courtState?.[court]?.division||state.currentDivision;
  if(div&&divisionComplete(div)&&!courtCurrentMatch(court)){
    if(window.publicLive)publicLive.innerHTML=`<div class="audience-hero">${divisionCompletePanelHtml(div)}</div>`;
    return;
  }
  renderPublic_v3121();
};

if(!restoreAutoSaveIfWanted()) renderAll();
setConnectionStatus(cloudSession.tournamentId?'Sync connecting…':'Local only',cloudSession.tournamentId?'connecting':'local');



