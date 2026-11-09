// @ts-check
import {state} from '../app-state.js';
import {isReadOnlySession} from '../session/staff-session-and-library.js';
import {matchRequiresWinner} from './court-scoring-and-history.js';
import {matchBelongsToCourt,renderAll,saveSetup} from '../legacy.js';
import {isTvSession} from '../sync/cloud-realtime-save-and-load.js';
import {cloudSession,getSetupSnapshot} from '../sync/cloud-session-and-autosave.js';
import {matchSyncIdentity} from '../sync/sync-state-and-rebase.js';
// Only configuration enters SetupSnapshot. Running timers live in the React court island.
export function ksmNormalizeTimerSettings(data){
  const out={};
  ['timeRegular','timeQuarterfinal','timeSemifinal','timeFinal','timeEncho'].forEach(id=>{
    const fallback=id==='timeRegular'||id==='timeEncho'?'3:00':'';
    let value=typeof data[id]==='string'?data[id].trim():null;
    // Shorthand: "5" or "5:" is 5:00, "2:3" is 2:03 (it used to be cleared).
    if(value!==null){const m=value.match(/^(\d{1,3})(?::(\d?))?$/);if(m)value=`${Number(m[1])}:${(m[2]||'0').padStart(2,'0')}`}
    const valid=value!==null&&/^\d{1,3}:[0-5]\d$/.test(value)&&value!=='0:00'&&Number(value.split(':')[0])*60+Number(value.split(':')[1])>0;
    out[id]=valid?value:(value===''&&id!=='timeRegular'?'':fallback);
  });
  out.court1TimerSound=data.court1TimerSound==='whistle02'?'whistle02':'whistle01';
  out.court2TimerSound=data.court2TimerSound==='whistle01'?'whistle01':'whistle02';
  out.court1TimerEnabled=data.court1TimerEnabled==='Off'?'Off':'On';
  out.court2TimerEnabled=data.court2TimerEnabled==='Off'?'Off':'On';
  return out;
}
export function ksmSaveTimerSettings(){
  const settings=ksmNormalizeTimerSettings(getSetupSnapshot());
  Object.keys(settings).forEach(id=>{/** @type {HTMLInputElement} */(document.getElementById(id)).value=settings[id]});
  saveSetup();renderAll();
}
export function ksmSetCourtTimerSound(sound){
  if(sound!=='whistle01'&&sound!=='whistle02')return;
  const el=/** @type {HTMLInputElement|null} */(document.getElementById(state.currentCourt==='B'?'court2TimerSound':'court1TimerSound'));
  if(el){el.value=sound;el.dispatchEvent(new Event('change',{bubbles:true}))}
}
export function ksmSetCourtTimerEnabled(enabled){
  const el=/** @type {HTMLInputElement|null} */(document.getElementById(state.currentCourt==='B'?'court2TimerEnabled':'court1TimerEnabled'));
  if(el){el.value=enabled?'On':'Off';el.dispatchEvent(new Event('change',{bubbles:true}))}
}
export function ksmMatchTimerInput(){
  const m=state.matches?.[state.current],court=state.currentCourt||'A';
  if(isReadOnlySession()||isTvSession()||!m||m.done||!matchBelongsToCourt(m,court))return null;
  const settings=ksmNormalizeTimerSettings(getSetupSnapshot());
  const node=(state.teamBracketNodes?.[m.division]||[]).find(n=>n.id===m.teamNodeId);
  const stage=node?.round||m.round||m.position;
  const field={Quarterfinal:'timeQuarterfinal',Semifinal:'timeSemifinal',Final:'timeFinal'}[stage];
  const ms=value=>{if(!value)return 0;const [minutes,seconds]=value.split(':').map(Number);return (minutes*60+seconds)*1000};
  // Unassigned local tournaments have one local autosave slot; cloud tournaments use their ID.
  return {tournamentId:cloudSession.tournamentId||'local',court,matchKey:matchSyncIdentity(m),
    sound:settings[court==='B'?'court2TimerSound':'court1TimerSound'],enabled:settings[court==='B'?'court2TimerEnabled':'court1TimerEnabled']!=='Off',durationMs:ms(settings[field]||settings.timeRegular),enchoMs:ms(settings.timeEncho),
    tied:(state.score?.W||[]).length===(state.score?.R||[]).length,scored:(state.score?.W||[]).length+(state.score?.R||[]).length>0,requiresWinner:!!matchRequiresWinner(m)};
}
