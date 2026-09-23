// @ts-check
/**
 * Bracket side: team number n (1-based registration order).
 * @param {number} n
 * @returns {BracketSource}
 */
function T(n){return {team:n}}
/**
 * Bracket side: winner of node id.
 * @param {string} id
 * @returns {BracketSource}
 */
function W(id){return {ref:id}}
/**
 * @param {string} id
 * @param {RoundName} round
 * @param {Court} court
 * @param {BracketSource|null} left
 * @param {BracketSource|null} right
 * @param {number} slot
 * @returns {TeamBracketNode}
 */
function N(id,round,court,left,right,slot){return {id,round,court,left,right,slot,winner:null}}
/**
 * Frozen bracket template for n teams (also used for individual single elimination).
 * @param {number} n
 * @returns {TeamBracketNode[]}
 */
function teamBracketNodesForCount(n){
  // Team Single-Elimination Template Library v1.0
  // Fixed data templates. Red listed first, White second. Top half Court A, bottom half Court B, Final Court A.
  if(n<=1)return [];
  if(n===2)return [N('F','Final','A',T(1),T(2),0)];
  if(n===3)return [N('SF1','Semifinal','A',T(1),T(2),0),N('F','Final','A',W('SF1'),T(3),0)];
  if(n===4)return [N('SF1','Semifinal','A',T(1),T(2),0),N('SF2','Semifinal','B',T(3),T(4),1),N('F','Final','A',W('SF1'),W('SF2'),0)];
  if(n===5)return [N('QF1','Quarterfinal','A',T(1),T(2),0),N('QF2','Quarterfinal','B',T(3),T(4),1),N('SF1','Semifinal','A',W('QF1'),null,0),N('SF2','Semifinal','B',W('QF2'),T(5),1),N('F','Final','A',W('SF1'),W('SF2'),0)];
  if(n===6)return [N('QF1','Quarterfinal','A',T(1),T(2),0),N('QF2','Quarterfinal','A',T(3),T(4),1),N('QF3','Quarterfinal','B',T(5),T(6),2),N('SF1','Semifinal','A',W('QF1'),W('QF2'),0),N('SF2','Semifinal','B',W('QF3'),null,1),N('F','Final','A',W('SF1'),W('SF2'),0)];
  if(n===7)return [N('QF1','Quarterfinal','A',T(1),T(2),0),N('QF2','Quarterfinal','A',T(3),T(4),1),N('QF3','Quarterfinal','B',T(5),T(6),2),N('SF1','Semifinal','A',W('QF1'),W('QF2'),0),N('SF2','Semifinal','B',W('QF3'),T(7),1),N('F','Final','A',W('SF1'),W('SF2'),0)];
  if(n===8)return [N('QF1','Quarterfinal','A',T(1),T(2),0),N('QF2','Quarterfinal','A',T(3),T(4),1),N('QF3','Quarterfinal','B',T(5),T(6),2),N('QF4','Quarterfinal','B',T(7),T(8),3),N('SF1','Semifinal','A',W('QF1'),W('QF2'),0),N('SF2','Semifinal','B',W('QF3'),W('QF4'),1),N('F','Final','A',W('SF1'),W('SF2'),0)];
  if(n===9)return [N('P1','Play-in','B',T(8),T(9),3),N('QF1','Quarterfinal','A',T(1),T(2),0),N('QF2','Quarterfinal','A',T(3),T(4),1),N('QF3','Quarterfinal','B',T(5),T(6),2),N('QF4','Quarterfinal','B',T(7),W('P1'),3),N('SF1','Semifinal','A',W('QF1'),W('QF2'),0),N('SF2','Semifinal','B',W('QF3'),W('QF4'),1),N('F','Final','A',W('SF1'),W('SF2'),0)];
  if(n===10)return [N('P1','Play-in','A',T(7),T(8),1),N('P2','Play-in','B',T(9),T(10),3),N('QF1','Quarterfinal','A',T(1),T(2),0),N('QF2','Quarterfinal','A',W('P1'),T(3),1),N('QF3','Quarterfinal','B',T(4),T(5),2),N('QF4','Quarterfinal','B',T(6),W('P2'),3),N('SF1','Semifinal','A',W('QF1'),W('QF2'),0),N('SF2','Semifinal','B',W('QF3'),W('QF4'),1),N('F','Final','A',W('SF1'),W('SF2'),0)];
  if(n===11)return [N('P1','Play-in','A',T(6),T(7),0),N('P2','Play-in','A',T(8),T(9),1),N('P3','Play-in','B',T(10),T(11),3),N('QF1','Quarterfinal','A',T(1),W('P1'),0),N('QF2','Quarterfinal','A',T(2),W('P2'),1),N('QF3','Quarterfinal','B',T(3),T(4),2),N('QF4','Quarterfinal','B',T(5),W('P3'),3),N('SF1','Semifinal','A',W('QF1'),W('QF2'),0),N('SF2','Semifinal','B',W('QF3'),W('QF4'),1),N('F','Final','A',W('SF1'),W('SF2'),0)];
  if(n===12)return [N('P1','Play-in','A',T(5),T(6),0),N('P2','Play-in','A',T(7),T(8),1),N('P3','Play-in','B',T(9),T(10),2),N('P4','Play-in','B',T(11),T(12),3),N('QF1','Quarterfinal','A',T(1),W('P1'),0),N('QF2','Quarterfinal','A',T(2),W('P2'),1),N('QF3','Quarterfinal','B',T(3),W('P3'),2),N('QF4','Quarterfinal','B',T(4),W('P4'),3),N('SF1','Semifinal','A',W('QF1'),W('QF2'),0),N('SF2','Semifinal','B',W('QF3'),W('QF4'),1),N('F','Final','A',W('SF1'),W('SF2'),0)];
  if(n===13)return [N('P1','Play-in','A',T(4),T(5),0),N('P2','Play-in','A',T(6),T(7),1),N('P3','Play-in','A',T(8),T(9),1),N('P4','Play-in','B',T(10),T(11),2),N('P5','Play-in','B',T(12),T(13),3),N('QF1','Quarterfinal','A',T(1),W('P1'),0),N('QF2','Quarterfinal','A',W('P2'),W('P3'),1),N('QF3','Quarterfinal','B',T(2),W('P4'),2),N('QF4','Quarterfinal','B',T(3),W('P5'),3),N('SF1','Semifinal','A',W('QF1'),W('QF2'),0),N('SF2','Semifinal','B',W('QF3'),W('QF4'),1),N('F','Final','A',W('SF1'),W('SF2'),0)];
  if(n===14)return [N('P1','Play-in','A',T(3),T(4),0),N('P2','Play-in','A',T(5),T(6),1),N('P3','Play-in','A',T(7),T(8),1),N('P4','Play-in','B',T(9),T(10),2),N('P5','Play-in','B',T(11),T(12),3),N('P6','Play-in','B',T(13),T(14),3),N('QF1','Quarterfinal','A',T(1),W('P1'),0),N('QF2','Quarterfinal','A',W('P2'),W('P3'),1),N('QF3','Quarterfinal','B',T(2),W('P4'),2),N('QF4','Quarterfinal','B',W('P5'),W('P6'),3),N('SF1','Semifinal','A',W('QF1'),W('QF2'),0),N('SF2','Semifinal','B',W('QF3'),W('QF4'),1),N('F','Final','A',W('SF1'),W('SF2'),0)];
  if(n===15)return [N('P1','Play-in','A',T(1),T(2),0),N('P2','Play-in','A',T(3),T(4),0),N('P3','Play-in','A',T(5),T(6),1),N('P4','Play-in','A',T(7),T(8),1),N('P5','Play-in','B',T(9),T(10),2),N('P6','Play-in','B',T(11),T(12),3),N('P7','Play-in','B',T(13),T(14),3),N('QF1','Quarterfinal','A',W('P1'),W('P2'),0),N('QF2','Quarterfinal','A',W('P3'),W('P4'),1),N('QF3','Quarterfinal','B',T(15),W('P5'),2),N('QF4','Quarterfinal','B',W('P6'),W('P7'),3),N('SF1','Semifinal','A',W('QF1'),W('QF2'),0),N('SF2','Semifinal','B',W('QF3'),W('QF4'),1),N('F','Final','A',W('SF1'),W('SF2'),0)];
  if(n>=16&&n<=32){
    const specs={
      16:{P:[],R:[[1,2],[3,4],[5,6],[7,8],[9,10],[11,12],[13,14],[15,16]]},
      17:{P:[['B',16,17,8,'White']],R:[[1,2],[3,4],[5,6],[7,8],[9,10],[11,12],[13,14],[15,'P1']]},
      18:{P:[['A',15,16,4,'White'],['B',17,18,8,'White']],R:[[1,2],[3,4],[5,6],[7,'P1'],[8,9],[10,11],[12,13],[14,'P2']]},
      19:{P:[['A',14,15,4,'White'],['B',16,17,7,'White'],['B',18,19,8,'White']],R:[[1,2],[3,4],[5,6],[7,'P1'],[8,9],[10,11],[12,'P2'],[13,'P3']]},
      20:{P:[['A',13,14,3,'White'],['A',15,16,4,'White'],['B',17,18,7,'White'],['B',19,20,8,'White']],R:[[1,2],[3,4],[5,'P1'],[6,'P2'],[7,8],[9,10],[11,'P3'],[12,'P4']]},
      21:{P:[['A',12,13,3,'White'],['A',14,15,4,'White'],['B',16,17,6,'White'],['B',18,19,7,'White'],['B',20,21,8,'White']],R:[[1,2],[3,4],[5,'P1'],[6,'P2'],[7,8],[9,'P3'],[10,'P4'],[11,'P5']]},
      22:{P:[['A',11,12,2,'White'],['A',13,14,3,'White'],['A',15,16,4,'White'],['B',17,18,6,'White'],['B',19,20,7,'White'],['B',21,22,8,'White']],R:[[1,2],[3,'P1'],[4,'P2'],[5,'P3'],[6,7],[8,'P4'],[9,'P5'],[10,'P6']]},
      23:{P:[['A',10,11,1,'White'],['A',12,13,2,'White'],['A',14,15,3,'White'],['A',16,17,4,'White'],['B',18,19,6,'White'],['B',20,21,7,'White'],['B',22,23,8,'White']],R:[[1,'P1'],[2,'P2'],[3,'P3'],[4,'P4'],[5,6],[7,'P5'],[8,'P6'],[9,'P7']]},
      24:{P:[['A',9,10,1,'White'],['A',11,12,2,'White'],['A',13,14,3,'White'],['A',15,16,4,'White'],['B',17,18,5,'White'],['B',19,20,6,'White'],['B',21,22,7,'White'],['B',23,24,8,'White']],R:[[1,'P1'],[2,'P2'],[3,'P3'],[4,'P4'],[5,'P5'],[6,'P6'],[7,'P7'],[8,'P8']]},
      25:{P:[['A',8,9,1,'White'],['A',10,11,2,'White'],['A',12,13,3,'White'],['A',14,15,4,'Red'],['A',16,17,4,'White'],['B',18,19,5,'White'],['B',20,21,6,'White'],['B',22,23,7,'White'],['B',24,25,8,'White']],R:[[1,'P1'],[2,'P2'],[3,'P3'],['P4','P5'],[4,'P6'],[5,'P7'],[6,'P8'],[7,'P9']]},
      26:{P:[['A',7,8,1,'White'],['A',9,10,2,'White'],['A',11,12,3,'White'],['A',13,14,4,'Red'],['A',15,16,4,'White'],['B',17,18,5,'White'],['B',19,20,6,'White'],['B',21,22,7,'White'],['B',23,24,8,'Red'],['B',25,26,8,'White']],R:[[1,'P1'],[2,'P2'],[3,'P3'],['P4','P5'],[4,'P6'],[5,'P7'],[6,'P8'],['P9','P10']]},
      27:{P:[['A',6,7,1,'White'],['A',8,9,2,'White'],['A',10,11,3,'Red'],['A',12,13,3,'White'],['A',14,15,4,'Red'],['A',16,17,4,'White'],['B',18,19,5,'White'],['B',20,21,6,'White'],['B',22,23,7,'White'],['B',24,25,8,'Red'],['B',26,27,8,'White']],R:[[1,'P1'],[2,'P2'],['P3','P4'],['P5','P6'],[3,'P7'],[4,'P8'],[5,'P9'],['P10','P11']]},
      28:{P:[['A',5,6,1,'White'],['A',7,8,2,'White'],['A',9,10,3,'Red'],['A',11,12,3,'White'],['A',13,14,4,'Red'],['A',15,16,4,'White'],['B',17,18,5,'White'],['B',19,20,6,'White'],['B',21,22,7,'Red'],['B',23,24,7,'White'],['B',25,26,8,'Red'],['B',27,28,8,'White']],R:[[1,'P1'],[2,'P2'],['P3','P4'],['P5','P6'],[3,'P7'],[4,'P8'],['P9','P10'],['P11','P12']]},
      29:{P:[['A',4,5,1,'White'],['A',6,7,2,'Red'],['A',8,9,2,'White'],['A',10,11,3,'Red'],['A',12,13,3,'White'],['A',14,15,4,'Red'],['A',16,17,4,'White'],['B',18,19,5,'White'],['B',20,21,6,'White'],['B',22,23,7,'Red'],['B',24,25,7,'White'],['B',26,27,8,'Red'],['B',28,29,8,'White']],R:[[1,'P1'],['P2','P3'],['P4','P5'],['P6','P7'],[2,'P8'],[3,'P9'],['P10','P11'],['P12','P13']]},
      30:{P:[['A',3,4,1,'White'],['A',5,6,2,'Red'],['A',7,8,2,'White'],['A',9,10,3,'Red'],['A',11,12,3,'White'],['A',13,14,4,'Red'],['A',15,16,4,'White'],['B',17,18,5,'White'],['B',19,20,6,'Red'],['B',21,22,6,'White'],['B',23,24,7,'Red'],['B',25,26,7,'White'],['B',27,28,8,'Red'],['B',29,30,8,'White']],R:[[1,'P1'],['P2','P3'],['P4','P5'],['P6','P7'],[2,'P8'],['P9','P10'],['P11','P12'],['P13','P14']]},
      31:{P:[['A',2,3,1,'White'],['A',4,5,2,'Red'],['A',6,7,2,'White'],['A',8,9,3,'Red'],['A',10,11,3,'White'],['A',12,13,4,'Red'],['A',14,15,4,'White'],['B',16,17,5,'Red'],['B',18,19,5,'White'],['B',20,21,6,'Red'],['B',22,23,6,'White'],['B',24,25,7,'Red'],['B',26,27,7,'White'],['B',28,29,8,'Red'],['B',30,31,8,'White']],R:[[1,'P1'],['P2','P3'],['P4','P5'],['P6','P7'],['P8','P9'],['P10','P11'],['P12','P13'],['P14','P15']]},
      32:{P:[],R:[[1,2],[3,4],[5,6],[7,8],[9,10],[11,12],[13,14],[15,16],[17,18],[19,20],[21,22],[23,24],[25,26],[27,28],[29,30],[31,32]]}
    };
    let spec=specs[n]||specs[32];let nodes=[];
    (spec.P||[]).forEach((p,i)=>nodes.push(N('P'+(i+1),'Play-in',p[0],T(p[1]),T(p[2]),p[3]-1)));
    let firstRoundName=n===32?'Round of 32':'Round of 16';let firstPrefix=n===32?'R32':'R16';
    spec.R.forEach((r,i)=>{let court=/** @type {Court} */(i<Math.ceil(spec.R.length/2)?'A':'B');let left=typeof r[0]==='number'?T(r[0]):W(r[0]);let right=typeof r[1]==='number'?T(r[1]):W(r[1]);let dest=n===32?'R16-'+(Math.floor(i/2)+1):'QF'+(Math.floor(i/2)+1);nodes.push(N(firstPrefix+'-'+(i+1),firstRoundName,court,left,right,i));});
    if(n===32){for(let i=1;i<=8;i++)nodes.push(N('R16-'+i,'Round of 16',i<=4?'A':'B',W('R32-'+(2*i-1)),W('R32-'+(2*i)),i-1));}
    for(let i=1;i<=4;i++)nodes.push(N('QF'+i,'Quarterfinal',i<=2?'A':'B',W((n===32?'R16':'R16')+'-'+(2*i-1)),W((n===32?'R16':'R16')+'-'+(2*i)),i-1));
    if(n<32){ // for 16-team base, QFs should read from R16 nodes already created
      nodes=nodes.filter((node,idx,arr)=>!(node.id.startsWith('QF')&&arr.findIndex(x=>x.id===node.id)!==idx));
    }
    // Ensure QF nodes for 16-31 are correct and unique.
    if(n>=16&&n<32){
      nodes=nodes.filter(x=>!x.id.startsWith('QF'));
      for(let i=1;i<=4;i++)nodes.push(N('QF'+i,'Quarterfinal',i<=2?'A':'B',W('R16-'+(2*i-1)),W('R16-'+(2*i)),i-1));
    }
    nodes.push(N('SF1','Semifinal','A',W('QF1'),W('QF2'),0),N('SF2','Semifinal','B',W('QF3'),W('QF4'),1),N('F','Final','A',W('SF1'),W('SF2'),0));
    return nodes;
  }
  alert('Team single-elimination templates currently support 2–32 teams.');
  return [];
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
  if(matchFmt==='Kachinuki'){
    let lineupW=['senpo','chuken','taisho'].map(k=>a[k]||`${a.team} ${slotLabel(k)}`),lineupR=['senpo','chuken','taisho'].map(k=>b[k]||`${b.team} ${slotLabel(k)}`);
    m.push({division:div,pool,white:lineupW[0],red:lineupR[0],wdojo:a.team,rdojo:b.team,teamWhite:a.team,teamRed:b.team,position:'Kachinuki',teamPair:pairId,done:false,wp:[],rp:[],type:'kachinuki',origin:'TEMPLATE',court,lineupW,lineupR,wIndex:0,rIndex:0});
  }else{
    slots.forEach(k=>m.push({division:div,pool,white:a[k]||`${a.team} ${slotLabel(k)}`,red:b[k]||`${b.team} ${slotLabel(k)}`,wdojo:a.team,rdojo:b.team,teamWhite:a.team,teamRed:b.team,position:slotLabel(k),teamPair:pairId,done:false,wp:[],rp:[],type:'teamPosition',origin:'TEMPLATE',court}));
  }
}
/**
 * Next lineup indexes after a kachinuki bout: the winner stays, a draw eliminates both (except a last player).
 * @param {Match} m
 * @returns {{wi: number, ri: number, whiteExhausted: boolean, redExhausted: boolean}}
 */
function kachinukiTransitionState(m){
  let wp=(m.wp||[]).length,rp=(m.rp||[]).length;
  let wi=m.wIndex,ri=m.rIndex;
  if(wp>rp){ri++;}
  else if(rp>wp){wi++;}
  else{
    if(wi===2 && ri<2){ri++;}
    else if(ri===2 && wi<2){wi++;}
    else{wi++;ri++;}
  }
  return {wi,ri,whiteExhausted:wi>2,redExhausted:ri>2};
}
/**
 * @param {string} div
 * @param {string} pair
 * @returns {string|null}
 */
function kachinukiPairWinner(div,pair){
  let ms=teamPairMatches(div,pair);
  let playoff=ms.find(x=>x.type==='teamPlayoff');
  if(playoff){
    if(!playoff.done)return null;
    let winner=winnerOf(playoff);
    if(winner===playoff.white)return playoff.teamWhite;
    if(winner===playoff.red)return playoff.teamRed;
    return null;
  }
  let bouts=ms.filter(x=>x.type==='kachinuki'&&x.done);
  if(!bouts.length)return null;
  let last=bouts[bouts.length-1],terminal=kachinukiTransitionState(last);
  if(terminal.whiteExhausted&&!terminal.redExhausted)return last.teamRed;
  if(terminal.redExhausted&&!terminal.whiteExhausted)return last.teamWhite;
  return null;
}
/**
 * Winning team name of a pairing, or null while undecided.
 * @param {string} div
 * @param {string} pair
 * @returns {string|null}
 */
function teamWinner(div,pair){let ms=teamPairMatches(div,pair);if(ms.some(x=>x.type==='kachinuki'))return kachinukiPairWinner(div,pair);let s=teamPairSummary(div,pair);if(s.wWins>s.rWins)return s.teamWhite;if(s.rWins>s.wWins)return s.teamRed;if(s.wPts>s.rPts)return s.teamWhite;if(s.rPts>s.wPts)return s.teamRed;return null}
/**
 * @param {Match} m
 */
function maybeAdvanceTeamBracket(m){
  if(!m || !(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'))return;
  let div=m.division, fmt=/* ksm:post-split-begin engine-settings was:teamTournamentFormat?.value */tournamentSettings().teamTournamentFormat/* ksm:post-split-end */||'Single Elimination';
  if(fmt!=='Single Elimination')return;
  syncTeamBracket(div,state.allMatches[div]||[],state.teamElimTeams?.[div]||eligibleTeams(div));
}
