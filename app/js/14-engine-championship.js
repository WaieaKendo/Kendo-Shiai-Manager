// @ts-check
const CHAMPIONSHIP_TEMPLATE_VERSION='v1.0';
/**
 * Frozen first-round seed pairs for `total` pool entrants, e.g. [['A1','B2'],['B1','A2']].
 * @param {number} total
 * @returns {string[][]}
 */
function championshipTemplateForTotal(total){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.championshipTemplateForTotal(total);
  /* ksm:post-split-end */
}
/**
 * @param {string} div
 * @returns {string[][]}
 */
function championshipLabels(div){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.championshipLabels(state.generated,state.brackets?.[div],state.pools[div]||[]);
  /* ksm:post-split-end */
}
/**
 * How many places of each pool feed the championship (pool label -> places).
 * @param {string} div
 * @returns {Record<string, number>}
 */
function requiredSeedPlaces(div){
  /* ksm:post-split-begin engine-bridge */const poolOnly=isPoolOnlyDivision(div);return KSMEngine.requiredSeedPlaces(poolOnly?state.pools[div][0]:null,poolOnly?[]:championshipLabels(div));
  /* ksm:post-split-end */
}
/**
 * @param {PoolStandingRow} a
 * @param {PoolStandingRow} b
 * @returns {boolean}
 */
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
/**
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {SeedResolution}
 */
function poolSeedResolution(poolLabel,div=state.currentDivision){
  /* ksm:post-split-begin engine-bridge */return /** @type {SeedResolution} */(KSMEngine.poolSeedResolution((state.pools[div]||[]).find(p=>p.label===poolLabel),poolLabel,state.allMatches[div]||[],requiredSeedPlaces(div)[poolLabel]||2));
  /* ksm:post-split-end */
}
/**
 * @param {string} poolLabel
 * @param {string} [div]
 * @returns {boolean}
 */
function poolPositionsResolved(poolLabel,div=state.currentDivision){return poolSeedResolution(poolLabel,div).complete;}
/**
 * The standings row for a seed label ('A1'), or null while undecided.
 * @param {string} div
 * @param {string} label
 * @param {boolean} [onlyFinalized]
 * @returns {PoolStandingRow|null}
 */
function seedNameForLabel(div,label,onlyFinalized=true){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.seedNameForLabel(label,poolLabel=>poolSeedResolution(poolLabel,div),onlyFinalized);
  /* ksm:post-split-end */
}

/**
 * @param {string} div
 * @param {ChampionshipNode} node
 * @returns {Match}
 */
function championshipMatchObjectForNode(div,node){
  /* ksm:post-split-begin engine-bridge */return /** @type {Match} */(KSMEngine.championshipMatchObjectForNode(div,node));
  /* ksm:post-split-end */
}
/**
 * Creates the championship nodes (state.championshipNodes) and their Match Objects.
 * @param {string} div
 * @param {string[][]} seedPairs
 * @returns {Match[]}
 */
function buildChampionshipTemplateMatches(div,seedPairs){
  /* ksm:post-split-begin engine-bridge */if(!(seedPairs||[]).length)return [];
  const built=KSMEngine.buildChampionshipTemplateMatches(div,seedPairs,(round,slot,total)=>championshipCourtFor(div,round,slot,total),(state.brackets[div]||championshipLabels(div)||[]).length);
  state.championshipNodes=state.championshipNodes||{};
  state.championshipNodes[div]=built.nodes;
  return /** @type {Match[]} */(built.matches);
  /* ksm:post-split-end */
}
/**
 * @param {string} div
 * @param {BracketSource} side
 * @returns {{name: string, dojo: string}|null}
 */
function championshipNodeSource(div,side){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.championshipNodeSource(side,label=>seedNameForLabel(div,label,true),state.allMatches?.[div]||[]);
  /* ksm:post-split-end */
}
/**
 * Fills championship matches from pool seeds and earlier winners.
 * @param {string} div
 * @returns {Match[]}
 */
function syncChampionshipTemplate(div){
  /* ksm:post-split-begin engine-bridge */const nodes=state.championshipNodes?.[div]||[];
  const arr=state.allMatches?.[div]||[];
  if(!nodes.length)return arr;
  const plan=KSMEngine.syncChampionshipTemplate(div,nodes,arr,label=>seedNameForLabel(div,label,true));
  // Self-heal: a generated championship node must always have a Match Object.
  plan.missing.forEach(m=>{arr.push(/** @type {Match} */(m));console.warn('KSM repaired missing championship Match Object',div,m.champNodeId);});
  plan.updates.forEach(u=>Object.assign(arr[u.index],u.set));
  state.allMatches[div]=arr;
  return arr;
  /* ksm:post-split-end */
}
function championshipSeeds(div){
  return championshipLabels(div).map(([r,w])=>[r==='BYE'?{name:'BYE',dojo:''}:seedNameForLabel(div,r,true),w==='BYE'?{name:'BYE',dojo:''}:seedNameForLabel(div,w,true),r,w]);
}
function bracketPairsFromSeeds(seeds){return seeds}
function champRoundOrder(name){return name==='Round of 16'?16:name==='Quarterfinal'?8:name==='Semifinal'?4:name==='Final'?2:0}
/**
 * @param {Match} m
 * @returns {{name: string, dojo: string}|null}
 */
function champWinnerObj(m){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.champWinnerObj(m);
  /* ksm:post-split-end */
}
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
function roundMatchCountForDivision(div,round){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.roundMatchCount((state.brackets[div]||championshipLabels(div)||[]).length,round);
  /* ksm:post-split-end */
}
/**
 * @param {Match} m
 * @returns {string}
 */
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
/**
 * @param {string} div
 */
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
/**
 * @param {string} div
 */
function recomputeChampionshipAdvancement(div){return syncChampionshipTemplate(div)}
/**
 * @param {Match} m
 */
function maybeAdvanceChampionship(m){if(!m||!m.championship||m.type!=='individual')return;syncChampionshipTemplate(m.division)}
/**
 * @param {Match} m
 */
function maybeCreateChampionship(m){if(!m||m.type!=='individual'||m.championship)return;syncChampionshipTemplate(m.division)}
/**
 * @param {number} n number of first-round matches
 * @returns {RoundName}
 */
function firstRoundName(n){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.firstRoundName(n);
  /* ksm:post-split-end */
}
/**
 * @param {RoundName} name
 * @returns {RoundName|null}
 */
function nextRoundFromName(name){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.nextRoundFromName(name);
  /* ksm:post-split-end */
}
/**
 * @param {RoundName} name
 * @returns {RoundName|null}
 */
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
/**
 * @param {RoundName} first
 * @returns {RoundName[]}
 */
function roundSequenceFromFirst(first){let seq=[];let r=first;while(r){seq.push(r);if(r==='Final')break;r=nextRoundFromName(r)}return seq;}
/**
 * @param {string} div
 * @param {RoundName} round
 * @param {number} slot
 * @returns {Match|undefined}
 */
function champMatchBySlot(div,round,slot){return (state.allMatches[div]||[]).find(x=>x.championship&&x.position===round&&x.bracketSlot===slot)}
function sourceLabelForRound(div,prevRound,slot){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.sourceLabelForRound(state.allMatches[div]||[],prevRound,slot);
  /* ksm:post-split-end */
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
