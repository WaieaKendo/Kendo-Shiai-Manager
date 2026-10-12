import fs from 'node:fs';
import process from 'node:process';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const authoritativeRule=/\.all-pools-context-grid\s*\{[^}]*display\s*:\s*grid\s*;[^}]*grid-template-columns\s*:\s*minmax\(0\s*,\s*1fr\)\s*;[^}]*gap\s*:\s*12px\s*;[^}]*\}/s;
const autoFitRule=/\.all-pools-context-grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(auto-fit/si;
const checks=[
  [authoritativeRule.test(html),'authoritative pool context grid is one column with compact spacing'],
  [!autoFitRule.test(html),'no auto-fit multi-column pool context rule remains'],
  [html.includes('<div class="all-pools-context-grid">${incompleteHtml}</div>'),'in-progress pools use shared one-column grid'],
  [html.includes('<div class="all-pools-context-grid">${completedHtml}</div>'),'completed pools use shared one-column grid']
];
let failed=false;
for(const [ok,label] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failed=true;}
if(failed)process.exit(1);
