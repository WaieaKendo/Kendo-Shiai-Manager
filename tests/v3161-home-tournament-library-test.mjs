import fs from 'node:fs';
const html = fs.readFileSync('public/index.html','utf8');
const sw = fs.readFileSync('public/service-worker.js','utf8');
const worker = fs.readFileSync('src-worker.js','utf8');
const checks = [
  ['version', html.includes('v3.16.1') && sw.includes('ksm-shell-v3.16.1') && worker.includes("version: '3.16.1'")],
  ['dedicated home view', html.includes('id="home"') && html.includes('id="homeTournamentLibrary"')],
  ['new tournament available on home', html.includes('onclick="createNewTournament()">＋ New Tournament')],
  ['existing tournaments open spectator', html.includes('openTournamentFromHome') && html.includes("setSessionRole('spectator')")],
  ['startup opens home', html.includes('showHomePage();return true')],
  ['public link bypasses home', html.includes("document.body.classList.remove('ksm-home');navigateTo('public')")],
  ['home return paths', html.includes('title="Tournament Library" onclick="showHomePage()"') && html.includes('>Tournament Library</button>')],
  ['staff login and logout preserved', html.includes('Staff Login') && html.includes("?'Logout':'Staff Login'")],
  ['save now preserved', html.includes('>Save Now</button>')],
  ['recovery file preserved', html.includes('downloadRecoveryFile()') && html.includes('triggerLoadRecoveryFile()')],
];
let failed=false;
for (const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed=true;}
if(failed)process.exit(1);
