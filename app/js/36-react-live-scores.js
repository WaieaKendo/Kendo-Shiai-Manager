/* ksm:post-split-begin react-live */
// ==========================================================
// React Live Scores (app/react/live-scores/, roadmap M.13)
// The Live Scores screen (#public) is drawn by one React island (LiveScores), mounted by
// app/react/live-scores/main.tsx. The legacy code still chooses each court's match
// (courtCurrentMatch(), which also moves a court on to its next match, as before) and decides
// when the Live Scores court's division is complete; renderPublic() (the live declaration is the
// 32-split-court-templates.js wrapper) publishes what to show as plain data (ksm:live-scores,
// window.ksmLiveScoresInput) while the island is mounted, instead of writing #publicLive.
// The functions below mirror the legacy renderer's decisions (the 32- wrapper, renderPublic()
// and liveScoresCourtCard() in 25-live-scores.js), which tests/golden/live-scores/*.json
// (recorded from it) pin. Team and kachinuki sheets are the court screen's data
// (ksmTeamSheet(), ksmKachinukiSheet(), 35-react-court.js), the placements its
// division-complete data (ksmDivisionCompleteInput()).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmReactLiveScoresActive(){return !!window.ksmLiveScoresMounted}
function ksmPublishLiveScores(input){
  window.ksmLiveScoresInput=input;
  window.dispatchEvent(new CustomEvent('ksm:live-scores'));
}
// liveScoresCourtCard(court) (25-) as data: text is what esc() showed (String(x||'')).
function ksmLiveScoresCourt(court){
  const data=courtCurrentMatch(court);
  if(!data)return {court:ksmText(court),kind:'idle'};
  const m=data.match,next=data.next,meta=audienceMeta(m);
  const base={court:ksmText(court),meta:{division:ksmText(meta.division),line:ksmText(meta.line)}};
  if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'){
    const nextTeams=next?{white:ksmText(next.teamWhite||next.white||'TBD'),red:ksmText(next.teamRed||next.red||'TBD')}:null;
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
// The legacy renderPublic() (the 32- wrapper, then 25-) as data, in the same order, so
// courtCurrentMatch() moves the courts on as it did: the Live Scores court's division complete
// and no match on it -> its placements instead of the courts; otherwise Court A and Court B.
// A TV device (body.ksm-tv) redraws its TV display after the courts, as before.
function ksmRenderLiveScores(){
  const court=state.publicCourt||'A';
  const div=state.courtActiveDivision?.[court]||state.courtState?.[court]?.division||state.currentDivision;
  if(div&&divisionComplete(div)&&!courtCurrentMatch(court)){
    ksmPublishLiveScores({kind:'complete',complete:ksmDivisionCompleteInput(div,true)});
    return;
  }
  if(!window.publicLive)return;
  ksmPublishLiveScores({kind:'courts',courts:[ksmLiveScoresCourt('A'),ksmLiveScoresCourt('B')]});
  if(document.body.classList.contains('ksm-tv'))renderTvDisplay();
}
/* ksm:post-split-end */
