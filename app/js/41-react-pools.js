/* ksm:post-split-begin react-pools */
// ==========================================================
// React Pools view (app/react/pools/, roadmap M.13)
// The Pools view (Registration -> Pools, #poolsReg) draws #poolOutput with one React island,
// mounted by app/react/pools/main.tsx. The legacy code still decides what is shown and runs every
// action: renderPools() (08-engine-generation.js) calls ksmRenderPools(div) below, which publishes
// the division's pools, the message when there are none, whether Edit Pool is offered and the
// Championship Preview / Team Standings as plain data (ksm:pools, window.ksmPoolsInput);
// toggleEditPools() (16-court-context-and-pool-editing.js) publishes the editor through
// ksmRenderPoolEditor(div). Both read what the legacy templates read; tests/golden/pools/*.json
// (recorded from the legacy renderer) pin the result. Text is what esc() showed (ksmText(),
// String(x||'')), the pool label of the drag-and-drop handlers what jsArg() passed
// (String(x??'')), the bracket the court screen's data (ksmBracket(), 35-react-court.js: the
// legacy bracketHtml()). The island's drag and drop and buttons call dragPoolPlayer(),
// dropPoolPlayer(), insertPoolPlayer(), toggleEditPools(), saveEditedPools() and renderPools()
// (08, 16), as the inline handlers did. The division select (#poolDiv, written by
// renderDivisions() in 02-, read synchronously by the pool functions), Regenerate and
// #poolOutput's class stay legacy. The legacy Pools renderer (the innerHTML of renderPools() and
// toggleEditPools(), and bracketHtml() with its helpers in 06-/14-/28-/29-) was removed in M.13.
// If the React module does not load, the Pools view shows a notice (the end of this file).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmPublishPools(input){
  window.ksmPoolsInput=input;
  window.dispatchEvent(new CustomEvent('ksm:pools'));
}
// renderPools() (08) as data.
function ksmPoolsViewInput(div){
  const pools=state.pools[div]||[];
  // The heading printed the label as it is (no esc()); labels are the engine's A, B, C, ...
  const poolData=pools.map(p=>({label:String(p.label??''),title:`${isTeamDivision(div)?'Team Pool':'Pool'} ${p.label}`,
    players:p.players.map((x,idx)=>({slot:ksmText(poolPlayerSlot(x,idx)),name:ksmText(x.name),dojo:ksmText(x.dojo)}))}));
  const message=pools.length?null:(isTeamDivision(div)&&state.allMatches[div]?.length?'Single-elimination team bracket created. Team position matches are available in the Court queue.':((state.divisionTypes[div]==='Single Elimination'&&state.allMatches[div]?.length)?'Single-elimination bracket created. Matches are available in the Court queue.':'No pools generated yet.'));
  const edit=!!(pools.length&&!isTeamRoundRobinDivision(div));
  const rightTitle=isTeamRoundRobinDivision(div)?'Team Standings':'Championship Preview';
  return {kind:'pools',pools:poolData,message,edit,rightTitle,bracket:ksmBracket(div)};
}
function ksmRenderPools(div){
  // The view replaces the editor: an edit not saved is dropped (F12, see below).
  ksmPoolEdit=null;
  ksmPublishPools(ksmPoolsViewInput(div));
}
// F12: Edit Pool works on a copy of the division's pools. The drops (dropPoolPlayer(),
// insertPoolPlayer(), movePoolPlayer() in 16-) move players in the copy, which the editor shows;
// state.pools changes only when Save Pool Changes applies it (saveEditedPools(), 16-). Leaving the
// editor any other way - Cancel, the division select, a live update or any other redraw of the
// view (renderPools()) - drops the copy, so the pools are exactly as before. Clicks in the editor
// (Save, Cancel) do not ask for an autosave (the click listener, 21-): only an applied Save saves.
var ksmPoolEdit=null;
function ksmPoolEditPools(div){
  if(!ksmPoolEdit||ksmPoolEdit.div!==div)ksmPoolEdit={div,pools:cloneJson(state.pools[div]||[])};
  return ksmPoolEdit.pools;
}
function ksmPoolEditorClick(target){return !!ksmPoolEdit&&!!target?.closest?.('#poolOutput')}
// Save Pool Changes: the edited pools to apply, or null (nothing to do). Without a move it only
// closes the editor (nothing is rebuilt). With matches already played it asks first: rebuilding
// the division's matches deletes their results; Cancel keeps them and the editor (nothing saved).
function ksmPoolEditToSave(div){
  const pools=ksmPoolEdit&&ksmPoolEdit.div===div?ksmPoolEdit.pools:null;
  if(!pools||JSON.stringify(pools)===JSON.stringify(state.pools[div]||[])){renderPools();return null}
  const played=(state.allMatches?.[div]||[]).filter(m=>m&&m.done).length;
  if(played&&!confirm(`Delete the results of ${played} played ${played===1?'match':'matches'} in ${div}?\n\nSaving the new pools rebuilds the division's matches, so the results played so far are deleted. Cancel keeps the results and the editor open (nothing is saved).`))return null;
  ksmPoolEdit=null;
  return pools;
}
// toggleEditPools() (16) as data: the editor of the division's pools (slot letters by position).
function ksmRenderPoolEditor(div){
  const pools=ksmPoolEditPools(div);
  ksmPublishPools({kind:'editor',
    pools:pools.map(p=>({label:String(p.label??''),title:`Pool ${ksmText(p.label)}`,
      players:p.players.map((x,idx)=>({slot:ksmText(poolPlayerSlotLetter(idx)),name:ksmText(x.name),dojo:ksmText(x.dojo||'')}))})),
    bracket:ksmBracket(div)});
}

// If the React module (app/react/main.tsx, a module script after app.js) did not run, say so in the
// Pools view instead of an empty #poolOutput, which nothing fills any more (e.g. an offline device
// whose cached copy lacks the module). The division select and Regenerate stay. Module scripts run
// before DOMContentLoaded, so a working page never shows this. Existing styles only (.muted-card,
// .small).
function ksmShowPoolsModuleMissing(){
  if(window.ksmPoolsMounted)return;
  const output=document.getElementById('poolOutput');
  if(!output||document.getElementById('poolsModuleMissing'))return;
  const notice=document.createElement('div');
  notice.id='poolsModuleMissing';notice.className='muted-card';notice.setAttribute('role','alert');notice.setAttribute('data-testid','pools-module-missing');
  notice.innerHTML='<b>Pools could not load</b><div class="small">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</div>';
  output.style.display='none';
  output.before(notice);
}
document.addEventListener('DOMContentLoaded',ksmShowPoolsModuleMissing);
/* ksm:post-split-end */
