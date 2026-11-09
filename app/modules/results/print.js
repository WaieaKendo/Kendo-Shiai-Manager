// @ts-check
import {firstRoundName,nextRoundFromName} from '../engine/engine-championship.js';
import {poolPlayerSlot} from '../engine/engine-pools.js';
import {slotLabel} from '../engine/engine-team-matches.js';
import {esc} from '../html-text.js';
import {KSM_TEAM_PLACE_TIED} from './results-screen.js';
import {tournamentPayload} from '../sync/cloud-session-and-autosave.js';
// One renderer for Setup and Library exports. Its input is a snapshot, never the live app.
// Shadow only the read dependencies of the original print operations; no payload application,
// session, storage, navigation or socket operations occur in this renderer.
export function ksmPrintRenderer(payload){
  const setup=payload.setup||{},state=KSMEngine.migrateGrandChampions(KSMEngine.migrateTeamDivisions(payload.state,setup));
  const ksmTeamDivision=id=>state.teamDivisions?.find(d=>d.id===id);
  // #86: a grand champion's division is printed under its row's name, its places as its awards.
  const ksmGrandChampion=id=>KSMEngine.isGrandChampionId(id)?(state.grandChampions||[]).find(g=>g.id===id)||null:null;
  const ksmDivisionName=id=>ksmGrandChampion(id)?.name??(ksmTeamDivision(id)?.name||id);
  const ksmTeamSettings=id=>{const d=ksmTeamDivision(id);return d?{teamFormat:d.teamFormat,teamAwardMode:d.awardMode}:KSMEngine.readSettings(setup)};
  const tName={value:setup.tName},tDate={value:setup.tDate},tLocation={value:setup.tLocation},teamFormat={value:setup.teamFormat};
  const matches=div=>state.allMatches?.[div]||[];
  const eligibleTeams=div=>KSMEngine.eligibleTeams((state.teams||[]).filter(t=>t.teamDivisionId===div));
  const isTeamDivision=div=>!!ksmTeamDivision(div)||div==='Team Tournament'||/team|kachinuki/i.test(state.divisionTypes?.[div]||'');
  const championshipLabels=div=>KSMEngine.championshipLabels(state.generated,state.brackets?.[div],state.pools?.[div]||[]);
  const isPoolOnlyDivision=div=>!isTeamDivision(div)&&(state.divisionTypes?.[div]||'Round Robin')==='Round Robin'&&(state.pools?.[div]||[]).length===1&&!championshipLabels(div).length;
  const requiredSeedPlaces=div=>KSMEngine.requiredSeedPlaces(isPoolOnlyDivision(div)?state.pools[div][0]:null,isPoolOnlyDivision(div)?[]:championshipLabels(div));
  const seedNameForLabel=(div,label,finalized)=>KSMEngine.seedNameForLabel(label,poolLabel=>KSMEngine.poolSeedResolution((state.pools?.[div]||[]).find(p=>p.label===poolLabel),poolLabel,matches(div),requiredSeedPlaces(div)[poolLabel]||2),finalized);
  const sideLabelGeneric=(side,div)=>KSMEngine.sideLabelGeneric(side,state.singleElimComps?.[div]||[],state.singleElimNodes?.[div]||[]);
  const redOnLeftForCourt=court=>setup[court==='B'?'court2RedSide':'court1RedSide']==='left';
  const isTeamRoundRobinDivision=div=>isTeamDivision(div)&&!(state.teamBracketNodes?.[div]||[]).length&&matches(div).some(m=>m.teamPair&&['teamPosition','teamPlayoff','kachinuki'].includes(m.type));
  const divisionComplete=div=>{const ms=matches(div).filter(KSMEngine.isValidMatchObject);return ms.some(m=>m.championship&&m.position==='Final'&&m.done)||((isTeamDivision(div)||isPoolOnlyDivision(div))&&ms.length&&ms.every(m=>m.done))};
  const teamStandings=div=>KSMEngine.teamStandings(matches(div),eligibleTeams(div),KSMEngine.teamRoundRobinCountedPlaces(ksmTeamSettings(div).teamAwardMode));
  const teamPairIds=div=>KSMEngine.teamPairIds(matches(div));
  const teamPairSummary=(div,pair)=>KSMEngine.teamPairSummary(matches(div),pair);
  const teamRoundRobinPairResolved=(div,pair)=>KSMEngine.teamRoundRobinPairResolved(matches(div),pair);
  const teamWinner=(div,pair)=>KSMEngine.teamWinner(matches(div),pair);
  const teamSideLabel=(side,div)=>{if(!side)return 'TBD';if(side.team)return eligibleTeams(div)[side.team-1]?.team||'Team '+side.team;if(side.ref)return (state.teamBracketNodes?.[div]||[]).find(n=>n.id===side.ref)?.winner||'Winner '+side.ref;return 'TBD'};
  const resultPlacements=div=>{
    if(!divisionComplete(div))return [];
    if(!isTeamDivision(div)){
      const placements=KSMEngine.individualPlacements(matches(div),isPoolOnlyDivision(div)?()=>KSMEngine.poolStandings(state.pools[div][0],matches(div),requiredSeedPlaces(div)[state.pools[div][0].label]||2):null);
      return ksmGrandChampion(div)?KSMEngine.grandChampionPlacements(placements,ksmGrandChampion(div).awardMode,KSMEngine.grandChampionWithdrawn(ksmGrandChampion(div))):placements;
    }
    const p=isTeamRoundRobinDivision(div)?KSMEngine.teamRoundRobinPlacements(true,matches(div),eligibleTeams(div),KSMEngine.teamRoundRobinCountedPlaces(ksmTeamSettings(div).teamAwardMode)):KSMEngine.teamFinalPlacements(state.teamBracketNodes?.[div]||[],eligibleTeams(div));
    if(!p)return [];
    const tied=new Set(p.undecided||[]),named=(place,name)=>tied.has(place)?KSM_TEAM_PLACE_TIED:name,mode=ksmTeamSettings(div).teamAwardMode||'top2';
    const rows=[{place:'1st',name:named(1,p.first)}];
    if(mode!=='top1'&&(p.second||tied.has(2)))rows.push({place:'2nd',name:named(2,p.second)});
    if(mode==='dual3')(tied.has(3)?[KSM_TEAM_PLACE_TIED]:(p.thirds||[])).forEach(name=>rows.push({place:'3rd',name}));
    return rows;
  };
// ---------- KSM v3.2.1 Print / PDF Export (read-only) ----------
function printMetaLine(){let bits=[];if(tDate.value)bits.push(tDate.value);if(tLocation.value)bits.push(tLocation.value);return bits.join(' • ')}
function printSheet(title,subtitle,body,kicker='Kendo Shiai Manager'){return KSMEngine.printSheet(title,subtitle,body,kicker);// moved to app/engine/html-text.ts
  }
function printNameBlock(name,dojo){return KSMEngine.printNameBlock(name,dojo);// moved to app/engine/html-text.ts
  }
function printableDivisions(){let out=Object.keys(state.allMatches||{});return out.length?out:state.divisions.filter(d=>state.divisions.includes(d));}
function refreshPrintDivisionSelect(){if(!window.printDivSelect)return;let divs=printableDivisions();let old=printDivSelect.value;printDivSelect.innerHTML=divs.map(d=>`<option value="${esc(d)}">${esc(ksmDivisionName(d))}</option>`).join('');if(old&&divs.includes(old))printDivSelect.value=old;}
function previewSelectedDivisionSheet(){refreshPrintDivisionSelect();let div=printDivSelect?.value||printableDivisions()[0];printBody.innerHTML=div?printDivisionSheet(div):printSheet('No generated divisions','Generate a tournament before printing.','')}
function previewAllDivisionSheets(){refreshPrintDivisionSelect();let divs=printableDivisions();printBody.innerHTML=divs.length?divs.map(printDivisionSheet).join(''):printSheet('No generated divisions','Generate a tournament before printing.','')}
function previewResultsSheet(){refreshPrintDivisionSelect();printBody.innerHTML=printResultsSheet()}
function previewFullPrintPacket(){refreshPrintDivisionSelect();let divs=printableDivisions();printBody.innerHTML=(divs.length?divs.map(printDivisionSheet).join(''):printSheet('No generated divisions','Generate a tournament before printing.',''))+printResultsSheet()}
function printDivisionSheet(div){return isTeamDivision(div)?printTeamDivisionSheet(div):printIndividualDivisionSheet(div)}
function printIndividualDivisionSheet(div){let pools=state.pools[div]||[],court=state.divisionCourts[div]||'A',format=state.divisionTypes[div]||'Round Robin';let body='';
  if(pools.length){body+=`<div class="print-section-title">Pools</div><div class="print-pool-grid">`+pools.map(p=>`<div class="print-card" data-testid="print-pool"><div class="print-round">Pool ${esc(p.label)}</div><div class="print-list">${p.players.map((x,i)=>`<div class="print-person" data-testid="print-pool-player"><div class="print-place-label" data-testid="print-slot">${esc(poolPlayerSlot(x,i))}</div>${printNameBlock(x.name,x.dojo)}</div>`).join('')}</div></div>`).join('')+`</div>`;
    body+=`<div class="print-section-title">Pool Match Order</div><div class="print-match-grid">`+pools.map(p=>{let ms=(state.allMatches[div]||[]).filter(m=>m.pool===p.label&&!m.championship&&!m.tiebreak);return `<div class="print-card soft"><div class="print-round">Pool ${esc(p.label)}</div>${ms.map((m,i)=>printMatchLine(m.white,m.red,m.wdojo,m.rdojo,'Match '+(i+1),m.court)).join('')||'<div class="print-dojo">No pool matches.</div>'}</div>`}).join('')+`</div>`;
  }else{body+=`<div class="print-section-title">Bracket</div>`;}
  body+=`<div class="print-section-title">Championship Bracket</div>${printBracketCards(div)}`;
  return printSheet(tName?.value||'Kendo Tournament',`${ksmDivisionName(div)} • ${ksmGrandChampion(div)?KSMEngine.grandChampionFormat(ksmGrandChampion(div)):format} • Court ${court}${printMetaLine()?' • '+printMetaLine():''}`,body,'Division Sheet')}
function printMatchLine(white,red,wdojo,rdojo,label,court){return `<div class="print-match${court&&redOnLeftForCourt(court)?' red-left':''}"><div class="print-white">${printNameBlock(white,wdojo)}</div><div class="print-vs">${esc(label||'vs')}</div><div class="print-red">${printNameBlock(red,rdojo)}</div></div>`}
function printBracketCards(div){if(state.singleElimNodes&&state.singleElimNodes[div])return printSingleElimBracketCards(div);let labels=championshipLabels(div);if(!labels.length)return '<div class="print-card soft"><div class="print-dojo">Championship bracket placeholders will appear after generation.</div></div>';let first=firstRoundName(labels.length),html=`<div class="print-card"><div class="print-round">${esc(first)}</div>`;labels.forEach(([r,w],i)=>{let rn=seedNameForLabel(div,r,true),wn=seedNameForLabel(div,w,true);let red=rn?rn.name:r,white=wn?wn.name:w;let rdojo=rn?rn.dojo:'',wdojo=wn?wn.dojo:'';let status=(String(w).toUpperCase()==='BYE'||!w)?'BYE':'Match '+(i+1);html+=printMatchLine(white,red,wdojo,rdojo,status,(state.championshipNodes?.[div]||[])[i]?.court||state.divisionCourts?.[div])});html+='</div>';let round=nextRoundFromName(first),count=labels.length;while(round){let next=Math.ceil(count/2);html+=`<div class="print-card"><div class="print-round">${esc(round)}</div>`;for(let i=1;i<=next;i++){html+=printMatchLine((2*i<=count)?`Winner of ${first} Match ${2*i}`:'Bye',`Winner of ${first} Match ${2*i-1}`,'','',round==='Final'?'Final':'Match '+i,state.divisionCourts?.[div])}html+='</div>';if(round==='Final')break;first=round;round=nextRoundFromName(round);count=next;}return `<div class="print-bracket-grid">${html}</div>`}
function printSingleElimBracketCards(div){let nodes=state.singleElimNodes?.[div]||[];if(!nodes.length)return '<div class="print-card soft"><div class="print-dojo">Bracket will appear after generation.</div></div>';let rounds=[...new Set(nodes.map(n=>n.round))];return `<div class="print-bracket-grid print-single-elim-grid">`+rounds.map(round=>`<div class="print-card"><div class="print-round">${esc(round)}</div>`+nodes.filter(n=>n.round===round).map((node,i)=>{let m=(state.allMatches[div]||[]).find(x=>x.singleElim&&x.elimNodeId===node.id);if(m)return printMatchLine(m.white,m.red,m.wdojo,m.rdojo,'Match '+(i+1),m.court);return printMatchLine(sideLabelGeneric(node.right,div),sideLabelGeneric(node.left,div),'','',(!node.left||!node.right)?'BYE':'Match '+(i+1),node.court);}).join('')+`</div>`).join('')+`</div>`}
function printTeamRoundRobinStandings(div){
  let rows=teamStandings(div),pairs=teamPairIds(div);
  let standings=`<div class="print-card">${rows.map(row=>`<div class="print-results-row"><div><b>${row.rank}. ${esc(row.name)}</b></div><div>${row.wins}-${row.losses} team W-L • ${row.matchWins} bout wins • ${row.pts} pts</div></div>`).join('')}</div>`;
  let pairRows=pairs.map(pair=>{let summary=teamPairSummary(div,pair),winner=teamRoundRobinPairResolved(div,pair)?teamWinner(div,pair):'Pending';return `<div class="print-results-row"><div><b>${esc(summary.teamWhite)} vs ${esc(summary.teamRed)}</b></div><div>${summary.wWins}-${summary.rWins} wins • ${summary.wPts}-${summary.rPts} pts • ${esc(winner)}</div></div>`}).join('');
  return `<div class="print-section-title">Team Standings</div>${standings}<div class="print-section-title">Team Pair Results</div><div class="print-card">${pairRows}</div>`;
}
function printTeamDivisionSheet(div){let teams=eligibleTeams(div),fmt=ksmTeamSettings(div).teamFormat||'Team',court=state.divisionCourts[div]||state.divisionCourts['Team Tournament']||'Both',cols=Math.max(1,Math.min(4,teams.length||1));let competitive=isTeamRoundRobinDivision(div)?printTeamRoundRobinStandings(div):`<div class="print-section-title">Team Bracket</div>${printTeamBracketCards(div)}`;let body=`<div class="print-section-title">Teams and Rosters</div><div class="print-team-grid" style="--team-cols:${cols}">`+teams.map(t=>`<div class="print-card"><div class="print-round">${esc(t.team)}</div>${printTeamRosterRows(t)}</div>`).join('')+`</div>${competitive}`;return printSheet(tName?.value||'Kendo Tournament',`${ksmDivisionName(div)} • ${fmt} • Court ${court}${printMetaLine()?' • '+printMetaLine():''}`,body,'Team Sheet')}
function printTeamRosterRows(t){let keys=(ksmTeamSettings(t.teamDivisionId).teamFormat==='3-Person Team'||ksmTeamSettings(t.teamDivisionId).teamFormat==='Kachinuki')?['senpo','chuken','taisho']:['senpo','jiho','chuken','fukusho','taisho'];return keys.map(k=>`<div class="print-roster"><div class="print-position">${esc(slotLabel(k))}</div><div>${esc(t[k]||'—')}</div></div>`).join('')}
function printTeamBracketCards(div){let nodes=state.teamBracketNodes?.[div]||[];if(!nodes.length)return '<div class="print-card soft"><div class="print-dojo">Team bracket will appear after generation.</div></div>';let rounds=[...new Set(nodes.map(n=>n.round))];return `<div class="print-bracket-grid">`+rounds.map(round=>`<div class="print-card"><div class="print-round">${esc(round)}</div>`+nodes.filter(n=>n.round===round).map((node,i)=>printMatchLine(teamSideLabel(node.right,div),teamSideLabel(node.left,div),'','',`${node.court?`Court ${node.court}`:'Match'} ${i+1}`,node.court)).join('')+`</div>`).join('')+`</div>`}
// F9: printed results use the same placements as the Results screen (resultPlacements: the engine's
// individualPlacements, incl. pool-only round robins, and the team rules), not a copy that only read
// a championship Final.
function printPlacementsForDivision(div){return resultPlacements(div).map(r=>[r.place,r.name]);}
function printResultsSheet(){let divs=printableDivisions();let rows=divs.map(div=>{let placements=printPlacementsForDivision(div);return `<div class="print-results-row"><div><div class="print-name">${esc(ksmDivisionName(div))}</div></div><div>${placements.length?placements.map(([place,name])=>`<div class="print-placement"><span class="print-place-label">${esc(place)}</span><b>${esc(name)}</b></div>`).join(''):'<span class="print-dojo">Results pending</span>'}</div></div>`}).join('');let awards=(state.awards||[]).filter(a=>a.award||a.name||a.dojo);let awardHtml=`<div class="print-section-title">Awards</div>`+(awards.length?`<div class="print-card">${awards.map(a=>`<div class="print-award-row"><b>${esc(a.award)}</b><span>${esc(a.name)}</span><span class="print-dojo">${esc(a.dojo)}</span></div>`).join('')}</div>`:'<div class="print-card soft"><div class="print-dojo">No awards entered.</div></div>');return printSheet(tName?.value||'Kendo Tournament',`Results${printMetaLine()?' • '+printMetaLine():''}`,`<div class="print-section-title">Division Results</div><div class="print-card">${rows||'<div class="print-dojo">No generated divisions.</div>'}</div>${awardHtml}`,'Results + Awards')}



  return {printMetaLine,printSheet,printNameBlock,printableDivisions,refreshPrintDivisionSelect,previewSelectedDivisionSheet,previewAllDivisionSheets,previewResultsSheet,previewFullPrintPacket,printDivisionSheet,printIndividualDivisionSheet,printMatchLine,printBracketCards,printSingleElimBracketCards,printTeamRoundRobinStandings,printTeamDivisionSheet,printTeamRosterRows,printTeamBracketCards,printPlacementsForDivision,printResultsSheet};
}
const printMetaLine=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printMetaLine(...args);
const printSheet=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printSheet(...args);
const printNameBlock=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printNameBlock(...args);
const printableDivisions=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printableDivisions(...args);
const refreshPrintDivisionSelect=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).refreshPrintDivisionSelect(...args);
export const previewSelectedDivisionSheet=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).previewSelectedDivisionSheet(...args);
export const previewAllDivisionSheets=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).previewAllDivisionSheets(...args);
export const previewResultsSheet=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).previewResultsSheet(...args);
export const previewFullPrintPacket=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).previewFullPrintPacket(...args);
export const printDivisionSheet=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printDivisionSheet(...args);
const printIndividualDivisionSheet=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printIndividualDivisionSheet(...args);
const printMatchLine=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printMatchLine(...args);
const printBracketCards=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printBracketCards(...args);
const printSingleElimBracketCards=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printSingleElimBracketCards(...args);
const printTeamRoundRobinStandings=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printTeamRoundRobinStandings(...args);
const printTeamDivisionSheet=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printTeamDivisionSheet(...args);
const printTeamRosterRows=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printTeamRosterRows(...args);
const printTeamBracketCards=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printTeamBracketCards(...args);
const printPlacementsForDivision=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printPlacementsForDivision(...args);
const printResultsSheet=(...args)=>/** @type {any} */(ksmPrintRenderer(tournamentPayload())).printResultsSheet(...args);
