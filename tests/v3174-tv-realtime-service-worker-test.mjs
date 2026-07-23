import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/service-worker.js','utf8');
const checks=[
 ['version badge',html.includes('v3.17.5-test')],
 ['cache version',sw.includes("ksm-shell-v3.17.5-test")],
 ['clone before cache',sw.includes('const copy = response.clone()')&&sw.includes('event.waitUntil')],
 ['old async clone removed',!sw.includes('cache.put(event.request, response.clone())')],
 ['tv diagnostics',html.includes('TV Realtime Diagnostics')&&html.includes('reconnectTvRealtime')],
 ['read-only own broadcast fix',html.includes('const isOwnWritableUpdate=canCloudWrite()')],
 ['apply revision diagnostics',html.includes('lastAppliedRevision:incomingRevision')]
];
let failed=false;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}
if(failed)process.exit(1);
