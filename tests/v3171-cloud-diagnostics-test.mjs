import { html as appSource } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
// Declared (function/const/let/var NAME), not just mentioned: an import line of app/main.js names it too.
const declared=n=>new RegExp(`(?:function\\s+|(?:const|let|var)\\s+)${n}\\b`).test(html);
const checks=[
 ['diagnostic persistence key',html.includes("KSM_CLOUD_DIAGNOSTICS_KEY='ksm.cloud.diagnostics.v3_17_1'")],
 ['request stage captured',html.includes("'Sending cloud request'")],
 ['http status captured',html.includes('httpStatus:response.status')],
 ['response body captured',html.includes("errorBody:response.ok?'':responseText.slice(0,1000)")],
 ['outbox retry stage captured',html.includes("stage:'Retrying queued snapshot'")],
 ['manual retry control',html.includes('Retry queued save')&&declared('retryQueuedCloudSave')],
 ['diagnostic fields displayed',html.includes("['Last save stage'")&&html.includes("['HTTP status'")&&html.includes("['Last error'")],
 ['save coordinator retained',declared('ksmCloudSavePending')&&declared('runPendingCloudSave')]
];
let failed=false;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed=true}
if(failed)process.exit(1);
