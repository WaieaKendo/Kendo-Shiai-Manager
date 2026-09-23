import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/service-worker.js','utf8');
const checks=[
  ['name line-height',html.includes('.tv3-name{font-size:76px!important;line-height:1!important')],
  ['descender padding',html.includes('padding-bottom:6px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important')],
  ['compact footer rows',html.includes('grid-template-rows:40px 80px 80px!important;gap:8px!important')],
  ['bottom safe area',html.includes('padding:4px 0 40px!important')],
  ['fixed canvas',html.includes('grid-template-rows:210px 610px 260px!important')],
];
for(const [name,ok] of checks){if(!ok){console.error(`FAIL: ${name}`);process.exitCode=1;}}
if(!process.exitCode) console.log(`v3.15.16 final TV polish checks: ${checks.length}/${checks.length}`);
