import { html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
const worker=fs.readFileSync('src-worker.js','utf8');
const sw=appServiceWorker;
const checks=[
 ['logo UI removed',!html.includes('id="tournamentLogo"')&&!html.includes('handleTournamentLogoUpload')],
 ['snapshot excludes logo',!html.includes("['tournamentLogo','tName'")],
 ['library excludes logo',!worker.includes('logo:setup.tournamentLogo')&&!worker.includes('logo:typeof item.logo')],
 ['server strips legacy logo',worker.includes('delete clean.setup.tournamentLogo')],
 ['library update nonfatal',worker.includes('Tournament library update failed')],
 ['structured worker errors',worker.includes("error:'Worker operation failed'")],
 ['cloud reset route',worker.includes("'/api/admin/reset'")&&worker.includes('KSM_RESET_KEY')],
 ['local data reset',html.includes('resetLegacyTournamentDataOnce')],
 ['recent input deferral',html.includes('recentEditorActivity()')]
];
let failed=false; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true} if(failed)process.exit(1);
