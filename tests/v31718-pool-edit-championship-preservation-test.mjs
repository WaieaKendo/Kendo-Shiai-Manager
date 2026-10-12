import fs from 'node:fs';
import vm from 'node:vm';
import { extractFunction, engine, html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';

const html=appSource;
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=appServiceWorker;
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');


let failed=false;
function check(ok,name){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}


const saveSource=extractFunction(html,'saveEditedPools');
check(saveSource.includes('buildPoolMatches(div,pools)'),'pool edit rebuilds preliminary matches');
check(saveSource.includes('buildChampionshipTemplateMatches(div,bracket)'),'pool edit rebuilds championship Match Objects');
check(saveSource.includes('poolMatches.concat(championshipMatches)'),'pool edit preserves both preliminary and championship Match Objects');
check(saveSource.includes('syncChampionshipTemplate(div)'),'pool edit resynchronizes championship template');
check(html.includes('KSM repaired missing championship Match Object'),'missing championship Match Objects have a self-healing path');

const context={console};
context.state={};
context.poolDiv={value:''};
context.renderPools=()=>{};
context.scheduleAutoSave=()=>{};
context.setActiveDivision=()=>{};
context.findNextForCourt=(court,div)=>({division:div,index:0});
context.seedNameForLabel=()=>null;
vm.createContext(context);
vm.runInContext(`${engine}
const POOL_MATCH_TEMPLATES=Object.freeze({
  2:Object.freeze([[0,1]]),
  3:Object.freeze([[0,1],[2,1],[2,0]]),
  4:Object.freeze([[0,1],[2,3],[2,0],[1,3],[1,2],[3,0]])
});
function roundMatchCountForDivision(div,round){
  const initial=(state.brackets?.[div]||[]).length;
  if(round==='Round of 16')return initial;
  if(round==='Quarterfinal')return initial>=8?4:initial;
  if(round==='Semifinal')return 2;
  if(round==='Final')return 1;
  return initial;
}
${extractFunction(html,'divisionCourtMode')}
${extractFunction(html,'poolCourtFor')}
${extractFunction(html,'poolPlayerSlotLetter')}
${extractFunction(html,'assignPoolPlayerSlots')}
${extractFunction(html,'poolPlayerSlot')}
${extractFunction(html,'poolMatchPairs')}
${extractFunction(html,'buildPoolMatches')}
${extractFunction(html,'championshipTemplateForTotal')}
${extractFunction(html,'firstRoundName')}
${extractFunction(html,'nextRoundFromName')}
${extractFunction(html,'championshipCourtFor')}
${extractFunction(html,'championshipMatchObjectForNode')}
${extractFunction(html,'buildChampionshipTemplateMatches')}
${extractFunction(html,'syncChampionshipTemplate')}
${extractFunction(html,'saveEditedPools')}
`,context);

function makePlayers(count,prefix){
  return Array.from({length:count},(_,i)=>({name:`${prefix}${i+1}`,dojo:`Dojo${(i%4)+1}`}));
}
function makePools(sizes,prefix){
  let n=0;
  return sizes.map((size,i)=>({label:String.fromCharCode(65+i),size,players:makePlayers(size,prefix).map((p,j)=>({...p,name:`${prefix}${++n}`}))}));
}
function resetDivision(div,sizes,mode,total){
  context.state={
    pools:{[div]:makePools(sizes,div+'-P')},
    brackets:{[div]:context.championshipTemplateForTotal(total)},
    championshipNodes:{},
    allMatches:{[div]:[]},
    currentByDivision:{},
    currentDivision:'Other Division',
    divisionCourts:{[div]:mode},
    courtState:{A:{division:null,index:0},B:{division:null,index:0}},
    courtActiveDivision:{A:null,B:null},
    managementRevision:0
  };
  context.poolDiv.value=div;
  context.seedNameForLabel=()=>null;
  context.saveEditedPools();
}

// Regression 1: the exact 14-person edited-pool case must retain four QFs plus
// two semifinals and a final as real Match Objects, not just as bracket preview text.
resetDivision('D14',[4,4,3,3],'A',14);
let d14=context.state.allMatches.D14;
check(d14.filter(m=>!m.championship).length===18,'14-person edited pools retain all 18 pool Match Objects');
check(d14.filter(m=>m.championship).length===7,'14-person edited pools retain 7 championship Match Objects');
check(d14.filter(m=>m.championship&&m.position==='Quarterfinal').length===4,'14-person edited division has four actual QF Match Objects');
check(context.state.championshipNodes.D14.length===7,'14-person edit rebuilds canonical championship nodes');

// Simulate completed pool standings (seed labels resolve via seedNameForLabel). QF seed sources now resolve and must make
// the actual QF Match Objects scorable.
const d14Seeds={A1:{name:'A1 Winner',dojo:'A'},A2:{name:'A2 Runner',dojo:'A'},B1:{name:'B1 Winner',dojo:'B'},B2:{name:'B2 Runner',dojo:'B'},C1:{name:'C1 Winner',dojo:'C'},C2:{name:'C2 Runner',dojo:'C'},D1:{name:'D1 Winner',dojo:'D'},D2:{name:'D2 Runner',dojo:'D'}};
context.seedNameForLabel=(div,label)=>d14Seeds[label]||null;
context.syncChampionshipTemplate('D14');
let d14qf=context.state.allMatches.D14.filter(m=>m.championship&&m.position==='Quarterfinal');
check(d14qf.every(m=>m.ready&&m.white&&m.red),'14-person edited division QFs become scorable after pool completion');

// Regression 2: split-court 12-person edit must preserve the same canonical
// elimination objects and court assignment.
resetDivision('D12',[4,4,4],'split',12);
let d12=context.state.allMatches.D12;
check(d12.filter(m=>!m.championship).length===18,'12-person edited pools retain all 18 pool Match Objects');
check(d12.filter(m=>m.championship).length===7,'12-person edited pools retain 7 championship Match Objects');
const d12Seeds={A1:{name:'A1',dojo:'A'},A2:{name:'A2',dojo:'A'},A3:{name:'A3',dojo:'A'},B1:{name:'B1',dojo:'B'},B2:{name:'B2',dojo:'B'},B3:{name:'B3',dojo:'B'},C1:{name:'C1',dojo:'C'},C2:{name:'C2',dojo:'C'}};
context.seedNameForLabel=(div,label)=>d12Seeds[label]||null;
context.syncChampionshipTemplate('D12');
let d12qf=context.state.allMatches.D12.filter(m=>m.championship&&m.position==='Quarterfinal');
check(d12qf.length===4&&d12qf.every(m=>m.ready),'12-person split edited division has four ready QFs');
check(d12qf.filter(m=>m.court==='A').length===2&&d12qf.filter(m=>m.court==='B').length===2,'12-person split edited QFs remain evenly assigned across courts');

// Regression 3: automatically repair a tournament produced by <=3.17.17 where
// Edit Pool deleted every championship Match Object but left championshipNodes.
context.state.allMatches.D12=context.state.allMatches.D12.filter(m=>!m.championship);
check(context.state.allMatches.D12.every(m=>!m.championship),'legacy broken edit state reproduces missing championship Match Objects');
context.syncChampionshipTemplate('D12');
const repaired=context.state.allMatches.D12.filter(m=>m.championship);
check(repaired.length===7,'sync self-heals all missing championship Match Objects');
check(repaired.filter(m=>m.position==='Quarterfinal').every(m=>m.ready),'self-healed QFs immediately become scorable when pool seeds are resolved');

if(failed)process.exit(1);
