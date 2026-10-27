import fs from 'node:fs';
import vm from 'node:vm';
import { extractFunction, engine, html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';

const html=appSource;
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=appServiceWorker;
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');


let failed=false;
function check(ok,name){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}

check(html.includes('const ksmLocalCourtDivision={A:null,B:null};'),'device-local division preference exists');
check(html.includes('if(state.currentCourt)rememberLocalCourtDivision(state.currentCourt,div);'),'manual division selection becomes local court preference');
check(html.includes("preserveOwnedCourtRuntimeState(rebased.state,localState,court);"),'concurrent rebase preserves owner court navigation');
check(html.includes("preserveLocalDivision:preserveLocalDivisionForRemoteSync(),source:'live sync'"),'live remote snapshots preserve local scorekeeper division');
check(html.includes('if(!individualMatchReady(active)||!matchBelongsToCourt(active,court))'),'rehydration rejects stale/non-scorable active pointer');
check(html.includes('let m=ensureScorableCurrentMatch();'),'score renderer self-heals missing active match');

// Regression 1: owner-scoped court state must survive a Court B/cloud rebase without
// copying a stale numeric index. The QF is now at index 2 and must be rediscovered.
const pureContext={console};
vm.createContext(pureContext);
vm.runInContext([
  engine,
  extractFunction(html,'normalizeCourt'),
  extractFunction(html,'individualMatchReady'),
  extractFunction(html,'matchBelongsToCourtInState'),
  extractFunction(html,'nextReadyIndexInState'),
  extractFunction(html,'preserveOwnedCourtRuntimeState')
].join('\n'),pureContext);
const localState={
  currentCourt:'A',currentDivision:'Division New',
  courtState:{A:{division:'Division New',index:99},B:{division:'Other',index:0}},
  courtActiveDivision:{A:'Division New',B:'Other'}
};
const rebasedState={
  divisionCourts:{'Division New':'A','Other':'B'},
  allMatches:{
    'Division New':[
      {division:'Division New',court:'A',done:true,white:'P1',red:'P2'},
      {division:'Division New',court:'A',done:false,templateNode:true,ready:false,white:'',red:'',position:'Semifinal'},
      {division:'Division New',court:'A',done:false,templateNode:true,ready:true,white:'QF White',red:'QF Red',position:'Quarterfinal'}
    ],
    Other:[{division:'Other',court:'B',done:false,white:'B1',red:'B2'}]
  },
  courtState:{A:{division:'Other',index:0},B:{division:'Other',index:0}},
  courtActiveDivision:{A:'Other',B:'Other'}
};
check(pureContext.preserveOwnedCourtRuntimeState(rebasedState,localState,'A')===true,'owner court runtime state can be preserved');
check(rebasedState.courtState.A.division==='Division New','Court A division survives concurrent rebase');
check(rebasedState.courtState.A.index===2,'Court A pointer is recomputed to ready QF instead of stale index');
check(rebasedState.courtState.B.division==='Other','Court B server state remains untouched');

// Regression 1b: split-court pointer repair respects the match's explicit court.
const splitState={
  divisionCourts:{Split:'split'},
  allMatches:{Split:[
    {division:'Split',court:'A',done:false,templateNode:true,ready:true,white:'A-QF-W',red:'A-QF-R'},
    {division:'Split',court:'B',done:false,templateNode:true,ready:true,white:'B-QF-W',red:'B-QF-R'}
  ]},
  courtState:{A:{division:'Split',index:9},B:{division:'Split',index:9}},
  courtActiveDivision:{A:'Split',B:'Split'}
};
check(pureContext.preserveOwnedCourtRuntimeState(splitState,{currentCourt:'B',currentDivision:'Split',courtState:{B:{division:'Split',index:9}},courtActiveDivision:{B:'Split'}},'B')===true,'split Court B runtime state can be repaired');
check(splitState.courtState.B.index===1,'split Court B selects its own ready QF');

// Regression 2: a remote snapshot may contain the old displayed division and an
// end-of-array pointer. Rehydration must keep the scorekeeper's local division and
// move to the newly ready QF.
const localDivisionContext={
  console,
  ksmLocalCourtDivision:{A:'Division New',B:null},
  state:{
    currentCourt:'A',currentDivision:'Division Old',current:3,
    currentByDivision:{'Division Old':3,'Division New':3},
    allMatches:{
      'Division Old':[{division:'Division Old',court:'A',done:false,white:'Old1',red:'Old2'}],
      'Division New':[
        {division:'Division New',court:'A',done:true,white:'P1',red:'P2'},
        {division:'Division New',court:'A',done:true,white:'P3',red:'P4'},
        {division:'Division New',court:'A',done:false,templateNode:true,ready:true,white:'QF White',red:'QF Red',position:'Quarterfinal'}
      ]
    },
    courtState:{A:{division:'Division Old',index:0},B:{division:null,index:0}},
    courtActiveDivision:{A:'Division Old',B:null},matches:[],score:{W:[],R:[],WT:0,RT:0}
  }
};
localDivisionContext.normalizeCourt=(value)=>String(value||'').toUpperCase()==='B'?'B':'A';
localDivisionContext.localCourtDivision=(court)=>localDivisionContext.ksmLocalCourtDivision[localDivisionContext.normalizeCourt(court)]||null;
localDivisionContext.rememberLocalCourtDivision=(court,div)=>{localDivisionContext.ksmLocalCourtDivision[localDivisionContext.normalizeCourt(court)]=div;return div};
localDivisionContext.individualMatchReady=(m)=>!!(m&&!m.done&&(!m.templateNode||m.ready)&&m.white&&m.red);
localDivisionContext.matchBelongsToCourt=(m,c)=>!!m&&m.court===c;
localDivisionContext.findNextForCourt=(court,div)=>{
  const arr=localDivisionContext.state.allMatches[div]||[];
  const index=arr.findIndex(m=>localDivisionContext.individualMatchReady(m)&&localDivisionContext.matchBelongsToCourt(m,court));
  return {division:div,index:index<0?arr.length:index};
};
localDivisionContext.applyCourtState=(court,cs)=>{
  const st=localDivisionContext.state;st.currentCourt=court;st.courtState[court]=cs;st.courtActiveDivision[court]=cs.division;st.currentDivision=cs.division;st.matches=st.allMatches[cs.division]||[];st.current=cs.index;st.currentByDivision[cs.division]=cs.index;
};
vm.createContext(localDivisionContext);
vm.runInContext(extractFunction(html,'rehydrateLoadedTournamentState'),localDivisionContext);
localDivisionContext.rehydrateLoadedTournamentState({preserveLocalDivision:true});
check(localDivisionContext.state.currentDivision==='Division New','live sync cannot revert manually selected division');
check(localDivisionContext.state.current===2,'end/stale pointer self-heals to first ready QF');
check(localDivisionContext.state.matches[2].position==='Quarterfinal','self-healed active match is the QF');


// Regression 3: even without a fresh payload application, the final score renderer
// must repair an empty/end-of-array active pointer when a QF is ready.
const renderContext={
  state:{
    currentCourt:'A',currentDivision:'Division New',current:3,matches:[],score:{W:[],R:[],WT:0,RT:0},
    allMatches:{'Division New':[
      {division:'Division New',court:'A',done:true,white:'P1',red:'P2'},
      {division:'Division New',court:'A',done:false,templateNode:true,ready:true,white:'QF W',red:'QF R',position:'Quarterfinal'}
    ]}
  }
};
renderContext.individualMatchReady=(m)=>!!(m&&!m.done&&(!m.templateNode||m.ready)&&m.white&&m.red);
renderContext.matchBelongsToCourt=(m,c)=>!!m&&m.court===c;
renderContext.findNextForCourt=(court,div)=>({division:div,index:1});
renderContext.applyCourtState=(court,cs)=>{const st=renderContext.state;st.currentCourt=court;st.currentDivision=cs.division;st.matches=st.allMatches[cs.division];st.current=cs.index;};
vm.createContext(renderContext);
vm.runInContext(extractFunction(html,'ensureScorableCurrentMatch'),renderContext);
const healed=renderContext.ensureScorableCurrentMatch();
check(healed?.position==='Quarterfinal'&&renderContext.state.current===1,'score renderer repairs empty active pointer to ready QF');

if(failed)process.exit(1);
