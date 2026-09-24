/* ksm:post-split-begin react-court */
// ==========================================================
// React court screen (app/react/court/, roadmap M.8)
// app/react/court/main.tsx mounts two islands and sets window flags; the legacy code still
// chooses the court's match and division, computes what is shown and runs the actions, and
// publishes plain data for the islands instead of writing their elements:
// * scoreboard (window.ksmReactScoreboard): renderScore() (22-scorekeeper-screen.js) comes
//   here and publishes the match display (ksm:court-scoreboard) instead of writing
//   #whiteName, #whitePts, ...; it still draws the queue and context.
// * header (window.ksmReactCourtHeader): updateScoreTournamentName() (22), renderDivisions()
//   (02-court-match-order.js: court title, the division select's options) and renderScore()
//   (division title, match line) publish their fields (ksm:court-header) instead of writing
//   #scoreTournamentName, #courtTitle, #scoreDiv, #scoreDivisionTitle, #matchMeta.
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
function ksmReactCourtHeaderActive(){return typeof window!=='undefined'&&window.ksmReactCourtHeader===true}
// The header as the legacy renderer drew it: the islands mount after app.js has rendered,
// and a writer publishes only its own fields (a completed division keeps the last match line).
function ksmCourtHeaderFromDom(){
  const text=id=>document.getElementById(id)?.textContent||'';
  const select=document.getElementById('scoreDiv');
  return {tournamentName:text('scoreTournamentName'),court:text('courtTitle').replace(/^Court /,''),
    divisions:select?[...select.options].map(o=>o.textContent):[],currentDivision:select?select.value:'',
    divisionTitle:text('scoreDivisionTitle'),matchLine:text('matchMeta')};
}
function ksmPublishCourtHeader(fields){
  window.ksmCourtHeaderInput={...(window.ksmCourtHeaderInput||ksmCourtHeaderFromDom()),...fields};
  window.dispatchEvent(new CustomEvent('ksm:court-header'));
}
// renderScore() with the React scoreboard: the legacy one minus the match display.
function renderScoreWithReactScoreboard(){
  updateScoreTournamentName();
  let m=ensureScorableCurrentMatch();
  if(m && !matchBelongsToCourt(m,state.currentCourt||'A'))m=null;
  const meta=matchDisplayMeta(m);
  const header={matchLine:meta.line,divisionTitle:m?meta.division:(state.currentDivision||'—')};
  if(ksmReactCourtHeaderActive())ksmPublishCourtHeader(header);
  else{matchMeta.textContent=header.matchLine;if(window.scoreDivisionTitle)scoreDivisionTitle.textContent=header.divisionTitle;}
  ksmPublishCourtScoreboard(m);
  renderQueue();renderPublic();renderContext();
}
/* ksm:post-split-end */
