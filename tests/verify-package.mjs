import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('public');
const required = [
  'index.html','manifest.webmanifest','service-worker.js',
  'icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png',
  'assets/ksm-fuji-logo.svg','assets/ksm-fuji-logo-nav.svg','assets/KSM-Background-watermark.svg',
  'assets/ksm-seigaiha-light.svg','assets/ksm-seigaiha-dark.svg',
  ...['setup','registration','courts','live-scores','search','results','export','save-load'].map(x=>`assets/nav-icons/${x}.svg`)
];
let failed = false;
for (const rel of required) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    console.error(`MISSING: ${rel}`); failed = true;
  }
}
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
for (const rel of required.filter(x=>x.startsWith('assets/'))) {
  if (!html.includes('/'+rel) && !fs.readFileSync(path.join(root,'service-worker.js'),'utf8').includes('/'+rel)) {
    console.error(`UNREFERENCED: ${rel}`); failed = true;
  }
}
if (!html.includes('v3.15.7') || !html.includes("engineVersion:'3.12.9'")) { console.error('Version marker missing'); failed = true; }
if (html.includes("document.addEventListener('touchend'")) { console.error('Legacy touchend click shim still present'); failed = true; }

for (const id of ['courtsMenu','exportMenu','saveLoadMenu']) {
  if (!html.includes(`aria-controls="${id}"`) || !html.includes(`id="${id}" role="menu"`)) {
    console.error(`ACCESSIBILITY CONTRACT MISSING: ${id}`); failed = true;
  }
}
if (!html.includes('function positionMobileNavMenu')) { console.error('Mobile menu positioning function missing'); failed = true; }
if (!html.includes("ksm-shell-v3.15.7")) { /* marker is in service worker, checked below */ }
const sw = fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
if (!sw.includes('ksm-shell-v3.15.7')) { console.error('Service worker cache version not bumped'); failed = true; }

if (failed) process.exit(1);
console.log(`PASS: ${required.length} required hosted/PWA files verified.`);
