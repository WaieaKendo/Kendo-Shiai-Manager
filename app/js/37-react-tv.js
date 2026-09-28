/* ksm:post-split-begin react-tv */
// ==========================================================
// React TV display (app/react/tv/, roadmap M.13)
// The TV display (?view=tv, body.ksm-tv, #tvLive) is drawn only by React: one island (Tv), mounted
// by app/react/tv/main.tsx. The legacy code still chooses what the TV shows:
// buildTV3ViewModel() (26-tv-display.js) takes the TV court's match with courtCurrentMatch()
// (which also moves the court on, as before), its upcoming matches (tvUpcomingMatches(), which
// sorts the division's matches in place) and decides when a completed division's Final Results
// show. renderTvDisplay() (26-) calls ksmRenderTv() below, which publishes what to draw as
// plain data (ksm:tv, window.ksmTvInput) and never writes #tvLive.
// The legacy tv3 renderer (tv3Individual(), tv3Team(), tv3Kachinuki(), tv3Results(),
// tv3Upcoming(), ... in 26-, and renderTvDisplay()'s body) and the first TV renderer that never
// ran (25-: tvIndividualHtml(), tvTeamHtml(), ...) were removed in M.13; the functions below
// mirror the tv3 renderer's reads, in the same order, which tests/golden/tv/*.json (recorded
// from it) pin; text is what esc() showed (ksmText(), String(x||'')); the placements are the
// court screen's division-complete data (ksmDivisionCompleteInput(), 35-react-court.js).
// If the React module does not load, the TV shows a notice (the end of this file).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmPublishTv(input){
  window.ksmTvInput=input;
  window.dispatchEvent(new CustomEvent('ksm:tv'));
}
// Point letters as Array.join() prints them (the view adds the '—' before the first point, as
// tvPointText() did).
function ksmTvLetters(arr){return (arr||[]).map(x=>x==null?'':String(x))}
// tv3Upcoming(): up to two cards, null for an empty one.
function ksmTvUpcoming(vm){
  return (vm.upcoming||[]).map(x=>x?{white:ksmText(x.left),red:ksmText(x.right),whiteSub:ksmText(x.leftSub),redSub:ksmText(x.rightSub)}:null);
}
// tv3Team(): the pairing's bouts (after tvUpcomingMatches() sorted them), the current one marked.
function ksmTvTeam(vm){
  const m=vm.match,all=(state.allMatches[m.division]||[]).filter(x=>x.teamPair===m.teamPair&&(x.type==='teamPosition'||x.type==='teamPlayoff'));
  const rows=all.length?all:[m],first=rows[0]||m,sum=teamPairSummary(m.division,m.teamPair);
  return {kind:'team',teamWhite:ksmText(first.teamWhite||m.teamWhite||'White Team'),teamRed:ksmText(first.teamRed||m.teamRed||'Red Team'),
    rows:rows.map(x=>{const p=activeScoreArrays(x);return {white:ksmText(x.white||'TBD'),red:ksmText(x.red||'TBD'),points:{W:ksmTvLetters(p.W),R:ksmTvLetters(p.R)},active:x===m}}),
    // Printed into the template as they are (no esc()).
    summary:{wWins:String(sum.wWins),wPts:String(sum.wPts),rWins:String(sum.rWins),rPts:String(sum.rPts)}};
}
// tv3Kachinuki(): the current bout and both three-fighter lineups.
function ksmTvKachinuki(vm){
  const m=vm.match,p=activeScoreArrays(m),lineup=arr=>{const l=(arr||[]).slice(0,3);while(l.length<3)l.push('—');return l.map(n=>ksmText(n||'—'))};
  return {kind:'kachinuki',white:ksmText(m.white||'—'),red:ksmText(m.red||'—'),points:{W:ksmTvLetters(p.W),R:ksmTvLetters(p.R)},
    teamWhite:ksmText(m.teamWhite||'White Team'),teamRed:ksmText(m.teamRed||'Red Team'),
    lineupW:lineup(m.lineupW),lineupR:lineup(m.lineupR),wIndex:Number(m.wIndex||0),rIndex:Number(m.rIndex||0)};
}
// renderTvDisplay() as the tv3 renderer drew it: header, body by format, then Upcoming Matches
// (or, for Final Results, the "Division Complete" footer).
function ksmTvDisplayInput(court){
  const vm=buildTV3ViewModel(court);
  const header={court:ksmText(vm.court),division:ksmText(vm.meta?.division||vm.division||'No active match'),meta:ksmText(vm.meta?.line||'')};
  if(vm.empty)return {kind:'tv',...header,body:{kind:'idle'},upcoming:ksmTvUpcoming(vm)};
  if(vm.format==='results')return {kind:'tv',...header,body:{kind:'results',complete:ksmDivisionCompleteInput(vm.division,true)},upcoming:[]};
  const upcoming=ksmTvUpcoming(vm);
  if(vm.format==='individual'){
    const m=vm.match,p=activeScoreArrays(m);
    return {kind:'tv',...header,upcoming,body:{kind:'individual',
      white:{name:ksmText(tvIndividualSideLabel(m,'white')),sub:ksmText(m.wdojo)},red:{name:ksmText(tvIndividualSideLabel(m,'red')),sub:ksmText(m.rdojo)},
      points:{W:ksmTvLetters(p.W),R:ksmTvLetters(p.R)}}};
  }
  return {kind:'tv',...header,upcoming,body:vm.format==='kachinuki'?ksmTvKachinuki(vm):ksmTvTeam(vm)};
}
function ksmRenderTv(){
  if(!window.tvLive)return;
  ksmPublishTv(ksmTvDisplayInput(tvAssignedCourt()));
}

// If the React module (app/react/main.tsx, a module script after app.js) did not run, say so on
// the TV instead of an empty screen, which nothing fills any more (e.g. an offline TV whose
// cached copy lacks the module). Module scripts run before DOMContentLoaded, so a working page
// never shows this. Existing styles only (.card, .sub).
function ksmShowTvModuleMissing(){
  if(window.ksmTvMounted)return;
  const live=document.getElementById('tvLive');
  if(!live||document.getElementById('tvModuleMissing'))return;
  const notice=document.createElement('div');
  notice.id='tvModuleMissing';notice.className='card';notice.setAttribute('role','alert');notice.setAttribute('data-testid','tv-module-missing');
  notice.innerHTML='<h1>TV display could not load</h1><p class="sub">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</p>';
  // The TV CSS sizes #tvLive with !important rules (the fixed canvas), so hide it the same way.
  live.style.setProperty('display','none','important');
  live.before(notice);
}
document.addEventListener('DOMContentLoaded',ksmShowTvModuleMissing);
/* ksm:post-split-end */
