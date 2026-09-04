import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');

function extractFunction(source,name){
  const markers=[`async function ${name}(`,`function ${name}(`];
  let start=-1;
  for(const marker of markers){start=source.indexOf(marker);if(start>=0)break}
  if(start<0)throw new Error(`Missing function ${name}`);
  const brace=source.indexOf('{',start);let depth=0,quote=null,escaped=false;
  for(let i=brace;i<source.length;i++){
    const ch=source[i];
    if(escaped){escaped=false;continue}
    if(quote){if(ch==='\\'){escaped=true;continue}if(ch===quote)quote=null;continue}
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue}
    if(ch==='{')depth++;
    if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`Unbalanced function ${name}`);
}

let failed=false;
function check(ok,name){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}

check(pkg.version==='3.17.16-test','package version');
check(html.includes('v3.17.16-test'),'HTML version');
check(sw.includes('ksm-shell-v3.17.16-test'),'service worker version');
check(worker.includes("version: '3.17.16-test'"),'worker version');
check(html.includes('m.completedResult=completedResultSnapshot(m);'),'match completion writes atomic result snapshot');
check(html.includes('repairLoadedEliminationAdvancement(options.source||\'tournament load\')'),'loads repair elimination advancement before render');
check(html.includes('patch.matchIdentity||matchSyncIdentity(localArr[path[2]])'),'rebase prefers action-time match identity');

const snippets=[
  "const KSM_HISTORY_MISSING={__ksmMissing:true};",
  "const KSM_LOCAL_VIEW_STATE_KEYS=new Set(['currentCourt','publicCourt','currentDivision','matches','current','score']);",
  'function cloneJson(value){return JSON.parse(JSON.stringify(value))}',
  extractFunction(html,'isValidMatchObject'),
  extractFunction(html,'matchSyncIdentity'),
  extractFunction(html,'matchRequiresWinner'),
  extractFunction(html,'completedResultWinnerValid'),
  extractFunction(html,'completedResultSnapshotValid'),
  extractFunction(html,'scoreWinnerOf'),
  extractFunction(html,'pointsFor'),
  extractFunction(html,'winnerOf'),
  extractFunction(html,'repairCompletedMatchResults'),
  extractFunction(html,'historyValuesEqual'),
  extractFunction(html,'cloneHistoryValue'),
  extractFunction(html,'buildHistoryPatches'),
  extractFunction(html,'stampHistoryPatchMatchIdentity'),
  extractFunction(html,'applyPatchToStateObject'),
  extractFunction(html,'resolveRebasePatch'),
  extractFunction(html,'champWinnerObj'),
  extractFunction(html,'championshipNodeSource'),
  extractFunction(html,'syncChampionshipTemplate'),
  extractFunction(html,'champMatchBySlot'),
  extractFunction(html,'sourceLabelForRound')
].join('\n');

const context={console,state:{allMatches:{},championshipNodes:{}}};
vm.createContext(context);vm.runInContext(snippets,context);

// Regression 1: completion must carry score + winner even if prior point patches never reached the server.
const before={allMatches:{Test:[{division:'Test',type:'individual',championship:true,champNodeId:'QF1',position:'Quarterfinal',bracketSlot:0,white:'Alice',red:'Rika',wp:['M'],rp:[],done:false}]}};
const after=JSON.parse(JSON.stringify(before));
after.allMatches.Test[0].done=true;
after.allMatches.Test[0].completedResult={winner:'Alice',wp:['M'],rp:[],wt:0,rt:0,recordedAt:'2026-09-04T00:00:00.000Z'};
const completionPatches=context.buildHistoryPatches(before,after).map(p=>context.stampHistoryPatchMatchIdentity(p,before,after));
check(completionPatches.some(p=>p.path.at(-1)==='completedResult'&&p.after?.winner==='Alice'),'completion action contains atomic winner/score snapshot');
check(completionPatches.filter(p=>p.path[0]==='allMatches').every(p=>p.matchIdentity==='champ:Test:QF1'),'completion patches carry stable QF1 identity');

// Simulate the failure class: remote has completion target but lost the earlier point score.
const localState=after;
const rebasedState={allMatches:{Test:[{division:'Test',type:'individual',championship:true,champNodeId:'QF1',position:'Quarterfinal',bracketSlot:0,white:'Alice',red:'Rika',wp:[],rp:[],done:false}]}};
for(const patch of completionPatches){
  const resolved=context.resolveRebasePatch(localState,rebasedState,patch);
  if(resolved)context.applyPatchToStateObject(rebasedState,resolved);
}
context.repairCompletedMatchResults(rebasedState,'unit test');
const repairedQf1=rebasedState.allMatches.Test[0];
check(repairedQf1.done===true,'completion remains completed after rebase');
check(repairedQf1.wp.length===1&&repairedQf1.wp[0]==='M','atomic result restores missing completed score');
check(context.winnerOf(repairedQf1)==='Alice','atomic result preserves QF winner instead of Hikiwake');

// Regression 2: action-time identity survives later array reordering.
const qf1={division:'Test',type:'individual',championship:true,champNodeId:'QF1',position:'Quarterfinal',bracketSlot:0,white:'Alice',red:'Rika',wp:[],rp:[],done:false};
const qf2={division:'Test',type:'individual',championship:true,champNodeId:'QF2',position:'Quarterfinal',bracketSlot:1,white:'Ben',red:'Kai',wp:[],rp:[],done:false};
const histBefore={allMatches:{Test:[qf1,qf2]}};
const histAfter=JSON.parse(JSON.stringify(histBefore));histAfter.allMatches.Test[0].wp=['K'];
const scorePatch=context.buildHistoryPatches(histBefore,histAfter).map(p=>context.stampHistoryPatchMatchIdentity(p,histBefore,histAfter)).find(p=>p.path[0]==='allMatches');
const reorderedLocal={allMatches:{Test:[qf2,{...qf1,wp:['K']}]}};
const reorderedRemote={allMatches:{Test:[qf2,qf1]}};
const remapped=context.resolveRebasePatch(reorderedLocal,reorderedRemote,scorePatch);
check(remapped?.path?.[2]===1,'stamped identity maps patch to QF1 after local array reorder');
context.applyPatchToStateObject(reorderedRemote,remapped);
check(reorderedRemote.allMatches.Test[1].wp[0]==='K'&&reorderedRemote.allMatches.Test[0].wp.length===0,'reordered patch cannot land on QF2');

// Regression 3: legacy/corrupt completed elimination tie is reopened, never propagated as Hikiwake.
const dirty={allMatches:{Test:[{division:'Test',type:'individual',championship:true,champNodeId:'QF1',position:'Quarterfinal',bracketSlot:0,white:'Alice',red:'Rika',wp:[],rp:[],done:true,ready:false}]}};
const repaired=context.repairCompletedMatchResults(dirty,'legacy test');
check(repaired.reopened===1&&dirty.allMatches.Test[0].done===false,'invalid completed QF is reopened for scoring');

// Regression 4: source labels never turn an invalid feeder into the literal competitor name Hikiwake.
context.state={
  allMatches:{Test:[{division:'Test',type:'individual',championship:true,champNodeId:'QF1',position:'Quarterfinal',bracketSlot:0,white:'Alice',red:'Rika',wp:[],rp:[],done:true}]},
  championshipNodes:{Test:[{id:'QF1',round:'Quarterfinal',slot:0}]}
};
const safeLabel=context.sourceLabelForRound('Test','Quarterfinal',0);
check(safeLabel.name==='Winner of Quarterfinal Match 1'&&safeLabel.done===false,'invalid feeder renders as awaiting winner, not Hikiwake');

// Regression 5: two completed QFs deterministically populate the semifinal from authoritative result snapshots.
context.state={
  allMatches:{Test:[
    {division:'Test',type:'individual',championship:true,champNodeId:'QF1',position:'Quarterfinal',bracketSlot:0,white:'Alice',red:'Rika',wp:[],rp:[],done:true,completedResult:{winner:'Alice',wp:['M'],rp:[],wt:0,rt:0}},
    {division:'Test',type:'individual',championship:true,champNodeId:'QF2',position:'Quarterfinal',bracketSlot:1,white:'Ben',red:'Kai',wp:[],rp:[],done:true,completedResult:{winner:'Kai',wp:[],rp:['K'],wt:0,rt:0}},
    {division:'Test',type:'individual',championship:true,templateNode:true,champNodeId:'SF1',position:'Semifinal',bracketSlot:0,white:'',red:'',wp:[],rp:[],done:false,ready:false,court:'A'}
  ]},
  championshipNodes:{Test:[
    {id:'QF1',round:'Quarterfinal',slot:0,left:null,right:null,court:'A'},
    {id:'QF2',round:'Quarterfinal',slot:1,left:null,right:null,court:'A'},
    {id:'SF1',round:'Semifinal',slot:0,left:{ref:'QF1'},right:{ref:'QF2'},court:'A'}
  ]}
};
context.repairCompletedMatchResults(context.state,'advancement test');
context.syncChampionshipTemplate('Test');
const sf=context.state.allMatches.Test.find(m=>m.champNodeId==='SF1');
check(sf.red==='Alice'&&sf.white==='Kai'&&sf.ready===true,'QF1/QF2 winners remain stable when semifinal becomes ready');
check(sf.red!=='Hikiwake'&&sf.white!=='Hikiwake','Hikiwake cannot occupy a semifinal competitor slot');

// Worker boundary: winner-required completed ties are rejected, valid legacy scored results still pass.
const workerContext={};vm.createContext(workerContext);
vm.runInContext([extractFunction(worker,'workerMatchRequiresWinner'),extractFunction(worker,'validateTournamentPayload')].join('\n'),workerContext);
const badPayload={state:{allMatches:{Test:[{division:'Test',type:'individual',championship:true,white:'A',red:'B',wp:[],rp:[],done:true}]}}};
const goodPayload={state:{allMatches:{Test:[{division:'Test',type:'individual',championship:true,white:'A',red:'B',wp:['M'],rp:[],done:true}]}}};
check(workerContext.validateTournamentPayload(badPayload)?.reason==='completed winner-required match has no identifiable winner','Worker rejects completed elimination tie');
check(workerContext.validateTournamentPayload(goodPayload)===null,'Worker accepts legacy completed elimination with identifiable score winner');

if(failed)process.exit(1);
