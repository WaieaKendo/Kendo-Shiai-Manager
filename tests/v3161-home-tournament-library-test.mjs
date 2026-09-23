import { html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html = appSource;
const sw = appServiceWorker;
const worker = fs.readFileSync('src-worker.js','utf8');
const checks = [
  ['dedicated home view', html.includes('id="home"') && html.includes('id="homeTournamentLibrary"')],
  ['new tournament available on home', html.includes('onclick="createNewTournament()">＋ New Tournament')],
  ['existing tournaments open spectator', html.includes('openTournamentFromHome') && html.includes("setSessionRole('spectator')")],
  ['startup opens home', html.includes('showHomePage();return true')],
  ['public link bypasses home', /classList\.remove\('ksm-home'\);if\(requestedView==='tv'\).{0,200}navigateTo\('public'\)/.test(html)],
  ['home return paths', html.includes('title="Tournament Library" onclick="showHomePage()"') && html.includes('>Tournament Library</button>')],
  ['staff login and logout preserved', html.includes('Staff Login') && html.includes("?'Logout':'Staff Login'")],
  ['save now preserved', html.includes('>Save Now</button>')],
  ['recovery file preserved', html.includes('downloadRecoveryFile()') && html.includes('triggerLoadRecoveryFile()')],
];
let failed=false;
for (const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed=true;}
if(failed)process.exit(1);
