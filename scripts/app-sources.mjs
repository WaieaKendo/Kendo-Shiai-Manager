// The app's source layout, shared by vite.config.js and the tests.
//
// app/index.html        markup; references /app.css and /app.js
// app/styles/NN-*.css   concatenated in file-name order into /app.css
// app/main.js           the ENTRY of /app.js, ONE ES module (<script type="module">; steps 3c and 4d of #136): the
//                       `import` lines (one single-line `import {a,b} from '...';` per module), the load-time
//                       calls (the path-URL rewrite first, the init...() calls in their old order, the autosave
//                       listeners) and, last, the window exports. Its top-level names are module scoped, so
//                       whatever inline on*="..." handlers, app/react, the tests and window.NAME reach is exported
//                       to window by the last section (tests/window-exports-test.mjs keeps it complete); no name
//                       may be declared twice (tests/no-duplicate-declarations-test.mjs).
//                       /app.js is the rolldown bundle of the entry + modules (appBundle()), ONE ES module file.
// app/modules/          the modules the entry imports, plain `.js` with `// @ts-check` (step 3d of #136,
//                       area by area: app-state.js, engine/engine-*.js, court/*.js, registration/*.js, setup/*.js,
//                       results/*.js, sync/*.js, session/*.js, links/*.js, auth/*.js, html-text.js, boot.js, react-bridges/*.js).
//                       A module never imports from the entry. The few functions tests replace after
//                       load (KSMTest.app.NAME = ..., the goldens' window wrappers) are made with
//                       replaceable() (app/modules/replaceable.js): a stable function callers use, and a live
//                       window.NAME accessor that swaps the implementation. Tests that read the app's code as
//                       text use appSourceText() below: the real files, no transform.
// app/*.html           other pages (e.g. overlay.html): extra Vite entries, built with
//                       ES-module scripts from app/react/ (React + strict TypeScript) and
//                       served without the .html (/overlay); none of them load app.js
// app/react/            React/TSX code, ES modules; never part of app.js
// app/engine/           pure strict-TS engine modules (no DOM, no globals). app/modules import them
//                       (`import * as KSMEngine from '.../engine/index.ts'`), so appBundle() bundles the engine into
//                       app.js (step 4b of #136) and app/main.js sets window.KSMEngine from the import
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
export const ENTRY_FILE = path.join(APP_DIR, 'main.js');
export const MODULES_DIR = path.join(APP_DIR, 'modules');
/** Every app/modules/**\/*.js file, sorted by path. */
export const moduleFiles = () => fs.readdirSync(MODULES_DIR, { recursive: true }).filter(f => f.endsWith('.js')).sort().map(f => path.join(MODULES_DIR, f));
const concat = files => files.map(f => fs.readFileSync(f, 'utf8')).join('');

/** Extra entry pages: every app/*.html except index.html (file names, sorted). */
export const extraPages = () => fs.readdirSync(APP_DIR).filter(f => f.endsWith('.html') && f !== 'index.html').sort().concat(Object.values(printDocuments));

export const appStyles = () => concat(styleFiles());
/** The entry of app.js: app/main.js, as it is on disk. */
export const appScript = () => fs.readFileSync(ENTRY_FILE, 'utf8');

/**
 * /app.js: the entry (app/main.js) and the modules it imports, bundled by rolldown into ONE ES module
 * file: no code splitting, no minify, no tree-shaking (the entry's top-level code is reached through
 * `window`, by inline handlers). rolldown keeps JSDoc and legal comments only; plain // and /* comments
 * are dropped from the output (the sources keep them). Returns the code (version placeholders intact).
 */
const nodeModule = file => path.join(ROOT, 'node_modules', file);
/** The production builds app.js bundles for the store's packages (see appBundle()). */
export const STORE_PACKAGE_BUILDS = {
  '@reduxjs/toolkit': nodeModule('@reduxjs/toolkit/dist/redux-toolkit.browser.mjs'),
  redux: nodeModule('redux/dist/redux.browser.mjs'),
  immer: nodeModule('immer/dist/immer.production.mjs'),
  reselect: nodeModule('reselect/dist/reselect.browser.mjs'),
};
export async function appBundle() {
  const bundle = await rolldown({
    input: ENTRY_FILE, logLevel: 'silent', treeshake: false,
    // Redux Toolkit and the packages it imports (app/store, #15): their published production builds, already
    // minified (rolldown neither minifies nor tree-shakes app.js). Their default ESM builds read
    // process.env.NODE_ENV, which rolldown makes 'development': ~150 kB of development-only checks (a deep
    // immutability walk on every dispatch) on TVs and tablets. The Node tests (tests/store) import the package
    // defaults and keep the checks. Exact files: re-check these paths when the pinned versions change.
    resolve: { alias: STORE_PACKAGE_BUILDS },
    transform: { define: { 'process.env.NODE_ENV': '"production"' } },
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
 * app/index.html, app/styles/*.css, app/modules/**\/*.js (sorted by path) and app/main.js, each file as it is
 * on disk, nothing transformed (no inlining of imports, `export` kept). Names are unique across the files
 * (tests/no-duplicate-declarations-test.mjs), so a function is found once.
 */
export const appSourceText = () => [indexHtml(), appStyles(), concat(moduleFiles()), appScript()].join('\n');
