const CHAMPIONSHIP_TEMPLATE_VERSION='v1.0';
function championshipTemplateForTotal(total){
  // Frozen Championship Template Library v1.0.
  // Each pair is [Red seed, White seed]. The first listed seed is red; the second is white.
  const T={
    6:[['A1','B2'],['B1','A2']],
    7:[['A1','B2'],['B1','A2']],
    8:[['A1','B2'],['B1','A2']],
    9:[['A1','B1'],['C1','A2']],
    10:[['A1','B2'],['C1','A3'],['B1','C2'],['A2','B3']],
    11:[['A1','B2'],['C1','A3'],['B1','C2'],['A2','B3']],
    12:[['A1','B2'],['C1','A3'],['B1','C2'],['A2','B3']],
    13:[['A1','B2'],['C1','D2'],['B1','C2'],['D1','A2']],
    14:[['A1','B2'],['C1','D2'],['B1','C2'],['D1','A2']],
    15:[['A1','B2'],['C1','D2'],['B1','C2'],['D1','A2']],
    16:[['A1','B2'],['C1','D2'],['B1','C2'],['D1','A2']],
    17:[['A1','D1'],['B1','C2'],['C1','A2'],['B2','E1']],
    18:[['A1','C2'],['B1','D2'],['E1','A2'],['D1','C1']],
    19:[['A1','C2'],['B1','D2'],['E1','A2'],['D1','C1']],
    20:[['A1','C2'],['B1','D2'],['E1','A2'],['D1','C1']],
    21:[['A1','B2'],['C1','D1'],['A2','F1'],['E1','B1']],
    22:[['A1','B2'],['C1','D1'],['A2','F1'],['E1','B1']],
    23:[['A1','D2'],['E1','B3'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','A3'],['C2','G2']],
    24:[['A1','D2'],['E1','B3'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','A3'],['C2','G2']],
    25:[['A1','D2'],['E1','B3'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','A3'],['C2','G2']],
    26:[['A1','D2'],['E1','B3'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','A3'],['C2','G2']],
    27:[['A1','D2'],['E1','B3'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','A3'],['C2','G2']],
    28:[['A1','D2'],['E1','B3'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','A3'],['C2','G2']],
    29:[['A1','D2'],['E1','H2'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','C2'],['H1','G2']],
    30:[['A1','D2'],['E1','H2'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','C2'],['H1','G2']],
    31:[['A1','D2'],['E1','H2'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','C2'],['H1','G2']],
    32:[['A1','D2'],['E1','H2'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','C2'],['H1','G2']],
    33:[['A1','D2'],['G1','B2'],['C1','F2'],['E1','D1'],['B1','E2'],['F1','A2'],['I1','C2'],['H1','G2']],
    34:[['A1','D2'],['G1','B2'],['C1','F2'],['E1','D1'],['B1','E2'],['F1','A2'],['I1','C2'],['H1','G2']],
    35:[['A1','D2'],['G1','B2'],['C1','F2'],['E1','D1'],['B1','E2'],['F1','A2'],['I1','C2'],['H1','G2']],
    36:[['A1','D2'],['G1','B2'],['C1','F2'],['E1','D1'],['B1','E2'],['F1','A2'],['I1','C2'],['H1','G2']],
    37:[['A1','D2'],['E1','I1'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','C2'],['H1','J1']],
    38:[['A1','D2'],['E1','I1'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','C2'],['H1','J1']],
    39:[['A1','D2'],['E1','I1'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','C2'],['H1','J1']],
    40:[['A1','D2'],['E1','I1'],['C1','F2'],['G1','B2'],['B1','E2'],['F1','A2'],['D1','C2'],['H1','J1']]
  };
  return T[total]||[];
}
function championshipLabels(div){
  // Once generated, the frozen template mapping remains authoritative even if
  // a no-show reduces the number of active pool competitors.
  if(state.generated && Array.isArray(state.brackets?.[div]) && state.brackets[div].length){
    return state.brackets[div];
  }
  let pools=state.pools[div]||[];
  let total=pools.reduce((sum,p)=>sum+(p.players?p.players.length:0),0);
  return championshipTemplateForTotal(total);
}
function requiredSeedPlaces(div){
  // Pool-only divisions award 1st–3rd from standings, so ties touching those places need tiebreaks.
  if(isPoolOnlyDivision(div)){const pool=state.pools[div][0];return {[pool.label]:Math.min(3,pool.players?.length||0)};}
  let req={};championshipLabels(div).flat().forEach(label=>{let m=String(label).match(/^([A-Z])(\d)$/);if(m){let p=parseInt(m[2],10);req[m[1]]=Math.max(req[m[1]]||0,p);}});return req;
}
function poolRowsStillTied(a,b){
  if(!a||!b)return false;
  if(a.wins!==b.wins || a.pts!==b.pts)return false;
  // If this tied base-position group has completed tiebreak data, use that data to resolve placement.
  let aHasTb=typeof a.tbWins==='number' || typeof a.tbPts==='number';
  let bHasTb=typeof b.tbWins==='number' || typeof b.tbPts==='number';
  if(aHasTb||bHasTb){
    let aw=a.tbWins||0, bw=b.tbWins||0, ap=a.tbPts||0, bp=b.tbPts||0;
    if(aw!==bw || ap!==bp)return false;
  }
  return true;
}
function poolSeedResolution(poolLabel,div=state.currentDivision){
  if(!poolFinished(poolLabel,div)||pendingTiebreak(poolLabel,div))return {complete:false,seeds:{},rows:[]};
  const req=requiredSeedPlaces(div)[poolLabel]||2;
  const base=initialPoolStandings(poolLabel,div);
  const seeds={};let complete=true;
  for(let i=0;i<base.length;){
    let j=i+1;while(j<base.length&&base[j].wins===base[i].wins&&base[j].pts===base[i].pts)j++;
    const group=base.slice(i,j),start=i+1,end=j;
    if(group.length===1){if(start<=req)seeds[start]=group[0];}
    else if(start<=req){
      const resolved=resolveTiebreakBaseGroup(poolLabel,div,{start,end,players:group});
      if(resolved.unresolved.length){complete=false;}
      const ordered=resolved.ordered||[];
      for(let offset=0;offset<ordered.length;offset++){
        const place=start+offset;
        if(place<=req && !resolved.unresolved.some(x=>x.name===ordered[offset].name))seeds[place]=ordered[offset];
      }
      // A fully resolved two-person tie for first explicitly owns both Seed 1
      // and Seed 2; a tie at the advancement boundary owns only that boundary.
      if(!resolved.unresolved.length){
        for(let offset=0;offset<ordered.length;offset++){
          const place=start+offset;if(place<=req)seeds[place]=ordered[offset];
        }
      }
    }
    i=j;
  }
  for(let place=1;place<=Math.min(req,base.length);place++)if(!seeds[place])complete=false;
  const rows=poolStandings(poolLabel,div);
  return {complete,seeds,rows};
}
function poolPositionsResolved(poolLabel,div=state.currentDivision){return poolSeedResolution(poolLabel,div).complete;}
function seedNameForLabel(div,label,onlyFinalized=true){
  let m=String(label).match(/^([A-Z])([123])$/); if(!m)return null;
  let poolLabel=m[1],place=parseInt(m[2],10);
  const resolution=poolSeedResolution(poolLabel,div);
  if(onlyFinalized && !resolution.complete)return null;
  return resolution.seeds[place]||resolution.rows[place-1]||null;
}

function championshipMatchObjectForNode(div,node){
  return {
    division:div,
    pool:'Championship',
    white:'',red:'',wdojo:'',rdojo:'',
    position:node.round,
    done:false,wp:[],rp:[],
    type:'individual',championship:true,templateNode:true,origin:'TEMPLATE',ready:false,
    champNodeId:node.id,bracketSlot:node.slot,court:node.court,
    seedRed:node.left?.seed||null,seedWhite:node.right?.seed||null
  };
}
function buildChampionshipTemplateMatches(div,seedPairs){
  const count=(seedPairs||[]).length;
  if(!count)return [];
  const nodes=[];
  const matches=[];
  const first=firstRoundName(count);
  function addNode(id,round,slot,left,right){
    const total=roundMatchCountForDivision(div,round);
    const court=championshipCourtFor(div,round,slot,total);
    const node={id,round,slot,left,right,court};nodes.push(node);
    matches.push(championshipMatchObjectForNode(div,node));
  }
  seedPairs.forEach(([red,white],i)=>addNode(`C-${first}-${i}`,first,i,{seed:red},{seed:white}));
  let prev=nodes.filter(n=>n.round===first),round=nextRoundFromName(first);
  while(round&&prev.length>1){
    const next=[];
    for(let i=0;i<Math.ceil(prev.length/2);i++){
      const a=prev[i*2],b=prev[i*2+1];
      const id=`C-${round}-${i}`;
      addNode(id,round,i,{ref:a?.id||null},{ref:b?.id||null});
      next.push(nodes[nodes.length-1]);
    }
    prev=next;round=nextRoundFromName(round);
  }
  state.championshipNodes=state.championshipNodes||{};
  state.championshipNodes[div]=nodes;
  return matches;
}
function championshipNodeSource(div,side){
  if(!side)return null;
  if(side.seed)return seedNameForLabel(div,side.seed,true);
  if(side.ref){
    const m=(state.allMatches?.[div]||[]).find(x=>x.championship&&x.champNodeId===side.ref);
    if(m?.done)return champWinnerObj(m);
  }
  return null;
}
function syncChampionshipTemplate(div){
  const nodes=state.championshipNodes?.[div]||[];
  const arr=state.allMatches?.[div]||[];
  if(!nodes.length)return arr;
  for(const node of nodes){
    let m=arr.find(x=>x&&x.championship&&x.champNodeId===node.id);
    if(!m){
      // A generated championship node must always have a corresponding Match
      // Object. Self-heal older/incomplete states (including pool-edit states
      // from <= v3.17.17) instead of leaving a visually populated but unplayable
      // elimination bracket.
      m=championshipMatchObjectForNode(div,node);
      arr.push(m);
      console.warn('KSM repaired missing championship Match Object',div,node.id);
    }
    if(m.done)continue;
    const red=championshipNodeSource(div,node.left),white=championshipNodeSource(div,node.right);
    m.position=node.round;m.bracketSlot=node.slot;m.court=node.court;
    m.red=red?.name||'';m.rdojo=red?.dojo||'';
    m.white=white?.name||'';m.wdojo=white?.dojo||'';
    m.ready=!!(red&&white);
  }
  state.allMatches[div]=arr;
  return arr;
}
function championshipSeeds(div){
  return championshipLabels(div).map(([r,w])=>[r==='BYE'?{name:'BYE',dojo:''}:seedNameForLabel(div,r,true),w==='BYE'?{name:'BYE',dojo:''}:seedNameForLabel(div,w,true),r,w]);
}
function bracketPairsFromSeeds(seeds){return seeds}
function champRoundOrder(name){return name==='Round of 16'?16:name==='Quarterfinal'?8:name==='Semifinal'?4:name==='Final'?2:0}
function champWinnerObj(m){let win=winnerOf(m);if(win===m.red)return {name:m.red,dojo:m.rdojo};if(win===m.white)return {name:m.white,dojo:m.wdojo};return null}
function nextChampRoundName(current,count){if(current==='Round of 16')return 'Quarterfinal';if(current==='Quarterfinal')return 'Semifinal';if(current==='Semifinal')return 'Final';if(count===8)return 'Quarterfinal';if(count===4)return 'Semifinal';return 'Final'}
function champSourceWinner(div,round,slot){
  let arr=state.allMatches[div]||[];
  let m=arr.find(x=>x.championship&&x.position===round&&x.bracketSlot===slot);
  if(m&&m.done)return champWinnerObj(m);
  if(round===firstRoundName((state.brackets[div]||[]).length)){
    let b=((state.byeWinners&&state.byeWinners[div])||[]).find(x=>x.slot===slot);
    if(b)return b.obj;
  }
  return null;
}
function roundMatchCountForDivision(div,round){let initial=(state.brackets[div]||championshipLabels(div)||[]).length;if(round==='Round of 16')return initial;if(round==='Quarterfinal')return initial>=8?4:initial;if(round==='Semifinal')return 2;if(round==='Final')return 1;return initial}
function individualLogicalMatchKey(m){
  if(!m||m.type!=='individual')return null;
  if(m.singleElim)return `single:${m.elimNodeId||m.position+':'+(m.bracketSlot??'')}`;
  if(m.championship)return `champ:${m.position||'Championship'}:${m.bracketSlot??''}`;
  if(m.tiebreak){
    const pair=[m.white||'',m.red||''].sort().join('|');
    return `tiebreak:${m.pool||''}:${m.tiebreakSeries||1}:${m.tiebreakIndex??0}:${pair}`;
  }
  return null;
}
function enforceUniqueIndividualMatches(div){
  const arr=state.allMatches?.[div]||[];
  const seen=new Map(),out=[];
  arr.forEach(m=>{
    const key=individualLogicalMatchKey(m);
    if(!key){out.push(m);return;}
    if(!seen.has(key)){seen.set(key,m);out.push(m);return;}
    const kept=seen.get(key);
    if(!kept.done&&m.done){
      const idx=out.indexOf(kept);
      if(idx>=0)out[idx]=m;
      seen.set(key,m);
    }
  });
  state.allMatches[div]=out;
  if(state.currentDivision===div)state.matches=out;
  return out;
}
function recomputeChampionshipAdvancement(div){return syncChampionshipTemplate(div)}
function maybeAdvanceChampionship(m){if(!m||!m.championship||m.type!=='individual')return;syncChampionshipTemplate(m.division)}
function maybeCreateChampionship(m){if(!m||m.type!=='individual'||m.championship)return;syncChampionshipTemplate(m.division)}
function firstRoundName(n){if(n>=8)return 'Round of 16';if(n>=4)return 'Quarterfinal';if(n>=2)return 'Semifinal';return 'Final'}
function nextRoundFromName(name){if(name==='Round of 16')return 'Quarterfinal';if(name==='Quarterfinal')return 'Semifinal';if(name==='Semifinal')return 'Final';return null}
function previousRoundName(name){if(name==='Quarterfinal')return 'Round of 16';if(name==='Semifinal')return 'Quarterfinal';if(name==='Final')return 'Semifinal';return null}
function placeholderMatchHtml(red,white,status='vs',extra=''){
  // Visual order is always White on the left and Red on the right.
  return `<div class="bracket-match"><div class="white"><b>${esc(white)}</b></div><div class="bracket-status">${esc(status)}</div><div class="red"><b>${esc(red)}</b></div></div>${extra}`;
}
function futureRoundsHtml(startRound,matchCount,div=null){
  let html='',round=startRound,count=matchCount;
  while(round && count>=1){
    let prev=previousRoundName(round)||'Previous Round';
    let nextCount=Math.ceil(count/2);
    html+=`<div class="bracket-card"><div class="bracket-round">${esc(round)}</div>`;
    for(let i=1;i<=nextCount;i++){
      let red=`Winner of ${prev} Match ${2*i-1}`;
      let white=(2*i<=count)?`Winner of ${prev} Match ${2*i}`:'Bye';
      html+=placeholderMatchHtml(red,white,white==='Bye'?'BYE':'vs');
    }
    html+='</div>';
    if(round==='Final')break;
    round=nextRoundFromName(round);count=nextCount;
  }
  return html;
}
function expectedRoundCount(div,round){
  let labels=championshipLabels(div);let first=firstRoundName(labels.length);let count=labels.length;
  if(round===first)return count;
  let r=nextRoundFromName(first);
  while(r){count=Math.ceil(count/2);if(r===round)return count;if(r==='Final')break;r=nextRoundFromName(r)}
  return 0;
}
function roundSequenceFromFirst(first){let seq=[];let r=first;while(r){seq.push(r);if(r==='Final')break;r=nextRoundFromName(r)}return seq;}
function champMatchBySlot(div,round,slot){return (state.allMatches[div]||[]).find(x=>x.championship&&x.position===round&&x.bracketSlot===slot)}
function sourceLabelForRound(div,prevRound,slot){
  let pm=champMatchBySlot(div,prevRound,slot);
  if(pm){
    if(pm.done){const winner=champWinnerObj(pm);if(winner)return {name:winner.name,dojo:winner.dojo||'',done:true};}
    return {name:`Winner of ${prevRound} Match ${slot+1}`,dojo:'',done:false};
  }
  return {name:`Winner of ${prevRound} Match ${slot+1}`,dojo:'',done:false};
}
function bracketHtml(div){
  if(state.singleElimNodes&&state.singleElimNodes[div])return singleElimBracketHtml(div);
  let labels=championshipLabels(div);
  let champ=(state.allMatches[div]||[]).filter(m=>m.championship);
  if(champ.length){
    let first=firstRoundName(labels.length||champ.length);let seq=roundSequenceFromFirst(first);let html='';
    seq.forEach(round=>{
      let expected=expectedRoundCount(div,round); if(!expected)return;
      let ms=[];for(let i=0;i<expected;i++)ms.push(champMatchBySlot(div,round,i));
      let complete=ms.every(Boolean)&&ms.every(m=>m.done);
      html+=`<div class="bracket-card"><div class="bracket-round">${esc(complete&&round!=='Final'?round+' Complete':round)}</div>`;
      for(let i=0;i<expected;i++){
        let m=ms[i];
        if(m){
          let w=winnerOf(m);
          html+=`<div class="bracket-match ${m.done?'':'gold'}"><div class="white ${w===m.white?'winner':''}"><b>${esc(specificMatchSideLabel(m,'white'))}</b><div class="small">${(m.wp||[]).join(' ')}</div></div><div class="bracket-status">${m.done?'DONE':'vs'}</div><div class="red ${w===m.red?'winner':''}"><b>${esc(specificMatchSideLabel(m,'red'))}</b><div class="small">${(m.rp||[]).join(' ')}</div></div></div>`;
        }else if(round===first){
          let pair=labels[i]||[];let rLabel=pair[0],wLabel=pair[1];let r=seedNameForLabel(div,rLabel,true),w=seedNameForLabel(div,wLabel,true);let red=r?r.name:rLabel,white=w?w.name:wLabel;let status=(String(wLabel).toUpperCase()==='BYE'||!wLabel)?'BYE':'vs';html+=placeholderMatchHtml(red,white,status);
        }else{
          let prev=previousRoundName(round);let red=sourceLabelForRound(div,prev,i*2),white=sourceLabelForRound(div,prev,i*2+1);
          html+=placeholderMatchHtml(red.name,white.name,white.name==='Bye'?'BYE':'vs');
        }
      }
      html+='</div>';
    });
    return html;
  }
  let html='';
  if(labels.length){
    let first=firstRoundName(labels.length);
    html+=`<div class="bracket-card"><div class="bracket-round">${esc(first)}</div>`+labels.map(([rLabel,wLabel],i)=>{let r=seedNameForLabel(div,rLabel,true),w=seedNameForLabel(div,wLabel,true);let red=r?r.name:rLabel,white=w?w.name:wLabel;let status=(String(wLabel).toUpperCase()==='BYE'||!wLabel)?'BYE':'vs';return `<div class="bracket-match"><div class="white"><b>${esc(white)}</b><div class="small">${esc(w? wLabel : (status==='BYE'?'bye':'pending'))}</div></div><div class="bracket-status">${status}</div><div class="red"><b>${esc(red)}</b><div class="small">${esc(r? rLabel : 'pending')}</div></div></div>`}).join('')+`</div>`;
    html+=futureRoundsHtml(nextRoundFromName(first),labels.length);
  }
  return html||'<div class="muted-card">Championship bracket will appear after pools are generated.</div>';
}
