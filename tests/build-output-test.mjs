// The Vite build must ship the app exactly as written in app/ (see scripts/app-sources.mjs):
// same markup, stylesheet and classic script, only moved into hashed files, and every
// static file at its old URL. run-all.mjs builds dist/ before the tests run.
import fs from 'node:fs';
import path from 'node:path';
import { APP_DIR, DIST_DIR, STYLE_TAG, SCRIPT_TAG, indexHtml, appStyles, appScript, serviceWorker, extraPages } from '../scripts/app-sources.mjs';

const checks = [];
const check = (ok, name) => checks.push([ok, name]);
const dist = rel => fs.readFileSync(path.join(DIST_DIR, rel), 'utf8');

const built = dist('index.html');
const css = built.match(/<link rel="stylesheet" href="\/(assets\/app-\w+\.css)">/)?.[1];
const js = built.match(/<script src="\/(assets\/app-\w+\.js)"><\/script>/)?.[1];
check(css && js, 'dist/index.html links one hashed stylesheet and one classic (non-module) script');
check(!/type="module"/.test(built), 'no module scripts');
check(built === indexHtml().replace(STYLE_TAG, `<link rel="stylesheet" href="/${css}">`).replace(SCRIPT_TAG, `<script src="/${js}"></script>`),
  'dist/index.html = app/index.html apart from the two bundle URLs');
check(css && dist(css) === appStyles(), 'stylesheet = app/styles/*.css in order, untransformed');
check(js && dist(js) === appScript(), 'script = app/js/*.js in order, untransformed');

const sw = dist('service-worker.js');
check(sw === serviceWorker().replace("'/app.css', '/app.js'", `'/${css}', '/${js}'`), 'service worker = app/service-worker.js with the bundle URLs in APP_SHELL');
const shell = [...sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const missing = shell.filter(url => url !== '/' && !fs.existsSync(path.join(DIST_DIR, url)));
check(!missing.length, `every APP_SHELL file exists in dist/ (${shell.length} entries)${missing.length ? ': missing ' + missing.join(', ') : ''}`);

// Extra pages (app/*.html, e.g. overlay.html): built next to index.html, with their own
// module scripts from app/react/ and without the classic bundle; the service worker lets
// the network answer their navigations instead of the cached app shell.
const pages = extraPages();
for (const page of pages) {
  const html = fs.existsSync(path.join(DIST_DIR, page)) ? dist(page) : '';
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
  const modules = scripts.map(tag => tag.match(/type="module"[^>]*src="\/(assets\/[\w.-]+\.js)"/)?.[1]);
  check(html && scripts.length && modules.every(f => f && fs.existsSync(path.join(DIST_DIR, f))),
    `dist/${page}: built, only bundled module scripts (${scripts.length})`);
  check(html && !html.includes('/assets/app-') && modules.every(f => f && !dist(f).includes('function performCourtAction(')), `dist/${page}: does not load the classic app bundle`);
}
check(/mode === 'navigate' && url\.pathname !== '\/' && url\.pathname !== '\/index\.html'\) return;/.test(sw),
  `service worker leaves navigations to extra pages to the network (${pages.length ? pages.join(', ') : 'none yet'})`);

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const publicDir = path.join(APP_DIR, 'public');
const notCopied = walk(publicDir).map(f => path.relative(publicDir, f))
  .filter(rel => !fs.existsSync(path.join(DIST_DIR, rel)) || !fs.readFileSync(path.join(DIST_DIR, rel)).equals(fs.readFileSync(path.join(publicDir, rel))));
check(!notCopied.length, `app/public/ files served unchanged at the same URLs${notCopied.length ? ': ' + notCopied.join(', ') : ''}`);
check(/"directory":\s*"\.\/dist"/.test(fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')), 'wrangler serves dist/');

let failed = 0;
for (const [ok, name] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
