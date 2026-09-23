// ---------- KSM v3.9.1 Grouped court queue ----------
function queueGroupLabel(m){
  if(!m)return 'Upcoming';
  if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'){
    return m.pool||m.position||'Team Match';
  }
  if(m.singleElim || m.championship || m.pool==='Championship'){
    return m.position||m.round||'Championship';
  }
  return `Pool ${m.pool||'A'}`;
}
function normalizeQueueGroupLabel(label){
  const raw=String(label||'Upcoming').trim();
  const low=raw.toLowerCase();
  if(low.includes('quarter'))return 'Quarterfinals';
  if(low.includes('semi'))return 'Semifinals';
  if(low==='final'||low.includes('final match'))return 'Final';
  if(low.includes('round of 32'))return 'Round of 32';
  if(low.includes('round of 16'))return 'Round of 16';
  if(low.includes('first round'))return 'First Round';
  return raw;
}
function renderGroupedQueueRow(m){
  const round=m.position||m.pool||'Match';
  const white=specificMatchSideLabel(m,'white');
  const red=specificMatchSideLabel(m,'red');
  return `<div class="queue-row ${m.tiebreak?'gold':''}">
    <div class="white"><b>${esc(white)}</b><div class="small">${esc(m.wdojo||m.teamWhite||'')}</div></div>
    <div class="vs">vs<div class="small">${esc(round)}</div></div>
    <div class="red"><b>${esc(red)}</b><div class="small">${esc(m.rdojo||m.teamRed||'')}</div></div>
  </div>`;
}
function renderQueue(){
  const target=document.getElementById('queue');
  if(!target)return;
  const div=state.currentDivision;
  const court=state.currentCourt||'A';
  if(!div){target.innerHTML='<div class="muted-card">No active division.</div>';return;}

  const doneHtml=finalResultsHtml(div);
  if(eliminationFinalDone(div)){
    target.innerHTML=doneHtml||'<div class="muted-card">Division complete.</div>';
    return;
  }

  const current=state.matches?.[state.current]||null;
  let items=[];

  if((state.allMatches?.[div]||[]).some(m=>m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki')){
    items=sortTeamMatches(div).filter(m=>!m.done && matchBelongsToCourt(m,court) && m!==current);
  }else if((state.allMatches?.[div]||[]).some(m=>m.singleElim)){
    items=dedupeSingleElimMatches(div).filter(m=>!m.done && matchBelongsToCourt(m,court) && m!==current);
  }else{
    const all=state.allMatches?.[div]||[];
    const currentIndex=all.indexOf(current);
    items=all.filter((m,i)=>!m.done && matchBelongsToCourt(m,court) && m!==current && (currentIndex<0 || i>currentIndex || m.championship));
  }

  if(!items.length){
    target.innerHTML=doneHtml||'<div class="muted-card">Queue complete.</div>';
    return;
  }

  const groups=[];
  items.forEach(m=>{
    const label=normalizeQueueGroupLabel(queueGroupLabel(m));
    let group=groups.find(g=>g.label===label);
    if(!group){group={label,matches:[]};groups.push(group);}
    group.matches.push(m);
  });

  target.innerHTML=groups.map(group=>`
    <section class="queue-group">
      <div class="queue-group-title">${esc(group.label)}</div>
      <div class="queue-group-body">
        ${group.matches.map(renderGroupedQueueRow).join('')}
      </div>
    </section>
  `).join('');
}


// ---------- KSM v3.9.1 Adaptive Court Context + Team Queue ----------

// Presentation metadata is explicitly defined for every supported single-elimination
// competitor count. The renderer does not infer or calculate the split.
const SINGLE_ELIM_CONTEXT_LAYOUTS = {
  2:{left:[],right:['Final']},
  3:{left:['Semifinal'],right:['Final']},
  4:{left:['Semifinal'],right:['Final']},
  5:{left:['Quarterfinal'],right:['Semifinal','Final']},
  6:{left:['Quarterfinal'],right:['Semifinal','Final']},
  7:{left:['Quarterfinal'],right:['Semifinal','Final']},
  8:{left:['Quarterfinal'],right:['Semifinal','Final']},
  9:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  10:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  11:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  12:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  13:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  14:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  15:{left:['Play-in','Quarterfinal'],right:['Semifinal','Final']},
  16:{left:['Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  17:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  18:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  19:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  20:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  21:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  22:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  23:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  24:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  25:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  26:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  27:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  28:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  29:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  30:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  31:{left:['Play-in','Round of 16'],right:['Quarterfinal','Semifinal','Final']},
  32:{left:['Round of 32','Round of 16'],right:['Quarterfinal','Semifinal','Final']}
};

function setCourtSupportMode(mode){
  const grid=document.querySelector('#score .sk-support-grid');
  const queueCard=document.querySelector('#score .sk-queue-card');
  if(!grid||!queueCard)return;
  const single=mode==='singleElim';
  const splitSingle=single&&divisionCourtMode(state.currentDivision)==='split';
  grid.classList.toggle('single-elim-mode',single&&!splitSingle);
  queueCard.classList.toggle('hidden',single&&!splitSingle);
}

function singleElimRoundCardHtml(div,round){
  const nodes=(state.singleElimNodes?.[div]||[]).filter(n=>n.round===round);
  if(!nodes.length)return '';
  let body=nodes.map(node=>{
    const m=(state.allMatches?.[div]||[]).find(x=>x.singleElim&&x.elimNodeId===node.id);
    if(m){
      const w=winnerOf(m);
      return `<div class="bracket-match ${m.done?'':'gold'}">
        <div class="white ${w===m.white?'winner':''}">
          <b>${esc(m.white||'TBD')}</b>
          <div class="small">${(m.wp||[]).join(' ')}</div>
        </div>
        <div class="bracket-status">${m.done?'DONE':'vs'}</div>
        <div class="red ${w===m.red?'winner':''}">
          <b>${esc(m.red||'TBD')}</b>
          <div class="small">${(m.rp||[]).join(' ')}</div>
        </div>
      </div>`;
    }
    const white=sideLabelGeneric(node.right,div);
    const red=sideLabelGeneric(node.left,div);
    const status=(!node.left||!node.right)?'BYE':'awaiting';
    return `<div class="bracket-match">
      <div class="white"><b>${esc(white)}</b></div>
      <div class="bracket-status">${status}</div>
      <div class="red"><b>${esc(red)}</b></div>
    </div>`;
  }).join('');
  return `<div class="bracket-card">
    <div class="bracket-round">${esc(round)}</div>
    ${body}
  </div>`;
}

function renderSingleElimContext(div){
  const count=(state.singleElimComps?.[div]||[]).length;
  const layout=SINGLE_ELIM_CONTEXT_LAYOUTS[count]||SINGLE_ELIM_CONTEXT_LAYOUTS[32];
  const leftHtml=(layout.left||[]).map(round=>singleElimRoundCardHtml(div,round)).filter(Boolean).join('');
  const rightHtml=(layout.right||[]).map(round=>singleElimRoundCardHtml(div,round)).filter(Boolean).join('');
  return `<div class="single-elim-context-grid">
    <div class="single-elim-context-column">
      <h2>Earlier Rounds</h2>
      ${leftHtml||'<div class="muted-card">No earlier round for this bracket size.</div>'}
    </div>
    <div class="single-elim-context-column">
      <h2>Later Rounds</h2>
      ${rightHtml||'<div class="muted-card">Later rounds will appear here.</div>'}
    </div>
  </div>`;
}

function renderContext(){
  if(!window.courtContext)return;
  const m=state.matches[state.current];
  if(!m){
    setCourtSupportMode('standard');
    courtContext.innerHTML='<div class="muted-card">No active match.</div>';
    return;
  }

  if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'){
    setCourtSupportMode('standard');
    if(m.type==='kachinuki'){
      courtContext.innerHTML=`<h2>${esc(m.teamWhite)} vs ${esc(m.teamRed)}</h2><p class="sub">Kachinuki • winner stays in</p>${kachinukiSheetHtml(m)}`;
      return;
    }
    const s=teamPairSummary(m.division,m.teamPair);
    courtContext.innerHTML=`<h2>${esc(s.teamWhite)} vs ${esc(s.teamRed)}</h2><p class="sub">Current team match only</p>${teamSheetHtml(m.division,m.teamPair,m)}`;
    return;
  }

  if(m.singleElim || (m.championship && m.pool==='Championship' && !(state.pools[m.division]||[]).length)){
    setCourtSupportMode('singleElim');
    courtContext.innerHTML=renderSingleElimContext(m.division);
    return;
  }

  // Pool-play Court Context remains unchanged.
  setCourtSupportMode('standard');
  const currentPool=m.pool && m.pool!=='Championship'?m.pool:(state.pools[m.division]?.[0]?.label||'A');
  const standings=poolStandings(currentPool,m.division);
  courtContext.innerHTML=`<div class="context-split">
    <div class="context-box">
      <h2>Pool ${esc(currentPool)} Standings</h2>
      <div class="stand-row small"><b>#</b><b>Name</b><b>Wins</b><b>Pts</b></div>
      ${standings.map((r,i)=>`<div class="stand-row">
        <span>${i+1}</span>
        <div><b>${esc(r.name)}</b><div class="small">${esc(r.dojo)}</div></div>
        <b>${r.wins}</b><b>${r.pts}</b>
      </div>`).join('')}
    </div>
    <div class="context-box">
      <h2>Championship Bracket Preview</h2>
      ${bracketHtml(m.division)}
    </div>
  </div>`;
}

function groupedQueueSection(label,rows){
  if(!rows||!rows.length)return '';
  return `<section class="queue-group">
    <div class="queue-group-title">${esc(normalizeQueueGroupLabel(label))}</div>
    <div class="queue-group-body">${rows.join('')}</div>
  </section>`;
}

function poolChampionshipQueueGroups(div,court){
  const labels=championshipLabels(div);
  if(!labels.length)return [];
  const first=firstRoundName(labels.length);
  const rounds=roundSequenceFromFirst(first);
  const groups=[];

  rounds.forEach(round=>{
    const expected=expectedRoundCount(div,round);
    if(!expected)return;
    const rows=[];
    for(let i=0;i<expected;i++){
      const expectedCourt=championshipCourtFor(div,round,i,expected);
      if(expectedCourt!==court)continue;
      const m=champMatchBySlot(div,round,i);
      if(m&&m.done)continue;
      if(m){
        if(!matchBelongsToCourt(m,court))continue;
        rows.push(renderGroupedQueueRow(m));
        continue;
      }

      if(round===first){
        const pair=labels[i]||[];
        const rLabel=pair[0],wLabel=pair[1];
        const r=seedNameForLabel(div,rLabel,true);
        const w=seedNameForLabel(div,wLabel,true);
        const red=r?r.name:(rLabel||'TBD');
        const white=w?w.name:(wLabel||'BYE');
        const status=(String(wLabel).toUpperCase()==='BYE'||!wLabel)?'BYE':'awaiting';
        rows.push(`<div class="queue-row queue-placeholder">
          <div class="white"><b>${esc(white)}</b></div>
          <div class="vs">${status}<div class="small">${esc(round)}</div></div>
          <div class="red"><b>${esc(red)}</b></div>
        </div>`);
      }else{
        const prev=previousRoundName(round);
        const red=sourceLabelForRound(div,prev,i*2);
        const white=sourceLabelForRound(div,prev,i*2+1);
        rows.push(`<div class="queue-row queue-placeholder">
          <div class="white"><b>${esc(white.name||'TBD')}</b></div>
          <div class="vs">awaiting<div class="small">${esc(round)}</div></div>
          <div class="red"><b>${esc(red.name||'TBD')}</b></div>
        </div>`);
      }
    }
    if(rows.length)groups.push({label:round,rows});
  });

  return groups;
}

function teamQueueGroups(div,court,current){
  const groups=[];
  const groupMap=new Map();
  const all=sortTeamMatches(div);
  const currentPair=current?.teamPair||null;
  const seenPairs=new Set();

  function add(label,row){
    const normalized=normalizeQueueGroupLabel(label||'Team Match');
    if(!groupMap.has(normalized)){
      const group={label:normalized,rows:[]};
      groupMap.set(normalized,group);
      groups.push(group);
    }
    groupMap.get(normalized).rows.push(row);
  }

  all.forEach(m=>{
    if(!isTeamMatch(m)||m.done||!matchBelongsToCourt(m,court))return;
    const pair=m.teamPair||`${m.teamWhite}|${m.teamRed}|${m.pool||m.position||''}`;
    if(pair===currentPair||seenPairs.has(pair))return;
    seenPairs.add(pair);
    const node=(state.teamBracketNodes?.[div]||[]).find(n=>n.id===m.teamNodeId);
    const round=node?.round||m.pool||m.position||'Team Match';
    add(round,`<div class="queue-row team-queue-row ${m.tiebreak?'gold':''}">
      <div class="white"><b>${esc(m.teamWhite||m.wdojo||'TBD')}</b></div>
      <div class="vs">vs<div class="small">${esc(round)}</div></div>
      <div class="red"><b>${esc(m.teamRed||m.rdojo||'TBD')}</b></div>
    </div>`);
  });

  (state.teamBracketNodes?.[div]||[]).forEach(node=>{
    if(node.winner||node.court!==court)return;
    const pair=nodePairId(node);
    if(pair===currentPair||seenPairs.has(pair))return;

    const actual=all.find(m=>isTeamMatch(m)&&m.teamNodeId===node.id&&!m.done);
    if(actual)return;

    seenPairs.add(pair);
    add(node.round,`<div class="queue-row team-queue-row queue-placeholder">
      <div class="white"><b>${esc(teamSideLabel(node.right,div))}</b></div>
      <div class="vs">awaiting<div class="small">${esc(node.round)}</div></div>
      <div class="red"><b>${esc(teamSideLabel(node.left,div))}</b></div>
    </div>`);
  });

  return groups;
}

function renderQueue(){
  const target=document.getElementById('queue');
  if(!target)return;
  const div=state.currentDivision;
  const court=state.currentCourt||'A';
  if(!div){
    target.innerHTML='<div class="muted-card">No active division.</div>';
    return;
  }

  const current=state.matches?.[state.current]||null;
  const all=state.allMatches?.[div]||[];
  const doneHtml=finalResultsHtml(div);

  if((current?.singleElim || (current?.championship && current?.pool==='Championship' && !(state.pools?.[div]||[]).length)) && divisionCourtMode(div)!=='split'){
    target.innerHTML='';
    return;
  }

  if(eliminationFinalDone(div)){
    target.innerHTML=doneHtml||'<div class="muted-card">Division complete.</div>';
    return;
  }

  if(all.some(m=>m.singleElim)&&divisionCourtMode(div)==='split'){
    const items=dedupeSingleElimMatches(div).filter(m=>!m.done&&matchBelongsToCourt(m,court)&&m!==current);
    const groups=[];
    items.forEach(m=>{
      const label=normalizeQueueGroupLabel(m.position||'Championship');
      let group=groups.find(g=>g.label===label);
      if(!group){group={label,rows:[]};groups.push(group);}
      group.rows.push(renderGroupedQueueRow(m));
    });
    target.innerHTML=groups.map(g=>groupedQueueSection(g.label,g.rows)).join('')||doneHtml||'<div class="muted-card">Queue complete.</div>';
    return;
  }

  if(all.some(isTeamMatch)){
    const groups=teamQueueGroups(div,court,current);
    target.innerHTML=groups.map(g=>groupedQueueSection(g.label,g.rows)).join('')||
      doneHtml||'<div class="muted-card">Queue complete.</div>';
    return;
  }

  // Pool play: current Court Context remains unchanged. Court Queue lists all
  // remaining pool matches followed by every future championship round,
  // including unresolved source placeholders.
  const currentIndex=all.indexOf(current);
  const poolMatches=all.filter((m,i)=>
    !m.done && !m.championship && matchBelongsToCourt(m,court) &&
    m!==current && (currentIndex<0 || i>currentIndex)
  );

  const poolGroups=[];
  poolMatches.forEach(m=>{
    const label=`Pool ${m.pool||'A'}`;
    let group=poolGroups.find(g=>g.label===label);
    if(!group){
      group={label,rows:[]};
      poolGroups.push(group);
    }
    group.rows.push(renderGroupedQueueRow(m));
  });

  const championshipGroups=poolChampionshipQueueGroups(div,court);
  const groups=[...poolGroups,...championshipGroups];

  target.innerHTML=groups.map(g=>groupedQueueSection(g.label,g.rows)).join('')||
    doneHtml||'<div class="muted-card">Queue complete.</div>';
}


// ---------- KSM v3.9.1 Active navigation state ----------
function setActiveNavForView(viewId){
  document.querySelectorAll('.icon-nav .nav-tile').forEach(btn=>{
    btn.classList.remove('active');
    btn.removeAttribute('aria-current');
  });

  const mapping={
    setup:"Setup",
    registration:"Registration",
    score:"Courts",
    public:"Live Scores",
    director:"Overview",
    tv:"TV Display",
    results:"Results",
    print:"Export"
  };

  const label=mapping[viewId];
  if(!label)return;

  const btn=[...document.querySelectorAll('.icon-nav .nav-tile')].find(el=>
    (el.textContent||'').trim().startsWith(label)
  );

  if(btn){
    btn.classList.add('active');
    btn.setAttribute('aria-current','page');
  }
}

const originalShowForNav=show;
show=function(id){
  originalShowForNav(id);
  setActiveNavForView(id);
};


