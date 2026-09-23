const BRACKET_SLOT_TEMPLATES={
  4:[{slot:1,quadrant:0,protectedSeed:1},{slot:2,quadrant:0},{slot:3,quadrant:1,protectedSeed:2},{slot:4,quadrant:1}],
  8:[{slot:1,quadrant:0,protectedSeed:1},{slot:2,quadrant:0},{slot:3,quadrant:1,protectedSeed:4},{slot:4,quadrant:1},{slot:5,quadrant:2,protectedSeed:3},{slot:6,quadrant:2},{slot:7,quadrant:3,protectedSeed:2},{slot:8,quadrant:3}],
  16:[{slot:1,quadrant:0,protectedSeed:1},{slot:2,quadrant:0},{slot:3,quadrant:0},{slot:4,quadrant:0},{slot:5,quadrant:1,protectedSeed:4},{slot:6,quadrant:1},{slot:7,quadrant:1},{slot:8,quadrant:1},{slot:9,quadrant:2,protectedSeed:3},{slot:10,quadrant:2},{slot:11,quadrant:2},{slot:12,quadrant:2},{slot:13,quadrant:3,protectedSeed:2},{slot:14,quadrant:3},{slot:15,quadrant:3},{slot:16,quadrant:3}],
  32:[{slot:1,quadrant:0,protectedSeed:1},{slot:9,quadrant:1,protectedSeed:4},{slot:17,quadrant:2,protectedSeed:3},{slot:25,quadrant:3,protectedSeed:2}]
};
function singleElimBracketSize(n){return n<=4?4:n<=8?8:n<=16?16:32;}
function protectedSeedQuadrant(seed){return ({1:0,2:3,3:2,4:1})[seed] ?? null;}

function singleElimSlotInfo(n){
  // Bracket slot metadata for individual single elimination placement.
  // This is a placement layer only: it chooses which competitor goes into T1, T2, etc.
  // The template layer then creates matches from those placed slots.
  let nodes=teamBracketNodesForCount(n), raw={};
  function note(side,node,sideName){
    if(side&&side.team){
      let opp=sideName==='left'?node.right:node.left;
      raw[side.team]={
        pos:side.team,
        nodeId:node.id,
        round:node.round,
        slot:node.slot||0,
        opponent:opp&&opp.team?opp.team:null,
        court:node.court||'A',
        isPlayIn:node.round==='Play-in',
        order:nodes.findIndex(x=>x.id===node.id)
      };
    }
  }
  nodes.forEach(node=>{note(node.left,node,'left');note(node.right,node,'right')});
  for(let i=1;i<=n;i++)if(!raw[i])raw[i]={pos:i,slot:Math.floor((i-1)/2),opponent:null,court:'A',isPlayIn:false,order:i};
  let slots=Object.values(raw).map(x=>x.slot||0);
  let firstRoundSlots=(slots.length?Math.max(...slots):0)+1;
  let slotsPerQuadrant=Math.max(1,Math.ceil(firstRoundSlots/4));
  Object.values(raw).forEach(x=>{
    x.quadrant=Math.max(0,Math.min(3,Math.floor((x.slot||0)/slotsPerQuadrant)));
    x.half=x.quadrant<2?0:1;
    let explicit=(BRACKET_SLOT_TEMPLATES[singleElimBracketSize(n)]||[]).find(t=>t.slot===x.pos);
    if(explicit&&explicit.protectedSeed)x.protectedSeed=explicit.protectedSeed;
  });
  return raw;
}
function chooseBestSeedSlot(q,positions,info,allPositions){
  // Seeds should land in protected, non-play-in slots in their quadrant.
  // Prefer a slot whose direct opponent is still empty so the seed is not paired with another seed.
  let candidates=allPositions.filter(pos=>!positions[pos-1] && (info[pos]?.quadrant||0)===q && !info[pos]?.isPlayIn);
  if(!candidates.length)candidates=allPositions.filter(pos=>!positions[pos-1] && (info[pos]?.quadrant||0)===q);
  if(!candidates.length)candidates=allPositions.filter(pos=>!positions[pos-1] && !info[pos]?.isPlayIn);
  if(!candidates.length)candidates=allPositions.filter(pos=>!positions[pos-1]);
  candidates.sort((a,b)=>{
    let ao=info[a]?.opponent, bo=info[b]?.opponent;
    let aOppFilled=ao&&positions[ao-1]?1:0, bOppFilled=bo&&positions[bo-1]?1:0;
    if(aOppFilled!==bOppFilled)return aOppFilled-bOppFilled;
    let aOrder=info[a]?.order??a, bOrder=info[b]?.order??b;
    if(aOrder!==bOrder)return aOrder-bOrder;
    return a-b;
  });
  return candidates[0];
}
function placeIndividualsForSingleElim(comps){
  let n=comps.length;if(n<=1)return comps;
  let sorted=[...comps].sort((a,b)=>(parseInt(a.seed)||999)-(parseInt(b.seed)||999)||a.name.localeCompare(b.name));
  let info=singleElimSlotInfo(n), positions=Array(n).fill(null), used=new Set();
  let allPositions=Object.keys(info).map(Number).sort((a,b)=>a-b);

  // Top four seeds are protected into separate bracket quadrants using the locked slot map pattern.
  // Seed 1 = top, Seed 2 = bottom, Seed 3 = lower middle, Seed 4 = upper middle.
  sorted.filter(c=>parseInt(c.seed)>=1 && parseInt(c.seed)<=4).sort((a,b)=>parseInt(a.seed)-parseInt(b.seed)).forEach(c=>{
    let q=protectedSeedQuadrant(parseInt(c.seed));
    let slot=chooseBestSeedSlot(q,positions,info,allPositions);
    if(slot){positions[slot-1]=c;used.add(c);}
  });

  // Fill remaining entries with the same separation concept used by the pool engine,
  // but apply it to bracket slots instead of pools.
  let rest=sorted.filter(c=>!used.has(c));
  rest.forEach(c=>{
    let best=null,bestScore=Infinity;
    for(let pos of allPositions){
      if(positions[pos-1])continue;
      let si=info[pos]||{}, q=si.quadrant||0, half=si.half||0, opp=si.opponent?positions[si.opponent-1]:null;
      let group=clubGroup(c.dojo);
      let sameOpp=opp&&clubGroup(opp.dojo)===group?1000:0;
      let sameQ=positions.filter((x,idx)=>x&&((info[idx+1]?.quadrant||0)===q)&&clubGroup(x.dojo)===group).length;
      let sameHalf=positions.filter((x,idx)=>x&&((info[idx+1]?.half||0)===half)&&clubGroup(x.dojo)===group).length;
      let sameCourt=positions.filter((x,idx)=>x&&(info[idx+1]?.court||'A')===(si.court||'A')&&clubGroup(x.dojo)===group).length;
      let qFill=positions.filter((x,idx)=>x&&((info[idx+1]?.quadrant||0)===q)).length;
      let playInPenalty=si.isPlayIn?0.15:0;
      let score=sameOpp+sameQ*20+sameHalf*6+sameCourt*2+qFill*0.25+playInPenalty+(si.order||pos)*0.001;
      if(score<bestScore){bestScore=score;best=pos;}
    }
    if(best)positions[best-1]=c;
  });

  // Fill any remaining gaps deterministically.
  sorted.forEach(c=>{if(!positions.includes(c)){let i=positions.findIndex(x=>!x);if(i>=0)positions[i]=c;}});
  return positions.filter(Boolean);
}
function singleElimOrderMap(div){let map={};(state.singleElimNodes?.[div]||[]).forEach((n,i)=>map[n.id]=i);return map;}
function sortIndividualSingleElimMatches(div,arr){let order=singleElimOrderMap(div);arr.sort((a,b)=>{
  let oa=order[a.elimNodeId]??9999, ob=order[b.elimNodeId]??9999;
  if(oa!==ob)return oa-ob;
  return (a.bracketSlot||0)-(b.bracketSlot||0);
});return arr;}
function dedupeSingleElimMatches(div){
  let arr=state.allMatches[div]||[];
  let seen=new Set(), out=[];
  sortIndividualSingleElimMatches(div,arr).forEach(m=>{
    if(m.singleElim){
      let k=m.elimNodeId||m.position+'-'+(m.bracketSlot||'');
      if(seen.has(k))return;
      seen.add(k);
    }
    out.push(m);
  });
  state.allMatches[div]=out;
  return out;
}

function buildIndividualSingleElimMatches(div,comps){
  state.singleElimNodes=state.singleElimNodes||{};
  const nodes=teamBracketNodesForCount(comps.length).map(n=>({...n,winner:null}));
  state.singleElimNodes[div]=nodes;
  const courtMode=state.divisionCourts[div]||'A';
  const arr=nodes.map(node=>({
    division:div,pool:'Championship',white:'',red:'',wdojo:'',rdojo:'',
    position:node.round,done:false,wp:[],rp:[],type:'individual',championship:true,
    singleElim:true,templateNode:true,origin:'TEMPLATE',ready:false,elimNodeId:node.id,
    court:(courtMode==='split'?(node.round==='Final'?'A':node.court):courtMode),
    bracketSlot:node.slot||0
  }));
  syncIndividualSingleElim(div,arr,comps);
  return arr;
}
function indivSide(side,comps,div){
  if(!side)return null;
  if(side.team){let c=comps[side.team-1];return c?{name:c.name,dojo:c.dojo}:null;}
  if(side.ref){let n=(state.singleElimNodes?.[div]||[]).find(x=>x.id===side.ref);return n&&n.winner?n.winner:null;}
  return null;
}
function indivNodeHasMatch(arr,node){return arr.some(m=>individualLogicalMatchKey(m)===`single:${node.id}`)}
function syncIndividualSingleElim(div,arr,comps){
  state.singleElimNodes=state.singleElimNodes||{};
  const nodes=state.singleElimNodes[div]||[];
  const courtMode=state.divisionCourts[div]||'A';
  let changed=true,guard=0;
  while(changed&&guard++<50){
    changed=false;
    for(const node of nodes){
      const match=arr.find(m=>m.singleElim&&m.elimNodeId===node.id);
      if(!match){
        console.error('KSM template invariant: missing Match Object for',div,node.id);
        continue;
      }
      if(match.done){
        const winner=winnerOf(match);
        if(winner&&winner!=='Hikiwake'){
          const next=winner===match.red?{name:match.red,dojo:match.rdojo}:{name:match.white,dojo:match.wdojo};
          if(!node.winner||node.winner.name!==next.name){node.winner=next;changed=true;}
        }
        continue;
      }
      if(node.winner){match.ready=false;continue;}
      const red=indivSide(node.left,comps,div),white=indivSide(node.right,comps,div);
      if(red&&!white&&!node.right?.ref){node.winner=red;match.ready=false;changed=true;continue;}
      if(white&&!red&&!node.left?.ref){node.winner=white;match.ready=false;changed=true;continue;}
      match.position=node.round;
      match.court=courtMode==='split'?(node.round==='Final'?'A':node.court):courtMode;
      match.bracketSlot=node.slot||0;
      if(red&&white){
        match.red=red.name;match.rdojo=red.dojo||'';
        match.white=white.name;match.wdojo=white.dojo||'';
        match.ready=true;
      }else{
        match.red=red?.name||'';match.rdojo=red?.dojo||'';
        match.white=white?.name||'';match.wdojo=white?.dojo||'';
        match.ready=false;
      }
    }
  }
  sortIndividualSingleElimMatches(div,arr);
  state.allMatches[div]=arr;
  return enforceUniqueIndividualMatches(div);
}
function maybeAdvanceIndividualSingleElim(m){
  if(!m||!m.singleElim)return;
  let div=m.division,arr=state.allMatches[div]||[],comps=(state.singleElimComps&&state.singleElimComps[div])||eligibleIndividuals(div).filter(c=>c.name);
  syncIndividualSingleElim(div,arr,comps);
}
function sideLabelGeneric(side,div){
  if(!side)return 'BYE';
  if(side.team){let c=(state.singleElimComps?.[div]||[])[side.team-1];return c?c.name:'Entry '+side.team;}
  if(side.ref){let n=(state.singleElimNodes?.[div]||[]).find(x=>x.id===side.ref);return n&&n.winner?n.winner.name:'Winner '+side.ref;}
  return 'TBD';
}
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
function singleElimBracketHtml(div){
  let nodes=state.singleElimNodes?.[div]||[];if(!nodes.length)return '<div class="muted-card">Single-elimination bracket will appear after generation.</div>';
  let rounds=[...new Set(nodes.map(n=>n.round))];let html='';
  rounds.forEach(round=>{html+=`<div class="bracket-card"><div class="bracket-round">${esc(round)}</div>`;nodes.filter(n=>n.round===round).forEach(node=>{let m=(state.allMatches[div]||[]).find(x=>x.singleElim&&x.elimNodeId===node.id);if(m){let w=winnerOf(m);html+=`<div class="bracket-match ${m.done?'':'gold'}"><div class="white ${w===m.white?'winner':''}"><b>${esc(specificMatchSideLabel(m,'white'))}</b><div class="small">${(m.wp||[]).join(' ')}</div></div><div class="bracket-status">${m.done?'DONE':'vs'}</div><div class="red ${w===m.red?'winner':''}"><b>${esc(specificMatchSideLabel(m,'red'))}</b><div class="small">${(m.rp||[]).join(' ')}</div></div></div>`;}else{html+=placeholderMatchHtml(sideLabelGeneric(node.left,div),sideLabelGeneric(node.right,div),(!node.left||!node.right)?'BYE':'vs');}});html+='</div>';});return html;
}
