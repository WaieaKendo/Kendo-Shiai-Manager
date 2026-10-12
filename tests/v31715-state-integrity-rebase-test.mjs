import fs from 'node:fs';
import vm from 'node:vm';
import { extractFunction, withDependencies, html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';

const html=appSource;
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=appServiceWorker;
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');


let failed=false;
function check(ok,name){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}

check(html.includes('sanitizeLoadedTournamentState(state'),'load-time state sanitizer');
check(html.includes('resolveRebasePatch(localState,rebased.state,patch)'),'identity-safe rebase path');
check(worker.includes("return json({ error: 'Invalid tournament state', integrityError }, 422)"),'Worker malformed-state rejection');
check(html.includes("matches=(state.allMatches[div]||[]).filter(isValidMatchObject)"),'division completion null safety');

const snippets=[
  "const KSM_LOCAL_VIEW_STATE_KEYS=new Set(['currentCourt','publicCourt','currentDivision','matches','current','score']);",
  'function cloneJson(value){return JSON.parse(JSON.stringify(value))}',
  extractFunction(html,'isValidMatchObject'),
  extractFunction(html,'matchSyncIdentity'),
  extractFunction(html,'applyPatchToStateObject'),
  extractFunction(html,'resolveRebasePatch'),
  extractFunction(html,'sanitizeLoadedTournamentState')
].join('\n');
const context={console};vm.createContext(context);vm.runInContext(withDependencies(html,snippets,{exclude:Object.keys(context)}),context);

// Regression 1: a stale deep numeric patch must never create a sparse array.
const target={allMatches:{Test:[{division:'Test',type:'individual',pool:'A',poolOrder:0,white:'A',red:'B',wp:[]}]}};
const sparsePatch={path:['allMatches','Test',4,'wp',0],after:'M'};
const applied=context.applyPatchToStateObject(target,sparsePatch);
check(applied===false,'out-of-range deep array patch is rejected');
check(target.allMatches.Test.length===1,'rejected patch does not grow match array');
check(!JSON.stringify(target).includes('null'),'rejected patch cannot serialize sparse holes as null');

// Regression 2: stale numeric index is resolved by match identity against newer server ordering.
const matchA={division:'Test',type:'individual',pool:'A',poolOrder:0,whitePoolSlot:'A',redPoolSlot:'B',white:'A',red:'B',wp:[]};
const matchB={division:'Test',type:'individual',pool:'A',poolOrder:1,whitePoolSlot:'C',redPoolSlot:'B',white:'C',red:'B',wp:[]};
const localState={allMatches:{Test:[matchA,{...matchB,wp:['M']}]}};
const rebasedState={allMatches:{Test:[matchB,matchA]}};
const raw={path:['allMatches','Test',1,'wp',0],before:{__ksmMissing:true},after:'M'};
const resolved=context.resolveRebasePatch(localState,rebasedState,raw);
check(resolved?.path?.[2]===0,'rebase remaps stale index to stable match identity');
check(context.applyPatchToStateObject(rebasedState,resolved)===true,'identity-resolved patch applies');
check(rebasedState.allMatches.Test[0].wp[0]==='M','score lands on intended match after reorder');

// Regression 3: missing dynamic match is appended as a full object, not created sparsely.
const localDynamic={division:'Test',type:'individual',championship:true,champNodeId:'C-QF-2',position:'Quarterfinal',white:'W',red:'R',wp:['K'],rp:[]};
const localDynamicState={allMatches:{Test:[matchA,matchB,localDynamic]}};
const serverDynamicState={allMatches:{Test:[matchA,matchB]}};
const dynamicPatch={path:['allMatches','Test',2,'wp',0],before:{__ksmMissing:true},after:'K'};
const dynamicResolved=context.resolveRebasePatch(localDynamicState,serverDynamicState,dynamicPatch);
check(dynamicResolved?.path?.[2]===2,'missing dynamic match gets a concrete appended index');
check(serverDynamicState.allMatches.Test.length===3,'dynamic match appended without holes');
check(serverDynamicState.allMatches.Test.every(Boolean),'dynamic append contains no null entries');

// Regression 4: old malformed snapshots self-heal before render and pointers are normalized.
const dirty={allMatches:{Test:[matchA,null,matchB,undefined]},currentByDivision:{Test:3},courtState:{A:{division:'Test',index:3},B:{division:'Test',index:2}}};
const repaired=context.sanitizeLoadedTournamentState(dirty,'test');
check(repaired.repaired===2,'sanitizer removes null/undefined match entries');
check(dirty.allMatches.Test.length===2&&dirty.allMatches.Test.every(Boolean),'sanitized allMatches is dense');
check(dirty.currentByDivision.Test===2,'division pointer adjusted after compaction');
check(dirty.courtState.B.index===1,'court pointer adjusted around removed slot');

// Worker boundary rejects malformed allMatches.
const workerContext={};vm.createContext(workerContext);vm.runInContext(extractFunction(worker,'validateTournamentPayload'),workerContext);
check(workerContext.validateTournamentPayload({state:{allMatches:{A:[matchA,null]}}})?.index===1,'Worker detects null match entry');
check(workerContext.validateTournamentPayload({state:{allMatches:{A:[matchA]}}})===null,'Worker accepts valid dense match arrays');

if(failed)process.exit(1);
