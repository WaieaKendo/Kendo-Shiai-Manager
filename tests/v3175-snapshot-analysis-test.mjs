import { html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
const worker=fs.readFileSync('src-worker.js','utf8');
const sw=appServiceWorker;
const checks=[['snapshot analyzer',html.includes('function analyzeTournamentSnapshot')],['state breakdown',html.includes('State breakdown')],['nested paths',html.includes('Largest nested paths')],['download analysis',html.includes('downloadSnapshotAnalysis')],['save captures analysis',html.includes('snapshotAnalysis=analyzeTournamentSnapshot(payload)')]];
let failed=false;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true;}if(failed)process.exit(1);
