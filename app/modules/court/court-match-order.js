// @ts-check
import {getState} from '../../store/index.ts';
import {selectAllMatches,selectBrackets,selectCourtActiveDivision,selectCourtState,selectCurrentCourt,selectCurrentDivision,selectCurrentIndex,selectDivisionCourts,selectDivisions,selectMatches,selectPoolViewDivision,selectTeamBracketNodes} from '../selectors.js';
import {ksmClearHistory,ksmEmptyScore,ksmSetCurrentCourt,ksmSetPoolViewDivision,ksmSetPublicCourt,ksmSetScore,ksmShowDivision,ksmShowMatch} from '../app-state.js';
import {ksmDefaultDivisionCourts} from '../setup/divisions-store.js';
import {loadScoreFromMatch} from './court-scoring-and-history.js';
import {ksmCourtPointer,ksmMoveCourtPointers,ksmResolveCourts} from './court-pointers-store.js';
import {ksmSetDivisionMatches,ksmSortDivisionMatches} from './match-writes.js';
import {renderScore} from './scorekeeper-screen.js';
import {championshipLabels,firstRoundName,roundSequenceFromFirst} from '../engine/engine-championship.js';
import {matchBelongsToCourt} from '../engine/engine-generation.js';
import {isTeamDivision} from '../engine/engine-pools.js';
import {singleElimOrderMap} from '../engine/engine-single-elim.js';
import {esc} from '../html-text.js';
import {show} from '../navigation.js';
import {ksmSignalCourtHeader} from '../react-bridges/court.js';
import {ksmDivisionName,ksmTeamDivisions} from '../registration/team-divisions.js';
import {renderPublic} from '../results/live-scores.js';
import {canCloudWrite} from '../session/staff-session-and-library.js';
import {applyCourtSides,localCourtDivision,pinCourtLocally,rememberLocalCourtDivision} from '../sync/sync-state-and-rebase.js';
import * as KSMEngine from '../../engine/index.ts';
export function isTeamMatch(m){return KSMEngine.isTeamMatch(m);// moved to app/engine/match-helpers.ts
  }
/** Node id -> its place in the bracket; `nodes` (a draw not in the store yet) instead of the division's nodes. */
function teamNodeOrderMap(div,nodes=selectTeamBracketNodes(getState())?.[div]){let map={};(nodes||[]).forEach((n,i)=>map[n.id]=i);return map}
function teamPairOrderMap(div,list=selectAllMatches(getState())[div]){let map={},next=0;(list||[]).forEach(m=>{if(isTeamMatch(m)&&m.teamPair&&map[m.teamPair]==null)map[m.teamPair]=next++});return map}
function teamPositionOrder(m){return KSMEngine.teamPositionOrder(m);// moved to app/engine/match-helpers.ts
  }
// `list` / `pairOrder`: the division's list and its pair order as they were before a sort (sortTeamMatches()).
function teamMatchSortKey(div,m,map=teamNodeOrderMap(div),list=selectAllMatches(getState())[div],pairOrder){let node=(m.teamNodeId&&map[m.teamNodeId]!=null)?map[m.teamNodeId]:null;if(node==null && m.teamPair){let sib=(list||[]).find(x=>x.teamPair===m.teamPair && x.teamNodeId && map[x.teamNodeId]!=null);if(sib)node=map[sib.teamNodeId];}
  // Round-robin position Match Objects belong to one authoritative team pairing.
  // Keep Senpo -> ... -> Taisho -> representative playoff together before
  // advancing the court to another pair. Elimination continues to use node order.
  if(node==null&&m.teamPair){pairOrder=pairOrder||teamPairOrderMap(div,list);if(pairOrder[m.teamPair]!=null)return pairOrder[m.teamPair]*100+teamPositionOrder(m)}
  if(node==null)node=999;return node*100+teamPositionOrder(m)}
// The division's list sorted through match-writes.js (#15 PR 13c-1); returns it as it is after, read again. The sort keys
// read the list as it was before the sort (V8 sorts a copy and writes it back at the end, so the in-place sort's
// comparator read that order too; 13c-2 sorts a copy of the store's list).
export function sortTeamMatches(div,nodes){let arr=selectAllMatches(getState())[div]||[];if(!arr.some(isTeamMatch))return arr;const map=teamNodeOrderMap(div,nodes),before=[...arr],pairOrder=teamPairOrderMap(div,before);return ksmSortDivisionMatches(div,(a,b)=>{
  let at=isTeamMatch(a),bt=isTeamMatch(b);if(at&&bt)return teamMatchSortKey(div,a,map,before,pairOrder)-teamMatchSortKey(div,b,map,before,pairOrder);if(at&&!bt)return -1;if(!at&&bt)return 1;return 0;
});}
export function individualMatchReady(m){return KSMEngine.individualMatchReady(m);// moved to app/engine/match-helpers.ts
  }
function championshipRoundIndex(div,round){
  const first=firstRoundName((selectBrackets(getState())?.[div]||championshipLabels(div)||[]).length);
  const seq=roundSequenceFromFirst(first);
  const idx=seq.indexOf(round);
  return idx<0?999:idx;
}
export function sortIndividualDivisionMatches(div,arr){
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
  const out=indexed.map(x=>x.m);ksmSetDivisionMatches(div,out);return selectAllMatches(getState())[div];
}
export function findNextForCourt(court,preferredDiv=null,startIndex=0){
  // The active match must always be pulled from the same ordered queue that
  // is displayed to the scorekeeper. Team brackets are especially sensitive:
  // play-ins must remain ahead of any dependent or later-round match, even if
  // other matches are technically playable. Never fall back to another division
  // simply because the selected division is waiting.
  function firstForDivision(d){
    let arr=selectAllMatches(getState())[d]||[];
    if(arr.some(isTeamMatch))arr=sortTeamMatches(d);
    else arr=sortIndividualDivisionMatches(d,arr);
    let idx=arr.findIndex(m=>individualMatchReady(m) && matchBelongsToCourt(m,court));
    return {division:d,index:idx>=0?idx:arr.length};
  }
  if(preferredDiv) return firstForDivision(preferredDiv);
  // Only divisions with a match on this court are scanned (and so sorted): the other court's divisions are left as they
  // are, so their match lists are not re-sorted or replaced (#177 review). They could not be found here anyway.
  let divs=Object.keys(selectAllMatches(getState())||{}).filter(d=>d&&(selectAllMatches(getState())[d]||[]).some(m=>matchBelongsToCourt(m,court)));
  for(let d of divs){let found=firstForDivision(d);if(found.index < (selectAllMatches(getState())[d]||[]).length)return found;}
  return {division:selectCurrentDivision(getState()),index:(selectAllMatches(getState())[selectCurrentDivision(getState())]||[]).length};
}
/**
 * Whether this device runs Court `court`: it may write the tournament (staff, or a local tournament with no cloud) and its
 * court (state.currentCourt, from the pin) is that court. A cloud TV link is never staff (initializeCloudRoleFromUrl()),
 * so a TV never runs a court; an offline TV is the same app as its court (no other device), so it does. Only then does a
 * view choice on the court (a court opened, a division picked, a load's rehydrate, a render's self-heal) move the
 * court's shared pointer (courtState[c], courtActiveDivision[c], currentByDivision); on any other device it changes only
 * this device's view (docs/STORE.md section 1.2, decided in #15 PR 6). Structural edits (generation, pool edits, division setup, grand champion, the
 * rebase) re-resolve the pointers on any writable device, as before.
 * @param {string} court
 */
export function isCourtScorekeeper(court){return canCloudWrite()&&selectCurrentCourt(getState())===court}
/**
 * Moves Court `court`'s shared pointer to `cs` (only from that court's own actions: see isCourtScorekeeper()): one
 * court/pointerMoved (or `type`), with the division's queue position when `queue` is given (#15 PR 13a).
 * @param {string} court
 * @param {{division:string|null,index:number}} cs
 * @param {'pointerMoved'|'divisionSelected'} [type]
 * @param {number} [queue]
 */
export function setCourtPointer(court,cs,type='pointerMoved',queue){ksmMoveCourtPointers(type,ksmCourtPointer(court,cs,queue),court)}
/**
 * Brings this court's shared pointer to this device's view, when this device is the court's scorekeeper and they
 * differ: a division picked before Staff Login (a spectator's pick moves only its own view) is the court's division
 * once the device can write, as it was before #15 PR 6. Called when the device becomes staff (ksmAccountSetRole()) and
 * before each court action (performCourtAction(), undo(), redo()), so that action's save carries it. Not recorded in the
 * action's Undo entry. Returns whether it wrote.
 */
export function syncOwnCourtPointer(){
  const court=selectCurrentCourt(getState()),div=selectCurrentDivision(getState());
  if(!court||!div||!Array.isArray(selectAllMatches(getState())?.[div])||!isCourtScorekeeper(court))return false;
  const index=selectCurrentIndex(getState())||0,cs=selectCourtState(getState())?.[court];
  if(cs&&cs.division===div&&cs.index===index&&selectCourtActiveDivision(getState())?.[court]===div)return false;
  // Never back onto a finished bout (#180 review, Low): when a render's self-heal (courtCurrentMatch()) has moved the
  // court past the bout this screen still shows, the court's pointer is ahead, not behind; this screen catches up on
  // its next render (ensureScorableCurrentMatch()). The court's division still syncs (#181 review): its index is kept.
  if(cs&&cs.division===div&&cs.index!==index&&selectAllMatches(getState())[div][index]?.done){
    if(selectCourtActiveDivision(getState())?.[court]===div)return false;
    setCourtPointer(court,cs);
    return true;
  }
  setCourtPointer(court,{division:div,index},'pointerMoved',index);
  return true;
}
/**
 * This device shows Court `court` at `cs`; on the court's scorekeeper the court's shared pointer (and the division's queue
 * position, the shown index) moves there too, as one court/… action (`type`: 'divisionSelected' for a court opened or a
 * division picked, else 'pointerMoved': Next Match, a load's reconciliation, the view rebuilt after Undo/Redo).
 * @param {string} court
 * @param {{division:string|null,index:number}} cs
 * @param {boolean} [keepScore]
 * @param {'pointerMoved'|'divisionSelected'} [type]
 */
export function applyCourtState(court,cs,keepScore=true,type='pointerMoved'){
  // Every caller passes this device's court (openCourt() sets it first), so this checks write access for that court.
  const runsCourt=isCourtScorekeeper(court);
  ksmSetCurrentCourt(court);
  // The pointer with the queue position the shown index will be (state.current after ksmShowMatch() below).
  if(runsCourt)setCourtPointer(court,cs,type,cs.index||0);
  // state.matches follows the shown division (it is allMatches[currentDivision], #15 PR 7); state.current is its index.
  ksmShowDivision(cs.division);
  ksmShowMatch(cs.index||0);
  if(keepScore){loadScoreFromMatch(selectMatches(getState())[selectCurrentIndex(getState())]);}
  else{ksmSetScore(ksmEmptyScore());ksmClearHistory()}
  applyCourtSides();
}
/** Both courts on their first ready bout (a structural edit: generation, a regenerate, a No Show): one court/pointersResolved. */
export function initCourtStates(){ksmResolveCourts(['A','B'],c=>findNextForCourt(c,null,0))}
export function renderDivisions(){
  ksmDefaultDivisionCourts(selectDivisions(getState()));// each division without a court gets 'A' (one action, none when all have one)
  if(window.poolDiv){let all=[...new Set([...selectDivisions(getState()),...ksmTeamDivisions().filter(d=>selectAllMatches(getState())?.[d.id]).map(d=>d.id),...Object.keys(selectAllMatches(getState())||{})])];let selected=(poolDiv.value&&all.includes(poolDiv.value))?poolDiv.value:((selectPoolViewDivision(getState())&&all.includes(selectPoolViewDivision(getState())))?selectPoolViewDivision(getState()):selectCurrentDivision(getState()));ksmSetPoolViewDivision(selected);poolDiv.innerHTML=all.map(d=>`<option ${d===selected?'selected':''}${ksmDivisionName(d)!==d?` value="${esc(d)}"`:''}>${esc(ksmDivisionName(d))}</option>`).join('');if(selected)poolDiv.value=selected;}
  if(window.scoreDiv){
    let court=selectCurrentCourt(getState())||'A';
    let all=[...new Set([...selectDivisions(getState()),...Object.keys(selectAllMatches(getState())||{})])];
    let opts=all.filter(d=>{let c=selectDivisionCourts(getState())[d]||'A';return c===court||c==='split'||(isTeamDivision(d)&&(selectDivisionCourts(getState())[d]||'Both')==='Both')});
    // The React court header (35-react-court.js) draws the court title and the select.
    ksmSignalCourtHeader({court,divisions:opts,currentDivision:selectCurrentDivision(getState())||''});
  }
}
export function openCourt(c){
  c=pinCourtLocally(c);
  ksmSetCurrentCourt(c);
  const preferred=localCourtDivision(c);
  let cs=preferred&&selectAllMatches(getState())?.[preferred]?findNextForCourt(c,preferred,0):selectCourtState(getState())?.[c];
  const active=cs?.division?(selectAllMatches(getState())?.[cs.division]||[])[cs.index]:null;
  if(!cs || !cs.division || !individualMatchReady(active) || !matchBelongsToCourt(active,c)){
    cs=findNextForCourt(c,cs?.division||selectCourtActiveDivision(getState())?.[c]||null,0);
  }
  applyCourtState(c,cs,true,'divisionSelected');
  if(cs?.division)rememberLocalCourtDivision(c,cs.division);
  renderDivisions();renderScore();show('score');
}
export function openPublicCourt(c){ksmSetPublicCourt(c);if(window.publicTitle)publicTitle.textContent='Live Scores • Court '+c;renderPublic();show('public')}
