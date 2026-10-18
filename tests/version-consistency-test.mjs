// The release version is written in ONE place: package.json "version" (and package-lock.json,
// which `npm version` keeps in step). The sources hold the placeholder __KSM_VERSION__ and the
// build fills it in (scripts/app-sources.mjs withVersion()); src-worker.js imports package.json.
// So this test checks what ships: the BUILT app in dist/ (run-all.mjs builds it first) and the
// worker's /api/health, against package.json. See docs/DEPLOYMENT.md, "Versions and releases".
import fs from 'node:fs';
import path from 'node:path';
import { DIST_DIR, VERSION_PLACEHOLDER } from '../scripts/app-sources.mjs';
import { html, worker, pkg, readRepoFile } from './lib/ksm-source.mjs';

const v = pkg.version;
const dist = rel => fs.readFileSync(path.join(DIST_DIR, rel), 'utf8');
const builtHtml = dist('index.html');
const appJs = builtHtml.match(/<script src="\/(assets\/app-\w+\.js)"><\/script>/)?.[1];
const builtJs = appJs ? dist(appJs) : '';
const builtSw = dist('service-worker.js');
const lock = JSON.parse(readRepoFile('package-lock.json'));
const { default: workerEntry } = await import('../src-worker.js');
const health = await (await workerEntry.fetch(new Request('https://ksm.test/api/health'), {})).json();
// A release version written anywhere else in the sources (the placeholder is the only form allowed).
const hardCoded = [
  ['app/index.html', readRepoFile('app/index.html')],
  ['app/service-worker.js', readRepoFile('app/service-worker.js')],
  ['app/js/19-cloud-diagnostics.js', readRepoFile('app/js/19-cloud-diagnostics.js')],
  ['src-worker.js', worker],
].filter(([, text]) => text.includes(v) || /version: '\d|appVersion:'\d|ksm-shell-v\d|Kendo Shiai Manager v\d|version-badge">v\d/.test(text)).map(([f]) => f);

const footer = builtHtml.match(/<footer[\s\S]*?<\/footer>/)?.[0] || '';
const header = builtHtml.match(/<header[\s\S]*?<\/header>/)?.[0] || '';
const checks = [
  [!header.includes('version-badge'), 'the header has no version badge'],
  [/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v), `package.json version is semver (${v})`],
  [lock.version === v && lock.packages?.['']?.version === v, 'package-lock.json version matches package.json'],
  [!hardCoded.length, `no hard-coded release version in the sources, only ${VERSION_PLACEHOLDER}${hardCoded.length ? ': ' + hardCoded.join(', ') : ''}`],
  [footer.includes(`About: Kendo Shiai Manager <span class="version-badge">v${v}</span>`), 'Library footer About version matches package.json'],
  [builtHtml.includes(`<span class="version-badge">v${v}</span>`) && builtHtml.includes('<title>Kendo Shiai Manager</title>'), 'built HTML badge matches package.json; title has no version'],
  [builtJs.split(`appVersion:'${v}'`).length - 1 === 2, 'built app.js diagnostics downloads carry the version (2)'],
  [builtSw.includes(`const CACHE_NAME = 'ksm-shell-v${v}'`), 'built service worker cache name matches (forces PWA update on release)'],
  [health.version === v, `/api/health version matches (${health.version})`],
  [readRepoFile('CHANGELOG.md').startsWith(`## v${v}`), 'CHANGELOG.md starts with this release'],
  [html.includes("engineVersion:'3.12.9'"), 'frozen tournament engine version is unchanged (3.12.9)'],
];

let failed = 0;
for (const [ok, name] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
