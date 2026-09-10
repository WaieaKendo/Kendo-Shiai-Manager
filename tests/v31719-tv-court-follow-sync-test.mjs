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

check(pkg.version==='3.17.19-test','package version');
check(html.includes('v3.17.19-test'),'HTML version');
check(sw.includes('ksm-shell-v3.17.19-test'),'service worker version');
check(worker.includes("version: '3.17.19-test'"),'worker version');
check(html.includes('onchange="selectScorekeeperDivision(this.value)"'),'scorekeeper division selector uses publishing handler');
check(html.includes("criticalAutoSave(`Court ${state.currentCourt||'A'} division changed: ${div}`)"),'court division selection publishes immediately');
check(html.includes('preserveLocalDivision:preserveLocalDivisionForRemoteSync()'),'remote sync uses role-aware local-division preservation');
check(html.includes('const tvCourt=isTvSession()?tvAssignedCourt()'),'TV diagnostics/render sync uses URL-assigned court');

// Regression 1: writable scorekeeper tabs preserve their locally selected division,
// while TV/read-only sessions must accept authoritative remote court runtime state.
const policyContext={canWrite:true,tv:false};
policyContext.canCloudWrite=()=>policyContext.canWrite;
policyContext.isTvSession=()=>policyContext.tv;
vm.createContext(policyContext);
vm.runInContext(extractFunction(html,'preserveLocalDivisionForRemoteSync'),policyContext);
check(policyContext.preserveLocalDivisionForRemoteSync()===true,'writable scorekeeper preserves local division against remote snapshots');
policyContext.tv=true;
check(policyContext.preserveLocalDivisionForRemoteSync()===false,'TV does not preserve a stale local division');
policyContext.tv=false;policyContext.canWrite=false;
check(policyContext.preserveLocalDivisionForRemoteSync()===false,'read-only spectator does not preserve stale court runtime state');

// Regression 2: Court B TV had remembered Division Old. A newer remote snapshot says
// Court B moved to Division New. With preserveLocalDivision=false it must follow New.
const tvContext={
  console,
  ksmLocalCourtDivision:{A:null,B:'Division Old'},
  state:{
    currentCourt:'B',currentDivision:'Division Old',current:0,
    currentByDivision:{'Division Old':0,'Division New':0},
    allMatches:{
      'Division Old':[{division:'Division Old',court:'B',done:false,white:'Old W',red:'Old R'}],
      'Division New':[{division:'Division New',court:'B',done:false,white:'New W',red:'New R'}]
    },
    courtState:{A:{division:null,index:0},B:{division:'Division New',index:0}},
    courtActiveDivision:{A:null,B:'Division New'},matches:[],score:{W:[],R:[],WT:0,RT:0}
  }
};
tvContext.normalizeCourt=(value)=>String(value||'').toUpperCase()==='B'?'B':'A';
tvContext.localCourtDivision=(court)=>tvContext.ksmLocalCourtDivision[tvContext.normalizeCourt(court)]||null;
tvContext.rememberLocalCourtDivision=(court,div)=>{tvContext.ksmLocalCourtDivision[tvContext.normalizeCourt(court)]=div;return div};
tvContext.individualMatchReady=(m)=>!!(m&&!m.done&&m.white&&m.red);
tvContext.matchBelongsToCourt=(m,c)=>!!m&&m.court===c;
tvContext.findNextForCourt=(court,div)=>{
  const arr=tvContext.state.allMatches[div]||[];
  const index=arr.findIndex(m=>tvContext.individualMatchReady(m)&&tvContext.matchBelongsToCourt(m,court));
  return {division:div,index:index<0?arr.length:index};
};
tvContext.applyCourtState=(court,cs)=>{
  const st=tvContext.state;st.currentCourt=court;st.courtState[court]=cs;st.courtActiveDivision[court]=cs.division;st.currentDivision=cs.division;st.matches=st.allMatches[cs.division]||[];st.current=cs.index;st.currentByDivision[cs.division]=cs.index;
};
vm.createContext(tvContext);
vm.runInContext(extractFunction(html,'rehydrateLoadedTournamentState'),tvContext);
tvContext.rehydrateLoadedTournamentState({preserveLocalDivision:false});
check(tvContext.state.currentDivision==='Division New','Court B TV follows newly published Court B division');
check(tvContext.state.matches[0]?.white==='New W','Court B TV renders match from newly active division');

// Regression 3: the exact same incoming state must NOT steal the scorekeeper's own
// locally selected division when preservation is intentionally enabled.
const scoreContext={...tvContext, ksmLocalCourtDivision:{A:null,B:'Division Local'}};
scoreContext.state={
  currentCourt:'B',currentDivision:'Division Remote',current:0,
  currentByDivision:{'Division Remote':0,'Division Local':0},
  allMatches:{
    'Division Remote':[{division:'Division Remote',court:'B',done:false,white:'Remote W',red:'Remote R'}],
    'Division Local':[{division:'Division Local',court:'B',done:false,white:'Local W',red:'Local R'}]
  },
  courtState:{A:{division:null,index:0},B:{division:'Division Remote',index:0}},
  courtActiveDivision:{A:null,B:'Division Remote'},matches:[],score:{W:[],R:[],WT:0,RT:0}
};
scoreContext.localCourtDivision=(court)=>scoreContext.ksmLocalCourtDivision[scoreContext.normalizeCourt(court)]||null;
scoreContext.rememberLocalCourtDivision=(court,div)=>{scoreContext.ksmLocalCourtDivision[scoreContext.normalizeCourt(court)]=div;return div};
scoreContext.findNextForCourt=(court,div)=>{
  const arr=scoreContext.state.allMatches[div]||[];
  const index=arr.findIndex(m=>scoreContext.individualMatchReady(m)&&scoreContext.matchBelongsToCourt(m,court));
  return {division:div,index:index<0?arr.length:index};
};
scoreContext.applyCourtState=(court,cs)=>{
  const st=scoreContext.state;st.currentCourt=court;st.courtState[court]=cs;st.courtActiveDivision[court]=cs.division;st.currentDivision=cs.division;st.matches=st.allMatches[cs.division]||[];st.current=cs.index;st.currentByDivision[cs.division]=cs.index;
};
vm.createContext(scoreContext);
vm.runInContext(extractFunction(html,'rehydrateLoadedTournamentState'),scoreContext);
scoreContext.rehydrateLoadedTournamentState({preserveLocalDivision:true});
check(scoreContext.state.currentDivision==='Division Local','Court B scorekeeper retains its own local division');
check(scoreContext.state.matches[0]?.white==='Local W','scorekeeper remains on its locally selected match');

if(failed)process.exit(1);
