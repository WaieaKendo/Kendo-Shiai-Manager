import { html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';
import fs from 'node:fs';

const html = appSource;
const sw = appServiceWorker;

const checks = [
  ['pending request state', html.includes('let ksmCloudSavePending=null;')],
  ['queued callers receive promises', html.includes('return new Promise(resolve=>') && html.includes('ksmCloudSavePending.resolvers.push(resolve)')],
  ['manual force is retained', html.includes('ksmCloudSavePending.force=ksmCloudSavePending.force||Boolean(force)')],
  ['latest pending save is executed', html.includes('const saved=await saveTournamentToCloudWithReason(pending.reason,pending.force)')],
  ['queued callers receive actual result', html.includes('pending.resolvers.forEach(resolve=>resolve(saved))')],
  ['in-flight saves join pending request', html.includes('if(ksmCloudSaveInFlight/* ksm:post-split-begin replace-conflict */||ksmFileReplace/* ksm:post-split-end */)return queuePendingCloudSave(reason,force);')],
  ['pending save runs before original settles', /finally\{\s*ksmCloudSaveInFlight=false;\s*await runPendingCloudSave\(\)/.test(html)],
  ['obsolete boolean queue removed', !html.includes('ksmCloudSaveQueued')]
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
