/* ksm:post-split-begin react-live */
// ==========================================================
// React Live Scores (app/react/live-scores/, roadmap M.13)
// The Live Scores screen (#public) is drawn only by React: one island (LiveScores), mounted by
// app/react/live-scores/main.tsx. The legacy code still chooses each court's match
// (courtCurrentMatch(), which also moves a court on to its next match, as before) and decides
// when a court's division is complete (F16); renderPublic() (25-live-scores.js) calls
// ksmRenderLiveScores() below, which publishes what to show as plain data (ksm:live-scores,
// window.ksmLiveScoresInput) and never writes #publicLive.
// The legacy Live Scores renderer (the 32-split-court-templates.js wrapper around renderPublic(),
// renderPublic() and liveScoresCourtCard() in 25-, the dead renderPublic() in 11-) was removed in
// M.13; the functions below mirror its decisions, which tests/golden/live-scores/*.json
// (recorded from it) pin. Team and kachinuki sheets are the court screen's data
// (ksmTeamSheet(), ksmKachinukiSheet(), 35-react-court.js), the placements its
// division-complete data (ksmDivisionCompleteInput()). audienceMeta() (25-) stays: the TV shares
// it.
// If the React module does not load, Live Scores shows a notice (the end of this file).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmPublishLiveScores(input){
  window.ksmLiveScoresInput=input;
  window.dispatchEvent(new CustomEvent('ksm:live-scores'));
}
// liveScoresCourtCard(court) (25-, removed) as data: text is what esc() showed (String(x||'')).
// F16: a court with no match whose division is complete shows that division's placements in
// its card (kind 'complete'), on every device, instead of "No active match".
function ksmLiveScoresCourt(court){
  const data=courtCurrentMatch(court);
  if(!data){
    const div=ksmLiveScoresFinishedDivision(court);
    if(div)return {court:ksmText(court),kind:'complete',division:ksmText(div),complete:ksmDivisionCompleteInput(div,true)};
    // Quirk pass: "Waiting for the next match" (not "...division") while the court's division
    // still has an unplayed match on this court that is not ready yet.
    const own=state.courtActiveDivision?.[court]||state.courtState?.[court]?.division;
    if(own&&(state.allMatches?.[own]||[]).some(m=>isValidMatchObject(m)&&!m.done&&matchBelongsToCourt(m,court)))return {court:ksmText(court),kind:'idle',waiting:true};
    return {court:ksmText(court),kind:'idle'};
  }
  const m=data.match,next=data.next,meta=audienceMeta(m);
  const base={court:ksmText(court),meta:{division:ksmText(meta.division),line:ksmText(meta.line)}};
  if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'){
    // Quirk pass: "Next" is the court's next pairing, as the TV's Upcoming shows it
    // (tvUpcomingMatches(), 25-), not the next bout of the pairing being fought.
    const up=tvUpcomingMatches(court,m,true)[0]||null;
    const nextTeams=up?{white:ksmText(up.teamWhite||up.white||'TBD'),red:ksmText(up.teamRed||up.red||'TBD')}:null;
    if(m.type==='kachinuki')return {...base,kind:'kachinuki',sheet:ksmKachinukiSheet(m),next:nextTeams};
    return {...base,kind:'team',sheet:ksmTeamSheet(m.division,m.teamPair,m),next:nextTeams};
  }
  // liveScorePoints(): the letters as Array.join() prints them.
  const pts=activeScoreArrays(m),letters=arr=>(arr||[]).map(x=>x==null?'':String(x));
  return {...base,kind:'individual',
    white:{name:ksmText(m.white||'TBD'),dojo:ksmText(m.wdojo||'')},red:{name:ksmText(m.red||'TBD'),dojo:ksmText(m.rdojo||'')},
    points:{W:letters(pts.W),R:letters(pts.R)},
    next:next?{white:ksmText(next.white||'TBD'),red:ksmText(next.red||'TBD')}:null};
}
// The court's division when it is complete and played on this court (F16): the court's own
// division (courtActiveDivision / courtState, which the scorekeepers publish, so every device
// knows both courts'); for the Live Scores court also this device's current division, as the
// legacy renderer read it. A division played only on the other court (a court with nothing
// left falls back to such a division) is not this court's.
function ksmLiveScoresFinishedDivision(court){
  const div=state.courtActiveDivision?.[court]||state.courtState?.[court]?.division||(court===(state.publicCourt||'A')?state.currentDivision:null);
  if(!div||!divisionComplete(div))return null;
  return (state.allMatches?.[div]||[]).some(m=>isValidMatchObject(m)&&matchBelongsToCourt(m,court))?div:null;
}
// renderPublic(): Court A and Court B (courtCurrentMatch() moves each court on, as before).
// F16 (was: the Live Scores court's complete division, with no match on that court, replaced the
// whole screen and hid the other court's live match): both courts stay while either has a
// match, a finished division's placements in its court's card; only when neither court has a
// match do a finished division's placements fill the screen: the Live Scores court's if it has
// one, else the other court's.
// A TV device (body.ksm-tv) redraws its TV display after the courts, as before.
function ksmRenderLiveScores(){
  const publicCourt=state.publicCourt||'A';
  const courts=[ksmLiveScoresCourt('A'),ksmLiveScoresCourt('B')];
  const playing=courts.some(c=>c.kind!=='idle'&&c.kind!=='complete');
  const finished=courts.filter(c=>c.kind==='complete').sort((a,b)=>Number(b.court===publicCourt)-Number(a.court===publicCourt))[0];
  if(!playing&&finished){
    ksmPublishLiveScores({kind:'complete',complete:finished.complete});
    // The TV is not redrawn when the Live Scores court's own division fills the screen, as before
    // (where the legacy renderer showed placements instead of the courts).
    if(finished.court===publicCourt)return;
  }else{
    if(!window.publicLive)return;
    ksmPublishLiveScores({kind:'courts',courts});
  }
  if(document.body.classList.contains('ksm-tv'))renderTvDisplay();
}

// If the React module (app/react/main.tsx, a module script after app.js) did not run, say so on
// Live Scores instead of an empty page, which nothing fills any more (e.g. an offline device
// whose cached copy lacks the module). Module scripts run before DOMContentLoaded, so a working
// page never shows this.
function ksmShowLiveScoresModuleMissing(){
  if(window.ksmLiveScoresMounted)return;
  const live=document.getElementById('publicLive');
  if(!live||document.getElementById('liveScoresModuleMissing'))return;
  const notice=document.createElement('div');
  notice.id='liveScoresModuleMissing';notice.className='card';notice.setAttribute('role','alert');notice.setAttribute('data-testid','live-scores-module-missing');
  notice.innerHTML='<h1>Live Scores could not load</h1><p class="sub">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</p>';
  live.style.display='none';
  live.before(notice);
}
document.addEventListener('DOMContentLoaded',ksmShowLiveScoresModuleMissing);
/* ksm:post-split-end */
