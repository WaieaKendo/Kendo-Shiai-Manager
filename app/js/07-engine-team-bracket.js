// @ts-check
/**
 * Bracket side: team number n (1-based registration order).
 * @param {number} n
 * @returns {BracketSource}
 */
function T(n){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.teamSource(n);
  /* ksm:post-split-end */
}
/**
 * Bracket side: winner of node id.
 * @param {string} id
 * @returns {BracketSource}
 */
function W(id){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.winnerSource(id);
  /* ksm:post-split-end */
}
/**
 * @param {string} id
 * @param {RoundName} round
 * @param {Court} court
 * @param {BracketSource|null} left
 * @param {BracketSource|null} right
 * @param {number} slot
 * @returns {TeamBracketNode}
 */
function N(id,round,court,left,right,slot){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.teamNode(id,round,court,left,right,slot);
  /* ksm:post-split-end */
}
/**
 * Frozen bracket template for n teams (also used for individual single elimination).
 * @param {number} n
 * @returns {TeamBracketNode[]}
 */
function teamBracketNodesForCount(n){
  /* ksm:post-split-begin engine-bridge */const nodes=KSMEngine.teamBracketNodesForCount(n);
  if(!nodes){alert('Team single-elimination templates currently support 2–32 teams.');return [];}
  return nodes;
  /* ksm:post-split-end */
}
/**
 * Adds a pairing's bouts (one kachinuki bout, or one per position).
 * @param {Match[]} m
 * @param {string} div
 * @param {Team} a White team
 * @param {Team} b Red team
 * @param {string} pool
 * @param {string} pairId
 * @param {Court} court
 * @param {string} matchFmt
 * @param {TeamPosition[]} slots
 */
function addTeamPairMatches(m,div,a,b,pool,pairId,court,matchFmt,slots){
  /* ksm:post-split-begin engine-bridge */m.push(.../** @type {Match[]} */(KSMEngine.teamPairMatchObjects(div,a,b,pool,pairId,court,matchFmt,slots)));
  /* ksm:post-split-end */
}
/**
 * Next lineup indexes after a kachinuki bout: the winner stays, a draw eliminates both (except a last player).
 * @param {Match} m
 * @returns {{wi: number, ri: number, whiteExhausted: boolean, redExhausted: boolean}}
 */
function kachinukiTransitionState(m){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.kachinukiTransitionState(m);
  /* ksm:post-split-end */
}
/**
 * @param {string} div
 * @param {string} pair
 * @returns {string|null}
 */
function kachinukiPairWinner(div,pair){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.kachinukiPairWinner(teamPairMatches(div,pair));
  /* ksm:post-split-end */
}
/**
 * Winning team name of a pairing, or null while undecided.
 * @param {string} div
 * @param {string} pair
 * @returns {string|null}
 */
function teamWinner(div,pair){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.teamWinner(state.allMatches[div]||[],pair);
  /* ksm:post-split-end */
}
/**
 * @param {Match} m
 */
function maybeAdvanceTeamBracket(m){
  if(!m || !(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'))return;
  let div=m.division, fmt=/* ksm:post-split-begin engine-settings was:teamTournamentFormat?.value */ksmTeamSettings(div).teamTournamentFormat/* ksm:post-split-end */||'Single Elimination';
  if(fmt!=='Single Elimination')return;
  syncTeamBracket(div,state.allMatches[div]||[],state.teamElimTeams?.[div]||eligibleTeams(div));
}
