import { html as appSource, sw as appServiceWorker, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html = appSource;
const sw = appServiceWorker;
const worker = fs.readFileSync('src-worker.js','utf8');
// Since M.13 the library's markup is drawn by React (app/react/library/: Library.tsx,
// library-model.ts; tests/golden/library pins it), so checks of the cards and buttons read that code
// as well as the static markup of app/index.html.
const libraryReact = readRepoFile('app/react/library/Library.tsx') + readRepoFile('app/react/library/library-model.ts');
const checks = [
  ['dedicated home view', html.includes('id="home"') && html.includes('id="homeTournamentLibrary"') && libraryReact.includes('id="homeTournamentLibrary"')],
  ['new tournament available on home', html.includes('onclick="createNewTournament()">＋ New Tournament') && libraryReact.includes('data-testid="home-new-tournament" onClick={() => { libraryWindow().createNewTournament?.(); }}>{NEW_TOURNAMENT_TEXT}') && libraryReact.includes("NEW_TOURNAMENT_TEXT = '＋ New Tournament'")],
  ['existing tournaments open spectator', html.includes("async function openTournamentFromHome(id){sessionStorage.removeItem(KSM_V316_STAFF_SESSION);setSessionRole('spectator')") && libraryReact.includes('libraryWindow().openTournamentFromHome?.(card.id)')],
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
