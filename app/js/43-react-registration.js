/* ksm:post-split-begin react-registration */
// ==========================================================
// React Registration, part 1 (app/react/registration/, roadmap M.13)
// Registration draws two parts with React islands, mounted by app/react/registration/main.tsx:
// the individual players table (#regTable) and the contents of the tournament status card
// (#tournamentStatusCard). The legacy code still decides what is shown and runs every action:
// renderReg() (03-registration-and-validation.js) calls ksmRenderRegistration() below, which
// publishes the rows the filter lets through as plain data (ksm:registration-players,
// window.ksmRegistrationPlayersInput); renderTournamentStatus() (03) sets the card's class and
// publishes its counts (ksm:registration-status, window.ksmRegistrationStatusInput).
// tests/golden/registration/*.json (recorded from the legacy renderer) pin the result. Text is what
// esc() showed after the HTML parser read it (ksmHtmlText()), a row's competitor is its index in
// state.competitors as the inline handlers had it. The rows' fields call updateComp() (03) on their
// change event, the status chip cycleCompetitorStatus() (03) and × ksmRemoveCompetitor() below,
// as the inline handlers did.
// Every other part of Registration stays legacy markup (app/index.html): the tab bar (regTab() in
// 23- toggles its classes and the cards), the toolbars and their buttons, the filter (#regFilter,
// read by renderReg() by id), the team, exhibition and Pools cards (part 2 / the Pools island).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmPublishRegistration(event,key,input){
  window[key]=input;
  window.dispatchEvent(new CustomEvent(event));
}
// A text as the legacy markup showed it: esc() (String(x||'')) and then the HTML parser, which
// turns CR LF and a lone CR into LF (in text and attribute values alike).
function ksmHtmlText(s){return ksmText(s).replace(/\r\n?/g,'\n')}
// renderReg() (03) as data: the filter as it read it, then a row per competitor it let through.
function ksmRegistrationData(){
  const f=(regFilter?.value||'').toLowerCase();
  const rows=state.competitors.map((c,i)=>({...c,i})).filter(c=>!f||[c.name,c.dojo,c.division,c.status].join(' ').toLowerCase().includes(f));
  return {
    divisions:state.divisions.map(ksmHtmlText),
    rows:rows.map(c=>({
      index:c.i,
      name:ksmHtmlText(c.name),dojo:ksmHtmlText(c.dojo),seed:ksmHtmlText(c.seed),
      // The class printed as `status ${c.status}` (not escaped; see F19) and the status as compared.
      status:String(c.status).replace(/\r\n?/g,'\n'),
      checked:c.status==='Checked',noShow:c.status==='NoShow',
      // The options printed `selected` (d===c.division), by position.
      selected:state.divisions.map((d,j)=>d===c.division?j:-1).filter(j=>j>=0),
    })),
  };
}
function ksmRenderRegistration(){
  const input=ksmRegistrationData();
  // The legacy innerHTML replaced every row, so a field being edited in the table lost the focus:
  // the browser committed it (its change event, then blur and focusout) while the old row was
  // removed, after the new rows had been computed. React replaces the rows later (at its render),
  // so the focus leaves the table here, at the same moment, with the same events.
  const active=document.activeElement;
  if(window.ksmRegistrationMounted&&active&&active!==document.body&&window.regTable&&regTable.contains(active))active.blur();
  ksmPublishRegistration('ksm:registration-players','ksmRegistrationPlayersInput',input);
}
// renderTournamentStatus() (03) as data: the validation result and the counts.
function ksmRenderTournamentStatus(valid,competitors,divisions,errors){
  ksmPublishRegistration('ksm:registration-status','ksmRegistrationStatusInput',
    {valid:!!valid,competitors,divisions,courts:ksmHtmlText(tCourts?.value||'2'),errors});
}
// × of a row: what its inline handler ran.
function ksmRemoveCompetitor(i){state.competitors.splice(i,1);renderReg();renderTournamentStatus()}
/* ksm:post-split-end */
