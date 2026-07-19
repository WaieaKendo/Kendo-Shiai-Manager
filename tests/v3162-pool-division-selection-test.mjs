import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const checks=[
  ['version badge', html.includes('v3.17.0')],
  ['independent pool selection state', html.includes("poolViewDivision:'Women’s Open'")],
  ['selector updates pool selection state', html.includes('onchange="state.poolViewDivision=this.value;renderPools()"')],
  ['renderDivisions preserves pool selector', html.includes('let selected=(poolDiv.value&&all.includes(poolDiv.value))?poolDiv.value')],
  ['renderPools uses independent selection', html.includes('poolDiv?.value||state.poolViewDivision||state.currentDivision')],
  ['service worker cache bumped', fs.readFileSync('public/service-worker.js','utf8').includes('ksm-shell-v3.17.0')]
];
let failed=false;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed=true;}
process.exit(failed?1:0);
