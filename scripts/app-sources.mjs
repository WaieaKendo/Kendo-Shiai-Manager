// The app's source layout, shared by vite.config.js and the tests.
//
// app/index.html        markup; references /app.css and /app.js
// app/styles/NN-*.css   concatenated in file-name order into /app.css
// app/js/NN-*.js        concatenated in file-name order into the ENTRY of /app.js, loaded as ONE ES module
//                       (<script type="module">; step 3c of #136). After step 4a the entry is what is left
//                       outside the modules: the `import` lines (00-imports.js, one single-line
//                       `import {a,b} from '...';` per module), init calls, and a few functions step 4d moves.
//                       Its top-level names are module scoped, so whatever inline on*="..." handlers,
//                       app/react, the tests and window.NAME reach is exported to window by the last file,
//                       app/js/99-window-exports.js (tests/window-exports-test.mjs keeps it complete);
//                       no name may be declared twice (tests/no-duplicate-declarations-test.mjs).
//                       /app.js is the rolldown bundle of entry + modules (appBundle()), ONE ES module file.
// app/modules/          the modules the entry imports, plain `.js` with `// @ts-check` (step 3d of #136,
//                       area by area: app-state.js, engine/engine-*.js, court/*.js, registration/*.js, setup/*.js,
//                       results/*.js, sync/*.js, session/*.js, links/*.js, auth/*.js, html-text.js, boot.js, react-bridges/*.js).
//                       A module never imports from the entry; its calls into app/js code that has not moved
//                       go through legacy.js (one wrapper per function, calling window.NAME at call time;
//                       app/js/00-legacy-exports.js puts those names on window first, since the entry's
//                       load-time code runs court code before 99-window-exports.js). Tests that read the
//                       app's code as text use appSourceText() below: the real files, no transform.
// app/*.html           other pages (e.g. overlay.html): extra Vite entries, built with
//                       ES-module scripts from app/react/ (React + strict TypeScript) and
//                       served without the .html (/overlay); none of them load app.js
// app/react/            React/TSX code, ES modules; never part of app.js
// app/engine/           pure strict-TS engine modules (no DOM, no globals). app/modules import them
//                       (`import * as KSMEngine from '.../engine/index.ts'`), so appBundle() bundles the engine into
//                       app.js (step 4b of #136) and app/js/99-window-exports.js sets window.KSMEngine from the import
//                       for anything outside the bundle; app/react imports the modules. Node tests import
//                       the .ts files directly.
// app/service-worker.js service worker (the build rewrites /app.css and /app.js to the
//                       hashed bundle names in APP_SHELL)
// app/public/           static files, copied to the site root unchanged
//
// The release version is written ONLY in package.json. The sources carry the placeholder
// __KSM_VERSION__ instead (index.html title + badge, the two appVersion fields in
// app/modules/sync/cloud-diagnostics.js, the service worker CACHE_NAME); the build (and the dev
// server) replace it with withVersion(). src-worker.js imports package.json itself.
import fs from 'node:fs';
import { printDocuments } from '../app/print-documents.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APP_DIR = path.join(ROOT, 'app');
export const DIST_DIR = path.join(ROOT, 'dist');
export const STYLE_URL = '/app.css';
export const SCRIPT_URL = '/app.js';
export const ENGINE_DIR = path.join(APP_DIR, 'engine');
export const ENGINE_URL = '/engine.js';
export const STYLE_TAG = `<link rel="stylesheet" href="${STYLE_URL}">`;
export const SCRIPT_TAG = `<script type="module" src="${SCRIPT_URL}"></script>`;
export const VERSION_PLACEHOLDER = '__KSM_VERSION__';
/** package.json "version", read fresh (a release bumps it while the dev server runs). */
export const appVersion = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
/** The text with every version placeholder replaced by package.json "version". */
export const withVersion = text => text.replaceAll(VERSION_PLACEHOLDER, appVersion());

const ordered = (dir, ext) => fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort().map(f => path.join(dir, f));
export const styleFiles = () => ordered(path.join(APP_DIR, 'styles'), '.css');
export const scriptFiles = () => ordered(path.join(APP_DIR, 'js'), '.js');
export const MODULES_DIR = path.join(APP_DIR, 'modules');
/** Every app/modules/**\/*.js file, sorted by path. */
export const moduleFiles = () => fs.readdirSync(MODULES_DIR, { recursive: true }).filter(f => f.endsWith('.js')).sort().map(f => path.join(MODULES_DIR, f));
const concat = files => files.map(f => fs.readFileSync(f, 'utf8')).join('');

/** Extra entry pages: every app/*.html except index.html (file names, sorted). */
export const extraPages = () => fs.readdirSync(APP_DIR).filter(f => f.endsWith('.html') && f !== 'index.html').sort().concat(Object.values(printDocuments));

export const appStyles = () => concat(styleFiles());
/** The entry of app.js: app/js/*.js concatenated (its `import` lines resolve against app/js). */
export const appScript = () => concat(scriptFiles());

const ENTRY_ID = path.join(APP_DIR, 'js', '__app-entry__.js');
/**
 * /app.js: the entry (appScript()) and the modules it imports, bundled by rolldown into ONE ES module
 * file: no code splitting, no minify, no tree-shaking (the entry's top-level code is reached through
 * `window`, by inline handlers). rolldown keeps JSDoc and legal comments only; plain // and /* comments
 * are dropped from the output (the sources keep them). Returns the code (version placeholders intact).
 */
export async function appBundle() {
  const bundle = await rolldown({
    input: ENTRY_ID, logLevel: 'silent', treeshake: false,
    plugins: [{ name: 'ksm-app-entry', resolveId: id => (id === ENTRY_ID ? id : null), load: id => (id === ENTRY_ID ? appScript() : null) }],
  });
  try {
    const { output } = await bundle.generate({ format: 'esm', minify: false, codeSplitting: false, comments: true });
    if (output.length !== 1) throw new Error(`app.js must be one file, rolldown produced ${output.length}`);
    return output[0].code;
  } finally { await bundle.close(); }
}

export const engineFiles = () => ordered(ENGINE_DIR, '.ts');

export const indexHtml = () => fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
export const serviceWorker = () => fs.readFileSync(path.join(APP_DIR, 'service-worker.js'), 'utf8');

/**
 * The app's source as ONE plain text, for tests that read the code (grep-style checks, extractFunction):
 * app/index.html, app/styles/*.css, app/modules/**\/*.js (sorted by path) and app/js/*.js, each file as it is
 * on disk, nothing transformed (no inlining of imports, `export` kept). Names are unique across the files
 * (tests/no-duplicate-declarations-test.mjs), so a function is found once.
 */
export const appSourceText = () => [indexHtml(), appStyles(), concat(moduleFiles()), appScript()].join('\n');
