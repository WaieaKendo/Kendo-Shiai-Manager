import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const checks=[
 ['clean root',html.includes('class="tv3-root"')],
 ['single fixed grid',html.includes('grid-template-rows:210px 610px 260px!important')],
 ['header current upcoming rebalance',html.includes('grid-template-rows:210px 610px 260px!important')],
 ['vertical rules neutralized',html.includes('.tv3-root .white,body.ksm-tv .tv3-root .red{border-left:0!important;border-right:0!important}')],
 ['kachinuki bottom clearance',html.includes('padding-bottom:10px!important')],
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
console.log(`v3.15.14 TV zone-rebalance checks: ${checks.length}/${checks.length}`);
