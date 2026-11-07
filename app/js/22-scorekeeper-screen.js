
function renderScore(){
  // The court screen is React (app/react/court/, 35-react-court.js): the division title, match
  // line and match display are published to it instead of written (M.8).
  updateScoreTournamentName();
  let m=ensureScorableCurrentMatch();
  if(m && !matchBelongsToCourt(m,state.currentCourt||'A'))m=null;
  const meta=matchDisplayMeta(m);
  ksmSignalCourtHeader({matchLine:meta.line,divisionTitle:m?meta.division:(state.currentDivision||'—'),requiresWinner:m?!!matchRequiresWinner(m):null,redLeft:redOnLeftForCourt(state.currentCourt)});
  ksmSignalCourtScoreboard(m);
  renderQueue();renderPublic();renderContext();
}
