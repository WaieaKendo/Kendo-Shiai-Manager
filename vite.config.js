import crypto from 'node:crypto';
import { printTheme } from './scripts/print-theme.mjs';
import { printDocumentPage } from './app/print-documents.mjs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {
  APP_DIR, DIST_DIR, STYLE_TAG, SCRIPT_TAG, STYLE_URL, SCRIPT_URL,
  appStyles, appBundle, serviceWorker, styleFiles, scriptFiles, moduleFiles, engineFiles, extraPages,
  ROOT, withVersion,
} from './scripts/app-sources.mjs';
import { servesOverlay, servesAppShell } from './app/engine/routes.ts';

const DEV_SERVICE_WORKER = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => self.clients.claim())));
`;

// The app is one script (app/js/*.js concatenated into the entry, plus the app/modules it imports, loaded
// as an ES module; steps 3c and 3d of #136) plus one stylesheet (see scripts/app-sources.mjs). This plugin
// serves them in dev and emits them as hashed files in the build; Vite handles index.html and copies
// app/public/. app.js is bundled by rolldown (appBundle(): ONE ESM file, no code splitting, no minify,
// no tree-shaking), per request in dev and once in buildStart; the stylesheet is emitted verbatim.
// The engine (app/engine/*.ts) is imported by app code and bundled into app.js (step 4b of #136; it was
// a separate classic engine.js defining the global `KSMEngine`). Order: app.js (module) -> the screens
// module below; modules run in document order, after parsing.
// Only index.html gets the app.js tag; extra pages (app/*.html) are ordinary Vite
// entries with module scripts from app/react/.
// index.html also gets one module script after app.js: the React screens' islands
// (SCREENS_MODULE: the court screen, Live Scores, the TV display and Results), which Vite bundles like any page script.
// Its files join APP_SHELL, so an offline device has the same screens.
// The version: package.json "version" replaces __KSM_VERSION__ (withVersion) in every page, in
// app.js and in the service worker (its CACHE_NAME), in dev and in the build.
const SCREENS_MODULE = '/react/main.tsx';
const SCREENS_TAG = `<script type="module" src="${SCREENS_MODULE}"></script>`;

// A page module’s entry chunk, imported chunks and CSS, for offline precaching.
function indexModuleFiles(bundle, page = 'index.html') {
  const chunks = Object.values(bundle).filter(c => c.type === 'chunk');
  const entry = chunks.find(c => c.isEntry && c.facadeModuleId && c.facadeModuleId.endsWith('/' + page));
  const files = new Set();
  const visit = chunk => {
    if (!chunk || files.has(chunk.fileName)) return;
    files.add(chunk.fileName);
    for (const css of chunk.viteMetadata?.importedCss || []) files.add(css);
    // Preserve the main app's existing static-import precache scope.
    const imports = page.startsWith('print/') ? [...chunk.imports, ...chunk.dynamicImports] : chunk.imports;
    for (const name of imports) visit(chunks.find(c => c.fileName === name));
  };
  visit(entry);
  return [...files];
}

function ksmClassicBundle() {
  const hashed = (name, ext, source) => `assets/${name}-${crypto.createHash('sha256').update(source).digest('hex').slice(0, 10)}${ext}`;
  let built = null;
  const pages = extraPages();
  return {
    name: 'ksm-classic-bundle',
    configureServer(server) {
      server.watcher.add([...styleFiles(), ...scriptFiles(), ...moduleFiles(), ...engineFiles()]);
      server.middlewares.use(async (req, res, next) => {
        const url = req.url.split('?')[0];
        const send = (type, body) => { res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-store'); res.end(body); };
        if (url === '/print/theme.css') return send('text/css; charset=utf-8', printTheme(appStyles()));
        if (url === STYLE_URL) return send('text/css; charset=utf-8', appStyles());
        if (url === SCRIPT_URL) return send('text/javascript; charset=utf-8', withVersion(await appBundle()));
        // No offline cache in dev, so edits show on reload: this worker only clears old caches.
        if (url === '/service-worker.js') return send('text/javascript; charset=utf-8', DEV_SERVICE_WORKER);
        // Extra pages at their clean URL (/overlay), as Cloudflare's asset server does.
        if (printDocumentPage(url)) req.url = req.url.replace(url, '/' + printDocumentPage(url));
        else if (pages.includes(`${url.slice(1)}.html`)) req.url = req.url.replace(url, `${url}.html`);
        // Path URLs (M.9): /t/<id>/overlay/a is the overlay page, as src-worker.js answers it; other
        // /t/... paths get index.html from Vite's single-page fallback, as from Cloudflare's.
        else if (servesOverlay(url)) req.url = req.url.replace(url, '/overlay.html');
        else if (servesAppShell(url)) req.url = req.url.replace(url, '/index.html');
        next();
      });
    },
    async buildStart() {
      for (const file of [...styleFiles(), ...scriptFiles(), ...moduleFiles(), ...engineFiles(), path.join(ROOT, 'package.json')]) this.addWatchFile(file);
      const css = appStyles(), js = withVersion(await appBundle());
      built = { css, js, cssFile: hashed('app', '.css', css), jsFile: hashed('app', '.js', js) };
    },
    transformIndexHtml: {
      // Before Vite parses the page, so it does not try to bundle the two tags itself.
      order: 'pre',
      handler(html, ctx) {
        html = withVersion(html);
        if (ctx.path !== '/index.html') return html;
        if (!html.includes(STYLE_TAG) || !html.includes(SCRIPT_TAG)) throw new Error('app/index.html must contain the app.css and app.js tags');
        if (ctx.server) return html.replace(SCRIPT_TAG, () => `${SCRIPT_TAG}\n${SCREENS_TAG}`);
        if (!built) return html;
        return html
          .replace(STYLE_TAG, () => `<link rel="stylesheet" href="/${built.cssFile}" vite-ignore>`)
          .replace(SCRIPT_TAG, () => `<script type="module" src="/${built.jsFile}" vite-ignore></script>\n${SCREENS_TAG}`);
      },
    },
    generateBundle(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: 'print/theme.css', source: printTheme(built.css) });
      this.emitFile({ type: 'asset', fileName: built.cssFile, source: built.css });
      this.emitFile({ type: 'asset', fileName: built.jsFile, source: built.js });
      const sw = withVersion(serviceWorker());
      if (!sw.includes(`'${STYLE_URL}', '${SCRIPT_URL}'`)) throw new Error('app/service-worker.js APP_SHELL must list /app.css and /app.js');
      const screens = indexModuleFiles(bundle);
      const printAssets = pages.filter(p => p.startsWith('print/')).flatMap(p => indexModuleFiles(bundle, p));
      const printShell = [...new Set([...pages.filter(p => p.startsWith('print/')).map(p => '/' + p.replace(/\.html$/, '')), ...printAssets.map(p => '/' + p), ...Object.keys(bundle).filter(p => /\.(png|webp)$/.test(p)).map(p => '/' + p)])].filter(p => !screens.includes(p.slice(1)));
      if (!screens.length) throw new Error(`index.html must load ${SCREENS_MODULE}`);
      const shell = [built.cssFile, built.jsFile, ...screens].map(f => `'/${f}'`).join(', ');
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source: sw.replace(`'${STYLE_URL}', '${SCRIPT_URL}'`, shell).replace('/* PRINT_SHELL */', printShell.map(p => JSON.stringify(p)).join(', ')) });
    },
  };
}

export default defineConfig({
  root: APP_DIR,
  define: { __PRINT_VERSION__: JSON.stringify(withVersion("__KSM_VERSION__")) },
  publicDir: 'public',
  plugins: [react(), ksmClassicBundle(), {
    // Vite drops the vite-ignore attribute but leaves its space behind.
    name: 'ksm-tidy-bundle-tags',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        html = html.replace(/(\/assets\/app-\w+\.(?:css|js)") >/g, '$1>');
        // Vite hoists the screens module into <head>, where it would run BEFORE app.js, which is a module
        // too and sits at the end of <body> (modules run in document order). Put it right after app.js,
        // as the dev server serves them: app.js -> the React screens.
        const screens = /\n\s*(<script type="module" crossorigin src="\/assets\/index-[\w-]+\.js"><\/script>)/;
        const tag = html.match(screens)?.[1];
        if (!tag) return html;
        return html.replace(screens, '').replace(/<script type="module" src="\/assets\/app-\w+\.js"><\/script>/, app => `${app}\n${tag}`);
      },
    },
  }],
  build: {
    outDir: DIST_DIR,
    emptyOutDir: true,
    minify: false,
    cssMinify: false,
    modulePreload: false,
    rolldownOptions: {
      // index.html (the app) plus every extra page (app/*.html), e.g. overlay.html.
      input: Object.fromEntries(['index.html', ...extraPages()].map(f => [path.basename(f, '.html'), path.join(APP_DIR, f)])),
    },
  },
  server: {
    // `npm run dev:vite`: the app from Vite, /api from `wrangler dev` (port 8787).
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
});
