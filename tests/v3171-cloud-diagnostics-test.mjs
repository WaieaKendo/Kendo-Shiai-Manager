import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const checks=[
 ['diagnostic persistence key',html.includes("KSM_CLOUD_DIAGNOSTICS_KEY='ksm.cloud.diagnostics.v3_17_1'")],
 ['request stage captured',html.includes("stage:'Sending cloud request'")],
 ['http status captured',html.includes('httpStatus:response.status')],
 ['response body captured',html.includes("errorBody:response.ok?'':responseText.slice(0,1000)")],
 ['outbox retry stage captured',html.includes("stage:'Retrying queued snapshot'")],
 ['manual retry control',html.includes('Retry queued save')&&html.includes('retryQueuedCloudSave')],
 ['diagnostic fields displayed',html.includes("['Last save stage'")&&html.includes("['HTTP status'")&&html.includes("['Last error'")],
 ['save coordinator retained',html.includes('ksmCloudSavePending')&&html.includes('runPendingCloudSave')]
];
let failed=false;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed=true}
if(failed)process.exit(1);
