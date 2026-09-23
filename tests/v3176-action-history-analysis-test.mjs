import { html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
const worker=fs.readFileSync('src-worker.js','utf8');
const sw=appServiceWorker;
const checks=[
 ['history analyzer',html.includes('function analyzeCourtActionHistory')],
 ['entry analyzer',html.includes('function analyzeHistoryEntry')],
 ['history sample export',html.includes('downloadActionHistorySample')],
 ['developer tools title',html.includes("'Developer Tools'")],
 ['read only diagnostic statement',html.includes('Scoring, undo, redo, saving, and synchronization are unchanged.')],
];
let failed=false;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true;}if(failed)process.exit(1);
