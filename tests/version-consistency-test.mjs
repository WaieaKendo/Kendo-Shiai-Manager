// The release version lives in package.json; every other place that shows or
// depends on it must match. This replaces the per-release version assertions
// that older tests used to pin (and which broke on every new release).
import { html, worker, sw, pkg, readRepoFile } from './lib/ksm-source.mjs';

const v = pkg.version;
const checks = [
  [/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v), `package.json version is semver (${v})`],
  [html.includes(`<span class="version-badge">v${v}</span>`), 'HTML version badge matches package.json'],
  [html.includes(`Kendo Shiai Manager v${v}`), 'HTML title/about text matches package.json'],
  [sw.includes(`const CACHE_NAME = 'ksm-shell-v${v}'`), 'service worker cache name matches (forces PWA update on release)'],
  [worker.includes(`version: '${v}'`), '/api/health version matches'],
  [readRepoFile('CHANGELOG.md').startsWith(`## v${v}`), 'CHANGELOG.md starts with this release'],
  [html.includes("engineVersion:'3.12.9'"), 'frozen tournament engine version is unchanged (3.12.9)'],
];

let failed = 0;
for (const [ok, name] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
