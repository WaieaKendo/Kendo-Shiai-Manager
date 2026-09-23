import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const checks=[
 ['white point class',html.includes('tv-point-string tv-white-points')],
 ['red point class',html.includes('tv-point-string tv-red-points')],
 ['fixed medial white zone',html.includes('.tv-white-points{left:676px!important}')],
 ['fixed medial red zone',html.includes('.tv-red-points{left:956px!important}')],
 ['centered team width',html.includes('width:1760px!important') && html.includes('grid-template-columns:830px 830px!important')],
 ['round context visible',html.includes('tv-context-meta{display:block!important')],
 ['upcoming outlined cards',html.includes('border:2px solid rgba(255,255,255,.32)!important')],
 ['team later nodes included',html.includes("nodeCourt!=='BOTH'") && html.includes('tvTeamNodeEntries(court,current)')],
 ['court histories remain',html.includes('courtActionHistory:{A:[],B:[]}') && html.includes('courtRedoHistory:{A:[],B:[]}')],
 ['next match atomic history',html.includes('performCourtAction(completedLabel')],
];
let fail=0;
for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++;}
if(fail)process.exit(1);
console.log(`v3.15.10 checks passed: ${checks.length}/${checks.length}`);
