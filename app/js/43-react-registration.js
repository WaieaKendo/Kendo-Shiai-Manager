/* ksm:post-split-begin react-registration */
// ==========================================================
// React Registration, parts 1 and 2 (app/react/registration/, roadmap M.13; part 2, the team
// cards, the exhibition table and the tab bar, is the second half of this file)
// Registration draws two parts with React islands, mounted by app/react/registration/main.tsx:
// the individual players table (#regTable) and the contents of the tournament status card
// (#tournamentStatusCard). The legacy code still decides what is shown and runs every action:
// renderReg() (03-registration-and-validation.js) calls ksmRenderRegistration() below, which
// publishes the rows the filter lets through as plain data (ksm:registration-players,
// window.ksmRegistrationPlayersInput); renderTournamentStatus() (03) sets the card's class and
// publishes its counts (ksm:registration-status, window.ksmRegistrationStatusInput).
// tests/golden/registration/*.json (recorded from the legacy renderer) pin the result. Text is what
// esc() showed after the HTML parser read it (ksmHtmlText()), a row's competitor is its index in
// state.competitors as the inline handlers had it. The rows' fields call ksmUpdateCompetitor()
// below on their change event (updateComp() (03) for the competitor the row showed: F17), the
// status chip cycleCompetitorStatus() (03) and × ksmRemoveCompetitor() below, as the inline
// handlers did.
// The toolbars and their buttons and the filter (#regFilter, read by renderReg() by id) stay
// legacy markup (app/index.html).
// The legacy renderer (the innerHTML of renderReg() and renderTournamentStatus(), and the 03- copy
// of regTab(), overridden by 23-'s and never run) was removed in M.13. If the React module does not
// load, Registration shows a notice in place of the players table (the end of this file).
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
    rows:rows.map(c=>ksmBindRegistrationRow(state.competitors[c.i],{
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
// F17: a row's fields belong to the competitor the row showed, not to a place in the list. The
// redraw commits the field being edited (its change event) after the new list is in place, so an
// applied live update (a 409 rebase, the cloud copy loaded, Staff Login with queued work) used to
// write the typed text into whichever competitor the new list had at that row. The row remembers
// its competitor (the object); a new list from another device has new objects, so there the
// competitor is the one entry with every field as the row showed it. If there is none (removed,
// or changed on the other device too) or more than one, the edit is dropped with a notice.
// (var, the map made on first use: renderReg() runs at boot, before this part of app.js.)
var ksmRegistrationRowCompetitors=null,ksmRegistrationRowsStale=false;
function ksmBindRegistrationRow(competitor,row){
  if(!ksmRegistrationRowCompetitors)ksmRegistrationRowCompetitors=new WeakMap();
  ksmRegistrationRowCompetitors.set(row,competitor);return row;
}
function ksmSameCompetitor(a,b){return ['name','dojo','division','seed','status'].every(k=>String(a?.[k]??'')===String(b?.[k]??''))}
// A row's field changed (its change event): what the inline onchange's updateComp(index,...) did,
// for the competitor the row belongs to.
function ksmUpdateCompetitor(row,key,value){
  const competitor=ksmRegistrationRowCompetitors?.get(row);
  let index=competitor?state.competitors.indexOf(competitor):row.index;
  if(index<0){
    const same=state.competitors.map((c,i)=>ksmSameCompetitor(c,competitor)?i:-1).filter(i=>i>=0);
    if(same.length!==1){
      showKsmToast(`Your change to ${competitor.name||'a player'} was not saved: the player list was updated from another device while you were typing. Enter it again.`,10000,true);
      return;
    }
    // Found in a new list: the rows being published show its old value, so they are drawn again.
    index=same[0];ksmRegistrationRowsStale=true;
  }
  updateComp(index,key,value);
}
function ksmRenderRegistration(){
  let input=ksmRegistrationData();
  // The legacy innerHTML replaced every row, so a field being edited in the table lost the focus:
  // the browser committed it (its change event, then blur and focusout) while the old row was
  // removed, after the new rows had been computed. React replaces the rows later (at its render),
  // so the focus leaves the table here, at the same moment, with the same events.
  const active=document.activeElement;
  ksmRegistrationRowsStale=false;
  if(window.ksmRegistrationMounted&&active&&active!==document.body&&window.regTable&&regTable.contains(active))active.blur();
  // F17: the blur committed an edit into a competitor of the new list (ksmUpdateCompetitor()).
  if(ksmRegistrationRowsStale){ksmRegistrationRowsStale=false;input=ksmRegistrationData()}
  ksmPublishRegistration('ksm:registration-players','ksmRegistrationPlayersInput',input);
}
// renderTournamentStatus() (03) as data: the validation result and the counts.
function ksmRenderTournamentStatus(valid,competitors,divisions,errors){
  ksmPublishRegistration('ksm:registration-status','ksmRegistrationStatusInput',
    {valid:!!valid,competitors,divisions,courts:ksmHtmlText(tCourts?.value||'2'),errors});
}
// × of a row: what its inline handler ran.
function ksmRemoveCompetitor(i){state.competitors.splice(i,1);renderReg();renderTournamentStatus()}

// ---------------------------------------------------------- Registration part 2
// The team cards (the wrapper of #teamTable in #teamReg), the exhibition table (#exhibitionTable)
// and the tab bar (the first row of the toolbar card) are React islands too
// (app/react/registration/RegistrationTeams.tsx). renderTeams() and renderExhibitions() (03) are
// calls of the publishers below; regTab() (23) still sets state.regMode, shows and hides the cards
// and redraws Pools, and publishes the tab (ksm:registration-tab) in place of toggling the tabs'
// classes. tests/golden/registration-teams/*.json (recorded from the legacy renderer) pin the
// result. The toolbars and their buttons, the team filter (#teamFilter, read by id on every key)
// and the hint line stay legacy markup. The legacy renderer (renderTeams()'s outerHTML,
// renderExhibitions()'s innerHTML, regTab()'s tab class toggles) was removed in M.13; without the
// React module the cards say so (the end of this file).
// A redraw replaced every card / row, so a field being edited lost the focus at that moment (its
// change event, then blur and focusout, after the new cards had been computed); React replaces
// them later, so the focus leaves the island here, as in ksmRenderRegistration().
function ksmBlurRedrawn(island){
  const active=document.activeElement;
  if(window.ksmRegistrationTeamsMounted&&active&&active!==document.body&&island&&island.contains(active))active.blur();
}
// renderTeams() (03) as data: the format line and positions of the Setup team format, then a card
// per team the filter lets through.
function ksmTeamsData(){
  let f=(teamFilter?.value||'').toLowerCase();
  let rows=state.teams.map((c,i)=>({...c,i})).filter(c=>!f||[c.team,c.type,c.senpo,c.jiho,c.chuken,c.fukusho,c.taisho].join(' ').toLowerCase().includes(f));
  let fmt=teamFormat?.value||'5-Person Team';
  let slots=fmt==='3-Person Team'||fmt==='Kachinuki'?['senpo','chuken','taisho']:['senpo','jiho','chuken','fukusho','taisho'];
  return {
    format:ksmHtmlText(fmt),tournamentFormat:ksmHtmlText(teamTournamentFormat?.value||'Single Elimination'),slots,
    cards:rows.map(c=>({index:c.i,team:ksmHtmlText(c.team),members:slots.map(k=>ksmHtmlText(c[k])),
      // The class printed as `status ${esc(c.status)}` (F19) and the status as compared.
      status:ksmHtmlText(c.status),checked:c.status==='Checked',noShow:c.status==='NoShow'})),
  };
}
function ksmRenderTeams(){
  const input=ksmTeamsData();
  ksmBlurRedrawn(document.querySelector('#teamReg #teamTable'));
  ksmPublishRegistration('ksm:registration-teams','ksmRegistrationTeamsInput',input);
}
// renderExhibitions() (03) as data: a row per exhibition match.
function ksmExhibitionsData(){
  let rows=state.exhibitions||[];
  return {rows:rows.map((x,i)=>({index:i,white:ksmHtmlText(x.white),red:ksmHtmlText(x.red),
    status:ksmHtmlText(x.status),checked:x.status==='Checked',noShow:x.status==='NoShow'}))};
}
function ksmRenderExhibitions(){
  if(!window.exhibitionTable)return;
  const input=ksmExhibitionsData();
  ksmBlurRedrawn(exhibitionTable);
  ksmPublishRegistration('ksm:registration-exhibitions','ksmRegistrationExhibitionsInput',input);
}
// regTab() (23): the tab marked active.
function ksmRenderRegistrationTab(mode){
  ksmPublishRegistration('ksm:registration-tab','ksmRegistrationTabInput',{mode:String(mode)});
}
// What the cards' and rows' inline handlers ran (`state` is not a window property).
function ksmSetTeamField(card,key,value){state.teams[card.index][key]=value}
function ksmRemoveTeam(i){state.teams.splice(i,1);renderTeams();renderTournamentStatus()}
function ksmSetExhibitionField(row,key,value){state.exhibitions[row.index][key]=value}
function ksmCycleExhibitionStatus(i){state.exhibitions[i].status=statusCycle(state.exhibitions[i].status);renderExhibitions()}
function ksmRemoveExhibition(i){state.exhibitions.splice(i,1);renderExhibitions()}

// If the React module (app/react/main.tsx, a module script after app.js) did not run, say so on
// Individual Players instead of an empty table, which nothing fills any more (e.g. an offline
// device whose cached copy lacks the module), and hide the empty status card. The tabs, the
// toolbars and their buttons stay. Module scripts run before DOMContentLoaded, so a working page
// never shows this. Existing styles only (.muted-card, .small).
function ksmShowRegistrationModuleMissing(){
  if(window.ksmRegistrationMounted)return;
  const table=document.querySelector('#indReg #regTable')?.parentElement;
  if(!table||document.getElementById('registrationModuleMissing'))return;
  const notice=document.createElement('div');
  notice.id='registrationModuleMissing';notice.className='muted-card';notice.setAttribute('role','alert');notice.setAttribute('data-testid','registration-module-missing');
  notice.innerHTML='<b>Players could not load</b><div class="small">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</div>';
  table.style.display='none';
  table.before(notice);
  const card=document.getElementById('tournamentStatusCard');
  if(card)card.style.display='none';
}
document.addEventListener('DOMContentLoaded',ksmShowRegistrationModuleMissing);
// The same for part 2: Team Registration and Exhibition say so in place of their (empty) tables;
// the toolbars, the filter and the tabs stay usable (without the island the current tab is no
// longer marked, regTab() still switches the cards).
function ksmShowRegistrationTeamsModuleMissing(){
  if(window.ksmRegistrationTeamsMounted)return;
  [['#teamReg #teamTable','registrationTeamsModuleMissing','registration-teams-module-missing','Teams could not load'],
   ['#exhibitionReg #exhibitionTable','registrationExhibitionsModuleMissing','registration-exhibitions-module-missing','Exhibitions could not load']]
  .forEach(([selector,id,testId,title])=>{
    const table=document.querySelector(selector)?.parentElement;
    if(!table||document.getElementById(id))return;
    const notice=document.createElement('div');
    notice.id=id;notice.className='muted-card';notice.setAttribute('role','alert');notice.setAttribute('data-testid',testId);
    notice.innerHTML=`<b>${title}</b><div class="small">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</div>`;
    table.style.display='none';
    table.before(notice);
  });
}
document.addEventListener('DOMContentLoaded',ksmShowRegistrationTeamsModuleMissing);
/* ksm:post-split-end */
