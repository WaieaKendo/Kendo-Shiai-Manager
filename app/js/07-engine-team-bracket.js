// @ts-check
/**
 * @param {Match} m
 */
function maybeAdvanceTeamBracket(m){
  if(!m || !(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'))return;
  let div=m.division, fmt=ksmTeamSettings(div).teamTournamentFormat||'Single Elimination';
  if(fmt!=='Single Elimination')return;
  syncTeamBracket(div,state.allMatches[div]||[],state.teamElimTeams?.[div]||eligibleTeams(div));
}
