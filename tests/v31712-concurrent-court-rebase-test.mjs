import fs from 'node:fs';
import vm from 'node:vm';
import { extractFunction, withDependencies, html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';

const html=appSource;
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=appServiceWorker;
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');

function count(haystack,needle){return haystack.split(needle).length-1}

const checks=[
  [count(html,'async function performCloudSave(')===1,'single authoritative performCloudSave definition'],
  [html.includes('KSM_CLOUD_REBASE_MAX_ATTEMPTS=4'),'bounded automatic conflict retries'],
  [html.includes('pendingLocalCourtActionsForRebase'),'local action replay helper'],
  [html.includes("stage:'Rebasing concurrent court changes'"),'rebase diagnostics'],
  [html.includes("'Rebased save completed'"),'successful rebase diagnostics'],
  [html.includes('originalBaseRevision'),'original revision retained across repeated conflicts']
];
let failed=false;
for(const [ok,name] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}
if(failed)process.exit(1);

const snippets=[
  "const KSM_LOCAL_VIEW_STATE_KEYS=new Set(['currentCourt','publicCourt','currentDivision','matches','current','score']);",
  "function normalizeCourt(value){return String(value||'').toUpperCase()==='B'?'B':'A'}",
  "function cloneJson(value){return JSON.parse(JSON.stringify(value))}",
  extractFunction(html,'applyPatchToStateObject'),
  extractFunction(html,'mergeHistoryEntries'),
  "const KSM_CLOUD_REBASE_MAX_ATTEMPTS=4;",
  extractFunction(html,'historyEntryIdentity'),
  extractFunction(html,'pendingLocalCourtActionsForRebase'),
  extractFunction(html,'rebaseLocalPayloadOnRecord'),
  extractFunction(html,'performCloudSave')
].join('\n');

const localAction={
  format:'patch-v1',label:'White M',court:'A',when:'2026-08-16T04:00:00.000Z',
  clientId:'court-a-client',revision:48,
  patches:[{path:['allMatches','A','score'],before:0,after:1}]
};
const baseState=(bScore,historyA=[])=>({
  allMatches:{A:{score:0},B:{score:bScore}},
  courtActionHistory:{A:historyA,B:[]},
  courtRedoHistory:{A:[],B:[]}
});
const localPayload={schemaVersion:'1.1',savedAt:'x',state:baseState(0,[localAction])};
const server50={tournamentId:'t1',revision:50,updatedAt:'2026-08-16T04:00:01Z',payload:{schemaVersion:'1.1',state:baseState(1)}};
const server51={tournamentId:'t1',revision:51,updatedAt:'2026-08-16T04:00:02Z',payload:{schemaVersion:'1.1',state:baseState(2)}};
const requestRevisions=[];
let call=0;
const context={
  console,
  Blob,
  cloudSession:{tournamentId:'t1',revision:48,updatedAt:null,clientId:'court-a-client',court:'A'},
  state:{currentCourt:'A'},
  pinnedCourt:()=> 'A',
  cloudEnvelope:(payload)=>({tournamentId:'t1',payload}),
  cloudHeaders:()=>({'content-type':'application/json'}),
  analyzeTournamentSnapshot:()=>({totalBytes:1}),
  writeCloudDiagnosticsState:()=>({}),
  v316StaffPassword:()=> 'staffpass',
  promptNewStaffPassword:()=> 'staffpass',
  sessionStorage:{setItem(){}},
  setSessionRole(){},persistCloudSession(){},rememberTournament(){},clearOutbox(){},
  setConnectionStatus(){},renderPersistentSaveStatus(){},connectCloudSocket(){},showKsmToast(){},
  ksmCloudAttemptCounter:0,ksmLastSuccessfulSaveAt:null,ksmSaveStatusMode:'idle',ksmCloudSocket:{},
  fetch:async (_url,opts)=>{
    const sent=JSON.parse(opts.body);requestRevisions.push(sent.revision);call++;
    if(call===1)return {status:409,ok:false,text:async()=>JSON.stringify({error:'Revision conflict',record:server50})};
    if(call===2)return {status:409,ok:false,text:async()=>JSON.stringify({error:'Revision conflict',record:server51})};
    const record={tournamentId:'t1',revision:52,updatedAt:'2026-08-16T04:00:03Z',payload:sent.payload};
    return {status:200,ok:true,text:async()=>JSON.stringify(record)};
  }
};
vm.createContext(context);
vm.runInContext(withDependencies(html,snippets,{exclude:Object.keys(context)}),context);
const saved=await context.performCloudSave(localPayload,48);

const dynamicChecks=[
  [requestRevisions.join(',')==='48,50,51',`retry revisions ${requestRevisions.join(',')}`],
  [saved.revision===52,'save succeeds after two consecutive conflicts'],
  [saved.payload.state.allMatches.A.score===1,'Court A local action survives repeated rebase'],
  [saved.payload.state.allMatches.B.score===2,'newest Court B cloud state survives repeated rebase'],
  [saved.__ksmRebased===true,'rebased result marker'],
  [saved.__ksmOriginalBaseRevision===48,'original base revision marker']
];
for(const [ok,name] of dynamicChecks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}

const dedupeContext={...context,cloudSession:{...context.cloudSession,revision:52}};
// The remote history already contains the exact local action; it must not be replayed again.
const alreadyApplied={tournamentId:'t1',revision:52,payload:{schemaVersion:'1.1',state:baseState(2,[localAction])}};
const candidates=context.pendingLocalCourtActionsForRebase(localPayload,alreadyApplied,48);
const dedupeOk=candidates.length===0;
console.log(`${dedupeOk?'PASS':'FAIL'} already-applied local action is deduplicated`);
if(!dedupeOk)failed=true;

if(failed)process.exit(1);
