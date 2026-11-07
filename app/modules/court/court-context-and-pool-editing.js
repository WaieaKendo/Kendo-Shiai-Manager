// @ts-check
import {state} from '../app-state.js';
import {findNextForCourt} from './court-match-order.js';
import {buildChampionshipTemplateMatches,championshipTemplateForTotal} from '../engine/engine-championship.js';
import {assignPoolPlayerSlots,buildPoolMatches} from '../engine/engine-pools.js';
import {appendApprovedDynamicMatches,ksmPoolEditPools,ksmPoolEditToSave,ksmRenderPoolEditor,renderPools,scheduleAutoSave,setActiveDivision,syncChampionshipTemplate} from '../legacy.js';
export function maybeCreateKachinukiNext(m){
  const plan=KSMEngine.maybeCreateKachinukiNext(m);if(!plan)return;
  let div=m.division,arr=state.allMatches[div]||[];
  if(plan.kind==='playoff')appendApprovedDynamicMatches(div,m,/** @type {Match} */(plan.match),'KACHINUKI_REPRESENTATIVE');
  else{let idx=arr.indexOf(m);arr.splice(idx+1,0,/** @type {Match} */(plan.match));state.allMatches[div]=arr;}
}

export function dragPoolPlayer(ev,poolLabel,idx){ev.dataTransfer.setData('text/plain',JSON.stringify({poolLabel,idx}));}
export function insertPoolPlayer(ev,toLabel,toIndex){
  ev.preventDefault();ev.stopPropagation();let div=poolDiv?.value||state.currentDivision;let pools=ksmPoolEditPools(div);let data;try{data=JSON.parse(ev.dataTransfer.getData('text/plain'))}catch(e){return}
  let from=pools.find(p=>p.label===data.poolLabel),to=pools.find(p=>p.label===toLabel);if(!from||!to)return;
  let player=from.players.splice(data.idx,1)[0];if(!player)return;
  if(from===to && data.idx<toIndex)toIndex--;
  to.players.splice(Math.max(0,Math.min(toIndex,to.players.length)),0,player);
  toggleEditPools();
}
export function dropPoolPlayer(ev,toLabel){ev.preventDefault();let div=poolDiv?.value||state.currentDivision;let pools=ksmPoolEditPools(div);let data;try{data=JSON.parse(ev.dataTransfer.getData('text/plain'))}catch(e){return}let from=pools.find(p=>p.label===data.poolLabel),to=pools.find(p=>p.label===toLabel);if(!from||!to)return;let player=from.players.splice(data.idx,1)[0];if(player)to.players.push(player);toggleEditPools();}
export function toggleEditPools(){let div=poolDiv?.value||state.currentDivision;let pools=ksmPoolEditPools(div);if(!pools.length)return;poolOutput.className='pools-layout';ksmRenderPoolEditor(div);}
function movePoolPlayer(fromPool,idx,toPool){let div=poolDiv?.value||state.currentDivision;let pools=ksmPoolEditPools(div);toPool=parseInt(toPool,10);if(fromPool===toPool)return;let player=pools[fromPool].players.splice(idx,1)[0];if(player)pools[toPool].players.push(player);toggleEditPools();}
export function saveEditedPools(){
  let div=poolDiv?.value||state.currentDivision;
  const edited=ksmPoolEditToSave(div);if(!edited)return;const pools=assignPoolPlayerSlots(edited);
  state.pools[div]=pools;

  // Pool editing occurs after the division has already been generated. Rebuild the
  // complete division Match Object set, not just the preliminary pool matches.
  // The championship preview is driven by state.brackets/standings, so dropping
  // the championship Match Objects here can make a QF look populated in the
  // bracket while leaving nothing scorable in the Court queue.
  const total=pools.reduce((sum,pool)=>sum+(pool.players?.length||0),0);
  state.brackets=state.brackets||{};
  const bracket=(Array.isArray(state.brackets[div])&&state.brackets[div].length)
    ? state.brackets[div]
    : championshipTemplateForTotal(total);
  state.brackets[div]=bracket;

  const poolMatches=buildPoolMatches(div,pools);
  const championshipMatches=buildChampionshipTemplateMatches(div,bracket);
  state.allMatches[div]=poolMatches.concat(championshipMatches);
  syncChampionshipTemplate(div);
  state.currentByDivision[div]=0;

  // Any saved court pointer into the pre-edit array is now stale because the
  // division Match Objects were intentionally rebuilt. Re-resolve each affected
  // court against the canonical queue before tournament play begins.
  ['A','B'].forEach(court=>{
    if(state.courtState?.[court]?.division===div||state.courtActiveDivision?.[court]===div){
      const next=findNextForCourt(court,div,0);
      state.courtState[court]=next;
      state.courtActiveDivision[court]=next.division;
    }
  });
  state.managementRevision=(state.managementRevision||0)+1;
  if(div===state.currentDivision)setActiveDivision(div);
  renderPools();
  scheduleAutoSave();
}
