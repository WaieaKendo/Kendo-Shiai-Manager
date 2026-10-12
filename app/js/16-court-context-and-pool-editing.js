
function maybeCreateKachinukiNext(m){
  /* ksm:post-split-begin engine-bridge */const plan=KSMEngine.maybeCreateKachinukiNext(m);if(!plan)return;
  let div=m.division,arr=state.allMatches[div]||[];
  if(plan.kind==='playoff')appendApprovedDynamicMatches(div,m,/** @type {Match} */(plan.match),'KACHINUKI_REPRESENTATIVE');
  else{let idx=arr.indexOf(m);arr.splice(idx+1,0,/** @type {Match} */(plan.match));state.allMatches[div]=arr;}
  /* ksm:post-split-end */
}
function kachinukiSheetHtml(m){let pts=activeScoreArrays(m);let w=m.lineupW||[],r=m.lineupR||[];function list(arr,idx,side){return arr.map((name,i)=>`<div class="competitor-line ${i<idx?'small':''}"><b>${esc(name)}</b><span class="small">${i<idx?'eliminated':(i===idx?'active':'waiting')}</span></div>`).join('')}return `<div class="team-sheet"><div class="team-sheet-head"><div>${esc(m.teamWhite)}</div><div class="redHead">${esc(m.teamRed)}</div></div><div class="team-sheet-row gold"><div class="white"><b>${esc(m.white)}</b><div class="live-points">${pts.W.join(' ')}</div></div><div class="vs">NOW</div><div class="red"><b>${esc(m.red)}</b><div class="live-points">${pts.R.join(' ')}</div></div></div><div class="team-sheet-row"><div>${list(w,m.wIndex,'W')}</div><div></div><div>${list(r,m.rIndex,'R')}</div></div></div>`}

function dragPoolPlayer(ev,poolLabel,idx){ev.dataTransfer.setData('text/plain',JSON.stringify({poolLabel,idx}));}
function insertPoolPlayer(ev,toLabel,toIndex){
  ev.preventDefault();ev.stopPropagation();let div=poolDiv?.value||state.currentDivision;let pools=state.pools[div]||[];let data;try{data=JSON.parse(ev.dataTransfer.getData('text/plain'))}catch(e){return}
  let from=pools.find(p=>p.label===data.poolLabel),to=pools.find(p=>p.label===toLabel);if(!from||!to)return;
  let player=from.players.splice(data.idx,1)[0];if(!player)return;
  if(from===to && data.idx<toIndex)toIndex--;
  to.players.splice(Math.max(0,Math.min(toIndex,to.players.length)),0,player);
  toggleEditPools();
}
function dropPoolPlayer(ev,toLabel){ev.preventDefault();let div=poolDiv?.value||state.currentDivision;let pools=state.pools[div]||[];let data;try{data=JSON.parse(ev.dataTransfer.getData('text/plain'))}catch(e){return}let from=pools.find(p=>p.label===data.poolLabel),to=pools.find(p=>p.label===toLabel);if(!from||!to)return;let player=from.players.splice(data.idx,1)[0];if(player)to.players.push(player);toggleEditPools();}
function toggleEditPools(){let div=poolDiv?.value||state.currentDivision;let pools=state.pools[div]||[];if(!pools.length)return;poolOutput.className='pools-layout';poolOutput.innerHTML='<div><div class="toolbar"><button class="primary" onclick="saveEditedPools()" data-testid="pool-edit-save">Save Pool Changes</button><button onclick="renderPools()">Cancel</button></div><p class="sub">Drag players between pools or drop between names to insert into that position. Top-to-bottom order is always A, B, C, D.</p><div class="pool-list">'+pools.map((p,pi)=>`<div class="pool" data-testid="pool-edit-pool" ondragover="event.preventDefault();this.classList.add('drop-target')" ondragleave="this.classList.remove('drop-target')" ondrop="if(event.target===this)dropPoolPlayer(event,${jsArg(p.label)});this.classList.remove('drop-target')"><h3>Pool ${esc(p.label)}</h3><div class="drop-zone" data-testid="pool-edit-drop" ondragover="event.preventDefault()" ondrop="insertPoolPlayer(event,${jsArg(p.label)},0)"></div>${p.players.map((x,idx)=>`<div class="drag-player" draggable="true" data-testid="pool-edit-player" ondragstart="dragPoolPlayer(event,${jsArg(p.label)},${idx})"><span class="pool-slot-badge">${esc(poolPlayerSlotLetter(idx))}</span><b>${esc(x.name)}</b><span class="small" style="float:right">${esc(x.dojo||'')}</span></div><div class="drop-zone" data-testid="pool-edit-drop" ondragover="event.preventDefault()" ondrop="insertPoolPlayer(event,${jsArg(p.label)},${idx+1})"></div>`).join('')}</div>`).join('')+'</div></div><div><h2>Championship Preview</h2>'+bracketHtml(div)+'</div>';}
function movePoolPlayer(fromPool,idx,toPool){let div=poolDiv?.value||state.currentDivision;let pools=state.pools[div]||[];toPool=parseInt(toPool,10);if(fromPool===toPool)return;let player=pools[fromPool].players.splice(idx,1)[0];if(player)pools[toPool].players.push(player);toggleEditPools();}
function saveEditedPools(){
  let div=poolDiv?.value||state.currentDivision;
  const pools=assignPoolPlayerSlots(state.pools[div]||[]);
  state.pools[div]=pools;

  // Pool editing occurs after the division has already been generated. Rebuild the
  // complete division Match Object set, not just the preliminary pool matches.
  // The championship preview is driven by state.brackets/standings, so dropping
  // the championship Match Objects here can make a QF look populated in the
  // bracket while leaving nothing scorable in the Court queue.
  const total=pools.reduce((sum,pool)=>sum+(pool.players?.length||0),0);
  state.brackets=state.brackets||{};
  const bracket=(Array.isArray(state.brackets[div])&&state.brackets[div].length)
    ? state.brackets[div]
    : championshipTemplateForTotal(total);
  state.brackets[div]=bracket;

  const poolMatches=buildPoolMatches(div,pools);
  const championshipMatches=buildChampionshipTemplateMatches(div,bracket);
  state.allMatches[div]=poolMatches.concat(championshipMatches);
  syncChampionshipTemplate(div);
  state.currentByDivision[div]=0;

  // Any saved court pointer into the pre-edit array is now stale because the
  // division Match Objects were intentionally rebuilt. Re-resolve each affected
  // court against the canonical queue before tournament play begins.
  ['A','B'].forEach(court=>{
    if(state.courtState?.[court]?.division===div||state.courtActiveDivision?.[court]===div){
      const next=findNextForCourt(court,div,0);
      state.courtState[court]=next;
      state.courtActiveDivision[court]=next.division;
    }
  });
  state.managementRevision=(state.managementRevision||0)+1;
  if(div===state.currentDivision)setActiveDivision(div);
  renderPools();
  scheduleAutoSave();
}
function renderAll(){ensureCourtHistory();renderDivisions();renderReg();renderTeams();renderExhibitions();renderPools();renderScore();renderProgress();renderContext();saveSetup();renderTournamentStatus();updateUndoButton()/* ksm:post-split-begin react-bridge */;if(typeof ksmNotifyStateChanged==='function')ksmNotifyStateChanged('render')/* ksm:post-split-end */}
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
// A value as a JavaScript string literal inside an inline on*="..." handler. esc() alone is not enough:
// the HTML parser decodes &#39; back to ' before the handler runs, so a name could break out of '...'.
function jsArg(v){return esc(JSON.stringify(String(v??'')))}
document.addEventListener('paste',e=>{if(!registration.classList.contains('hidden')&&state.regMode==='individual'){let text=e.clipboardData.getData('text');if(text&&text.includes('\t')){e.preventDefault();text.trim().split(/\n/).forEach(line=>{let[name,dojo,division,seed,status]=line.split('\t');if(name){if(division&&!state.divisions.includes(division))state.divisions.push(division);state.competitors.push({name,dojo:dojo||'',division:division||state.divisions[0],seed:seed||'',status:(status||'Registered').replace('Checked In','Checked')})}});renderDivisions();renderReg()}}});


