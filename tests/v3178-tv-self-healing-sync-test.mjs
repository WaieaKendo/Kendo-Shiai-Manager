import { html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
const sw=appServiceWorker;
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const checks=[
  [html.includes("refreshTvFromCloud('Connection handshake')"),'connection handshake refresh'],
  [html.includes("refreshTvFromCloud('Initial sync fallback')"),'initial fallback'],
  [html.includes("setInterval(()=>refreshTvFromCloud('Periodic verification',false),15000)"),'periodic verification'],
  [html.includes("refreshTvFromCloud('Revision gap recovery')"),'revision-gap recovery'],
  [html.includes("refreshTvFromCloud('TV became visible')"),'visibility recovery'],
  [html.includes('forceApply=false'),'force-apply support'],
  [/cloudSession\.court=requestedCourt\|\|'';[^\n]*?[^s]connectCloudSocket\(\)/.test(html),'court assignment before socket'],
  [html.includes('if(isTvSession()){renderTvDisplay();'),'forced TV rerender']
];
const failed=checks.filter(([ok])=>!ok);
if(failed.length){for(const [,name] of failed)console.error('Missing:',name);process.exit(1)}
console.log('v3.17.8 self-healing TV synchronization checks passed');
