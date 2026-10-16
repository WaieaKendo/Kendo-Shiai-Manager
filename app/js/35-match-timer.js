/* ksm:post-split-begin match-timer */
// Only configuration enters SetupSnapshot. Running timers live in the React court island.
function ksmNormalizeTimerSettings(data){
  const out={};
  ['timeRegular','timeQuarterfinal','timeSemifinal','timeFinal','timeEncho'].forEach(id=>{
    const fallback=id==='timeRegular'||id==='timeEncho'?'3:00':'';
    const value=typeof data[id]==='string'?data[id].trim():null;
    const valid=value!==null&&/^\d{1,3}:[0-5]\d$/.test(value)&&value!=='0:00'&&Number(value.split(':')[0])*60+Number(value.split(':')[1])>0;
    out[id]=valid?value:(value===''&&id!=='timeRegular'?'':fallback);
  });
  out.court1TimerSound=data.court1TimerSound==='whistle02'?'whistle02':'whistle01';
  out.court2TimerSound=data.court2TimerSound==='whistle01'?'whistle01':'whistle02';
  out.court1TimerEnabled=data.court1TimerEnabled==='Off'?'Off':'On';
  out.court2TimerEnabled=data.court2TimerEnabled==='Off'?'Off':'On';
  return out;
}
function ksmSaveTimerSettings(){
  const settings=ksmNormalizeTimerSettings(getSetupSnapshot());
  Object.keys(settings).forEach(id=>{document.getElementById(id).value=settings[id]});
  saveSetup();renderAll();
}
function ksmSetCourtTimerSound(sound){
  if(sound!=='whistle01'&&sound!=='whistle02')return;
  const el=document.getElementById(state.currentCourt==='B'?'court2TimerSound':'court1TimerSound');
  if(el){el.value=sound;el.dispatchEvent(new Event('change',{bubbles:true}))}
}
function ksmSetCourtTimerEnabled(enabled){
  const el=document.getElementById(state.currentCourt==='B'?'court2TimerEnabled':'court1TimerEnabled');
  if(el){el.value=enabled?'On':'Off';el.dispatchEvent(new Event('change',{bubbles:true}))}
}
function ksmMatchTimerInput(){
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
/* ksm:post-split-end */
