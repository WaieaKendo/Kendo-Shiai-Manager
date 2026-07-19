import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');
const icon = fs.readFileSync('public/assets/nav-icons/registration.svg', 'utf8');

const checks = [
  ['version badge', html.includes('v3.16.3')],
  ['supplied registration icon', icon.includes('id="Registration"') && icon.includes('rgb(202,53,53)')],
  ['setup mobile alignment', html.includes('.icon-nav .setup-nav-tile') && html.includes('setup-nav-tile"')],
  ['staff representative selection', html.includes("['local','admin','director','staff'].includes(ksmSessionRole)")],
  ['faster local autosave', html.includes('setTimeout(()=>autoSaveTournament(reason),300)')],
  ['faster cloud debounce', html.includes("scheduleCloudSave(reason='Autosave',delay=250)")],
  ['queued in-flight save', html.includes('ksmCloudSaveQueued=true') && html.includes("scheduleCloudSave('Queued edit',50)")],
  ['TV route honors view parameter', html.includes("requestedView==='tv'") && html.includes("renderTvDisplay();show('tv')")]
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
