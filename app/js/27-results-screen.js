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
function resultCardHtml(div){
  const placements=resultPlacements(div),roundRobin=isTeamRoundRobinDivision(div);
  if(!placements.length){
    const progress=roundRobin?teamRoundRobinProgress(div):null;
    return `<article class="result-progress-card" data-testid="result-card">
      <h2 class="result-card-title" data-testid="result-card-title">${esc(div)}</h2>
      <div class="result-progress-message">${roundRobin?`Round robin in progress • ${progress.complete}/${progress.total} pairings complete`:'Tournament in progress'}</div>
      ${roundRobin?`<div class="result-card-footer"><button class="view-bracket-link" onclick="openResultsBracket(${jsArg(div)})">View Standings →</button></div>`:''}
    </article>`;
  }

  const rows=placements.map((p,i)=>`
    <div class="placement-row ${i===0?'champion':''}" data-testid="placement-row">
      <div class="placement-ribbon ${p.tier}"></div>
      <div class="placement-label" data-testid="placement-place">${esc(p.place)}</div>
      <div class="placement-name" data-testid="placement-name">${esc(p.name)}</div>
    </div>`).join('');

  return `<article class="result-award-card" data-testid="result-card">
    <h2 class="result-card-title" data-testid="result-card-title">${esc(div)}</h2>
    <div class="result-card-rule"></div>
    <div class="placement-list">${rows}</div>
    <div class="result-card-footer">
      <button class="view-bracket-link" onclick="openResultsBracket(${jsArg(div)})">${roundRobin?'View Standings':'View Bracket'} →</button>
    </div>
  </article>`;
}
function awardsEditorHtml(){
  const rows=(state.awards||[]).map((a,i)=>`
    <div class="award-edit-row">
      <input aria-label="Award name" value="${esc(a.award||'')}" onchange="state.awards[${i}].award=this.value;saveAuto()">
      <input aria-label="Recipient name" value="${esc(a.name||'')}" onchange="state.awards[${i}].name=this.value;saveAuto()">
      <input aria-label="Dojo" value="${esc(a.dojo||'')}" onchange="state.awards[${i}].dojo=this.value;saveAuto()">
      <button class="award-remove" onclick="removeResultAward(${i})" aria-label="Remove award">×</button>
    </div>`).join('');

  return `<section class="results-awards-card">
    <h2 class="results-awards-title">Special Awards</h2>
    <div class="awards-editor">
      ${rows||'<div class="results-empty">No special awards entered yet.</div>'}
    </div>
    <div class="award-add-row">
      <button class="primary" onclick="addResultAward()">+ Add Award</button>
    </div>
  </section>`;
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
  if(!window.resultsBody)return;
  /* ksm:post-split-begin react-results */ksmRenderResults();if(window.ksmResultsMounted)return;
  /* ksm:post-split-end */
  if(window.resultsTournamentName){
    resultsTournamentName.textContent=(window.tName&&tName.value)?tName.value:'Kendo Tournament';
  }

  const divisions=[
    ...new Set([
      ...(state.divisions||[]),
      ...Object.keys(state.allMatches||{})
    ])
  ].filter(div=>(state.allMatches?.[div]||[]).length);

  const completed=divisions.filter(divisionComplete);
  const pending=divisions.filter(div=>!divisionComplete(div));

  let output='';
  if(completed.length){
    output+=`<div class="results-section-heading">Completed</div>
      <div class="results-card-grid">${completed.map(resultCardHtml).join('')}</div>`;
  }
  if(pending.length){
    output+=`<div class="results-section-heading">In Progress</div>
      <div class="results-card-grid">${pending.map(resultCardHtml).join('')}</div>`;
  }
  if(!divisions.length){
    output+='<div class="results-empty">Generate tournament matches to display results.</div>';
  }

  resultsBody.innerHTML=output+awardsEditorHtml();
}
function teamResultsBracketHtml(div){
  const nodes=state.teamBracketNodes?.[div]||[];
  if(!nodes.length)return '<div class="results-empty">No team bracket is available.</div>';
  const rounds=[...new Set(nodes.map(n=>n.round))];
  return `<div class="results-team-bracket">${rounds.map(round=>`
    <section class="results-team-round">
      <h3>${esc(round)}</h3>
      ${nodes.filter(n=>n.round===round).map(node=>{
        const white=teamSideLabel(node.right,div);
        const red=teamSideLabel(node.left,div);
        return `<div class="results-team-match">
          <div class="white"><b>${esc(white)}</b></div>
          <div>${node.winner?'DONE':'vs'}</div>
          <div class="red"><b>${esc(red)}</b></div>
        </div>`;
      }).join('')}
    </section>`).join('')}</div>`;
}
function completedResultDetailHtml(div){
  if(isTeamDivision(div))return teamResultsBracketHtml(div);

  const pools=state.pools?.[div]||[];
  if(pools.length){
    const poolHtml=pools.map(pool=>{
      const standings=poolStandings(pool.label,div);
      return `<div class="bracket-card">
        <div class="bracket-round">Pool ${esc(pool.label)}</div>
        ${standings.map((row,i)=>`
          <div class="stand-row">
            <span>${i+1}</span>
            <div><b>${esc(row.name)}</b><div class="small">${esc(row.dojo||'')}</div></div>
            <b>${row.wins}</b><b>${row.pts}</b>
          </div>`).join('')}
      </div>`;
    }).join('');
    return `<div class="context-split">
      <div class="context-box"><h2>Pool Results</h2>${poolHtml}</div>
      <div class="context-box"><h2>Championship Bracket</h2>${bracketHtml(div)}</div>
    </div>`;
  }

  return bracketHtml(div);
}
function openResultsBracket(div){
  const modal=document.getElementById('resultsBracketModal');
  if(!modal)return;
  /* ksm:post-split-begin react-results */ksmRenderResultsBracket(div);if(window.ksmResultsMounted){modal.classList.remove('hidden');return;}
  /* ksm:post-split-end */
  resultsBracketTitle.textContent=div;
  resultsBracketBody.innerHTML=completedResultDetailHtml(div);
  modal.classList.remove('hidden');
}
function closeResultsBracket(){
  const modal=document.getElementById('resultsBracketModal');
  if(modal)modal.classList.add('hidden');
}
function renderResultsAll(){
  // Preserve the historical function name as the presentation entry point.
  renderResultsDashboard();
  return '';
}
const originalShowForResults=show;
show=function(id){
  originalShowForResults(id);
  if(id==='results')renderResultsDashboard();
};
document.addEventListener('keydown',function(event){
  if(event.key==='Escape')closeResultsBracket();
});


