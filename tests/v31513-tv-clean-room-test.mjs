import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const checks=[
 ['version',html.includes('v3.15.13')],
 ['clean root',html.includes('class="tv3-root"')],
 ['single fixed grid',html.includes('grid-template-rows:190px 500px 390px!important')],
 ['permanent upcoming',html.includes('class="tv3-upcoming"')],
 ['upcoming cards',html.includes('class="tv3-up-card')],
 ['individual five columns',html.includes('grid-template-columns:520px 280px 120px 280px 520px!important')],
 ['team centered grid',html.includes('grid-template-columns:minmax(0,1fr) 110px minmax(0,1fr)!important')],
 ['kachinuki exactly three',html.includes('slice(0,3)')],
 ['new renderer emitted',/function renderTvDisplay\(\)[\s\S]*tv3-root/.test(html)],
 ['no tv2 emitted',!/innerHTML=`<div class="tv2-canvas/.test(html)],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
console.log(`v3.15.13 TV clean-room checks: ${checks.length}/${checks.length}`);
