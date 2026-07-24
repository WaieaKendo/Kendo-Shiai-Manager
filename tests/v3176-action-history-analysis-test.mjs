import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const worker=fs.readFileSync('src-worker.js','utf8');
const sw=fs.readFileSync('public/service-worker.js','utf8');
const checks=[
 ['version badge',html.includes('v3.17.6-test')],
 ['history analyzer',html.includes('function analyzeCourtActionHistory')],
 ['entry analyzer',html.includes('function analyzeHistoryEntry')],
 ['history sample export',html.includes('downloadActionHistorySample')],
 ['developer tools title',html.includes("'Developer Tools'")],
 ['read only diagnostic statement',html.includes('Scoring, undo, redo, saving, and synchronization are unchanged.')],
 ['worker version',worker.includes("version: '3.17.6-test'")],
 ['cache bumped',sw.includes('ksm-shell-v3.17.6-test')]
];
let failed=false;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true;}if(failed)process.exit(1);
