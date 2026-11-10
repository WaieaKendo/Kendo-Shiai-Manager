// The Vite build must ship the app exactly as written in app/ (see scripts/app-sources.mjs):
// same markup, stylesheet and classic script, only moved into hashed files, and every
// static file at its old URL. The one addition is the module script of the React screens
// (app/react/main.tsx: the court screen and Live Scores, see vite.config.js), whose files join
// the offline APP_SHELL.
// The one transform: package.json "version" fills in the __KSM_VERSION__ placeholders (withVersion).
// run-all.mjs builds dist/ before the tests run.
import fs from 'node:fs';
import { printTheme } from '../scripts/print-theme.mjs';
import { printDocuments } from '../app/print-documents.mjs';
import vm from 'node:vm';
import path from 'node:path';
import { APP_DIR, DIST_DIR, STYLE_TAG, SCRIPT_TAG, VERSION_PLACEHOLDER, withVersion, indexHtml, appStyles, appBundle, serviceWorker, extraPages } from '../scripts/app-sources.mjs';

const checks = [];
const check = (ok, name) => checks.push([ok, name]);
const dist = rel => fs.readFileSync(path.join(DIST_DIR, rel), 'utf8');

const built = dist('index.html');
const css = built.match(/<link rel="stylesheet" href="\/(assets\/app-\w+\.css)">/)?.[1];
const js = built.match(/<script type="module" src="\/(assets\/app-\w+\.js)"><\/script>/)?.[1];
check(css && js && !/engine-\w+\.js/.test(built) && !/<script src=/.test(built), 'dist/index.html links one hashed stylesheet and the app script as an ES module, no separate engine script (step 4b)');
const modules = [...built.matchAll(/\n\s*<script type="module" crossorigin src="\/(assets\/index-[\w-]+\.js)"><\/script>/g)];
const court = modules[0]?.[1];
// The screens' entry chunk and the chunks it imports (React, mountIsland), as Vite wrote them.
const courtFiles = court ? [court, ...[...dist(court).matchAll(/^import .* from "\.\/([\w.-]+\.js)";$/gm)].map(m => `assets/${m[1]}`)] : [];
check(modules.length === 1 && [...built.matchAll(/type="module"/g)].length === 2, 'two module scripts: app.js, then the React screens (court, Live Scores, TV, Results, Overview, Tournament Library, Pools, Setup, Registration, the shell)');
check(court && dist(court).includes('ksm:court-scoreboard') && dist(court).includes('ksm:live-scores') && dist(court).includes('ksm:tv') && dist(court).includes('ksm:results') && dist(court).includes('ksm:overview') && dist(court).includes('ksm:library') && dist(court).includes('ksm:pools') && dist(court).includes('ksm:setup-divisions') && dist(court).includes('ksm:setup-header') && dist(court).includes('ksm:registration-players') && dist(court).includes('ksm:registration-status') && dist(court).includes('ksm:registration-teams') && dist(court).includes('ksm:registration-exhibitions') && dist(court).includes('ksm:registration-tab') && dist(court).includes('ksm:shell-nav') && dist(court).includes('ksm:shell-header') && dist(court).includes('ksm:shell-dialogs') && courtFiles.every(f => fs.existsSync(path.join(DIST_DIR, f)) && !dist(f).includes('function performCourtAction(')),
  `screens module bundled from app/react/features/court/, app/react/features/live-scores/, app/react/features/tv/, app/react/features/results/, app/react/features/overview/, app/react/features/library/, app/react/features/pools/, app/react/features/setup/, app/react/features/registration/ and app/react/features/shell/ without the classic app (${courtFiles.join(', ')})`);
// Vite hoists the screens module into <head>; the build moves it right after app.js, because modules run in
// document order and the React screens need app.js's globals (window.* exports) first.
const screensTag = modules[0]?.[0].trim() ?? '';
check(built.replace(`\n${screensTag}`, '') === withVersion(indexHtml()).replace(STYLE_TAG, `<link rel="stylesheet" href="/${css}">`).replace(SCRIPT_TAG, `<script type="module" src="/${js}"></script>`) && built.indexOf(`</script>\n${screensTag}`) > built.indexOf(`src="/${js}"`),
  'dist/index.html = app/index.html apart from the bundle URLs, the screens module and the version, with the screens module right after it');
check(!fs.readdirSync(path.join(DIST_DIR, 'assets')).some(f => /^engine-/.test(f)) && js && /^\tKSMEngine: engine_exports,$/m.test(dist(js)), 'no engine.js is built; the engine is bundled into app.js and window.KSMEngine is set from it');
check(css && dist(css) === appStyles(), 'stylesheet = app/styles/*.css in order, untransformed');
check(js && dist(js) === withVersion(await appBundle()) && !/^(?:import|export) /m.test(dist(js)), 'script = the rolldown bundle of app/js/*.js and app/modules (one ES module file), apart from the version');

const theme = dist('print/theme.css');
const printCss = fs.readFileSync(path.join(APP_DIR, 'print/print.css'), 'utf8');
const tokens = [...new Set([...printCss.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]))];
check(theme.startsWith(':root{') && tokens.every(t => theme.includes(t + ':')),
  'print theme starts with :root{ and contains every colour token used by print CSS');
check(printTheme('/* before */ body{margin:0} :root {--ink:blue;}') === ':root{--ink:blue;}',
  'print theme finds :root after comments and other rules');
let missingRootFailed = false;
try { printTheme('body{color:blue}'); } catch { missingRootFailed = true; }
check(missingRootFailed, 'print theme fails explicitly when the token block is missing');
check(!fs.existsSync(path.join(DIST_DIR, 'print/scorekeeper-guide.pdf')), 'build does not publish the review PDF');

const sw = dist('service-worker.js');
const printShellText = sw.match(/'\/print\/theme\.css', ([^\n]+),\n/)?.[1];
const printShell = printShellText ? JSON.parse('[' + printShellText + ']') : [];
check(Object.values(printDocuments).every(p => printShell.includes('/' + p.replace(/\.html$/, ''))), 'every registered print page is precached');
check(sw === withVersion(serviceWorker()).replace('/* PRINT_SHELL */', printShellText).replace("'/app.css', '/app.js'", [css, js, ...courtFiles].map(f => `'/${f}'`).join(', ')),
  'service worker = app/service-worker.js with the version and the bundle URLs (screens module included) in APP_SHELL');
const shell = [...sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1].matchAll(/['\"]([^'\"]+)['\"]/g)].map(m => m[1]);
const missing = shell.filter(url => url !== '/' && !fs.existsSync(path.join(DIST_DIR, url)) && !fs.existsSync(path.join(DIST_DIR, url + '.html')));
check(!missing.length, `every APP_SHELL file exists in dist/ (${shell.length} entries)${missing.length ? ': missing ' + missing.join(', ') : ''}`);

// Extra pages (app/*.html, e.g. overlay.html): built next to index.html, with their own
// module scripts from app/react/ and without the classic bundle; the service worker lets
// the network answer their navigations instead of the cached app shell.
const pages = extraPages();
for (const page of pages) {
  const html = fs.existsSync(path.join(DIST_DIR, page)) ? dist(page) : '';
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
  const modules = scripts.map(tag => tag.match(/type="module"[^>]*src="\/(assets\/[\w.-]+\.js)"/)?.[1]);
  check(html && (page === 'privacy.html' ? scripts.length === 0 : scripts.length > 0) && modules.every(f => f && fs.existsSync(path.join(DIST_DIR, f))),
    `dist/${page}: built, script-free privacy page or only bundled module scripts (${scripts.length})`);
  check(html && !html.includes('/assets/app-') && modules.every(f => f && !dist(f).includes('function performCourtAction(')), `dist/${page}: does not load the classic app bundle`);
}
// Path URLs (M.9): the app shell answers /, /index.html and /t/... (servesAppShell(), checked
// against app/engine/routes.ts in tests/engine/routes.test.mjs), never an extra page's URL.
const swShell = (() => {
  const code = sw.slice(sw.indexOf('const OVERLAY_PATH'), sw.indexOf("self.addEventListener('install'"));
  const ctx = vm.createContext({});
  try { vm.runInContext(`${code}\nthis.servesAppShell = servesAppShell;`, ctx); } catch (_) { return null; }
  return ctx.servesAppShell;
})();
const extraUrls = pages.flatMap(page => [`/${page}`, `/${page.replace(/\.html$/, '')}`]).concat(['/t/x/overlay/a']);
check(/mode === 'navigate' && !servesAppShell\(url\.pathname\)\) return;/.test(sw) && swShell
  && ['/', '/index.html', '/t/x', '/t/x/court/a', '/t/x/tv/b'].every(swShell) && !extraUrls.some(swShell),
  `service worker keeps extra pages outside the app-shell navigation fallback (${pages.length ? pages.join(', ') : 'none yet'}; /t/<id>/overlay/a) and serves the app for /t/ paths`);

const leftover = fs.readdirSync(DIST_DIR, { recursive: true }).filter(f => /\.(html|js|css)$/.test(f) && dist(f).includes(VERSION_PLACEHOLDER));
check(!leftover.length, `no ${VERSION_PLACEHOLDER} left in dist/${leftover.length ? ': ' + leftover.join(', ') : ''}`);

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const publicDir = path.join(APP_DIR, 'public');
const notCopied = walk(publicDir).map(f => path.relative(publicDir, f))
  .filter(rel => !fs.existsSync(path.join(DIST_DIR, rel)) || !fs.readFileSync(path.join(DIST_DIR, rel)).equals(fs.readFileSync(path.join(publicDir, rel))));
check(!notCopied.length, `app/public/ files served unchanged at the same URLs${notCopied.length ? ': ' + notCopied.join(', ') : ''}`);
check(/"directory":\s*"\.\/dist"/.test(fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')), 'wrangler serves dist/');

let failed = 0;
for (const [ok, name] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
