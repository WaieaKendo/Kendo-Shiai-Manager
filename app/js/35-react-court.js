/* ksm:post-split-begin react-court */
// ==========================================================
// React court screen (app/react/court/, roadmap M.8)
// The court (scorekeeper) screen is drawn only by React: app/react/court/main.tsx mounts seven
// islands. The legacy code still chooses the court's match and division, computes what is
// shown and runs the actions; its writers publish plain data (a window property plus an event)
// that the islands render:
// * header: updateScoreTournamentName() (22-scorekeeper-screen.js), renderDivisions()
//   (02-court-match-order.js: court title, the division select's options) and renderScore()
//   (22: division title, match line from matchDisplayMeta()) publish their own fields
//   (ksm:court-header, window.ksmCourtHeaderInput); the header starts from the static markup.
// * match display: renderScore() (22) publishes the court's match, points, hansoku and the
//   team-playoff representatives (ksm:court-scoreboard).
// * score buttons and action row: the score buttons have no writer; updateUndoButton()
//   (10-court-scoring-and-history.js) publishes whether Undo/Redo may be pressed
//   (ksm:court-actions). Every button calls the legacy global (point, hansoku, undo, redo,
//   openFusenDialog, nextMatch); the Fusen-gachi dialog (#fusenDialog) is a shell island
//   (app/react/shell/, app/js/44-react-shell.js).
//   A spectator and a completed division hide them through CSS only (F2 stays, ROADMAP.md).
// * queue and context panels: renderQueue() and renderContext() (32-split-court-templates.js)
//   publish ksmQueuePanelInput() / ksmContextPanelInput() below (ksm:court-queue,
//   ksm:court-context); setCourtSupportMode() (24-) still sets the layout classes around them.
// * division complete: the renderScore() wrapper (32-) decides when; setCourtCompletePresentation()
//   (32-) publishes the placements (ksm:court-complete) for the .division-complete class and
//   panel on #score .scoreboard-card.
// The legacy court renderer (the DOM-writing renderScore/renderQueue/renderContext and their
// HTML helpers) was removed in M.8 step 5; the functions below mirror its decisions, which
// tests/golden/court/*.json (recorded from it) pin. HTML helpers that other screens share
// went with the screens' legacy renderers (divisionCompletePanelHtml() with the TV's, bracketHtml() and
// its helpers with the Pools view's, M.13).
// If the court module
// does not load, the court screen shows a notice (the end of this file).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
// D1 (owners' decision on F27): a team round robin's daihyosen bout is labelled on the court
// screen, Live Scores and the TV. It still ends with Next Match (no automatic end at the point).
// (A function, not a const: app.js publishes before this file's top level has run.)
function ksmDaihyosenLabel(){return 'Daihyosen — first point wins'}
function ksmIsRoundRobinDaihyosen(m){return !!(m&&m.roundRobinTiebreak&&m.type==='teamPlayoff')}
function ksmScoreboardInput(m){
  if(!m)return {match:null,score:{W:[],R:[],WT:0,RT:0},representatives:null};
  const s=state.score||{};
  const score={W:[...(s.W||[])],R:[...(s.R||[])],WT:s.WT||0,RT:s.RT||0};
  const match={white:m.white,red:m.red,wdojo:m.wdojo,rdojo:m.rdojo,teamWhite:m.teamWhite,teamRed:m.teamRed,type:m.type,
    ...(ksmIsRoundRobinDaihyosen(m)?{rule:ksmDaihyosenLabel()}:{}),requiresWinner:!!matchRequiresWinner(m)};
  if(m.type!=='teamPlayoff')return {match,score,representatives:null};
  // As repSelect(): the roster and permission come from the match at state.current.
  const current=state.matches[state.current],playoff=current&&current.type==='teamPlayoff';
  const rep=(side,team,name)=>({team:team||'',current:name||'',roster:[...teamRoster(playoff?(side==='W'?current.teamWhite:current.teamRed):team,m.division)],editable:Boolean(canModifyRepresentative(current))});
  return {match,score,representatives:{W:rep('W',m.teamWhite,m.white),R:rep('R',m.teamRed,m.red)}};
}
// Owner decision 5 (#29): a match's hansoku per side, as the court screen shows them: the live
// count for the match this device is scoring (state.score, as activeScoreArrays() reads its
// points), else the match's stored wt/rt. Live Scores and the TV show them too.
function ksmHansokuCounts(m){
  if(!m)return {W:0,R:0};
  const arr=state.allMatches?.[m.division]||[],idx=arr.indexOf(m);
  if(m.division===state.currentDivision&&idx===state.current&&!m.done)return {W:Number(state.score?.WT)||0,R:Number(state.score?.RT)||0};
  return {W:Number(m.wt)||0,R:Number(m.rt)||0};
}
function ksmPublishCourtScoreboard(m){
  window.ksmCourtScoreboardInput=ksmScoreboardInput(m);
  window.dispatchEvent(new CustomEvent('ksm:court-scoreboard'));
}
// The static header markup (app/index.html), which the first publish starts from: each writer
// publishes only its own fields (a completed division keeps the last match line).
// (A function, not a const: app.js publishes before this file's top level has run.)
function ksmStaticCourtHeader(){return {tournamentName:'Kendo Tournament',court:'A',divisions:[],currentDivision:'',divisionTitle:'—',matchLine:'No active match'}}
function ksmPublishCourtHeader(fields){
  if(fields.divisionTitle)fields.divisionTitle=ksmDivisionName(fields.divisionTitle);
  if(fields.divisions)fields.divisionNames=Object.fromEntries(fields.divisions.map(id=>[id,ksmDivisionName(id)]));
  window.ksmCourtHeaderInput={...(window.ksmCourtHeaderInput||ksmStaticCourtHeader()),...fields,timerSound:ksmNormalizeTimerSettings(getSetupSnapshot())[normalizeCourt(state.currentCourt)==='B'?'court2TimerSound':'court1TimerSound'],timerEnabled:ksmNormalizeTimerSettings(getSetupSnapshot())[normalizeCourt(state.currentCourt)==='B'?'court2TimerEnabled':'court1TimerEnabled']!=='Off',tvRedLeft:document.getElementById(normalizeCourt(state.currentCourt)==='B'?'court2TvRedSide':'court1TvRedSide')?.value==='left'};
  window.dispatchEvent(new CustomEvent('ksm:court-header'));
}
// #38 "Configure court": set this court's Red side by editing Setup's field (Court A/B — Red side), so
// it saves and syncs exactly like a Setup edit (the field's own onchange, and the document's change
// listener that schedules the autosave).
function ksmSetCourtRedSide(side){
  const el=document.getElementById(normalizeCourt(state.currentCourt)==='B'?'court2RedSide':'court1RedSide');
  if(!el||el.value===side||(side!=='left'&&side!=='right'))return;
  el.value=side;
  el.dispatchEvent(new Event('change',{bubbles:true}));
}
// #40: the audience setting uses the same Setup change path, independently of the table.
function ksmSetCourtTvRedSide(side){
  const el=document.getElementById(normalizeCourt(state.currentCourt)==='B'?'court2TvRedSide':'court1TvRedSide');
  if(!el||el.value===side||(side!=='left'&&side!=='right'))return;
  el.value=side;
  el.dispatchEvent(new Event('change',{bubbles:true}));
}
// "More court settings in Setup": Setup, scrolled to this court's Red side field.
function ksmOpenCourtSetup(){
  navigateTo('setup');
  const el=document.getElementById(normalizeCourt(state.currentCourt)==='B'?'court2RedSide':'court1RedSide');
  if(el){el.scrollIntoView({block:'center'});el.focus()}
}
function ksmPublishCourtActions(actions){
  window.ksmCourtActionsInput=actions;
  window.dispatchEvent(new CustomEvent('ksm:court-actions'));
}
// divisionCompletePanelHtml() (32-; removed in M.13, the TV was its last user) as data: esc()
// text (String(x||'')).
function ksmDivisionCompleteInput(div,complete){
  if(!complete)return {complete:false,placements:[]};
  return {complete:true,placements:resultPlacements(div).map(p=>({place:ksmText(p.place),name:ksmText(p.name),tier:ksmText(p.tier)}))};
}
// setCourtCompletePresentation() (32-): the court screen's division-complete panel. Owner decision 7
// and issue #31: a completed division's panel also gets the court, the division and the division
// to continue to (ksmNextCourtDivision()), for the box "<Division> is complete ..." with
// [Continue to <next> →] / [Keep showing results]; its buttons call selectScorekeeperDivision()
// (08-), the court dropdown's action, so the TV and Live Scores follow (no new shared state).
function ksmPublishCourtComplete(input){
  if(input&&input.complete){
    const court=state.currentCourt||'A',division=state.currentDivision||'';
    const name=ksmDivisionName(division),next=division?ksmNextCourtDivision(court,division):null,nextName=next?ksmDivisionName(next):null;
    input={...input,court:ksmText(court),division:ksmText(name),next,
      ...(name!==division?{divisionId:division}:{}),...(next&&nextName!==next?{nextName}:{})};
  }
  window.ksmCourtCompleteInput=input;
  window.dispatchEvent(new CustomEvent('ksm:court-complete'));
}
// Issue #31: a court's division list in Setup's running order, filtered to the court: the court
// dropdown's options (renderDivisions(), 02-: state.divisions, then any other generated division
// such as the team event; the divisions on this court, split ones and a team event on both).
function ksmCourtDivisionList(court){
  const all=[...new Set([...state.divisions,...ksmTeamDivisions().filter(d=>state.allMatches?.[d.id]).map(d=>d.id),...Object.keys(state.allMatches||{})])].filter(Boolean);
  return all.filter(d=>{const c=state.divisionCourts[d]||'A';return c===court||c==='split'||(isTeamDivision(d)&&(state.divisionCourts[d]||'Both')==='Both')});
}
// A division has a match ready to play on the court (as findNextForCourt() picks one): generated,
// not finished, and not waiting for the other court.
function ksmDivisionReadyOnCourt(d,court){
  return (state.allMatches?.[d]||[]).some(m=>isValidMatchObject(m)&&individualMatchReady(m)&&matchBelongsToCourt(m,court));
}
// Owner decision 7 / #31: the division a court continues to after `current`: the next one in the
// court's list that has a match ready on the court (after `current`, then from the top), or null.
function ksmNextCourtDivision(court,current){
  const list=ksmCourtDivisionList(court),i=list.indexOf(current);
  const order=i<0?list:[...list.slice(i+1),...list.slice(0,i)];
  return order.find(d=>d!==current&&ksmDivisionReadyOnCourt(d,court))||null;
}

// ---------- Queue and context panels ----------
// ksmQueuePanelInput() and ksmContextPanelInput() make the decisions of the removed legacy
// queue/context renderers and read the same data (engine bridges: poolStandings,
// teamPairSummary, teamStandings, seedNameForLabel, sourceLabelForRound, ...), and publish it as
// plain data (ksm:court-queue, ksm:court-context). The comments name the legacy function each
// part mirrors ("(removed)": deleted with the legacy court, Live Scores, TV or Results renderer
// (M.8, M.13), bracketHtml() and its helpers with the legacy Pools renderer (M.13)).
// Text is what esc() showed (String(x||'')); numbers the templates printed as is are String(x).
function ksmPublishCourtQueue(input){
  window.ksmCourtQueueInput=input;
  window.dispatchEvent(new CustomEvent('ksm:court-queue'));
}
function ksmPublishCourtContext(input){
  window.ksmCourtContextInput=input;
  window.dispatchEvent(new CustomEvent('ksm:court-context'));
}
function ksmText(s){return String(s||'')}
// alignedMatchRowHtml(match,options) (28-, removed) with its option defaults resolved.
function ksmAlignedRow(match,options={}){
  const white=options.white ?? (match?specificMatchSideLabel(match,'white'):'TBD');
  const red=options.red ?? (match?specificMatchSideLabel(match,'red'):'TBD');
  const wp=options.wp ?? match?.wp ?? [];
  const rp=options.rp ?? match?.rp ?? [];
  const status=options.status ?? (match?.done?'DONE':'vs');
  const slots=points=>[...(points||[])].slice(0,2).map(v=>v?String(v):'');
  return {kind:'aligned',white:ksmText(white),red:ksmText(red),wp:slots(wp),rp:slots(rp),status:ksmText(status),current:!!options.current,compact:!!options.compact};
}
// alignedPlaceholderRowHtml() (28-, removed).
function ksmPlaceholderRow(white,red,status='awaiting',compact=false){return ksmAlignedRow(null,{white,red,wp:[],rp:[],status,compact})}
// A first-round championship slot before its match exists (bracketHtml(), 28-, removed).
function ksmSeedPlaceholderRow(div,pair){
  const redLabel=pair[0],whiteLabel=pair[1];
  const redSeed=seedNameForLabel(div,redLabel,true),whiteSeed=seedNameForLabel(div,whiteLabel,true);
  return ksmPlaceholderRow(whiteSeed?whiteSeed.name:(whiteLabel||'BYE'),redSeed?redSeed.name:(redLabel||'TBD'),
    (String(whiteLabel).toUpperCase()==='BYE'||!whiteLabel)?'BYE':'awaiting',true);
}
// futureRoundsHtml() (14-, removed): placeholder rounds after a first round that has no matches yet.
function ksmFutureRoundCards(startRound,matchCount){
  const cards=[];let round=startRound,count=matchCount;
  while(round&&count>=1){
    const prev=previousRoundName(round)||'Previous Round',nextCount=Math.ceil(count/2),rows=[];
    for(let i=1;i<=nextCount;i++){
      const red=`Winner of ${prev} Match ${2*i-1}`,white=(2*i<=count)?`Winner of ${prev} Match ${2*i}`:'Bye';
      rows.push({kind:'bracket-match',white,red,status:white==='Bye'?'BYE':'vs'});
    }
    cards.push({round:ksmText(round),rows});
    if(round==='Final')break;
    round=nextRoundFromName(round);count=nextCount;
  }
  return cards;
}
// singleElimRoundCardHtml() (24-/28-, removed); null for a round without nodes.
function ksmSingleElimRoundCard(div,round){
  const nodes=(state.singleElimNodes?.[div]||[]).filter(node=>node.round===round);
  if(!nodes.length)return null;
  return {round:ksmText(round),rows:nodes.map(node=>{
    const match=(state.allMatches?.[div]||[]).find(item=>item.singleElim&&item.elimNodeId===node.id);
    if(match)return ksmAlignedRow(match,{status:match.done?'DONE':'vs',compact:true});
    return ksmPlaceholderRow(sideLabelGeneric(node.right,div),sideLabelGeneric(node.left,div),(!node.left||!node.right)?'BYE':'awaiting',true);
  })};
}
// teamRoundRobinStandingsHtml() (28-, removed).
function ksmTeamStandings(div,options={}){
  const rows=teamStandings(div),progress=teamRoundRobinProgress(div),complete=divisionComplete(div);
  if(!rows.length)return {kind:'results-empty',text:'No team standings are available.'};
  const standings={complete:!!complete,progress:{complete:progress.complete,total:progress.total},compact:!!options.compact,
    rows:rows.map(row=>({rank:String(row.rank),name:ksmText(row.name),nameFallback:!!row.nameFallback,record:`${row.wins}-${row.losses}`,matchWins:String(row.matchWins),pts:String(row.pts)})),
    pairs:null};
  if(options.includePairResults!==false)standings.pairs=teamPairIds(div).map(pair=>{
    const summary=teamPairSummary(div,pair),resolved=teamRoundRobinPairResolved(div,pair),winner=resolved?teamWinner(div,pair):'';
    return {title:`${ksmText(summary.teamWhite)} vs ${ksmText(summary.teamRed)}`,row:ksmAlignedRow(null,{white:summary.teamWhite,red:summary.teamRed,
      wp:[String(summary.wWins),String(summary.wPts)],rp:[String(summary.rWins),String(summary.rPts)],status:resolved?`Winner: ${winner}`:`${summary.done}/${summary.total}`,compact:true})};
  });
  return {kind:'team-standings',standings};
}
// bracketHtml() (28-, removed in M.13: the Pools view was its last user); also the Pools view's
// Championship Preview / Team Standings (41-react-pools.js) and the Results modal.
function ksmBracket(div){
  if(isTeamRoundRobinDivision(div))return ksmTeamStandings(div,{compact:true,includePairResults:false});
  if(state.singleElimNodes&&state.singleElimNodes[div]){
    // singleElimBracketHtml() (28-, removed)
    const nodes=state.singleElimNodes?.[div]||[];
    if(!nodes.length)return {kind:'message',text:'Single-elimination bracket will appear after generation.'};
    return {kind:'cards',cards:[...new Set(nodes.map(node=>node.round))].map(round=>ksmSingleElimRoundCard(div,round))};
  }
  const labels=championshipLabels(div);
  const championship=(state.allMatches[div]||[]).filter(match=>match.championship);
  if(championship.length){
    const first=firstRoundName(labels.length||championship.length),cards=[];
    roundSequenceFromFirst(first).forEach(round=>{
      const expected=expectedRoundCount(div,round);
      if(!expected)return;
      const rows=[];
      for(let index=0;index<expected;index++){
        const match=champMatchBySlot(div,round,index);
        if(match)rows.push(ksmAlignedRow(match,{status:match.done?'DONE':'vs',compact:true}));
        else if(round===first)rows.push(ksmSeedPlaceholderRow(div,labels[index]||[]));
        else{
          const previous=previousRoundName(round);
          const redSource=sourceLabelForRound(div,previous,index*2),whiteSource=sourceLabelForRound(div,previous,index*2+1);
          rows.push(ksmPlaceholderRow(whiteSource.name,redSource.name,'awaiting',true));
        }
      }
      cards.push({round:ksmText(round),rows});
    });
    return {kind:'cards',cards};
  }
  if(labels.length){
    const first=firstRoundName(labels.length);
    return {kind:'cards',cards:[{round:ksmText(first),rows:labels.map(pair=>ksmSeedPlaceholderRow(div,pair))},...ksmFutureRoundCards(nextRoundFromName(first),labels.length)]};
  }
  // A round robin of 3-5 (one pool, no championship) has no bracket to wait for (quirk pass).
  if(isPoolOnlyDivision(div))return {kind:'message',text:'No championship bracket: places come from the pool standings.'};
  return {kind:'message',text:'Championship bracket will appear after pools are generated.'};
}
// teamResultsBracketHtml() (28-, removed in M.13: the Results modal was its last user).
function ksmTeamResults(div){
  if(isTeamRoundRobinDivision(div))return ksmTeamStandings(div,{includePairResults:true});
  const nodes=state.teamBracketNodes?.[div]||[];
  if(!nodes.length)return {kind:'results-empty',text:'No team bracket is available.'};
  const all=state.allMatches?.[div]||[];
  return {kind:'team-bracket',rounds:[...new Set(nodes.map(node=>node.round))].map(round=>({round:ksmText(round),rows:nodes.filter(node=>node.round===round).map(node=>{
    const matches=all.filter(match=>match.teamNodeId===node.id),completed=matches.filter(match=>match.done),first=matches[0];
    const white=first?.teamWhite||teamSideLabel(node.right,div),red=first?.teamRed||teamSideLabel(node.left,div);
    if(completed.length){
      const summary=teamPairSummary(div,first.teamPair);
      return ksmAlignedRow(null,{white,red,wp:[String(summary.wWins),String(summary.wPts)],rp:[String(summary.rWins),String(summary.rPts)],status:'DONE',compact:true});
    }
    return ksmPlaceholderRow(white,red,node.winner?'DONE':'awaiting',true);
  })}))};
}
// poolResultCardHtml() (29-/31-, removed).
function ksmPoolCard(div,pool,options={}){
  const standings=poolStandings(pool.label,div);
  const matches=(state.allMatches?.[div]||[]).filter(match=>match.pool===pool.label&&!match.championship);
  const complete=options.completed??poolDisplayComplete(div,pool.label);
  return {label:ksmText(pool.label),active:!!options.active,complete:!!complete,
    standings:standings.map(row=>({name:ksmText(row.name),dojo:ksmText(row.dojo),wins:String(row.wins),pts:String(row.pts)})),
    matches:matches.map(match=>ksmAlignedRow(match,{status:match.done?'DONE':(match.tiebreak?'TIEBREAK':'vs'),compact:true,current:!!options.currentMatch&&match===options.currentMatch}))};
}
// orderedPoolContextHtml() (31-, removed).
function ksmPoolContext(div,currentMatch){
  const pools=[...(state.pools?.[div]||[])].sort((a,b)=>String(a.label).localeCompare(String(b.label)));
  const incomplete=pools.filter(pool=>!poolDisplayComplete(div,pool.label));
  const completed=pools.filter(pool=>poolDisplayComplete(div,pool.label));
  const currentLabel=currentMatch&&!currentMatch.championship?currentMatch.pool:null;
  const inProgress=incomplete.map(pool=>ksmPoolCard(div,pool,{active:pool.label===currentLabel,currentMatch}));
  const done=completed.map(pool=>ksmPoolCard(div,pool,{completed:true}));
  return {kind:'pools',inProgress,bracket:ksmBracket(div),completed:done};
}
// renderSingleElimContext() (the 32- wrapper around 24-, removed).
function ksmSingleElimContext(div){
  if(divisionCourtMode(div)==='split'){
    // splitTemplateContextHtml() (32-, removed)
    const nodes=state.singleElimNodes?.[div]||[];
    if(!nodes.length)return {kind:'message',text:'Single-elimination bracket will appear after generation.'};
    return {kind:'split-single-elim',cards:[...new Set(nodes.map(n=>n.round))].map(round=>ksmSingleElimRoundCard(div,round)).filter(Boolean)};
  }
  const count=(state.singleElimComps?.[div]||[]).length;
  const layout=SINGLE_ELIM_CONTEXT_LAYOUTS[count]||SINGLE_ELIM_CONTEXT_LAYOUTS[32];
  const cards=rounds=>(rounds||[]).map(round=>ksmSingleElimRoundCard(div,round)).filter(Boolean);
  return {kind:'single-elim',left:cards(layout.left),right:cards(layout.right)};
}
// teamSheetHtml() (11-/28-, removed in M.13).
function ksmTeamSheet(div,pair,currentMatch){
  const matches=(state.allMatches[div]||[]).filter(m=>m.teamPair===pair&&(m.type==='teamPosition'||m.type==='teamPlayoff'));
  const first=matches[0]||{},s=teamPairSummary(div,pair);
  return {teamWhite:ksmText(first.teamWhite||'White Team'),teamRed:ksmText(first.teamRed||'Red Team'),
    rows:matches.map(match=>{
      const pts=activeScoreArrays(match);
      const status=match===currentMatch?'NOW':(match.done?'DONE':(match.position||'vs'));
      return ksmAlignedRow(match,{wp:pts.W,rp:pts.R,status,current:match===currentMatch});
    }),
    totals:{wWins:String(s.wWins),wPts:String(s.wPts),rWins:String(s.rWins),rPts:String(s.rPts)}};
}
// kachinukiSheetHtml() (16-/28-, removed in M.13).
function ksmKachinukiSheet(m){
  const pts=activeScoreArrays(m);
  const side=(lineup,index)=>({lineup:(lineup||[]).map(ksmText),index:index??null});
  return {teamWhite:ksmText(m.teamWhite),teamRed:ksmText(m.teamRed),current:ksmAlignedRow(m,{wp:pts.W,rp:pts.R,status:'NOW',current:true}),
    white:side(m.lineupW,m.wIndex),red:side(m.lineupR,m.rIndex)};
}
// renderContext() as the legacy renderer drew it (removed): the 32- wrapper, then renderContext()
// (31-) for a match on this court or persistentContextHtml() (32-) otherwise, calling
// setCourtSupportMode() as they did.
// (31- also computes an unused teamPairSummary() for a team match; left out.)
function ksmContextPanelInput(){
  const m=state.matches?.[state.current];
  if(m&&matchBelongsToCourt(m,state.currentCourt||'A')){
    if(m.type==='teamPosition'||m.type==='teamPlayoff'||m.type==='kachinuki'){
      setCourtSupportMode('standard');
      if(m.type==='kachinuki')return {kind:'kachinuki',sheet:ksmKachinukiSheet(m)};
      return {kind:'team-sheet',sheet:ksmTeamSheet(m.division,m.teamPair,m)};
    }
    if(m.singleElim||(m.championship&&m.pool==='Championship'&&!(state.pools[m.division]||[]).length)){
      setCourtSupportMode('singleElim');return ksmSingleElimContext(m.division);
    }
    setCourtSupportMode('standard');
    return ksmPoolContext(m.division,m);
  }
  const div=contextDivisionForCourt();
  setCourtSupportMode((state.singleElimNodes?.[div]||[]).length?'singleElim':'standard');
  if(!div)return {kind:'message',text:'No division selected.'};
  if((state.singleElimNodes?.[div]||[]).length)return ksmSingleElimContext(div);
  if((state.pools?.[div]||[]).length)return ksmPoolContext(div,null);
  if(isTeamDivision(div))return {kind:'bracket',bracket:ksmTeamResults(div)};
  return {kind:'bracket',bracket:ksmBracket(div)};
}
// finalResultsHtml() (11-, removed) as data; null where it returned ''.
function ksmFinalResults(div){
  if(isTeamDivision(div)){
    if(!divisionComplete(div))return null;
    // teamFinalResultsHtml() (09-, removed in M.13)
    const p=teamFinalPlacements(div);
    if(!p)return {kind:'results',results:null};
    // External PR review (#35): a place with an award still level is never named alphabetically.
    const tied=new Set(p.undecided||[]),named=(place,name)=>ksmText(tied.has(place)?KSM_TEAM_PLACE_TIED:name);
    const mode=ksmTeamSettings(div).teamAwardMode||'top2',lines=[{place:'🥇 1st',name:named(1,p.first)}];
    if(mode!=='top1'&&(p.second||tied.has(2)))lines.push({place:'🥈 2nd',name:named(2,p.second)});
    if(mode==='dual3')(tied.has(3)?[KSM_TEAM_PLACE_TIED]:(p.thirds||[])).forEach(t=>lines.push({place:'🥉 3rd',name:ksmText(t)}));
    return {kind:'results',results:{title:'Team Results',lines}};
  }
  // #86: a grand champion shows its awards (Results' placements), for a bracket or a pool of winners.
  if(ksmGrandChampion(div)){
    if(!divisionComplete(div))return null;
    return {kind:'results',results:{title:ksmText(ksmDivisionName(div)),lines:resultPlacements(div).map(p=>({place:ksmText(p.place),name:ksmText(p.name)}))}};
  }
  const final=(state.allMatches[div]||[]).find(m=>m.championship&&m.position==='Final'&&m.done);
  if(!final)return null;
  const first=winnerOf(final),second=first===final.red?final.white:final.red;
  const semi=(state.allMatches[div]||[]).filter(m=>m.championship&&m.position==='Semifinal'&&m.done);
  const thirds=semi.map(m=>{const w=winnerOf(m);return w===m.red?m.white:m.red}).filter(Boolean);
  return {kind:'results',results:{title:'Final Results',lines:[{place:'1st',name:ksmText(first)},{place:'2nd',name:ksmText(second)},...thirds.map(t=>({place:'3rd',name:ksmText(t)}))]}};
}
// renderGroupedQueueRow(m) (24-, removed).
function ksmQueueRow(m){
  return {kind:'queue',team:false,placeholder:false,tiebreak:!!m.tiebreak,
    white:{name:ksmText(specificMatchSideLabel(m,'white')),detail:ksmText(m.wdojo||m.teamWhite||'')},
    red:{name:ksmText(specificMatchSideLabel(m,'red')),detail:ksmText(m.rdojo||m.teamRed||'')},
    center:'vs',round:ksmText(m.position||m.pool||'Match')};
}
function ksmQueuePlaceholder(white,red,center,round,team=false){
  return {kind:'queue',team,placeholder:true,tiebreak:false,white:{name:ksmText(white),detail:null},red:{name:ksmText(red),detail:null},center,round:ksmText(round)};
}
// Rows into groups by label, in order of first appearance.
function ksmQueueGroups(){
  const groups=[];
  return {groups,add(label,row){let g=groups.find(x=>x.label===label);if(!g){g={label,rows:[]};groups.push(g)}g.rows.push(row)}};
}
// poolChampionshipQueueGroups() (24-, removed).
function ksmChampionshipQueueGroups(div,court){
  const labels=championshipLabels(div);
  if(!labels.length)return [];
  const first=firstRoundName(labels.length),out=ksmQueueGroups();
  roundSequenceFromFirst(first).forEach(round=>{
    const expected=expectedRoundCount(div,round);
    if(!expected)return;
    for(let i=0;i<expected;i++){
      if(championshipCourtFor(div,round,i,expected)!==court)continue;
      const m=champMatchBySlot(div,round,i);
      if(m&&m.done)continue;
      if(m){if(matchBelongsToCourt(m,court))out.add(round,ksmQueueRow(m));continue;}
      if(round===first){
        const pair=labels[i]||[],rLabel=pair[0],wLabel=pair[1];
        const r=seedNameForLabel(div,rLabel,true),w=seedNameForLabel(div,wLabel,true);
        out.add(round,ksmQueuePlaceholder(w?w.name:(wLabel||'BYE'),r?r.name:(rLabel||'TBD'),(String(wLabel).toUpperCase()==='BYE'||!wLabel)?'BYE':'awaiting',round));
      }else{
        const prev=previousRoundName(round),red=sourceLabelForRound(div,prev,i*2),white=sourceLabelForRound(div,prev,i*2+1);
        out.add(round,ksmQueuePlaceholder(white.name||'TBD',red.name||'TBD','awaiting',round));
      }
    }
  });
  return out.groups;
}
// teamQueueGroups() (24-, removed): one row per pairing, grouped by the normalized round.
function ksmTeamQueueGroups(div,court,current){
  const all=sortTeamMatches(div),currentPair=current?.teamPair||null,seenPairs=new Set(),out=ksmQueueGroups();
  const add=(label,row)=>out.add(normalizeQueueGroupLabel(label||'Team Match'),row);
  all.forEach(m=>{
    if(!isTeamMatch(m)||m.done||!matchBelongsToCourt(m,court))return;
    const pair=m.teamPair||`${m.teamWhite}|${m.teamRed}|${m.pool||m.position||''}`;
    if(pair===currentPair||seenPairs.has(pair))return;
    seenPairs.add(pair);
    const node=(state.teamBracketNodes?.[div]||[]).find(n=>n.id===m.teamNodeId);
    const round=node?.round||m.pool||m.position||'Team Match';
    add(round,{kind:'queue',team:true,placeholder:false,tiebreak:!!m.tiebreak,white:{name:ksmText(m.teamWhite||m.wdojo||'TBD'),detail:null},
      red:{name:ksmText(m.teamRed||m.rdojo||'TBD'),detail:null},center:'vs',round:ksmText(round)});
  });
  (state.teamBracketNodes?.[div]||[]).forEach(node=>{
    if(node.winner||node.court!==court)return;
    const pair=nodePairId(node);
    if(pair===currentPair||seenPairs.has(pair))return;
    if(all.find(m=>isTeamMatch(m)&&m.teamNodeId===node.id&&!m.done))return;
    seenPairs.add(pair);
    add(node.round,ksmQueuePlaceholder(teamSideLabel(node.right,div),teamSideLabel(node.left,div),'awaiting',node.round,true));
  });
  return out.groups;
}
// renderQueue() as the legacy renderer drew it (removed): the 32- wrapper (a split single
// elimination: canonicalSingleElimQueue()), then renderQueue() (the last declaration, 24-).
function ksmQueuePanelInput(){
  const div=state.currentDivision,court=state.currentCourt||'A';
  if(!div)return {kind:'empty'};
  if(divisionComplete(div))return {kind:'empty'};
  const groupsOr=(groups,fallback)=>groups.length?{kind:'groups',groups}:fallback;
  if((state.singleElimNodes?.[div]||[]).length&&divisionCourtMode(div)==='split'){
    const current=state.matches?.[state.current]||null;
    const nodes=state.singleElimNodes?.[div]||[],arr=enforceUniqueIndividualMatches(div),out=ksmQueueGroups();
    nodes.forEach(node=>{
      const nodeCourt=divisionCourtMode(div)==='split'?(node.round==='Final'?'A':node.court):(state.divisionCourts?.[div]||'A');
      if(nodeCourt!==court)return;
      const m=arr.find(x=>x.singleElim&&x.elimNodeId===node.id);
      if(m?.done||m===current||node.winner)return;
      if(m&&m.ready)out.add(node.round,ksmQueueRow(m));
      else out.add(node.round,ksmPlaceholderRow(sideLabelGeneric(node.right,div),sideLabelGeneric(node.left,div),(!node.left||!node.right)?'BYE':'awaiting',true));
    });
    return groupsOr(out.groups.map(g=>({label:ksmText(g.label),rows:g.rows})),{kind:'empty'});
  }
  const current=state.matches?.[state.current]||null;
  const all=state.allMatches?.[div]||[];
  const done=ksmFinalResults(div);
  const doneOr=text=>done||{kind:'message',text};
  if((current?.singleElim||(current?.championship&&current?.pool==='Championship'&&!(state.pools?.[div]||[]).length))&&divisionCourtMode(div)!=='split')return {kind:'empty'};
  if(eliminationFinalDone(div))return doneOr('Division complete.');
  if(all.some(m=>m.singleElim)&&divisionCourtMode(div)==='split'){
    const out=ksmQueueGroups();
    dedupeSingleElimMatches(div).filter(m=>!m.done&&matchBelongsToCourt(m,court)&&m!==current)
      .forEach(m=>out.add(normalizeQueueGroupLabel(m.position||'Championship'),ksmQueueRow(m)));
    return groupsOr(out.groups,doneOr('Queue complete.'));
  }
  if(all.some(isTeamMatch))return groupsOr(ksmTeamQueueGroups(div,court,current),doneOr('Queue complete.'));
  // Pool play: the pool matches after the current one, then every future championship round.
  const currentIndex=all.indexOf(current),out=ksmQueueGroups();
  all.filter((m,i)=>!m.done&&!m.championship&&matchBelongsToCourt(m,court)&&m!==current&&(currentIndex<0||i>currentIndex))
    .forEach(m=>out.add(`Pool ${m.pool||'A'}`,ksmQueueRow(m)));
  return groupsOr([...out.groups,...ksmChampionshipQueueGroups(div,court)],doneOr('Queue complete.'));
}

// If the court module (app/react/court/main.tsx, a module script after app.js) did not run, say
// so on the court screen instead of the static markup, which nothing updates any more (e.g. an
// offline device whose cached copy lacks the module). Module scripts run before
// DOMContentLoaded, so a working page never shows this.
function ksmShowCourtModuleMissing(){
  if(window.ksmCourtScreenMounted)return;
  const shell=document.querySelector('#score .scorekeeper-shell');
  if(!shell||document.getElementById('courtModuleMissing'))return;
  const notice=document.createElement('div');
  notice.id='courtModuleMissing';notice.className='card';notice.setAttribute('role','alert');notice.setAttribute('data-testid','court-module-missing');
  notice.innerHTML='<h1>Court screen could not load</h1><p class="sub">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</p>';
  shell.style.display='none';
  shell.before(notice);
}
document.addEventListener('DOMContentLoaded',ksmShowCourtModuleMissing);
/* ksm:post-split-end */
