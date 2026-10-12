import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');
const checks=[
 [html.includes("KSM_PINNED_COURT_PREFIX='ksm.pinned.court.v3_17_11'"),'pinned court storage'],
 [html.includes('function restorePinnedCourt()'),'court restoration'],
 [html.includes('function localChangesPending()'),'pending local mutation guard'],
 [html.includes('return deferRemoteRecord(record'),'remote deferral'],
 [html.includes('function rebaseLocalPayloadOnRecord'),'conflict rebase'],
 [html.includes("stage:'Rebasing concurrent court changes'"),'rebase diagnostics'],
 [html.includes("['Pinned court',pinnedCourt()||'—']"),'court diagnostics']
];
let failed=false;for(const [ok,name] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true}if(failed)process.exit(1);
