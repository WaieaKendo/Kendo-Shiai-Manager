// @ts-check
/**
 * Member positions of the team format in Setup, in bout order.
 * @returns {TeamPosition[]}
 */
function teamSlots(){let fmt=/* ksm:post-split-begin engine-settings was:teamFormat?.value */tournamentSettings().teamFormat/* ksm:post-split-end */||'5-Person Team';return fmt==='3-Person Team'||fmt==='Kachinuki'?['senpo','chuken','taisho']:['senpo','jiho','chuken','fukusho','taisho']}
/**
 * @param {string} k
 * @returns {string} 'senpo' -> 'Senpo'
 */
function slotLabel(k){return ({senpo:'Senpo',jiho:'Jiho',chuken:'Chuken',fukusho:'Fukusho',taisho:'Taisho'}[k]||k)}
/**
 * Team event matches: single-elimination bracket (state.teamBracketNodes) or round robin.
 * @param {string} div
 * @param {Team[]} teams
 * @returns {Match[]}
 */
function buildTeamMatches(div,teams){
  let m=[],fmt=/* ksm:post-split-begin engine-settings was:teamTournamentFormat?.value */tournamentSettings().teamTournamentFormat/* ksm:post-split-end */||'Single Elimination';
  state.teamElimTeams=state.teamElimTeams||{};state.teamElimTeams[div]=[...teams];
  if(fmt==='Single Elimination'){
    state.teamBracketNodes=state.teamBracketNodes||{};
    state.teamBracketNodes[div]=teamBracketNodesForCount(teams.length);
    syncTeamBracket(div,m,state.teamElimTeams[div]);
  }else{
    let slots=teamSlots(),matchFmt=/* ksm:post-split-begin engine-settings was:teamFormat?.value */tournamentSettings().teamFormat/* ksm:post-split-end */||'5-Person Team';
    for(let i=0;i<teams.length;i++)for(let j=i+1;j<teams.length;j++){
      let court=/** @type {Court} */((i+j)%2===0?'A':'B');
      addTeamPairMatches(m,div,teams[i],teams[j],'A',`${i}-${j}`,court,matchFmt,slots);
    }
  }
  return m
}
/**
 * @param {BracketSource|null} side
 * @param {Team[]} teams
 * @param {string} div
 * @returns {Team|null}
 */
function teamSideTeam(side,teams,div){
  if(!side)return null;
  if(side.team)return teams[side.team-1]||null;
  if(side.ref){let n=(state.teamBracketNodes?.[div]||[]).find(x=>x.id===side.ref);return n&&n.winner?teams.find(t=>t&&t.team===n.winner):null;}
  return null;
}
function nodeHasMatch(arr,node){return arr.some(m=>m.teamNodeId===node.id)}
/**
 * @param {TeamBracketNode} node
 * @returns {string}
 */
function nodePairId(node){return 'node-'+node.id}
/**
 * Creates the bouts of every team node whose two teams are known.
 * @param {string} div
 * @param {Match[]} arr
 * @param {Team[]} teams
 */
function syncTeamBracket(div,arr,teams){
  state.teamBracketNodes=state.teamBracketNodes||{};
  let nodes=state.teamBracketNodes[div]||[];let slots=teamSlots(),matchFmt=/* ksm:post-split-begin engine-settings was:teamFormat?.value */tournamentSettings().teamFormat/* ksm:post-split-end */||'5-Person Team';let changed=true,guard=0;
  while(changed&&guard++<50){changed=false;
    for(let node of nodes){
      if(node.winner)continue;
      let a=teamSideTeam(node.left,teams,div),b=teamSideTeam(node.right,teams,div);
      // Only auto-advance true byes. If the missing side is a reference
      // to a future match, keep the node as a visible placeholder until that
      // feeder match is completed. This prevents semifinals/finals from
      // disappearing after the first team match.
      if(a&&!b&&!node.right?.ref){node.winner=a.team;changed=true;continue;}
      if(b&&!a&&!node.left?.ref){node.winner=b.team;changed=true;continue;}
      if(a&&b){
        if(!nodeHasMatch(arr,node)){
          // Canonical elimination mapping: node.right is White; node.left is Red.
          let before=arr.length;addTeamPairMatches(arr,div,b,a,node.round,nodePairId(node),node.court,matchFmt,slots);
          arr.slice(before).forEach(x=>{x.teamNodeId=node.id;x.bracketSlot=node.slot||0});changed=true;
        }else{
          let pair=nodePairId(node);let ms=teamPairMatches(div,pair);
          if(ms.length && ms.every(x=>x.done)){
            let win=teamWinner(div,pair);if(win){node.winner=win;changed=true;}
          }
        }
      }
    }
  }
  state.allMatches[div]=arr;sortTeamMatches(div);return state.allMatches[div];
}


