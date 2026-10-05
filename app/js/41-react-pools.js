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
// #poolOutput's class stay legacy.
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
  ksmPublishPools(ksmPoolsViewInput(div));
}
// toggleEditPools() (16) as data: the editor of the division's pools (slot letters by position).
function ksmRenderPoolEditor(div){
  const pools=state.pools[div]||[];
  ksmPublishPools({kind:'editor',
    pools:pools.map(p=>({label:String(p.label??''),title:`Pool ${ksmText(p.label)}`,
      players:p.players.map((x,idx)=>({slot:ksmText(poolPlayerSlotLetter(idx)),name:ksmText(x.name),dojo:ksmText(x.dojo||'')}))})),
    bracket:ksmBracket(div)});
}
/* ksm:post-split-end */
