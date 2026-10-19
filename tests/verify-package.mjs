import fs from 'node:fs';
import path from 'node:path';
// Run after `npm run build`: checks the built site in dist/.
const root = path.resolve('dist');
const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'),'utf8'));
const appVersion = pkg.version;
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
// index.html plus the app stylesheet and script it references.
const indexHtml = fs.readFileSync(path.join(root,'index.html'),'utf8');
const html = indexHtml + [...indexHtml.matchAll(/(?:href|src)="\/(assets\/app-[\w]+\.(?:css|js))"/g)].map(m => fs.readFileSync(path.join(root, m[1]),'utf8')).join('');
for (const rel of required.filter(x=>x.startsWith('assets/'))) {
  if (!html.includes('/'+rel) && !fs.readFileSync(path.join(root,'service-worker.js'),'utf8').includes('/'+rel)) {
    console.error(`UNREFERENCED: ${rel}`); failed = true;
  }
}
if (!html.includes(`v${appVersion}`) || !html.includes("engineVersion:'3.12.9'")) { console.error('Version marker missing'); failed = true; }
if (html.includes("document.addEventListener('touchend'")) { console.error('Legacy touchend click shim still present'); failed = true; }

for (const id of ['courtsMenu','tvMenu']) {
  if (!html.includes(`aria-controls="${id}"`) || !html.includes(`id="${id}" role="menu"`)) {
    console.error(`ACCESSIBILITY CONTRACT MISSING: ${id}`); failed = true;
  }
}
if (!html.includes('function positionMobileNavMenu')) { console.error('Mobile menu positioning function missing'); failed = true; }
const sw = fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
if (!sw.includes(`ksm-shell-v${appVersion}`)) { console.error('Service worker cache version not bumped'); failed = true; }

if (failed) process.exit(1);
console.log(`PASS: ${required.length} required hosted/PWA files verified.`);
