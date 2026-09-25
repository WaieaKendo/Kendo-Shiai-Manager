import { html as appSource, sw as appServiceWorker } from './lib/ksm-source.mjs';
import fs from 'node:fs';
import process from 'node:process';

const html=appSource;
// M.8 step 5: the legacy court renderer is gone; the React court context panel draws the pools
// (app/react/court/CourtContext.tsx; tests/golden/court/*.json pin the result).
const courtDir=new URL('../app/react/court/',import.meta.url);
const react=fs.readdirSync(courtDir).filter(f=>/\.tsx?$/.test(f)).sort().map(f=>fs.readFileSync(new URL(f,courtDir),'utf8')).join('');
const sw=appServiceWorker;
const worker=fs.readFileSync(new URL('../src-worker.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const authoritativeRule=/\.all-pools-context-grid\s*\{[^}]*display\s*:\s*grid\s*;[^}]*grid-template-columns\s*:\s*minmax\(0\s*,\s*1fr\)\s*;[^}]*gap\s*:\s*12px\s*;[^}]*\}/s;
const autoFitRule=/\.all-pools-context-grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(auto-fit/si;
const checks=[
  [authoritativeRule.test(html),'authoritative pool context grid is one column with compact spacing'],
  [!autoFitRule.test(html),'no auto-fit multi-column pool context rule remains'],
  [react.includes('const PoolGrid = ({ cards, icons }: { cards: PoolCardView[]; icons: CourtPanelIcons }) => <div className="all-pools-context-grid">') && react.includes('<PoolGrid cards={view.inProgress} icons={icons} />'),'in-progress pools use shared one-column grid'],
  [react.includes('<PoolGrid cards={view.completed} icons={icons} />'),'completed pools use shared one-column grid']
];
let failed=false;
for(const [ok,label] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failed=true;}
if(failed)process.exit(1);
