// @ts-check
import {ksmEmptyScore,ksmSetCurrentCourt,ksmSetPoolViewDivision,ksmSetPublicCourt,ksmSetScore,ksmShowDivision,ksmShowMatch,state} from '../app-state.js';
import {loadScoreFromMatch} from './court-scoring-and-history.js';
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
function teamNodeOrderMap(div){let map={};(state.teamBracketNodes?.[div]||[]).forEach((n,i)=>map[n.id]=i);return map}
function teamPairOrderMap(div){let map={},next=0;(state.allMatches[div]||[]).forEach(m=>{if(isTeamMatch(m)&&m.teamPair&&map[m.teamPair]==null)map[m.teamPair]=next++});return map}
function teamPositionOrder(m){return KSMEngine.teamPositionOrder(m);// moved to app/engine/match-helpers.ts
  }
function teamMatchSortKey(div,m){let map=teamNodeOrderMap(div);let node=(m.teamNodeId&&map[m.teamNodeId]!=null)?map[m.teamNodeId]:null;if(node==null && m.teamPair){let sib=(state.allMatches[div]||[]).find(x=>x.teamPair===m.teamPair && x.teamNodeId && map[x.teamNodeId]!=null);if(sib)node=map[sib.teamNodeId];}
  // Round-robin position Match Objects belong to one authoritative team pairing.
  // Keep Senpo -> ... -> Taisho -> representative playoff together before
  // advancing the court to another pair. Elimination continues to use node order.
  if(node==null&&m.teamPair){let pairOrder=teamPairOrderMap(div);if(pairOrder[m.teamPair]!=null)return pairOrder[m.teamPair]*100+teamPositionOrder(m)}
  if(node==null)node=999;return node*100+teamPositionOrder(m)}
export function sortTeamMatches(div){let arr=state.allMatches[div]||[];if(!arr.some(isTeamMatch))return arr;arr.sort((a,b)=>{
  let at=isTeamMatch(a),bt=isTeamMatch(b);if(at&&bt)return teamMatchSortKey(div,a)-teamMatchSortKey(div,b);if(at&&!bt)return -1;if(!at&&bt)return 1;return 0;
});state.allMatches[div]=arr;return arr;}
export function individualMatchReady(m){return KSMEngine.individualMatchReady(m);// moved to app/engine/match-helpers.ts
  }
function championshipRoundIndex(div,round){
  const first=firstRoundName((state.brackets?.[div]||championshipLabels(div)||[]).length);
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
  const out=indexed.map(x=>x.m);state.allMatches[div]=out;return out;
}
export function findNextForCourt(court,preferredDiv=null,startIndex=0){
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
  // Only divisions with a match on this court are scanned (and so sorted): the other court's divisions are left as they
  // are, so their match lists are not re-sorted or replaced (#177 review). They could not be found here anyway.
  let divs=Object.keys(state.allMatches||{}).filter(d=>d&&(state.allMatches[d]||[]).some(m=>matchBelongsToCourt(m,court)));
  for(let d of divs){let found=firstForDivision(d);if(found.index < (state.allMatches[d]||[]).length)return found;}
  return {division:state.currentDivision,index:(state.allMatches[state.currentDivision]||[]).length};
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
export function isCourtScorekeeper(court){return canCloudWrite()&&state.currentCourt===court}
/** Moves Court `court`'s shared pointer to `cs` (only from that court's own actions: see isCourtScorekeeper()). */
export function setCourtPointer(court,cs){
  state.courtState=state.courtState||/** @type {any} */({});state.courtActiveDivision=state.courtActiveDivision||/** @type {any} */({});
  state.courtState[court]=cs;
  state.courtActiveDivision[court]=cs.division;
}
/**
 * Brings this court's shared pointer to this device's view, when this device is the court's scorekeeper and they
 * differ: a division picked before Staff Login (a spectator's pick moves only its own view) is the court's division
 * once the device can write, as it was before #15 PR 6. Called when the device becomes staff (ksmAccountSetRole()) and
 * before each court action (performCourtAction(), undo(), redo()), so that action's save carries it. Not recorded in the
 * action's Undo entry. Returns whether it wrote.
 */
export function syncOwnCourtPointer(){
  const court=state.currentCourt,div=state.currentDivision;
  if(!court||!div||!Array.isArray(state.allMatches?.[div])||!isCourtScorekeeper(court))return false;
  const index=state.current||0,cs=state.courtState?.[court];
  if(cs&&cs.division===div&&cs.index===index&&state.courtActiveDivision?.[court]===div)return false;
  // Never back onto a finished bout (#180 review, Low): when a render's self-heal (courtCurrentMatch()) has moved the
  // court past the bout this screen still shows, the court's pointer is ahead, not behind; this screen catches up on
  // its next render (ensureScorableCurrentMatch()).
  if(cs&&cs.division===div&&state.allMatches[div][index]?.done)return false;
  setCourtPointer(court,{division:div,index});
  state.currentByDivision[div]=index;
  return true;
}
export function applyCourtState(court,cs,keepScore=true){
  // Every caller passes this device's court (openCourt() sets it first), so this checks write access for that court.
  const runsCourt=isCourtScorekeeper(court);
  ksmSetCurrentCourt(court);
  if(runsCourt)setCourtPointer(court,cs);
  // state.matches follows the shown division (it is allMatches[currentDivision], #15 PR 7); state.current is its index.
  ksmShowDivision(cs.division);
  ksmShowMatch(cs.index||0);
  if(runsCourt)state.currentByDivision[cs.division]=state.current;
  if(keepScore){loadScoreFromMatch(state.matches[state.current]);}
  else{ksmSetScore(ksmEmptyScore());state.history=[]}
  applyCourtSides();
}
export function initCourtStates(){
  ['A','B'].forEach(c=>{state.courtState[c]=findNextForCourt(c,null,0);state.courtActiveDivision[c]=state.courtState[c].division;});
}
export function renderDivisions(){
  state.divisions.forEach(d=>state.divisionCourts[d]=state.divisionCourts[d]||'A');
  if(window.poolDiv){let all=[...new Set([...state.divisions,...ksmTeamDivisions().filter(d=>state.allMatches?.[d.id]).map(d=>d.id),...Object.keys(state.allMatches||{})])];let selected=(poolDiv.value&&all.includes(poolDiv.value))?poolDiv.value:((state.poolViewDivision&&all.includes(state.poolViewDivision))?state.poolViewDivision:state.currentDivision);ksmSetPoolViewDivision(selected);poolDiv.innerHTML=all.map(d=>`<option ${d===selected?'selected':''}${ksmDivisionName(d)!==d?` value="${esc(d)}"`:''}>${esc(ksmDivisionName(d))}</option>`).join('');if(selected)poolDiv.value=selected;}
  if(window.scoreDiv){
    let court=state.currentCourt||'A';
    let all=[...new Set([...state.divisions,...Object.keys(state.allMatches||{})])];
    let opts=all.filter(d=>{let c=state.divisionCourts[d]||'A';return c===court||c==='split'||(isTeamDivision(d)&&(state.divisionCourts[d]||'Both')==='Both')});
    // The React court header (35-react-court.js) draws the court title and the select.
    ksmSignalCourtHeader({court,divisions:opts,currentDivision:state.currentDivision||''});
  }
}
export function openCourt(c){
  c=pinCourtLocally(c);
  ksmSetCurrentCourt(c);
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
export function openPublicCourt(c){ksmSetPublicCourt(c);if(window.publicTitle)publicTitle.textContent='Live Scores • Court '+c;renderPublic();show('public')}
