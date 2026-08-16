import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const checks=[
 ['version',html.includes('v3.15.12')],
 ['isolated canvas',html.includes('tv2-canvas')],
 ['single view model',html.includes('function buildTVViewModel')],
 ['single renderer',html.includes('function renderTvDisplay(){') && html.includes('tv2IndividualCurrent')],
 ['fixed zones',html.includes('.tv2-header{position:absolute;left:100px;top:18px') && html.includes('.tv2-current{position:absolute;left:100px;top:210px') && html.includes('.tv2-upcoming{position:absolute;left:100px;top:720px')],
 ['upcoming unconditional',html.includes('${tv2UpcomingHtml(vm)}')],
 ['two upcoming cards',html.includes('while(result.length<2)result.push(null)')],
 ['top rules only',html.includes('.tv2-side-rule{border-top:14px solid #fff') && !html.includes('.tv2-side-rule{border-left')],
 ['individual fixed columns',html.includes('grid-template-columns:540px 250px 100px 250px 540px')],
 ['centered teams',html.includes('grid-template-columns:810px 100px 810px')],
 ['kachinuki 3 fighters',html.includes('(m.lineupW||[]).slice(0,3)') && html.includes('(m.lineupR||[]).slice(0,3)')],
 ['kachinuki status only',html.includes('tv2KRow') && !html.includes('tv2-k-summary')],
];
let fail=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++;}if(fail)process.exit(1);console.log(`v3.15.12 checks passed: ${checks.length}/${checks.length}`);
