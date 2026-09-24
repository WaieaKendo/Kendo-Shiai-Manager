/* ksm:post-split-begin react-court */
// ==========================================================
// React court screen (app/react/court/, roadmap M.8)
// Once app/react/court/main.tsx has mounted the scoreboard island it sets
// window.ksmReactScoreboard, and renderScore() (22-scorekeeper-screen.js) comes here: the
// legacy code still chooses the court's match, sets the header and draws the queue and
// context, and publishes the match display (ksm:court-scoreboard) for the island instead
// of writing #whiteName, #whitePts, ... itself.
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmReactScoreboardActive(){return typeof window!=='undefined'&&window.ksmReactScoreboard===true}
function ksmScoreboardInput(m){
  if(!m)return {match:null,score:{W:[],R:[],WT:0,RT:0},representatives:null};
  const s=state.score||{};
  const score={W:[...(s.W||[])],R:[...(s.R||[])],WT:s.WT||0,RT:s.RT||0};
  const match={white:m.white,red:m.red,wdojo:m.wdojo,rdojo:m.rdojo,teamWhite:m.teamWhite,teamRed:m.teamRed,type:m.type};
  if(m.type!=='teamPlayoff')return {match,score,representatives:null};
  // As repSelect(): the roster and permission come from the match at state.current.
  const current=state.matches[state.current],playoff=current&&current.type==='teamPlayoff';
  const rep=(side,team,name)=>({team:team||'',current:name||'',roster:[...teamRoster(playoff?(side==='W'?current.teamWhite:current.teamRed):team)],editable:Boolean(canModifyRepresentative(current))});
  return {match,score,representatives:{W:rep('W',m.teamWhite,m.white),R:rep('R',m.teamRed,m.red)}};
}
function ksmPublishCourtScoreboard(m){
  window.ksmCourtScoreboardInput=ksmScoreboardInput(m);
  window.dispatchEvent(new CustomEvent('ksm:court-scoreboard'));
}
// renderScore() with the React scoreboard: the legacy one minus the match display.
function renderScoreWithReactScoreboard(){
  updateScoreTournamentName();
  let m=ensureScorableCurrentMatch();
  if(m && !matchBelongsToCourt(m,state.currentCourt||'A'))m=null;
  const meta=matchDisplayMeta(m);
  matchMeta.textContent=meta.line;
  if(window.scoreDivisionTitle)scoreDivisionTitle.textContent=m?meta.division:(state.currentDivision||'—');
  ksmPublishCourtScoreboard(m);
  renderQueue();renderPublic();renderContext();
}
/* ksm:post-split-end */
