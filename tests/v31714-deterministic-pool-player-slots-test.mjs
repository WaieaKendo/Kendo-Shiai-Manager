import fs from 'node:fs';
import vm from 'node:vm';
import { extractFunction } from './lib/ksm-source.mjs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');

function extractConstStatement(source,name){
  const start=source.indexOf(`const ${name}=`);
  if(start<0)throw new Error(`Missing const ${name}`);
  const end=source.indexOf(';',start);
  if(end<0)throw new Error(`Unterminated const ${name}`);
  return source.slice(start,end+1);
}

const staticChecks=[
  [html.includes('function poolPlayerSlotLetter(index)'),'canonical pool-slot helper'],
  [html.includes('poolSlot:poolPlayerSlotLetter(index),poolSlotIndex:index'),'pool entries store explicit slot metadata'],
  [html.includes('whitePoolSlot:poolPlayerSlot(players[whiteIndex],whiteIndex)'),'white Match Object slot metadata'],
  [html.includes('redPoolSlot:poolPlayerSlot(players[redIndex],redIndex)'),'red Match Object slot metadata'],
  [/const pools=assignPoolPlayerSlots\(state\.pools\[div\]\|\|\[\]\);\s*state\.pools\[div\]=pools;/.test(html),'edited pools are re-slotted before match rebuild'],
  [html.includes('Top-to-bottom order is always A, B, C, D.'),'edit UI explains slot order'],
  [html.includes('pool-slot-badge'),'generated pool UI shows slot badge'],
  [html.includes('${esc(poolPlayerSlot(x,i))}</div>${printNameBlock(x.name,x.dojo)}'),'print pools show slot letters']
];
let failed=false;
for(const [ok,name] of staticChecks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}

const snippets=[
  extractConstStatement(html,'POOL_MATCH_TEMPLATES'),
  extractFunction(html,'poolSizes'),
  extractFunction(html,'clubGroup'),
  extractFunction(html,'shuffleDeterministic'),
  extractFunction(html,'poolPlayerSlotLetter'),
  extractFunction(html,'assignPoolPlayerSlots'),
  extractFunction(html,'buildPools'),
  extractFunction(html,'poolPlayerSlot'),
  extractFunction(html,'poolMatchPairs'),
  extractFunction(html,'buildPoolMatches')
].join('\n');
const context={poolCourtFor:()=> 'A'};
vm.createContext(context);
vm.runInContext(`${snippets}\nthis.assignPoolPlayerSlots=assignPoolPlayerSlots;this.buildPools=buildPools;this.buildPoolMatches=buildPoolMatches;`,context);


const generatedComps=[
  {name:'Seed One',dojo:'A',seed:'1'},{name:'Seed Two',dojo:'B',seed:'2'},
  {name:'P3',dojo:'C',seed:''},{name:'P4',dojo:'D',seed:''},{name:'P5',dojo:'E',seed:''},{name:'P6',dojo:'F',seed:''},{name:'P7',dojo:'G',seed:''},{name:'P8',dojo:'H',seed:''}
];
const generatedPools=context.buildPools(generatedComps);

const originals=['Player 1','Player 2','Player 3','Player 4'].map((name,i)=>({name,dojo:`Dojo ${i+1}`}));
const pools=context.assignPoolPlayerSlots([{label:'A',size:4,players:originals}]);
const players=pools[0].players;
const matches=context.buildPoolMatches('Test',pools);
const pairNames=matches.map(m=>`${m.white}-${m.red}`).join(',');
const pairSlots=matches.map(m=>`${m.whitePoolSlot}-${m.redPoolSlot}`).join(',');

const noShowSurvivors=players.filter(p=>p.poolSlot!=='B');
const edited=context.assignPoolPlayerSlots([{label:'A',size:3,players:[players[3],players[0],players[2]]}]);
const editedMatches=context.buildPoolMatches('Test',edited);

const dynamicChecks=[
  [generatedPools.every(pool=>pool.players.map(p=>p.poolSlot).join(',')==='A,B,C,D'),'actual buildPools assigns A/B/C/D to every 4-person pool'],
  [generatedComps.every(p=>!Object.prototype.hasOwnProperty.call(p,'poolSlot')),'buildPools leaves registration competitors free of pool-slot metadata'],
  [players.map(p=>p.poolSlot).join(',')==='A,B,C,D','top-to-bottom players become A,B,C,D'],
  [players.map(p=>p.poolSlotIndex).join(',')==='0,1,2,3','pool slot indexes are deterministic'],
  [originals.every(p=>!Object.prototype.hasOwnProperty.call(p,'poolSlot')),'registration/source player objects are not mutated'],
  [pairNames==='Player 1-Player 2,Player 3-Player 4,Player 3-Player 1,Player 2-Player 4,Player 2-Player 3,Player 4-Player 1',`4-person names follow visible player order: ${pairNames}`],
  [pairSlots==='A-B,C-D,C-A,B-D,B-C,D-A',`4-person explicit slot order ${pairSlots}`],
  [noShowSurvivors.map(p=>p.poolSlot).join(',')==='A,C,D','structural no-show removal preserves surviving original slots'],
  [edited[0].players.map(p=>p.poolSlot).join(',')==='A,B,C','saved manual edit reassigns slots from new top-to-bottom order'],
  [editedMatches.map(m=>`${m.whitePoolSlot}-${m.redPoolSlot}`).join(',')==='A-B,C-B,C-A','edited 3-person pool uses canonical slots']
];
for(const [ok,name] of dynamicChecks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}

if(failed)process.exit(1);
