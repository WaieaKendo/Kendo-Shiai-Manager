import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const checks=[
 ['v3.15.4 package polish visible', html.includes('setInterval(renderPersistentSaveStatus,60000)')],
 ['status is vertical', html.includes('flex-direction:column') && html.includes('align-items:flex-end')],
 ['status card removed', html.includes('border:0;') && html.includes('background:transparent;') && html.includes('box-shadow:none;')],
 ['no second save age', !html.includes(' sec ago')],
 ['minute save age', html.includes(' min ago')],
 ['clock time after hour', html.includes("'✓ Saved at '")],
 ['save toast present', html.includes("showKsmToast('Saving…',0)") && html.includes("showKsmToast('✓ Tournament saved',2000)")],
 ['raw access urls hidden', !html.includes("esc(link.replace(/key=[^&]+/,'key=PRIVATE'))")],
 ['copy closes access modal', html.includes("closeAfter=false") && html.includes("setTimeout(closeCloudModal,850)")],
 ['qr remains open with back', html.includes('onclick="openTournamentAccess()">Back')],
];
let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`); if(ok)passed++;}
console.log(`Tournament Day polish invariants: ${passed}/${checks.length} passed`);
if(passed!==checks.length)process.exit(1);
