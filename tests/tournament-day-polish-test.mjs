import { html as appSource } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html=appSource;
const checks=[
 ['save status refreshes every minute', html.includes('setInterval(renderPersistentSaveStatus,60000)')],
 ['status is vertical', html.includes('flex-direction:column') && html.includes('align-items:flex-end')],
 ['status card removed', html.includes('border:0;') && html.includes('background:transparent;') && html.includes('box-shadow:none;')],
 ['no second save age', !html.includes(' sec ago')],
 ['minute save age', html.includes(' min ago')],
 ['clock time after hour', html.includes("'✓ Saved at '")],
 ['save toast present', html.includes("showKsmToast('Saving…',0)") && html.includes("showKsmToast('✓ Tournament saved',2000)")],
 ['raw access urls hidden', !html.includes("esc(link.replace(/key=[^&]+/,'key=PRIVATE'))")],
 ['copy closes access modal', html.includes("closeAfter=false") && html.includes("setTimeout(closeCloudModal,850)")],
 // 'qr remains open with back' (html.includes('onclick="openTournamentAccess()">Back')) was removed in
 // M.13 (feat/react-shell): it pinned showQr()'s Back button, and showQr() was only called by the first
 // openTournamentAccess() (21-), overridden by 33-'s and never run; both went with the legacy shell.
 // The Tournament Access the app shows has its QR code in the modal itself (golden-shell-test.py).
];
let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`); if(ok)passed++;}
console.log(`Tournament Day polish invariants: ${passed}/${checks.length} passed`);
if(passed!==checks.length)process.exit(1);
