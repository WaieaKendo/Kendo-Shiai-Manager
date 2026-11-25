import { html as appSource } from './lib/ksm-source.mjs';
import fs from 'node:fs';

const html = appSource;
const icon = fs.readFileSync('app/public/assets/nav-icons/registration.svg', 'utf8');

const checks = [
  ['supplied registration icon', icon.includes('id="Registration"') && icon.includes('rgb(202,53,53)')],
  ['setup mobile alignment', html.includes('.icon-nav .setup-nav-tile') && html.includes('setup-nav-tile"')],
  ['staff representative selection', html.includes("['local','admin','director','staff'].includes(ksmSessionRole)")],
  ['debounced local autosave', /setTimeout\(\(\)=>\{ksmSaveTimer=null;autoSaveTournament\(reason\)\},\d+\)/.test(html)],
  ['debounced cloud save', /scheduleCloudSave\(reason='Autosave',delay=\d+\)/.test(html)],
  ['deterministic pending save', html.includes('queuePendingCloudSave') && html.includes('runPendingCloudSave') && !html.includes('ksmCloudSaveQueued=true')],
  ['TV route honors view parameter', html.includes("requestedView==='tv'") && /renderTvDisplay\(\);(renderTvRealtimeDiagnostics\(\);)?show\('tv'\)/.test(html)]
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
