// @ts-check
function championshipSideLabel(side,div){
  if(!side)return 'BYE';
  if(side.seed){
    const resolved=seedNameForLabel(div,side.seed,true);
    return resolved?.name||side.seed;
  }
  if(side.ref){
    const source=(state.championshipNodes?.[div]||[]).find(node=>node.id===side.ref);
    const sourceMatch=(state.allMatches?.[div]||[]).find(m=>m&&m.championship&&m.champNodeId===side.ref);
    if(sourceMatch?.done){const winner=champWinnerObj(sourceMatch);if(winner)return winner.name;}
    return `Winner of ${source?.round||'Match'} Match ${Number(source?.slot||0)+1}`;
  }
  return 'TBD';
}
/**
 * Name, or where the side comes from ('Winner of …').
 * @param {Match} match
 * @param {'white'|'red'} side
 * @returns {string}
 */
function specificMatchSideLabel(match,side){
  if(!match)return 'TBD';
  const actual=side==='white'?(match.white||match.teamWhite):(match.red||match.teamRed);
  if(actual)return actual;
  if(match.singleElim){
    const node=(state.singleElimNodes?.[match.division]||[]).find(n=>n.id===match.elimNodeId);
    return sideLabelGeneric(side==='white'?node?.right:node?.left,match.division);
  }
  if(match.championship){
    const node=(state.championshipNodes?.[match.division]||[]).find(n=>n.id===match.champNodeId);
    return championshipSideLabel(side==='white'?node?.right:node?.left,match.division);
  }
  return 'TBD';
}
