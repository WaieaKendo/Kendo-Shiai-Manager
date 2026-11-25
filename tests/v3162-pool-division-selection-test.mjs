import { html as appSource } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
const checks=[
  ['independent pool selection state', html.includes("poolViewDivision:'Women’s Open'")],
  ['selector updates pool selection state', html.includes('onchange="state.poolViewDivision=this.value;renderPools()"')],
  ['renderDivisions preserves pool selector', html.includes('let selected=(poolDiv.value&&all.includes(poolDiv.value))?poolDiv.value')],
  ['renderPools uses independent selection', html.includes('poolDiv?.value||state.poolViewDivision||state.currentDivision')],
];
let failed=false;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed=true;}
process.exit(failed?1:0);
