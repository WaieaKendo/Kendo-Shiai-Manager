// ==========================================================
// KSM v3.9.1 — reusable aligned match result presentation
// ==========================================================
function alignedPointSlots(points,side){
  const values=[...(points||[])].slice(0,2);
  while(values.length<2)values.push('');
  return values.map(value=>`
    <div class="match-point ${side==='R'?'red':''} ${value?'':'empty'}">${value?esc(value):'·'}</div>
  `).join('');
}
function alignedMatchRowHtml(match,options={}){
  const white=options.white ?? (match?specificMatchSideLabel(match,'white'):'TBD');
  const red=options.red ?? (match?specificMatchSideLabel(match,'red'):'TBD');
  const wp=options.wp ?? match?.wp ?? [];
  const rp=options.rp ?? match?.rp ?? [];
  const status=options.status ?? (match?.done?'DONE':'vs');
  const current=!!options.current;
  const compact=!!options.compact;
  const extra=options.extraClass||'';
  const statusClass=String(status).toLowerCase().includes('done')?'done':
    String(status).toLowerCase().includes('await')?'awaiting':'';
  return `<div class="aligned-match-row ${current?'current':''} ${compact?'compact':''} ${extra}">
    <div class="match-name white"${current?' data-testid="current-bout-white-name"':''}>${esc(white||'TBD')}</div>
    ${alignedPointSlots(wp,'W')}
    <div class="match-status ${statusClass}">${esc(status||'vs')}</div>
    ${alignedPointSlots(rp,'R')}
    <div class="match-name red"${current?' data-testid="current-bout-red-name"':''}>${esc(red||'TBD')}</div>
  </div>`;
}
function alignedPlaceholderRowHtml(white,red,status='awaiting',compact=false){
  return alignedMatchRowHtml(null,{white,red,wp:[],rp:[],status,compact});
}



function singleElimBracketHtml(div){
  const nodes=state.singleElimNodes?.[div]||[];
  if(!nodes.length)return '<div class="muted-card">Single-elimination bracket will appear after generation.</div>';
  const rounds=[...new Set(nodes.map(node=>node.round))];
  return rounds.map(round=>`
    <div class="bracket-card">
      <div class="bracket-round">${esc(round)}</div>
      ${nodes.filter(node=>node.round===round).map(node=>{
        const match=(state.allMatches[div]||[]).find(item=>item.singleElim&&item.elimNodeId===node.id);
        if(match){
          return alignedMatchRowHtml(match,{
            status:match.done?'DONE':'vs',
            compact:true
          });
        }
        return alignedPlaceholderRowHtml(
          sideLabelGeneric(node.right,div),
          sideLabelGeneric(node.left,div),
          (!node.left||!node.right)?'BYE':'awaiting',
          true
        );
      }).join('')}
    </div>`).join('');
}


function bracketHtml(div){
  if(isTeamRoundRobinDivision(div))return teamRoundRobinStandingsHtml(div,{compact:true,includePairResults:false});
  if(state.singleElimNodes&&state.singleElimNodes[div])return singleElimBracketHtml(div);

  const labels=championshipLabels(div);
  const championship=(state.allMatches[div]||[]).filter(match=>match.championship);
  let output='';

  if(championship.length){
    const first=firstRoundName(labels.length||championship.length);
    const rounds=roundSequenceFromFirst(first);
    rounds.forEach(round=>{
      const expected=expectedRoundCount(div,round);
      if(!expected)return;
      let rows='';
      for(let index=0;index<expected;index++){
        const match=champMatchBySlot(div,round,index);
        if(match){
          rows+=alignedMatchRowHtml(match,{
            status:match.done?'DONE':'vs',
            compact:true
          });
        }else if(round===first){
          const pair=labels[index]||[];
          const redLabel=pair[0],whiteLabel=pair[1];
          const redSeed=seedNameForLabel(div,redLabel,true);
          const whiteSeed=seedNameForLabel(div,whiteLabel,true);
          rows+=alignedPlaceholderRowHtml(
            whiteSeed?whiteSeed.name:(whiteLabel||'BYE'),
            redSeed?redSeed.name:(redLabel||'TBD'),
            (String(whiteLabel).toUpperCase()==='BYE'||!whiteLabel)?'BYE':'awaiting',
            true
          );
        }else{
          const previous=previousRoundName(round);
          const redSource=sourceLabelForRound(div,previous,index*2);
          const whiteSource=sourceLabelForRound(div,previous,index*2+1);
          rows+=alignedPlaceholderRowHtml(
            whiteSource.name,
            redSource.name,
            'awaiting',
            true
          );
        }
      }
      output+=`<div class="bracket-card">
        <div class="bracket-round">${esc(round)}</div>
        ${rows}
      </div>`;
    });
    return output;
  }

  if(labels.length){
    const first=firstRoundName(labels.length);
    output+=`<div class="bracket-card">
      <div class="bracket-round">${esc(first)}</div>
      ${labels.map(pair=>{
        const redLabel=pair[0],whiteLabel=pair[1];
        const redSeed=seedNameForLabel(div,redLabel,true);
        const whiteSeed=seedNameForLabel(div,whiteLabel,true);
        return alignedPlaceholderRowHtml(
          whiteSeed?whiteSeed.name:(whiteLabel||'BYE'),
          redSeed?redSeed.name:(redLabel||'TBD'),
          (String(whiteLabel).toUpperCase()==='BYE'||!whiteLabel)?'BYE':'awaiting',
          true
        );
      }).join('')}
    </div>`;
    output+=futureRoundsHtml(nextRoundFromName(first),labels.length);
  }

  return output||'<div class="muted-card">Championship bracket will appear after pools are generated.</div>';
}

function teamRoundRobinStandingsHtml(div,options={}){
  const rows=teamStandings(div),progress=teamRoundRobinProgress(div),complete=divisionComplete(div);
  if(!rows.length)return '<div class="results-empty">No team standings are available.</div>';
  const compact=!!options.compact;
  const tiedByName=rows.some(row=>row.nameFallback);
  const table=`<div class="team-standings-table ${compact?'compact':''}">
    <div class="team-standings-row header"><span>Rank</span><span>Team</span><span>Team W-L</span><span>Bout W</span><span>Pts</span></div>
    ${rows.map(row=>`<div class="team-standings-row"><b>${row.rank}</b><span><b>${esc(row.name)}</b>${row.nameFallback?'<small>Name fallback</small>':''}</span><b>${row.wins}-${row.losses}</b><b>${row.matchWins}</b><b>${row.pts}</b></div>`).join('')}
  </div>`;
  const note=tiedByName?'<div class="small team-standings-note">Teams tied on team wins and aggregate points are ordered alphabetically, per the tournament specification.</div>':'';
  const status=`<div class="small team-standings-status">${complete?'Final standings':`Current standings • ${progress.complete} of ${progress.total} team pairings complete`}</div>`;
  if(options.includePairResults===false)return status+table+note;
  const pairs=teamPairIds(div).map(pair=>{
    const summary=teamPairSummary(div,pair),resolved=teamRoundRobinPairResolved(div,pair),winner=resolved?teamWinner(div,pair):'';
    return `<section class="results-team-round"><h3>${esc(summary.teamWhite)} vs ${esc(summary.teamRed)}</h3>${alignedMatchRowHtml(null,{white:summary.teamWhite,red:summary.teamRed,wp:[String(summary.wWins),String(summary.wPts)],rp:[String(summary.rWins),String(summary.rPts)],status:resolved?`Winner: ${winner}`:`${summary.done}/${summary.total}`,compact:true})}</section>`;
  }).join('');
  return `${status}${table}${note}<div class="results-team-bracket team-round-robin-pairs"><h2>Team Pair Results</h2>${pairs}</div>`;
}


