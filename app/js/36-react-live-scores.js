/* ksm:post-split-begin react-live */
// ==========================================================
// React Live Scores (app/react/features/live-scores/, roadmap M.13, #136 step 2)
// The Live Scores screen (#public) is drawn only by React: one island (LiveScores), mounted by
// app/react/features/live-scores/main.tsx. What it shows is computed by the module (publish.ts:
// each court's match with courtCurrentMatch(), which also moves a court on to its next match, as
// before, and when a court's division is complete, F16; as plain data in
// window.ksmLiveScoresInput); legacy only signals. renderPublic() (25-live-scores.js) calls
// ksmRenderLiveScores() below, which dispatches ksm:live-scores. tests/golden/live-scores/*.json
// pin what the island draws (recorded from the legacy Live Scores renderer, removed in M.13).
// audienceMeta() (25-) stays: the TV shares it.
// The "between matches" helpers below (ksmStageLabel(), ksmWaitingReason(), ksmUpNext(),
// ksmBetweenMatches()) stay classic: classic 35-react-court.js (and KSMTest.app) call
// ksmUpNext(), and classic code must never call a module function. The modules read them through
// shared/legacy.ts; they move with the court file.
// If the React module does not load, Live Scores shows a notice (the end of this file).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
// Owner decision 6 (#29): what Live Scores and the TV show for a court between matches.
// A match's stage as a reason names it: the bracket round (Final, Semifinal), the team bracket
// node's round, the pool, or the position.
function ksmStageLabel(m){
  if(!m)return 'The next match';
  if(isTeamMatch(m)&&m.teamNodeId){const n=(state.teamBracketNodes?.[m.division]||[]).find(x=>x.id===m.teamNodeId);if(n?.round)return String(n.round)}
  if(m.championship||m.singleElim||m.pool==='Championship')return String(m.position||'Championship');
  if(m.pool&&!isTeamMatch(m))return `Pool ${m.pool}`;
  return String(m.position||'The next match');
}
// Why the court's division waits, when it is known: its next match on this court waits for an
// unfinished match of the division on the other court ("Final waits for the semifinal on Court B").
function ksmWaitingReason(court,div){
  const other=court==='A'?'B':'A',arr=state.allMatches?.[div]||[];
  const mine=arr.find(m=>isValidMatchObject(m)&&!m.done&&matchBelongsToCourt(m,court));
  const theirs=arr.find(m=>isValidMatchObject(m)&&!m.done&&matchBelongsToCourt(m,other)&&!matchBelongsToCourt(m,court));
  if(!mine||!theirs)return null;
  const stage=ksmStageLabel(theirs),what=/^Pool /.test(stage)?stage:`the ${stage.toLowerCase()}`;
  return `${ksmStageLabel(mine)} waits for ${what} on Court ${other}`;
}
// "Up next on this court": the next division in the court's running order (#31, as Continue
// picks it) and its first two matches ready on this court (a team pairing once), or null.
function ksmUpNext(court,own){
  const next=ksmNextCourtDivision(court,own||null);if(!next)return null;
  let arr=state.allMatches[next]||[];arr=arr.some(isTeamMatch)?sortTeamMatches(next):sortIndividualDivisionMatches(next,arr);
  const seen=new Set(),matches=[];
  for(const m of arr){
    if(matches.length>=2)break;
    if(!isValidMatchObject(m)||!individualMatchReady(m)||!matchBelongsToCourt(m,court))continue;
    if(isTeamMatch(m)){const key=m.teamPair||m.teamNodeId||`${m.teamWhite}|${m.teamRed}`;if(seen.has(key))continue;seen.add(key);matches.push({white:ksmText(m.teamWhite||'TBD'),red:ksmText(m.teamRed||'TBD')})}
    else matches.push({white:ksmText(m.white||'TBD'),red:ksmText(m.red||'TBD')});
  }
  return matches.length?{division:ksmText(ksmDivisionName(next)),matches}:null;
}
function ksmBetweenMatches(court,own){
  return {reason:own?ksmWaitingReason(court,own):null,upNext:ksmUpNext(court,own)};
}
// Signal: renderPublic() (25-live-scores.js) asks for a redraw. The module (app/react/features/
// live-scores/publish.ts) computes what to show on ksm:live-scores; ksmLiveScoresRequested tells
// it, when it loads, that a signal came earlier. Classic code must not call a module function:
// this script runs before it (the module may not exist yet, or at all).
function ksmRenderLiveScores(){
  window.ksmLiveScoresRequested=true;
  window.dispatchEvent(new CustomEvent('ksm:live-scores'));
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
