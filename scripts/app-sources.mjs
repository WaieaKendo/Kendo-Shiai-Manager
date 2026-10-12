// The app's source layout, shared by vite.config.js and the tests.
//
// app/index.html        markup; references /app.css and /app.js
// app/styles/NN-*.css   concatenated in file-name order into /app.css
// app/js/NN-*.js        concatenated in file-name order into /app.js, ONE classic script:
//                       inline on*="..." handlers need globals, and ~35 functions are
//                       redeclared later in the code, where the last declaration wins.
//                       Separate <script> tags or ES modules would change both.
// app/*.html           other pages (e.g. overlay.html): extra Vite entries, built with
//                       ES-module scripts from app/react/ (React + strict TypeScript) and
//                       served without the .html (/overlay); none of them load app.js
// app/react/            React/TSX code, ES modules; never part of app.js
// app/engine/           pure strict-TS engine modules (no DOM, no globals). Bundled by
//                       engineScript() into ONE classic IIFE script defining `KSMEngine`,
//                       which index.html loads BEFORE app.js (/engine.js in dev, hashed in
//                       the build); app/js delegates to it, app/react imports the modules.
// app/service-worker.js service worker (the build rewrites /app.css and /app.js to the
//                       hashed bundle names in APP_SHELL)
// app/public/           static files, copied to the site root unchanged
//
// The release version is written ONLY in package.json. The sources carry the placeholder
// __KSM_VERSION__ instead (index.html title + badge, the two appVersion fields in
// app/js/19-cloud-diagnostics.js, the service worker CACHE_NAME); the build (and the dev
// server) replace it with withVersion(). src-worker.js imports package.json itself.
import fs from 'node:fs';
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
export const SCRIPT_TAG = `<script src="${SCRIPT_URL}"></script>`;
export const VERSION_PLACEHOLDER = '__KSM_VERSION__';
/** package.json "version", read fresh (a release bumps it while the dev server runs). */
export const appVersion = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
/** The text with every version placeholder replaced by package.json "version". */
export const withVersion = text => text.replaceAll(VERSION_PLACEHOLDER, appVersion());

const ordered = (dir, ext) => fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort().map(f => path.join(dir, f));
export const styleFiles = () => ordered(path.join(APP_DIR, 'styles'), '.css');
export const scriptFiles = () => ordered(path.join(APP_DIR, 'js'), '.js');
const concat = files => files.map(f => fs.readFileSync(f, 'utf8')).join('');

/** Extra entry pages: every app/*.html except index.html (file names, sorted). */
export const extraPages = () => fs.readdirSync(APP_DIR).filter(f => f.endsWith('.html') && f !== 'index.html').sort();

export const appStyles = () => concat(styleFiles());
export const appScript = () => concat(scriptFiles());
export const engineFiles = () => ordered(ENGINE_DIR, '.ts');

/** app/engine/index.ts as a classic script: `var KSMEngine = (function(exports){...})({});`. */
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
// before the split. Tests that read the source (grep checks, extractFunction) use this.
export function singleFileSource() {
  return indexHtml()
    .replace(STYLE_TAG, () => `<style>\n${appStyles()}</style>`)
    .replace(SCRIPT_TAG, () => `<script>\n${appScript()}</script>`);
}
