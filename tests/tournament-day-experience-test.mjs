import { html as appSource } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
const worker=fs.readFileSync('src-worker.js','utf8');
const checks=[
 ['persistent online status',html.includes('🟢 Online')&&html.includes('humanSaveAge')],
 ['manual Save Now retained',html.includes('saveNow()')&&html.includes('>Save Now<')],
 ['completed match critical autosave',html.includes('criticalAutoSave(`Completed match:')],
 ['next match remains manual',html.includes('function nextMatch()')&&html.includes('Next Match')],
 ['ten-minute safety autosave',html.includes('600000')&&html.includes('10-minute safety autosave')],
 ['recovery download/load',html.includes('downloadRecoveryFile')&&html.includes('loadRecoveryFile')&&html.includes('KSM_RECOVERY')],
 ['tournament access links',html.includes('openTournamentAccess')&&html.includes('Spectator View')&&html.includes('Court A')&&html.includes('Court B')],
 ['cloud diagnostics modal',html.includes('function cloudDiagnostics()')&&html.includes('title="Open Cloud Diagnostics"')],
 ['engine remains frozen',html.includes("engineVersion:'3.12.9'")&&!worker.includes('maybeCreateTiebreaks')],
];
let pass=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)pass++;}
console.log(`Tournament Day Experience invariants: ${pass}/${checks.length} passed`);
if(pass!==checks.length)process.exit(1);
