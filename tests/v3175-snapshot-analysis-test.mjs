import { html as appSource, sw as appServiceWorker, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
const worker=fs.readFileSync('src-worker.js','utf8');
const sw=appServiceWorker;
// M.13: the shell (navigation, header, dialogs) is React: app/react/features/shell/ draws it, app/js/44-react-shell.js
// publishes what the legacy code decided (tests/golden/shell pins the result).
const shellReact = ['nav-model.ts', 'dialogs-model.ts', 'Dialogs.tsx', 'Shell.tsx'].map(f => readRepoFile(`app/react/features/shell/${f}`)).join('\n');
const checks=[['snapshot analyzer',html.includes('function analyzeTournamentSnapshot')],['state breakdown',shellReact.includes('State breakdown')&&html.includes('analysis.stateBreakdown')],['nested paths',shellReact.includes('Largest nested paths')&&html.includes('analysis.largest')],['download analysis',html.includes('downloadSnapshotAnalysis')],['save captures analysis',html.includes('snapshotAnalysis=analyzeTournamentSnapshot(payload)')]];
let failed=false;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true;}if(failed)process.exit(1);
