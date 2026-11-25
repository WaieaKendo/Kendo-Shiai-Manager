import { html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
const sw=appServiceWorker;
const checks=[
 ['clone before cache',sw.includes('const copy = response.clone()')&&sw.includes('event.waitUntil')],
 ['old async clone removed',!sw.includes('cache.put(event.request, response.clone())')],
 ['tv diagnostics',html.includes('TV Realtime Diagnostics')&&html.includes('reconnectTvRealtime')],
 ['read-only own broadcast fix',html.includes('const isOwnWritableUpdate=canCloudWrite()')],
 ['apply revision diagnostics',html.includes('lastAppliedRevision:incomingRevision')]
];
let failed=false;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}
if(failed)process.exit(1);
