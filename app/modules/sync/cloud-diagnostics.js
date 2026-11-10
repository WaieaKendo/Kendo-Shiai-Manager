// @ts-check
import {state} from '../app-state.js';
import {ensureCourtHistory} from '../court/court-scoring-and-history.js';
import {cloudSession,downloadJson,tournamentPayload} from './cloud-session-and-autosave.js';
import {KSM_CLOUD_DIAGNOSTICS_KEY,KSM_CLOUD_OUTBOX_KEY,KSM_CLOUD_RECOVERY_KEY,KSM_CLOUD_SESSION_KEY,KSM_SAVE_KEY} from './sync-state-and-rebase.js';
import * as KSMEngine from '../../engine/index.ts';
// Cloud diagnostics and the one-time reset of v3.17.3 (step 3d of #136, from app/js/19-cloud-diagnostics.js).
// resetLegacyTournamentDataOnce() still runs from app/js/19-cloud-diagnostics.js.
export function readCloudDiagnosticsState(){try{return JSON.parse(localStorage.getItem(KSM_CLOUD_DIAGNOSTICS_KEY)||'{}')}catch(_){return {}}}
export function writeCloudDiagnosticsState(patch={}){const next={...readCloudDiagnosticsState(),...patch,updatedAt:new Date().toISOString()};try{localStorage.setItem(KSM_CLOUD_DIAGNOSTICS_KEY,JSON.stringify(next))}catch(err){console.warn('Diagnostics storage failed',err)}return next}
function clearCloudDiagnosticsError(){writeCloudDiagnosticsState({stage:'Idle',httpStatus:null,errorMessage:'',errorBody:'',retryCount:0})}
export function formatDiagnosticTime(value){if(!value)return 'None';const parsed=Date.parse(value);return Number.isFinite(parsed)?new Date(parsed).toLocaleString():String(value)}
export function payloadByteSize(payload){try{return new Blob([JSON.stringify(payload)]).size}catch(_){return 0}}
export function formatSnapshotBytes(bytes){return KSMEngine.formatSnapshotBytes(bytes);// moved to app/engine/labels.ts
  }
function snapshotValueSummary(value){return KSMEngine.snapshotValueSummary(value);// moved to app/engine/labels.ts
  }
export function analyzeTournamentSnapshot(payload=tournamentPayload()){
  const totalBytes=payloadByteSize(payload),entries=[];
  const visit=(value,path,depth=0)=>{const bytes=payloadByteSize(value);entries.push({path,bytes,summary:snapshotValueSummary(value)});if(!value||typeof value!=='object'||depth>=4||Array.isArray(value))return;Object.entries(value).forEach(([key,child])=>visit(child,`${path}.${key}`,depth+1))};
  visit(payload,'payload');
  const largest=entries.filter(x=>x.path!=='payload').sort((a,b)=>b.bytes-a.bytes).slice(0,24);
  const stateBreakdown=Object.entries(payload?.state||{}).map(([key,value])=>({key,bytes:payloadByteSize(value),summary:snapshotValueSummary(value)})).sort((a,b)=>b.bytes-a.bytes);
  const setupBreakdown=Object.entries(payload?.setup||{}).map(([key,value])=>({key,bytes:payloadByteSize(value),summary:snapshotValueSummary(value)})).sort((a,b)=>b.bytes-a.bytes).slice(0,12);
  return {analyzedAt:new Date().toISOString(),totalBytes,largest,stateBreakdown,setupBreakdown};
}
export function downloadSnapshotAnalysis(){const analysis=analyzeTournamentSnapshot();downloadJson({appVersion:'__KSM_VERSION__',tournamentId:cloudSession.tournamentId||null,cloudRevision:cloudSession.revision||0,...analysis},`KSM_Snapshot_Analysis_${new Date().toISOString().replace(/[:.]/g,'-')}.json`)}
function analyzeHistoryEntry(entry,index){
  const properties=Object.entries(entry||{}).map(([key,value])=>({key,bytes:payloadByteSize(value),summary:snapshotValueSummary(value)})).sort((a,b)=>b.bytes-a.bytes);
  const changes=Object.entries(entry?.changes||{}).map(([key,value])=>({key,bytes:payloadByteSize(value),beforeBytes:payloadByteSize(value?.before),afterBytes:payloadByteSize(value?.after),summary:snapshotValueSummary(value)})).sort((a,b)=>b.bytes-a.bytes);
  return {index,label:entry?.label||'Action',when:entry?.when||'',totalBytes:payloadByteSize(entry),properties,changes};
}
export function analyzeCourtActionHistory(){
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
function historySampleEntry(entry,index){if(!entry)return null;return {analysis:analyzeHistoryEntry(entry,index),rawEntry:entry}}
export function downloadActionHistorySample(){
  ensureCourtHistory();const courts={};
  ['A','B'].forEach(court=>{const entries=state.courtActionHistory?.[court]||[],sizes=entries.map((entry,index)=>({entry,index,bytes:payloadByteSize(entry)})),largest=sizes.sort((a,b)=>b.bytes-a.bytes)[0]||null;courts[court]={entryCount:entries.length,first:historySampleEntry(entries[0],0),latest:historySampleEntry(entries[entries.length-1],entries.length-1),largest:largest?historySampleEntry(largest.entry,largest.index):null}});
  downloadJson({appVersion:'__KSM_VERSION__',tournamentId:cloudSession.tournamentId||null,cloudRevision:cloudSession.revision||0,analyzedAt:new Date().toISOString(),courts},`KSM_Action_History_Sample_${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
}
const KSM_V3173_RESET_MARKER='ksm.local.reset.v3_17_3';
export function resetLegacyTournamentDataOnce(){
  if(localStorage.getItem(KSM_V3173_RESET_MARKER)==='done')return;
  [KSM_SAVE_KEY,KSM_CLOUD_SESSION_KEY,KSM_CLOUD_OUTBOX_KEY,KSM_CLOUD_RECOVERY_KEY,KSM_CLOUD_DIAGNOSTICS_KEY,'ksm.tournament.library.v3_16'].forEach(key=>localStorage.removeItem(key));
  localStorage.setItem(KSM_V3173_RESET_MARKER,'done');
}
