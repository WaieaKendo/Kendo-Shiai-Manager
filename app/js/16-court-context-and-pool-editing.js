
function maybeCreateKachinukiNext(m){
  /* ksm:post-split-begin engine-bridge */const plan=KSMEngine.maybeCreateKachinukiNext(m);if(!plan)return;
  let div=m.division,arr=state.allMatches[div]||[];
  if(plan.kind==='playoff')appendApprovedDynamicMatches(div,m,/** @type {Match} */(plan.match),'KACHINUKI_REPRESENTATIVE');
  else{let idx=arr.indexOf(m);arr.splice(idx+1,0,/** @type {Match} */(plan.match));state.allMatches[div]=arr;}
  /* ksm:post-split-end */
}

function dragPoolPlayer(ev,poolLabel,idx){ev.dataTransfer.setData('text/plain',JSON.stringify({poolLabel,idx}));}
function insertPoolPlayer(ev,toLabel,toIndex){
  ev.preventDefault();ev.stopPropagation();let div=poolDiv?.value||state.currentDivision;let pools=/* ksm:post-split-begin pool-edit was:state.pools[div]||[] */ksmPoolEditPools(div)/* ksm:post-split-end */;let data;try{data=JSON.parse(ev.dataTransfer.getData('text/plain'))}catch(e){return}
  let from=pools.find(p=>p.label===data.poolLabel),to=pools.find(p=>p.label===toLabel);if(!from||!to)return;
  let player=from.players.splice(data.idx,1)[0];if(!player)return;
  if(from===to && data.idx<toIndex)toIndex--;
  to.players.splice(Math.max(0,Math.min(toIndex,to.players.length)),0,player);
  toggleEditPools();
}
function dropPoolPlayer(ev,toLabel){ev.preventDefault();let div=poolDiv?.value||state.currentDivision;let pools=/* ksm:post-split-begin pool-edit was:state.pools[div]||[] */ksmPoolEditPools(div)/* ksm:post-split-end */;let data;try{data=JSON.parse(ev.dataTransfer.getData('text/plain'))}catch(e){return}let from=pools.find(p=>p.label===data.poolLabel),to=pools.find(p=>p.label===toLabel);if(!from||!to)return;let player=from.players.splice(data.idx,1)[0];if(player)to.players.push(player);toggleEditPools();}
function toggleEditPools(){/* ksm:post-split-begin react-pools */let div=poolDiv?.value||state.currentDivision;let pools=ksmPoolEditPools(div);if(!pools.length)return;poolOutput.className='pools-layout';ksmRenderPoolEditor(div);/* ksm:post-split-end */}
function movePoolPlayer(fromPool,idx,toPool){let div=poolDiv?.value||state.currentDivision;let pools=/* ksm:post-split-begin pool-edit was:state.pools[div]||[] */ksmPoolEditPools(div)/* ksm:post-split-end */;toPool=parseInt(toPool,10);if(fromPool===toPool)return;let player=pools[fromPool].players.splice(idx,1)[0];if(player)pools[toPool].players.push(player);toggleEditPools();}
function saveEditedPools(){
  let div=poolDiv?.value||state.currentDivision;
  /* ksm:post-split-begin pool-edit was:const pools=assignPoolPlayerSlots(state.pools[div]||[]); */const edited=ksmPoolEditToSave(div);if(!edited)return;const pools=assignPoolPlayerSlots(edited);/* ksm:post-split-end */
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
document.addEventListener('paste',e=>{if(!registration.classList.contains('hidden')&&state.regMode==='individual'){let text=e.clipboardData.getData('text');if(text&&text.includes('\t')){e.preventDefault();text.trim()./* ksm:post-split-begin paste-lines was:split(/\n/) */split(/\r\n|\r|\n/)/* ksm:post-split-end */.forEach(line=>{let[name,dojo,division,seed,status]=line.split('\t')/* ksm:post-split-begin paste-lines */.map(cell=>cell.trim())/* ksm:post-split-end */;if(name){if(division&&!state.divisions.includes(division))state.divisions.push(division);state.competitors.push({name,dojo:dojo||'',division:division||state.divisions[0],seed:seed||'',status:(status||'Registered').replace('Checked In','Checked')})}});renderDivisions();renderReg()}}});


