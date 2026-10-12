import { html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const sw=appServiceWorker;
const worker=fs.readFileSync('src-worker.js','utf8');
const checks=[
  [html.includes("division&&divisionComplete(division)&&resultPlacements(division).length"),'completed active division detection'],
  [html.includes("format:'results'"),'TV results view model'],
  [html.includes('divisionCompletePanelHtml(vm.division)'),'shared Court completion markup'],
  [html.includes("vm.format==='results'?tv3Results(vm)"),'TV results render branch'],
  [html.includes("vm.format==='results'?tv3ResultsFooter():tv3Upcoming(vm)"),'results footer branch'],
  [html.includes('.tv3-results-body .division-complete-row'),'isolated TV results styling']
];
const failed=checks.filter(([ok])=>!ok);
for(const [ok,label] of checks)console.log(`${ok?'PASS':'FAIL'} ${label}`);
if(failed.length)process.exit(1);
