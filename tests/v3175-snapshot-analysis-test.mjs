import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const worker=fs.readFileSync('src-worker.js','utf8');
const sw=fs.readFileSync('public/service-worker.js','utf8');
const checks=[['version badge',html.includes('v3.17.5-test')],['snapshot analyzer',html.includes('function analyzeTournamentSnapshot')],['state breakdown',html.includes('State breakdown')],['nested paths',html.includes('Largest nested paths')],['download analysis',html.includes('downloadSnapshotAnalysis')],['save captures analysis',html.includes('snapshotAnalysis=analyzeTournamentSnapshot(payload)')],['worker version',worker.includes("version: '3.17.5-test'")],['cache bumped',sw.includes("ksm-shell-v3.17.5-test")]];
let failed=false;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true;}if(failed)process.exit(1);
