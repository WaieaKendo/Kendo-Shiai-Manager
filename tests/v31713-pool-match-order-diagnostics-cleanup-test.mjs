import fs from 'node:fs';
import vm from 'node:vm';
import { extractFunction, withDependencies, html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';

const html=appSource;
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=appServiceWorker;
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');

function extractConstStatement(source,name){
  const start=source.indexOf(`const ${name}=`);
  if(start<0)throw new Error(`Missing const ${name}`);
  const end=source.indexOf(';',start);
  if(end<0)throw new Error(`Unterminated const ${name}`);
  return source.slice(start,end+1);
}

const checks=[
  [html.includes("3:Object.freeze([[0,1],[2,1],[2,0]])"),'3-person canonical template'],
  [html.includes("4:Object.freeze([[0,1],[2,3],[2,0],[1,3],[1,2],[3,0]])"),'4-person canonical template'],
  [html.includes('const pairs=poolMatchPairs(players.length);'),'tiebreaks reuse canonical pool templates'],
  [!html.includes('id="tvRealtimeDiagnostics"'),'visible TV diagnostics element removed'],
  [!html.includes('body.ksm-tv .tv-realtime-diagnostics{'),'visible TV diagnostics CSS removed'],
  [html.includes('const ksmTvRealtimeDiagnostics={'),'internal realtime diagnostics retained'],
  [html.includes('function updateTvRealtimeDiagnostics('),'internal realtime diagnostic updates retained']
];
let failed=false;
for(const [ok,name] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}

const snippets=[
  extractConstStatement(html,'POOL_MATCH_TEMPLATES'),
  extractFunction(html,'poolMatchPairs'),
  extractFunction(html,'buildPoolMatches')
].join('\n');
const context={poolCourtFor:()=> 'A'};
vm.createContext(context);
vm.runInContext(`${withDependencies(html,snippets,{exclude:Object.keys(context)})}\nthis.poolMatchPairs=poolMatchPairs;this.buildPoolMatches=buildPoolMatches;`,context);

function player(name){return {name,dojo:`Dojo ${name}`}}
function generated(names){
  return context.buildPoolMatches('Test',[{label:'A',players:names.map(player)}]);
}
const three=generated(['A','B','C']);
const four=generated(['A','B','C','D']);
const seq=matches=>matches.map(m=>`${m.white}-${m.red}`).join(',');

const dynamicChecks=[
  [seq(three)==='A-B,C-B,C-A',`3-person generated order ${seq(three)}`],
  [seq(four)==='A-B,C-D,C-A,B-D,B-C,D-A',`4-person generated order ${seq(four)}`],
  [three.map(m=>m.poolTemplateOrder).join(',')==='0,1,2','3-person explicit template order metadata'],
  [four.map(m=>m.poolTemplateOrder).join(',')==='0,1,2,3,4,5','4-person explicit template order metadata'],
  [four.every(m=>m.poolOrder===0),'pool order metadata'],
  [four.every(m=>m.origin==='TEMPLATE'),'generated matches retain TEMPLATE origin']
];
for(const [ok,name] of dynamicChecks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}

if(failed)process.exit(1);
