function readCloudDiagnosticsState(){try{return JSON.parse(localStorage.getItem(KSM_CLOUD_DIAGNOSTICS_KEY)||'{}')}catch(_){return {}}}
function writeCloudDiagnosticsState(patch={}){const next={...readCloudDiagnosticsState(),...patch,updatedAt:new Date().toISOString()};try{localStorage.setItem(KSM_CLOUD_DIAGNOSTICS_KEY,JSON.stringify(next))}catch(err){console.warn('Diagnostics storage failed',err)}return next}
function clearCloudDiagnosticsError(){writeCloudDiagnosticsState({stage:'Idle',httpStatus:null,errorMessage:'',errorBody:'',retryCount:0})}
function formatDiagnosticTime(value){if(!value)return 'None';const parsed=Date.parse(value);return Number.isFinite(parsed)?new Date(parsed).toLocaleString():String(value)}
function payloadByteSize(payload){try{return new Blob([JSON.stringify(payload)]).size}catch(_){return 0}}
function formatSnapshotBytes(bytes){const n=Number(bytes)||0;if(n>=1048576)return `${(n/1048576).toFixed(2)} MB`;if(n>=1024)return `${Math.round(n/1024)} KB`;return `${n} B`}
function snapshotValueSummary(value){if(Array.isArray(value))return `Array (${value.length})`;if(value&&typeof value==='object')return `Object (${Object.keys(value).length} keys)`;return typeof value}
function analyzeTournamentSnapshot(payload=tournamentPayload()){
  const totalBytes=payloadByteSize(payload),entries=[];
  const visit=(value,path,depth=0)=>{const bytes=payloadByteSize(value);entries.push({path,bytes,summary:snapshotValueSummary(value)});if(!value||typeof value!=='object'||depth>=4||Array.isArray(value))return;Object.entries(value).forEach(([key,child])=>visit(child,`${path}.${key}`,depth+1))};
  visit(payload,'payload');
  const largest=entries.filter(x=>x.path!=='payload').sort((a,b)=>b.bytes-a.bytes).slice(0,24);
  const stateBreakdown=Object.entries(payload?.state||{}).map(([key,value])=>({key,bytes:payloadByteSize(value),summary:snapshotValueSummary(value)})).sort((a,b)=>b.bytes-a.bytes);
  const setupBreakdown=Object.entries(payload?.setup||{}).map(([key,value])=>({key,bytes:payloadByteSize(value),summary:snapshotValueSummary(value)})).sort((a,b)=>b.bytes-a.bytes).slice(0,12);
  return {analyzedAt:new Date().toISOString(),totalBytes,largest,stateBreakdown,setupBreakdown};
}
function snapshotAnalysisHtml(analysis){if(!analysis)return '<p class="small">No snapshot analysis has been recorded yet. Make a change or press Save Now.</p>';const top=(analysis.stateBreakdown||[]).slice(0,16),deep=(analysis.largest||[]).slice(0,16);return `<div class="cloud-detail-grid"><div class="cloud-detail"><div class="small">Total snapshot</div><b>${esc(formatSnapshotBytes(analysis.totalBytes))}</b></div><div class="cloud-detail"><div class="small">Analyzed</div><b>${esc(formatDiagnosticTime(analysis.analyzedAt))}</b></div></div><h3 style="margin-top:18px">State breakdown</h3><div class="cloud-detail-grid">${top.map(x=>`<div class="cloud-detail"><div class="small">state.${esc(x.key)}</div><b>${esc(formatSnapshotBytes(x.bytes))}</b><div class="small">${esc(x.summary)}</div></div>`).join('')}</div><h3 style="margin-top:18px">Largest nested paths</h3><div class="cloud-detail-grid">${deep.map(x=>`<div class="cloud-detail"><div class="small" style="overflow-wrap:anywhere">${esc(x.path)}</div><b>${esc(formatSnapshotBytes(x.bytes))}</b><div class="small">${esc(x.summary)}</div></div>`).join('')}</div>`}
function downloadSnapshotAnalysis(){const analysis=analyzeTournamentSnapshot();downloadJson({appVersion:'__KSM_VERSION__',tournamentId:cloudSession.tournamentId||null,cloudRevision:cloudSession.revision||0,...analysis},`KSM_Snapshot_Analysis_${new Date().toISOString().replace(/[:.]/g,'-')}.json`)}
function analyzeHistoryEntry(entry,index){
  const properties=Object.entries(entry||{}).map(([key,value])=>({key,bytes:payloadByteSize(value),summary:snapshotValueSummary(value)})).sort((a,b)=>b.bytes-a.bytes);
  const changes=Object.entries(entry?.changes||{}).map(([key,value])=>({key,bytes:payloadByteSize(value),beforeBytes:payloadByteSize(value?.before),afterBytes:payloadByteSize(value?.after),summary:snapshotValueSummary(value)})).sort((a,b)=>b.bytes-a.bytes);
  return {index,label:entry?.label||'Action',when:entry?.when||'',totalBytes:payloadByteSize(entry),properties,changes};
}
function analyzeCourtActionHistory(){
  ensureCourtHistory();
  const courts={};
  ['A','B'].forEach(court=>{
    const entries=state.courtActionHistory?.[court]||[];
    const analyzed=entries.map((entry,index)=>analyzeHistoryEntry(entry,index));
    const sorted=[...analyzed].sort((a,b)=>b.totalBytes-a.totalBytes);
    const totalBytes=analyzed.reduce((sum,item)=>sum+item.totalBytes,0);
    courts[court]={entryCount:entries.length,totalBytes,averageBytes:entries.length?Math.round(totalBytes/entries.length):0,smallestBytes:sorted.length?sorted[sorted.length-1].totalBytes:0,largest:sorted[0]||null,first:analyzed[0]||null,latest:analyzed[analyzed.length-1]||null,entries:sorted.slice(0,12)};
  });
  return {analyzedAt:new Date().toISOString(),courts};
}
function historyEntryCard(title,item){
  if(!item)return `<div class="cloud-detail"><div class="small">${esc(title)}</div><b>No entry</b></div>`;
  const largestChanges=(item.changes||[]).slice(0,6).map(x=>`${x.key}: ${formatSnapshotBytes(x.bytes)}`).join(' • ');
  return `<div class="cloud-detail"><div class="small">${esc(title)} • #${item.index+1}</div><b>${esc(item.label)} — ${esc(formatSnapshotBytes(item.totalBytes))}</b><div class="small" style="overflow-wrap:anywhere">${esc(largestChanges||'No changed state properties')}</div></div>`;
}
function actionHistoryAnalysisHtml(analysis=analyzeCourtActionHistory()){
  return ['A','B'].map(court=>{const c=analysis.courts[court];return `<h3 style="margin-top:18px">Court ${court}</h3><div class="cloud-detail-grid"><div class="cloud-detail"><div class="small">Entries</div><b>${c.entryCount}</b></div><div class="cloud-detail"><div class="small">Total history</div><b>${esc(formatSnapshotBytes(c.totalBytes))}</b></div><div class="cloud-detail"><div class="small">Average entry</div><b>${esc(formatSnapshotBytes(c.averageBytes))}</b></div><div class="cloud-detail"><div class="small">Largest entry</div><b>${esc(formatSnapshotBytes(c.largest?.totalBytes||0))}</b></div>${historyEntryCard('First entry',c.first)}${historyEntryCard('Latest entry',c.latest)}${historyEntryCard('Largest entry',c.largest)}</div>`}).join('');
}
function historySampleEntry(entry,index){if(!entry)return null;return {analysis:analyzeHistoryEntry(entry,index),rawEntry:entry}}
function downloadActionHistorySample(){
  ensureCourtHistory();const courts={};
  ['A','B'].forEach(court=>{const entries=state.courtActionHistory?.[court]||[],sizes=entries.map((entry,index)=>({entry,index,bytes:payloadByteSize(entry)})),largest=sizes.sort((a,b)=>b.bytes-a.bytes)[0]||null;courts[court]={entryCount:entries.length,first:historySampleEntry(entries[0],0),latest:historySampleEntry(entries[entries.length-1],entries.length-1),largest:largest?historySampleEntry(largest.entry,largest.index):null}});
  downloadJson({appVersion:'__KSM_VERSION__',tournamentId:cloudSession.tournamentId||null,cloudRevision:cloudSession.revision||0,analyzedAt:new Date().toISOString(),courts},`KSM_Action_History_Sample_${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
}

const KSM_V3173_RESET_MARKER='ksm.local.reset.v3_17_3';
function resetLegacyTournamentDataOnce(){
  if(localStorage.getItem(KSM_V3173_RESET_MARKER)==='done')return;
  [KSM_SAVE_KEY,KSM_CLOUD_SESSION_KEY,KSM_CLOUD_OUTBOX_KEY,KSM_CLOUD_RECOVERY_KEY,KSM_CLOUD_DIAGNOSTICS_KEY,'ksm.tournament.library.v3_16'].forEach(key=>localStorage.removeItem(key));
  localStorage.setItem(KSM_V3173_RESET_MARKER,'done');
}
resetLegacyTournamentDataOnce();
