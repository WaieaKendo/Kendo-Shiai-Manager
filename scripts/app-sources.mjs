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
// app/service-worker.js service worker (the build rewrites /app.css and /app.js to the
//                       hashed bundle names in APP_SHELL)
// app/public/           static files, copied to the site root unchanged
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APP_DIR = path.join(ROOT, 'app');
export const DIST_DIR = path.join(ROOT, 'dist');
export const STYLE_URL = '/app.css';
export const SCRIPT_URL = '/app.js';
export const STYLE_TAG = `<link rel="stylesheet" href="${STYLE_URL}">`;
export const SCRIPT_TAG = `<script src="${SCRIPT_URL}"></script>`;

const ordered = (dir, ext) => fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort().map(f => path.join(dir, f));
export const styleFiles = () => ordered(path.join(APP_DIR, 'styles'), '.css');
export const scriptFiles = () => ordered(path.join(APP_DIR, 'js'), '.js');
const concat = files => files.map(f => fs.readFileSync(f, 'utf8')).join('');

/** Extra entry pages: every app/*.html except index.html (file names, sorted). */
export const extraPages = () => fs.readdirSync(APP_DIR).filter(f => f.endsWith('.html') && f !== 'index.html').sort();

export const appStyles = () => concat(styleFiles());
export const appScript = () => concat(scriptFiles());
export const indexHtml = () => fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
export const serviceWorker = () => fs.readFileSync(path.join(APP_DIR, 'service-worker.js'), 'utf8');

// index.html with the stylesheet and script inlined, as the app was a single file
// before the split. Tests that read the source (grep checks, extractFunction) use this.
export function singleFileSource() {
  return indexHtml()
    .replace(STYLE_TAG, () => `<style>\n${appStyles()}</style>`)
    .replace(SCRIPT_TAG, () => `<script>\n${appScript()}</script>`);
}
