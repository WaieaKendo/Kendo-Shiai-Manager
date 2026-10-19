import { html as appSource, readRepoFile } from './lib/ksm-source.mjs';
import fs from 'node:fs';
const html = appSource;
const worker = fs.readFileSync('src-worker.js','utf8');
// Since M.13 the library's markup is drawn by React (app/react/library/: Library.tsx,
// library-model.ts; tests/golden/library pins it), so checks of the cards and buttons read that code
// as well as the static markup of app/index.html.
const libraryReact = readRepoFile('app/react/library/Library.tsx') + readRepoFile('app/react/library/library-model.ts');
// M.13: the shell (navigation, header, dialogs) is React: app/react/shell/ draws it, app/js/44-react-shell.js
// publishes what the legacy code decided (tests/golden/shell pins the result).
const shellReact = ['nav-model.ts', 'dialogs-model.ts', 'Dialogs.tsx', 'Shell.tsx'].map(f => readRepoFile(`app/react/shell/${f}`)).join('\n');
const checks = [
  ['staff login', html.includes('Staff Login') && html.includes("?'Logout':'Staff Login'")],
  ['new tournament', html.includes('createNewTournament()')],
  ['library cards', html.includes('tournament-library-grid') && html.includes('tournament-card') && libraryReact.includes('className="home-tournament-card"')],
  ['save now preserved', shellReact.includes('h.retry && <button') && shellReact.includes('data-testid="header-save-now"')],
  ['recovery download preserved', html.includes('downloadRecoveryFile()')],
  ['single public access', html.includes("ksmOpenCloudModal('Tournament Access'") && shellReact.includes('Tournament access QR code')],
  ['staff auth endpoint', worker.includes("url.pathname === '/auth'")],
  ['two roles only', worker.includes("new Set(['spectator', 'staff'])")],
  ['password hashed', worker.includes("crypto.subtle.digest('SHA-256'")],
];
let failed = false;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'}: ${name}`); if (!ok) failed = true; }
if (failed) process.exit(1);
