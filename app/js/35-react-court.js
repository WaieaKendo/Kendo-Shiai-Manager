/* ksm:post-split-begin react-court */
// ==========================================================
// React court screen (app/react/features/court/, roadmap M.8, #136 step 2)
// The court (scorekeeper) screen is drawn only by React: app/react/features/court/main.tsx mounts
// seven islands. The legacy code still chooses the court's match and division and runs the
// actions; the module computes what is shown (app/react/features/court/publish.ts, as plain data
// in window.ksmCourtScoreboardInput, ...HeaderInput, ...ActionsInput, ...CompleteInput,
// ...QueueInput and ...ContextInput). Legacy only signals: the writers call the stubs below (or,
// in 32-, record the request themselves), which put the request on window and dispatch the event
// (ksm:court-scoreboard, -header, -actions, -complete, -queue, -context). They must not call a
// function defined in the module: this script runs before it (the module may not exist yet, or at
// all). The module computes each input on its event and, once, when it loads, for a request that
// came earlier.
// * header: updateScoreTournamentName() (22-scorekeeper-screen.js), renderDivisions()
//   (02-court-match-order.js: court title, the division select's options) and renderScore()
//   (22: division title, match line from matchDisplayMeta()) send only their own fields
//   (ksmSignalCourtHeader()), which are merged in window.ksmCourtHeaderRequested; the module
//   builds the input from the static header and those fields.
// * match display: renderScore() (22) sends the court's match (ksmSignalCourtScoreboard()).
// * score buttons and action row: the score buttons have no writer; updateUndoButton()
//   (10-court-scoring-and-history.js) sends whether Undo/Redo may be pressed
//   (ksmSignalCourtActions()). Every button calls the legacy global (point, hansoku, undo, redo,
//   openFusenDialog, nextMatch); the Fusen-gachi dialog (#fusenDialog) is a shell island
//   (app/react/shell/, app/js/44-react-shell.js).
//   A spectator and a completed division hide them through CSS only (F2 stays, ROADMAP.md).
// * queue and context panels: renderQueue() and renderContext() (32-split-court-templates.js)
//   signal (ksmCourtQueueRequested, ksmCourtContextRequested); the module makes the decisions of
//   the removed legacy renderers, and its context builder calls setCourtSupportMode() (24-, the
//   layout classes) and its queue builder enforceUniqueIndividualMatches() (it writes
//   state.allMatches and state.matches for a split single elimination) through legacy.
// * division complete: the renderScore() wrapper (32-) decides when; setCourtCompletePresentation()
//   (32-) sends {div,complete} (ksmCourtCompleteRequested) for the .division-complete class and
//   panel on #score .scoreboard-card.
// The legacy court renderer (the DOM-writing renderScore/renderQueue/renderContext and their
// HTML helpers) was removed in M.8 step 5; publish.ts mirrors its decisions, which
// tests/golden/court/*.json (recorded from it) pin.
// What stays here, and why:
// - Builders that other classic code calls (the module reads them through shared/legacy.ts):
//   ksmText, ksmBracket and ksmTeamResults (Pools view, Results modal) with the row and card
//   builders they use (ksmAlignedRow, ksmPlaceholderRow, ksmSeedPlaceholderRow,
//   ksmFutureRoundCards, ksmSingleElimRoundCard, ksmTeamStandings), ksmPoolStandingRows,
//   ksmHansokuCounts, ksmDaihyosenLabel, ksmIsRoundRobinDaihyosen (Live Scores, TV), ksmTeamSheet,
//   ksmKachinukiSheet, ksmDivisionCompleteInput and the court division list and next division
//   (ksmNextCourtDivision: 36-, 44-).
// - ksmSingleElimContext() and ksmFinalResults(): the module could move them, but they read
//   top-level `const`s (SINGLE_ELIM_CONTEXT_LAYOUTS in 24-, KSM_TEAM_PLACE_TIED in 27-), which are
//   not window properties, so the module cannot reach them.
// - The Red side and Setup actions (ksmSetCourtRedSide, ksmSetCourtTvRedSide, ksmOpenCourtSetup)
//   and the module-missing notice (the end of this file).
// If the court module does not load, the court screen shows a notice (the end of this file); the
// inputs are then never computed.
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
// D1 (owners' decision on F27): a team round robin's daihyosen bout is labelled on the court
// screen, Live Scores and the TV. It still ends with Next Match (no automatic end at the point).
// (A function, not a const: app.js publishes before this file's top level has run.)
function ksmDaihyosenLabel(){return 'Daihyosen — first point wins'}
function ksmIsRoundRobinDaihyosen(m){return !!(m&&m.roundRobinTiebreak&&m.type==='teamPlayoff')}
// Owner decision 5 (#29): a match's hansoku per side, as the court screen shows them: the live
// count for the match this device is scoring (state.score, as activeScoreArrays() reads its
// points), else the match's stored wt/rt. Live Scores and the TV show them too.
function ksmHansokuCounts(m){
  if(!m)return {W:0,R:0};
  const arr=state.allMatches?.[m.division]||[],idx=arr.indexOf(m);
  if(m.division===state.currentDivision&&idx===state.current&&!m.done)return {W:Number(state.score?.WT)||0,R:Number(state.score?.RT)||0};
  return {W:Number(m.wt)||0,R:Number(m.rt)||0};
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
// divisionCompletePanelHtml() (32-; removed in M.13, the TV was its last user) as data: esc()
// text (String(x||'')).
function ksmDivisionCompleteInput(div,complete){
  if(!complete)return {complete:false,placements:[]};
  return {complete:true,placements:resultPlacements(div).map(p=>({place:ksmText(p.place),name:ksmText(p.name),tier:ksmText(p.tier)}))};
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

// Signals (see the header). Each records its request on window and dispatches; the module
// computes the input. No function of the module is called here.
function ksmSignalCourtScoreboard(m){
  window.ksmCourtScoreboardRequested={match:m};
  window.dispatchEvent(new CustomEvent('ksm:court-scoreboard'));
}
// Cumulative: each writer sends only its own fields, merged over the earlier requests.
function ksmSignalCourtHeader(fields){
  window.ksmCourtHeaderRequested={...(window.ksmCourtHeaderRequested||{}),...fields};
  window.dispatchEvent(new CustomEvent('ksm:court-header'));
}
function ksmSignalCourtActions(actions){
  window.ksmCourtActionsRequested=actions;
  window.dispatchEvent(new CustomEvent('ksm:court-actions'));
}
// Text is what esc() showed (String(x||'')); numbers the templates printed as is are String(x).
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
// A pool's standings as the tables show them. Players tied on wins and points after the pool and
// placed by a played tiebreak show their totals with the tiebreak added and a "*"; the order stays
// the decided one, so a tiebreak total can be higher than the place above it, which the note under
// the table explains ("* Wins and points include the tiebreak. A, B and C were tied after the pool
// at 1 win, 1 pt; the tiebreak only decides their order."). Individual pools only (a team pool's
// tiebreak is not counted in these stats), once every tiebreak bout of the pool is done.
function ksmPoolStandingRows(div,poolLabel){
  const standings=poolStandings(poolLabel,div);
  const tiebreaks=(state.allMatches?.[div]||[]).filter(m=>m&&m.pool===poolLabel&&m.tiebreak);
  const played=tiebreaks.length>0&&tiebreaks.every(m=>m.done&&!isTeamMatch(m));
  const tied=row=>played&&typeof row.tbWins==='number';
  const count=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
  const groups=new Map();
  standings.filter(tied).forEach(r=>{const key=`${r.wins}/${r.pts}`;groups.set(key,[...(groups.get(key)||[]),r])});
  const list=names=>names.length<3?names.join(' and '):`${names.slice(0,-1).join(', ')} and ${names[names.length-1]}`;
  const note=groups.size?`* Wins and points include the tiebreak. ${[...groups.values()].map(g=>`${list(g.map(r=>ksmText(r.name)))} were tied after the pool at ${count(g[0].wins,'win')}, ${count(g[0].pts,'pt')}`).join('; ')}; the tiebreak only decides their order.`:'';
  return {note,rows:standings.map(row=>tied(row)
    ?{name:ksmText(row.name),dojo:ksmText(row.dojo||''),wins:String(row.wins+(row.tbWins||0)),pts:String(row.pts+(row.tbPts||0)),tiebreak:true}
    :{name:ksmText(row.name),dojo:ksmText(row.dojo||''),wins:String(row.wins),pts:String(row.pts),tiebreak:false})};
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
/* ksm:post-split-end */
/* ksm:post-split-begin react-court */
// If the court module (app/react/features/court/main.tsx, a module script after app.js) did not run, say
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
