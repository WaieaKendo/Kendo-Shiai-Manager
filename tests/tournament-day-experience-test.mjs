import { html as appSource, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
// M.13: the shell (navigation, header, dialogs) is React: app/react/shell/ draws it, app/js/44-react-shell.js
// publishes what the legacy code decided (tests/golden/shell pins the result).
const shellReact = ['nav-model.ts', 'dialogs-model.ts', 'Dialogs.tsx', 'Shell.tsx'].map(f => readRepoFile(`app/react/shell/${f}`)).join('\n');
const worker=fs.readFileSync('src-worker.js','utf8');
const checks=[
 ['persistent online status',html.includes('🟢 Online')&&html.includes('humanSaveAge')],
 ['manual Save Now retained',html.includes('saveNow()')&&html.includes('>Save Now<')],
 ['completed match critical autosave',html.includes('criticalAutoSave(`Completed match:')],
 ['next match remains manual',html.includes('function nextMatch()')&&html.includes('Next Match')],
 ['ten-minute safety autosave',html.includes('600000')&&html.includes('10-minute safety autosave')],
 ['recovery download/load',html.includes('downloadRecoveryFile')&&html.includes('loadRecoveryFile')&&html.includes('KSM_RECOVERY')],
 // Tournament Access: the spectator link (spectatorLink()) with Copy Link and its QR code (React since
 // M.13). ('Spectator View' was a row of the first openTournamentAccess() in 21-, which never ran.)
 ['tournament access links',html.includes('openTournamentAccess')&&html.includes('ksmOpenTournamentAccess(link,qr)')&&html.includes('function spectatorLink()')&&shellReact.includes('Scan to open the tournament in Spectator mode.')&&html.includes('Court A')&&html.includes('Court B')],
 ['cloud diagnostics modal',html.includes('function cloudDiagnostics()')&&html.includes('title="Open Cloud Diagnostics"')],
 ['engine remains frozen',html.includes("engineVersion:'3.12.9'")&&!worker.includes('maybeCreateTiebreaks')],
];
let pass=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)pass++;}
console.log(`Tournament Day Experience invariants: ${pass}/${checks.length} passed`);
if(pass!==checks.length)process.exit(1);
