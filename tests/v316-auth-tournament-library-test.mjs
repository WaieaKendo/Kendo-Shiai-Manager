import { html as appSource } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html = appSource;
const worker = fs.readFileSync('src-worker.js','utf8');
const checks = [
  ['staff login', html.includes('Staff Login') && html.includes("?'Logout':'Staff Login'")],
  ['new tournament', html.includes('createNewTournament()')],
  ['library cards', html.includes('tournament-library-grid') && html.includes('tournament-card')],
  ['save now preserved', html.includes('>Save Now</button>')],
  ['recovery download preserved', html.includes('downloadRecoveryFile()')],
  ['single public access', html.includes("openCloudModal('Tournament Access'") && html.includes('Tournament access QR code')],
  ['staff auth endpoint', worker.includes("url.pathname === '/auth'")],
  ['two roles only', worker.includes("new Set(['spectator', 'staff'])")],
  ['password hashed', worker.includes("crypto.subtle.digest('SHA-256'")],
];
let failed = false;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'}: ${name}`); if (!ok) failed = true; }
if (failed) process.exit(1);
