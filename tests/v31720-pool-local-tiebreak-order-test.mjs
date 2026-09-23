import fs from 'node:fs';
import vm from 'node:vm';
import { extractFunction, html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';

const html=appSource;
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=appServiceWorker;
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');


let failed=false;
function check(ok,name){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}

check(html.includes("normalizeIndividualPoolTiebreakOrderInState(rebasedState,div,'concurrent rebase insertion')"),'rebase path normalizes a newly recovered tiebreak');
check(html.includes("normalizeAllIndividualPoolTiebreakOrder(rebased.state,'concurrent rebase')"),'completed rebase repairs all pool-local tiebreak ordering');
check(html.includes("normalizeAllIndividualPoolTiebreakOrder(state,options.source||'tournament load')"),'loaded tournaments self-heal legacy misplaced tiebreaks');

const context={console};
context.state={};
context.cloneJson=value=>JSON.parse(JSON.stringify(value));
context.isValidMatchObject=match=>Boolean(match&&typeof match==='object'&&!Array.isArray(match));
context.individualMatchReady=m=>!!(m&&!m.done&&(!m.templateNode||m.ready)&&(m.white&&m.red));
context.matchBelongsToCourtInState=(targetState,m,c)=>!!m&&((m.court||targetState?.divisionCourts?.[m.division]||'A')===c || (!m.court&&targetState?.divisionCourts?.[m.division]==='split'&&c==='A'));
context.nextReadyIndexInState=(targetState,div,court)=>{
  const arr=targetState?.allMatches?.[div]||[];
  const idx=arr.findIndex(m=>context.individualMatchReady(m)&&context.matchBelongsToCourtInState(targetState,m,court));
  return idx<0?arr.length:idx;
};
vm.createContext(context);
vm.runInContext(`
${extractFunction(html,'legacyTiebreakSyncIdentity')}
${extractFunction(html,'matchSyncIdentity')}
${extractFunction(html,'matchHasSyncIdentity')}
${extractFunction(html,'isIndividualPoolTiebreakMatch')}
${extractFunction(html,'reindexPointersAfterMatchReorder')}
${extractFunction(html,'normalizeIndividualPoolTiebreakOrderInState')}
${extractFunction(html,'normalizeAllIndividualPoolTiebreakOrder')}
const APPROVED_DYNAMIC_MATCH_TYPES=Object.freeze(new Set(['INDIVIDUAL_POOL_TIEBREAK','TEAM_3_PERSON_REPRESENTATIVE','TEAM_5_PERSON_REPRESENTATIVE','KACHINUKI_REPRESENTATIVE','TEAM_3_PERSON_ROUND_ROBIN_TIEBREAK','TEAM_5_PERSON_ROUND_ROBIN_TIEBREAK','KACHINUKI_ROUND_ROBIN_TIEBREAK']));
${extractFunction(html,'appendApprovedDynamicMatches')}
${extractFunction(html,'resolveRebasePatch')}
`,context);

function baseMatch(pool,n){return {division:'D',pool,type:'individual',done:true,white:`${pool}${n}W`,red:`${pool}${n}R`,court:'A',poolOrder:n-1};}
function tie(pool,a,b,series=1,index=0){return {division:'D',pool,type:'individual',tiebreak:true,done:false,white:a,red:b,court:'A',tiebreakSeries:series,tiebreakIndex:index};}
function poolSequence(arr){return arr.filter(m=>m&&!m.championship).map(m=>m.tiebreak?`${m.pool}-TB${m.tiebreakSeries}.${m.tiebreakIndex}`:`${m.pool}-${m.poolOrder+1}`);}
function makeFourPoolState(){
  const arr=[];
  for(const pool of ['A','B','C','D']){arr.push(baseMatch(pool,1),baseMatch(pool,2),baseMatch(pool,3));}
  arr.push({division:'D',type:'individual',championship:true,position:'Quarterfinal',white:'TBD',red:'TBD',done:false,templateNode:true,ready:false,court:'A'});
  context.state={pools:{D:['A','B','C','D'].map(label=>({label}))},allMatches:{D:arr},divisionCourts:{D:'A'},courtState:{A:{division:'D',index:2},B:{division:null,index:0}},courtActiveDivision:{A:'D',B:null},currentDivision:'D',currentCourt:'A',current:2,currentByDivision:{D:2}};
  return arr;
}

// Regression 1: a two-player Pool A tiebreak must sit directly after Pool A even
// when the supplied anchor is a cloned object and therefore fails reference equality.
let arr=makeFourPoolState();
const clonedAnchor={...arr[2]};
context.appendApprovedDynamicMatches('D',clonedAnchor,tie('A','A1','A2',1,0),'INDIVIDUAL_POOL_TIEBREAK');
let seq=poolSequence(context.state.allMatches.D);
check(seq.indexOf('A-TB1.0')===3,'2-player Pool A tiebreak is inserted immediately after Pool A');
check(seq[4]==='B-1','Pool B starts only after Pool A tiebreak');

// Regression 2: a three-player tiebreak uses the canonical A-B, C-B, C-A order
// and all three matches remain between Pool A and Pool B.
arr=makeFourPoolState();
const three=[tie('A','A','B',1,0),tie('A','C','B',1,1),tie('A','C','A',1,2)];
context.appendApprovedDynamicMatches('D',{...arr[2]},three,'INDIVIDUAL_POOL_TIEBREAK');
seq=poolSequence(context.state.allMatches.D);
check(seq.slice(3,6).join(',')==='A-TB1.0,A-TB1.1,A-TB1.2','3-player tiebreak series stays in canonical order after its pool');
check(seq[6]==='B-1','next pool follows the complete 3-player tiebreak series');

// Regression 3: self-heal the exact reported bad state: Pool A's tiebreak was
// appended after Pool D (for example by an older conflict rebase).
arr=makeFourPoolState();
const misplaced=tie('A','A1','A2',1,0);
context.state.allMatches.D.splice(context.state.allMatches.D.length-1,0,misplaced);
check(poolSequence(context.state.allMatches.D).indexOf('A-TB1.0')>poolSequence(context.state.allMatches.D).indexOf('D-3'),'bad legacy state reproduces tiebreak after Pool D');
context.normalizeIndividualPoolTiebreakOrderInState(context.state,'D','regression test');
seq=poolSequence(context.state.allMatches.D);
check(seq.indexOf('A-TB1.0')===3&&seq[4]==='B-1','legacy Pool A tiebreak is repaired ahead of Pool B');

// Regression 4: the cloud conflict path previously appended a locally created
// tiebreak to remoteArr. resolveRebasePatch must now insert and normalize it into Pool A.
const remoteBase=[];for(const pool of ['A','B','C','D'])remoteBase.push(baseMatch(pool,1),baseMatch(pool,2),baseMatch(pool,3));
const localBase=remoteBase.map(m=>({...m}));
const localTb=tie('A','A1','A2',1,0);localBase.splice(3,0,localTb);
const rebasedState={pools:{D:['A','B','C','D'].map(label=>({label}))},allMatches:{D:remoteBase.map(m=>({...m}))},divisionCourts:{D:'A'},courtState:{A:{division:'D',index:3},B:{division:null,index:0}},courtActiveDivision:{A:'D',B:null},currentDivision:'D',currentCourt:'A',current:3,currentByDivision:{D:3}};
const localState={allMatches:{D:localBase}};
const patch={path:['allMatches','D',3,'done'],before:{__ksmMissing:true},after:false,matchIdentity:context.matchSyncIdentity(localTb)};
const resolved=context.resolveRebasePatch(localState,rebasedState,patch);
check(!!resolved,'rebase resolves patch for locally created tiebreak');
seq=poolSequence(rebasedState.allMatches.D);
check(seq.indexOf('A-TB1.0')===3&&seq[4]==='B-1','conflict-recovered tiebreak is not appended after Pool D');
check(resolved.path[2]===3,'rebased patch retargets canonical Pool A tiebreak index');

// Regression 5: repeated tiebreak series between the same players need different
// sync identities or conflict replay can update the wrong series.
const s1=tie('A','A','B',1,0),s2=tie('A','A','B',2,0);
check(context.matchSyncIdentity(s1)!==context.matchSyncIdentity(s2),'tiebreak sync identity includes series/index');
check(context.matchHasSyncIdentity(s1,context.legacyTiebreakSyncIdentity(s1)),'legacy tiebreak identities remain compatible with older action history');

// Regression 6: split-court Pool C/D sequencing. Pool C and D share Court B in
// a four-pool split division, so a Pool C tiebreak must become Court B's next
// match before any Pool D match can start.
arr=makeFourPoolState();
context.state.divisionCourts.D='split';
context.state.pools.D.forEach((pool,index)=>{pool.court=index<2?'A':'B'});
context.state.allMatches.D.forEach(m=>{if(m.pool==='C'||m.pool==='D')m.court='B'});
const cTie=tie('C','C1','C2',1,0);cTie.court='B';
context.state.allMatches.D.splice(context.state.allMatches.D.length-1,0,cTie);
context.state.courtState.B={division:'D',index:context.state.allMatches.D.findIndex(m=>m.pool==='D')};
context.normalizeIndividualPoolTiebreakOrderInState(context.state,'D','split-court regression');
const splitSeq=poolSequence(context.state.allMatches.D);
check(splitSeq.indexOf('C-TB1.0')===splitSeq.indexOf('C-3')+1,'split Court B Pool C tiebreak sits directly before Pool D');
const bIndex=context.state.courtState.B.index;
check(context.state.allMatches.D[bIndex]?.pool==='C'&&context.state.allMatches.D[bIndex]?.tiebreak===true,'split Court B pointer advances to its pool tiebreak before Pool D');

if(failed)process.exit(1);
