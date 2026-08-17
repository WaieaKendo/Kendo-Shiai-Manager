import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');

function extractFunction(source,name){
  const marker=`function ${name}(`;
  const start=source.indexOf(marker);
  if(start<0)throw new Error(`Missing function ${name}`);
  const brace=source.indexOf('{',start);
  let depth=0,quote=null,escaped=false;
  for(let i=brace;i<source.length;i++){
    const ch=source[i];
    if(escaped){escaped=false;continue}
    if(quote){
      if(ch==='\\'){escaped=true;continue}
      if(ch===quote)quote=null;
      continue;
    }
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue}
    if(ch==='{')depth++;
    if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`Unbalanced function ${name}`);
}
function extractConstStatement(source,name){
  const start=source.indexOf(`const ${name}=`);
  if(start<0)throw new Error(`Missing const ${name}`);
  const end=source.indexOf(';',start);
  if(end<0)throw new Error(`Unterminated const ${name}`);
  return source.slice(start,end+1);
}

const checks=[
  [pkg.version==='3.17.13-test','package version'],
  [html.includes('v3.17.13-test'),'HTML version'],
  [sw.includes('ksm-shell-v3.17.13-test'),'service worker cache version'],
  [worker.includes("version: '3.17.13-test'"),'worker version'],
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
vm.runInContext(`${snippets}\nthis.poolMatchPairs=poolMatchPairs;this.buildPoolMatches=buildPoolMatches;`,context);

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
