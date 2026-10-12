// @ts-check
/**
 * Member positions of the team format in Setup, in bout order.
 * @returns {TeamPosition[]}
 */
function teamSlots(){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.teamSlots(tournamentSettings().teamFormat);
  /* ksm:post-split-end */
}
/**
 * @param {string} k
 * @returns {string} 'senpo' -> 'Senpo'
 */
function slotLabel(k){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.slotLabel(k);
  /* ksm:post-split-end */
}
/**
 * Team event matches: single-elimination bracket (state.teamBracketNodes) or round robin.
 * @param {string} div
 * @param {Team[]} teams
 * @returns {Match[]}
 */
function buildTeamMatches(div,teams){
  /* ksm:post-split-begin engine-bridge */const plan=KSMEngine.buildTeamMatches(div,teams,tournamentSettings());let m=/** @type {Match[]} */(plan.matches);
  state.teamElimTeams=state.teamElimTeams||{};state.teamElimTeams[div]=[...teams];
  if(plan.singleElim){
    state.teamBracketNodes=state.teamBracketNodes||{};
    state.teamBracketNodes[div]=teamBracketNodesForCount(teams.length);
    syncTeamBracket(div,m,state.teamElimTeams[div]);
  }
  return m;
  /* ksm:post-split-end */
}
/**
 * @param {BracketSource|null} side
 * @param {Team[]} teams
 * @param {string} div
 * @returns {Team|null}
 */
function teamSideTeam(side,teams,div){
  /* ksm:post-split-begin engine-bridge */return /** @type {Team|null} */(KSMEngine.teamSideTeam(side,teams,state.teamBracketNodes?.[div]||[]));
  /* ksm:post-split-end */
}
function nodeHasMatch(arr,node){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.nodeHasMatch(arr,node);
  /* ksm:post-split-end */
}
/**
 * @param {TeamBracketNode} node
 * @returns {string}
 */
function nodePairId(node){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.nodePairId(node);
  /* ksm:post-split-end */
}
/**
 * Creates the bouts of every team node whose two teams are known.
 * @param {string} div
 * @param {Match[]} arr
 * @param {Team[]} teams
 */
function syncTeamBracket(div,arr,teams){
  /* ksm:post-split-begin engine-bridge */state.teamBracketNodes=state.teamBracketNodes||{};
  const nodes=state.teamBracketNodes[div]||[],current=state.allMatches[div];
  const plan=KSMEngine.syncTeamBracket(div,nodes,arr,teams,tournamentSettings().teamFormat,current===arr?undefined:(current||[]));
  plan.winners.forEach(w=>{nodes[w.index].winner=w.winner;});
  arr.push(.../** @type {Match[]} */(plan.added));
  state.allMatches[div]=arr;sortTeamMatches(div);return state.allMatches[div];
  /* ksm:post-split-end */
}


