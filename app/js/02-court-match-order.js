function isTeamMatch(m){/* ksm:post-split-begin engine-bridge */return KSMEngine.isTeamMatch(m);// moved to app/engine/match-helpers.ts
  /* ksm:post-split-end */}
function teamNodeOrderMap(div){let map={};(state.teamBracketNodes?.[div]||[]).forEach((n,i)=>map[n.id]=i);return map}
function teamPairOrderMap(div){let map={},next=0;(state.allMatches[div]||[]).forEach(m=>{if(isTeamMatch(m)&&m.teamPair&&map[m.teamPair]==null)map[m.teamPair]=next++});return map}
function teamPositionOrder(m){/* ksm:post-split-begin engine-bridge */return KSMEngine.teamPositionOrder(m);// moved to app/engine/match-helpers.ts
  /* ksm:post-split-end */}
function teamMatchSortKey(div,m){let map=teamNodeOrderMap(div);let node=(m.teamNodeId&&map[m.teamNodeId]!=null)?map[m.teamNodeId]:null;if(node==null && m.teamPair){let sib=(state.allMatches[div]||[]).find(x=>x.teamPair===m.teamPair && x.teamNodeId && map[x.teamNodeId]!=null);if(sib)node=map[sib.teamNodeId];}
  // Round-robin position Match Objects belong to one authoritative team pairing.
  // Keep Senpo -> ... -> Taisho -> representative playoff together before
  // advancing the court to another pair. Elimination continues to use node order.
  if(node==null&&m.teamPair){let pairOrder=teamPairOrderMap(div);if(pairOrder[m.teamPair]!=null)return pairOrder[m.teamPair]*100+teamPositionOrder(m)}
  if(node==null)node=999;return node*100+teamPositionOrder(m)}
function sortTeamMatches(div){let arr=state.allMatches[div]||[];if(!arr.some(isTeamMatch))return arr;arr.sort((a,b)=>{
  let at=isTeamMatch(a),bt=isTeamMatch(b);if(at&&bt)return teamMatchSortKey(div,a)-teamMatchSortKey(div,b);if(at&&!bt)return -1;if(!at&&bt)return 1;return 0;
});state.allMatches[div]=arr;return arr;}
function individualMatchReady(m){/* ksm:post-split-begin engine-bridge */return KSMEngine.individualMatchReady(m);// moved to app/engine/match-helpers.ts
  /* ksm:post-split-end */}
function championshipRoundIndex(div,round){
  const first=firstRoundName((state.brackets?.[div]||championshipLabels(div)||[]).length);
  const seq=roundSequenceFromFirst(first);
  const idx=seq.indexOf(round);
  return idx<0?999:idx;
}
function sortIndividualDivisionMatches(div,arr){
  const indexed=arr.map((m,i)=>({m,i}));
  indexed.sort((a,b)=>{
    const ac=a.m.championship?1:0,bc=b.m.championship?1:0;
    if(ac!==bc)return ac-bc;
    if(!ac)return a.i-b.i;
    if(a.m.singleElim||b.m.singleElim){
      const order=singleElimOrderMap(div);
      return (order[a.m.elimNodeId]??9999)-(order[b.m.elimNodeId]??9999);
    }
    const ar=championshipRoundIndex(div,a.m.position),br=championshipRoundIndex(div,b.m.position);
    if(ar!==br)return ar-br;
    const as=Number(a.m.bracketSlot??9999),bs=Number(b.m.bracketSlot??9999);
    return as!==bs?as-bs:a.i-b.i;
  });
  const out=indexed.map(x=>x.m);state.allMatches[div]=out;return out;
}
function findNextForCourt(court,preferredDiv=null,startIndex=0){
  // The active match must always be pulled from the same ordered queue that
  // is displayed to the scorekeeper. Team brackets are especially sensitive:
  // play-ins must remain ahead of any dependent or later-round match, even if
  // other matches are technically playable. Never fall back to another division
  // simply because the selected division is waiting.
  function firstForDivision(d){
    let arr=state.allMatches[d]||[];
    if(arr.some(isTeamMatch))arr=sortTeamMatches(d);
    else arr=sortIndividualDivisionMatches(d,arr);
    let idx=arr.findIndex(m=>individualMatchReady(m) && matchBelongsToCourt(m,court));
    return {division:d,index:idx>=0?idx:arr.length};
  }
  if(preferredDiv) return firstForDivision(preferredDiv);
  let divs=Object.keys(state.allMatches||{}).filter(Boolean);
  for(let d of divs){let found=firstForDivision(d);if(found.index < (state.allMatches[d]||[]).length)return found;}
  return {division:state.currentDivision,index:(state.allMatches[state.currentDivision]||[]).length};
}
function applyCourtState(court,cs,keepScore=true){
  state.currentCourt=court;
  state.courtState[court]=cs;
  state.courtActiveDivision[court]=cs.division;
  state.currentDivision=cs.division;
  state.matches=state.allMatches[cs.division]||[];
  state.current=cs.index||0;
  state.currentByDivision[cs.division]=state.current;
  if(keepScore){loadScoreFromMatch(state.matches[state.current]);}
  else{state.score={W:[],R:[],WT:0,RT:0};state.history=[]}
  applyCourtSides();
}
function initCourtStates(){
  ['A','B'].forEach(c=>{state.courtState[c]=findNextForCourt(c,null,0);state.courtActiveDivision[c]=state.courtState[c].division;});
}
function renderDivisions(){
  state.divisions.forEach(d=>state.divisionCourts[d]=state.divisionCourts[d]||'A');
/* ksm:post-split-begin team-divisions was:  if(window.poolDiv){let all=[...new Set([...state.divisions,...Object.keys(state.allMatches||{})])];let selected=(poolDiv.value&&all.includes(poolDiv.value))?poolDiv.value:((state.poolViewDivision&&all.includes(state.poolViewDivision))?state.poolViewDivision:state.currentDivision);state.poolViewDivision=selected;poolDiv.innerHTML=all.map(d=>`<option ${d===selected?'selected':''}>${esc(d)}</option>`).join('');if(selected)poolDiv.value=selected;}  */  if(window.poolDiv){let all=[...new Set([...state.divisions,...ksmTeamDivisions().filter(d=>state.allMatches?.[d.id]).map(d=>d.id),...Object.keys(state.allMatches||{})])];let selected=(poolDiv.value&&all.includes(poolDiv.value))?poolDiv.value:((state.poolViewDivision&&all.includes(state.poolViewDivision))?state.poolViewDivision:state.currentDivision);state.poolViewDivision=selected;poolDiv.innerHTML=all.map(d=>`<option ${d===selected?'selected':''}${ksmDivisionName(d)!==d?` value="${esc(d)}"`:''}>${esc(ksmDivisionName(d))}</option>`).join('');if(selected)poolDiv.value=selected;}
/* ksm:post-split-end */
  if(window.scoreDiv){
    let court=state.currentCourt||'A';
    let all=[...new Set([...state.divisions,...Object.keys(state.allMatches||{})])];
    let opts=all.filter(d=>{let c=state.divisionCourts[d]||'A';return c===court||c==='split'||/* ksm:post-split-begin team-divisions was:(d==='Team Tournament'&&(state.divisionCourts[d]||'Both')==='Both') */(isTeamDivision(d)&&(state.divisionCourts[d]||'Both')==='Both')/* ksm:post-split-end */});
/* ksm:post-split-begin react-court */
    // The React court header (35-react-court.js) draws the court title and the select.
    ksmPublishCourtHeader({court,divisions:opts,currentDivision:state.currentDivision||''});
/* ksm:post-split-end */
  }
}
function openCourt(c){
  c=pinCourtLocally(c);
  const preferred=localCourtDivision(c);
  let cs=preferred&&state.allMatches?.[preferred]?findNextForCourt(c,preferred,0):state.courtState?.[c];
  const active=cs?.division?(state.allMatches?.[cs.division]||[])[cs.index]:null;
  if(!cs || !cs.division || !individualMatchReady(active) || !matchBelongsToCourt(active,c)){
    cs=findNextForCourt(c,cs?.division||state.courtActiveDivision?.[c]||null,0);
  }
  applyCourtState(c,cs,true);
  if(cs?.division)rememberLocalCourtDivision(c,cs.division);
  renderDivisions();renderScore();show('score');
}
function openPublicCourt(c){state.publicCourt=c;if(window.publicTitle)publicTitle.textContent='Live Scores • Court '+c;renderPublic();show('public')}
