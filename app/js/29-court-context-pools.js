// ---------- KSM v3.9.1 Pool Context layout ----------
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

  // Pool-play Court Context: standings first, championship preview below.
  setCourtSupportMode('standard');
  const currentPool=m.pool && m.pool!=='Championship'
    ? m.pool
    : (state.pools[m.division]?.[0]?.label||'A');
  const standings=poolStandings(currentPool,m.division);

  courtContext.innerHTML=`<div class="pool-context-stack">
    <div class="context-box">
      <h2>Pool ${esc(currentPool)} Standings</h2>
      <div class="stand-row small"><b>#</b><b>Name</b><b>Wins</b><b>Pts</b></div>
      ${standings.map((r,i)=>`<div class="stand-row">
        <span>${i+1}</span>
        <div><b>${esc(r.name)}</b><div class="small">${esc(r.dojo)}</div></div>
        <b>${r.wins}</b>
        <b>${r.pts}</b>
      </div>`).join('')}
    </div>

    <div class="pool-context-divider" aria-hidden="true"></div>

    <div class="context-box pool-context-bracket">
      <h2>Championship Bracket Preview</h2>
      ${bracketHtml(m.division)}
    </div>
  </div>`;
}


// ---------- KSM v3.9.1 Unified score-slot renderer ----------
function alignedPointSlots(points,side){
  const values=[...(points||[])].slice(0,2);
  while(values.length<2)values.push('');

  return values.map(value=>{
    const hasValue=!!value;
    const sideClass=hasValue && side==='R' ? 'red' : '';
    return `<div class="match-point ${sideClass} ${hasValue?'':'empty'}">${hasValue?esc(value):'·'}</div>`;
  }).join('');
}


// ---------- KSM v3.9.1 All pool results in Court Context ----------
function allPoolResultsContextHtml(div){
  const pools=state.pools?.[div]||[];
  if(!pools.length)return '';

  const cards=pools.map(pool=>{
    const standings=poolStandings(pool.label,div);
    const matches=(state.allMatches?.[div]||[]).filter(match=>
      match.pool===pool.label && !match.championship
    );

    const standingsHtml=standings.map((row,index)=>`
      <div class="stand-row">
        <span>${index+1}</span>
        <div>
          <b>${esc(row.name)}</b>
          <div class="small">${esc(row.dojo||'')}</div>
        </div>
        <b>${row.wins}</b>
        <b>${row.pts}</b>
      </div>`).join('');

    const matchesHtml=matches.map(match=>
      alignedMatchRowHtml(match,{
        status:match.done?'DONE':(match.tiebreak?'TIEBREAK':'vs'),
        compact:true
      })
    ).join('');

    return `<section class="pool-result-card">
      <h3>Pool ${esc(pool.label)}</h3>
      <div class="pool-result-standings">
        <div class="stand-row small"><b>#</b><b>Name</b><b>Wins</b><b>Pts</b></div>
        ${standingsHtml}
      </div>
      <div>${matchesHtml||'<div class="small">No pool matches available.</div>'}</div>
    </section>`;
  }).join('');

  return `<div class="all-pools-context">
    <h2>All Pool Results</h2>
    <div class="all-pools-context-grid">${cards}</div>
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

  setCourtSupportMode('standard');
  const currentPool=m.pool && m.pool!=='Championship'
    ? m.pool
    : (state.pools[m.division]?.[0]?.label||'A');
  const standings=poolStandings(currentPool,m.division);

  courtContext.innerHTML=`<div class="pool-context-stack">
    <div class="context-box">
      <h2>Pool ${esc(currentPool)} Standings</h2>
      <div class="stand-row small"><b>#</b><b>Name</b><b>Wins</b><b>Pts</b></div>
      ${standings.map((r,i)=>`<div class="stand-row">
        <span>${i+1}</span>
        <div><b>${esc(r.name)}</b><div class="small">${esc(r.dojo)}</div></div>
        <b>${r.wins}</b>
        <b>${r.pts}</b>
      </div>`).join('')}
    </div>

    <div class="pool-context-divider" aria-hidden="true"></div>

    <div class="context-box pool-context-bracket">
      <h2>Championship Bracket Preview</h2>
      ${bracketHtml(m.division)}
    </div>

    <div class="pool-context-divider" aria-hidden="true"></div>

    <div class="context-box">
      ${allPoolResultsContextHtml(m.division)}
    </div>
  </div>`;
}


// ---------- KSM v3.9.1 Dynamic active pool card ----------
function poolResultCardHtml(div,pool,options={}){
  const standings=poolStandings(pool.label,div);
  const matches=(state.allMatches?.[div]||[]).filter(match=>
    match.pool===pool.label && !match.championship
  );

  const standingsHtml=standings.map((row,index)=>`
    <div class="stand-row">
      <span>${index+1}</span>
      <div>
        <b>${esc(row.name)}</b>
        <div class="small">${esc(row.dojo||'')}</div>
      </div>
      <b>${row.wins}</b>
      <b>${row.pts}</b>
    </div>`).join('');

  const matchesHtml=matches.map(match=>
    alignedMatchRowHtml(match,{
      status:match.done?'DONE':(match.tiebreak?'TIEBREAK':'vs'),
      compact:true,
      current:!!options.currentMatch && match===options.currentMatch
    })
  ).join('');

  return `<section class="pool-result-card ${options.active?'active-pool-card':''}">
    <h3>Pool ${esc(pool.label)}</h3>
    <div class="pool-result-standings">
      <div class="stand-row small"><b>#</b><b>Name</b><b>Wins</b><b>Pts</b></div>
      ${standingsHtml}
    </div>
    <div>${matchesHtml||'<div class="small">No pool matches available.</div>'}</div>
  </section>`;
}

function activePoolForDivision(div,currentMatch){
  const pools=state.pools?.[div]||[];
  if(!pools.length)return null;

  // Prefer the current incomplete pool match.
  if(currentMatch && !currentMatch.done && !currentMatch.championship){
    return pools.find(pool=>pool.label===currentMatch.pool)||null;
  }

  // Otherwise, use the first pool with any incomplete preliminary match.
  return pools.find(pool=>
    (state.allMatches?.[div]||[]).some(match=>
      match.pool===pool.label && !match.championship && !match.done
    )
  )||null;
}

function allPoolResultsContextHtml(div,excludeLabel=null){
  const pools=(state.pools?.[div]||[]).filter(pool=>pool.label!==excludeLabel);
  if(!pools.length)return '';

  return `<div class="all-pools-context">
    <h2>All Pool Results</h2>
    <div class="all-pools-context-grid">
      ${pools.map(pool=>poolResultCardHtml(div,pool)).join('')}
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

  setCourtSupportMode('standard');

  const activePool=activePoolForDivision(m.division,m);
  const activePoolHtml=activePool
    ? `<div class="context-box">
        ${poolResultCardHtml(m.division,activePool,{active:true,currentMatch:m})}
      </div>
      <div class="pool-context-divider" aria-hidden="true"></div>`
    : '';

  const lowerPoolsHtml=allPoolResultsContextHtml(
    m.division,
    activePool ? activePool.label : null
  );

  courtContext.innerHTML=`<div class="pool-context-stack">
    ${activePoolHtml}

    <div class="context-box pool-context-bracket">
      <h2>Championship Bracket Preview</h2>
      ${bracketHtml(m.division)}
    </div>

    ${lowerPoolsHtml ? `
      <div class="pool-context-divider" aria-hidden="true"></div>
      <div class="context-box">${lowerPoolsHtml}</div>
    ` : ''}
  </div>`;
}


