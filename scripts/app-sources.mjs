// The app's source layout, shared by vite.config.js and the tests.
//
// app/index.html        markup; references /app.css and /app.js
// app/styles/NN-*.css   concatenated in file-name order into /app.css
// app/js/NN-*.js        concatenated in file-name order into the ENTRY of /app.js, loaded as ONE ES module
//                       (<script type="module">; step 3c of #136). Its top-level names are module
//                       scoped, so whatever inline on*="..." handlers, app/react, the tests and
//                       window.NAME reach is exported to window by the last file,
//                       app/js/99-window-exports.js (tests/window-exports-test.mjs keeps it complete);
//                       no name may be declared twice (tests/no-duplicate-declarations-test.mjs).
//                       Since step 3d the entry may `import` (app/js/00-imports.js lists the imports,
//                       one single-line `import {a,b} from '...';` per module) and /app.js is the
//                       rolldown bundle of entry + modules (appBundle()), still ONE ES module file.
// app/modules/          the modules the entry imports, plain `.js` with `// @ts-check` (step 3d of #136,
//                       area by area: app-state.js, engine/engine-*.js, court/*.js, registration/*.js, setup/*.js,
//                       results/*.js, sync/*.js, session/*.js, links/*.js, auth/*.js, html-text.js, boot.js, react-bridges/*.js; next: step 4). A module never imports from the entry; its calls into app/js
//                       code that has not moved go through legacy.js (one wrapper per function, calling
//                       window.NAME at call time; app/js/00-legacy-exports.js puts those names on window
//                       first, since the entry's load-time code runs court code before 99-window-exports.js). Tests that read or run the app's code see the
//                       entry plus the modules as one classic script (singleFileSource(), classicAppScript():
//                       the modules in import order with `import` lines removed and `export ` dropped;
//                       tests/ksm_source.py does the same).
// app/*.html           other pages (e.g. overlay.html): extra Vite entries, built with
//                       ES-module scripts from app/react/ (React + strict TypeScript) and
//                       served without the .html (/overlay); none of them load app.js
// app/react/            React/TSX code, ES modules; never part of app.js
// app/engine/           pure strict-TS engine modules (no DOM, no globals). app/modules and app/js import them
//                       (`import * as KSMEngine from '.../engine/index.ts'`), so appBundle() bundles the engine into
//                       app.js (step 4b of #136) and 00-legacy-exports.js sets window.KSMEngine from the import
//                       for tests and anything outside; app/react imports the modules. engineScript() is only
//                       for tests that run app code in a vm, where it is the global KSMEngine.
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

/** app/modules/legacy.js: wrappers for the calls modules make into app/js (left out of the classic script). */
export const LEGACY_MODULE = path.join(MODULES_DIR, 'legacy.js');
const IMPORT_LINE = /^import \{([^}]*)\} from '([^']+)';?[ \t]*\r?\n/gm;
// `import * as KSMEngine from '.../engine/index.ts';` (step 4b): dropped, never visited; in the classic script KSMEngine is the global the tests supply.
const ENGINE_IMPORT_LINE = /^import \* as KSMEngine from '[^']*engine\/index\.ts';?[ \t]*\r?\n/gm;
const hasUnsupportedModuleSyntax = text => /^\s*(?:import\s*[\w{*'"]|export\s+(?:\{|\*|default))/m.test(text.replace(IMPORT_LINE, '').replace(ENGINE_IMPORT_LINE, ''));
/**
 * The entry plus its modules as ONE classic script, for tests that read or run the app's code: each module
 * (in import order, dependencies first, each once) with its `import` lines removed and `export ` dropped
 * from its declarations, then the entry without its `import` lines. app/modules/legacy.js is skipped (see
 * LEGACY_MODULE). Only single-line `import {a,b} from '...';`
 * and `export function|const|let|class|async function` are supported (anything else throws).
 * tests/ksm_source.py does the same.
 */
export function classicAppScript() {
  const done = new Set(), out = [];
  const strip = (file, text) => {
    if (hasUnsupportedModuleSyntax(text)) throw new Error(`${path.relative(ROOT, file)}: only single-line \`import {a,b} from '...';\` and \`export function|const|let|class\` are supported`);
    for (const m of text.matchAll(IMPORT_LINE)) visit(path.resolve(path.dirname(file), m[2]));
    return text.replace(IMPORT_LINE, '').replace(ENGINE_IMPORT_LINE, '');
  };
  const visit = file => {
    if (done.has(file)) return;
    done.add(file);
    // legacy.js only wraps app/js functions for calls from a module; in one script the functions themselves are in scope.
    if (file === LEGACY_MODULE) return;
    out.push(strip(file, fs.readFileSync(file, 'utf8')).replace(/^export (?=(?:async\s+)?function\b|const\b|let\b|class\b)/gm, ''));
  };
  const entry = scriptFiles().map(f => strip(f, fs.readFileSync(f, 'utf8'))).join('');
  return out.join('') + entry;
}
export const engineFiles = () => ordered(ENGINE_DIR, '.ts');

/** app/engine/index.ts as a classic script (the app no longer loads it; vm-based tests do): `var KSMEngine = (function(exports){...})({});`. */
export async function engineScript() {
  const bundle = await rolldown({ input: path.join(ENGINE_DIR, 'index.ts'), logLevel: 'silent' });
  try {
    const { output } = await bundle.generate({ format: 'iife', name: 'KSMEngine', minify: false });
    return output[0].code;
  } finally { await bundle.close(); }
}
export const indexHtml = () => fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
export const serviceWorker = () => fs.readFileSync(path.join(APP_DIR, 'service-worker.js'), 'utf8');

// index.html with the stylesheet and script inlined, as the app was a single file
// before the split. Tests that read the source (grep checks, extractFunction) use this. The script
// is inlined as a classic script (not type="module"): the tests evaluate pieces of it in vm contexts.
export function singleFileSource() {
  return indexHtml()
    .replace(STYLE_TAG, () => `<style>\n${appStyles()}</style>`)
    .replace(SCRIPT_TAG, () => `<script>\n${classicAppScript()}</script>`);
}
