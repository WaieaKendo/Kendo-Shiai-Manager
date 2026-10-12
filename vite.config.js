import crypto from 'node:crypto';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {
  APP_DIR, DIST_DIR, STYLE_TAG, SCRIPT_TAG, STYLE_URL, SCRIPT_URL, ENGINE_URL,
  appStyles, appScript, engineScript, serviceWorker, styleFiles, scriptFiles, engineFiles, extraPages,
} from './scripts/app-sources.mjs';

const DEV_SERVICE_WORKER = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => self.clients.claim())));
`;

// The app is still one classic script plus one stylesheet (see scripts/app-sources.mjs).
// This plugin serves them in dev and emits them verbatim (no transform or minify) as
// hashed files in the build; Vite handles index.html and copies app/public/.
// The engine (app/engine/*.ts) is bundled into a second classic script that defines
// `KSMEngine`; the plugin adds its tag right before app.js (app/index.html is unchanged).
// Only index.html gets the classic bundle; extra pages (app/*.html) are ordinary Vite
// entries with module scripts from app/react/.
// index.html also gets one module script after app.js: the React court screen islands
// (COURT_MODULE), which Vite bundles like any page script. Its files join APP_SHELL, so an
// offline device has the same court screen.
const COURT_MODULE = '/react/court/main.tsx';
const COURT_TAG = `<script type="module" src="${COURT_MODULE}"></script>`;

// The bundled files index.html's module scripts load: entry chunk, imported chunks, their CSS.
function indexModuleFiles(bundle) {
  const chunks = Object.values(bundle).filter(c => c.type === 'chunk');
  const entry = chunks.find(c => c.isEntry && c.facadeModuleId && path.basename(c.facadeModuleId) === 'index.html');
  const files = new Set();
  const visit = chunk => {
    if (!chunk || files.has(chunk.fileName)) return;
    files.add(chunk.fileName);
    for (const css of chunk.viteMetadata?.importedCss || []) files.add(css);
    for (const name of chunk.imports) visit(chunks.find(c => c.fileName === name));
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
      server.watcher.add([...styleFiles(), ...scriptFiles(), ...engineFiles()]);
      server.middlewares.use(async (req, res, next) => {
        const url = req.url.split('?')[0];
        const send = (type, body) => { res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-store'); res.end(body); };
        if (url === STYLE_URL) return send('text/css; charset=utf-8', appStyles());
        if (url === SCRIPT_URL) return send('text/javascript; charset=utf-8', appScript());
        if (url === ENGINE_URL) return send('text/javascript; charset=utf-8', await engineScript());
        // No offline cache in dev, so edits show on reload: this worker only clears old caches.
        if (url === '/service-worker.js') return send('text/javascript; charset=utf-8', DEV_SERVICE_WORKER);
        // Extra pages at their clean URL (/overlay), as Cloudflare's asset server does.
        if (pages.includes(`${url.slice(1)}.html`)) req.url = req.url.replace(url, `${url}.html`);
        next();
      });
    },
    async buildStart() {
      for (const file of [...styleFiles(), ...scriptFiles(), ...engineFiles()]) this.addWatchFile(file);
      const css = appStyles(), js = appScript(), engine = await engineScript();
      built = { css, js, engine, cssFile: hashed('app', '.css', css), jsFile: hashed('app', '.js', js), engineFile: hashed('engine', '.js', engine) };
    },
    transformIndexHtml: {
      // Before Vite parses the page, so it does not try to bundle the two tags itself.
      order: 'pre',
      handler(html, ctx) {
        if (ctx.path !== '/index.html') return html;
        if (!html.includes(STYLE_TAG) || !html.includes(SCRIPT_TAG)) throw new Error('app/index.html must contain the app.css and app.js tags');
        if (ctx.server) return html.replace(SCRIPT_TAG, () => `<script src="${ENGINE_URL}"></script>\n${SCRIPT_TAG}\n${COURT_TAG}`);
        if (!built) return html;
        return html
          .replace(STYLE_TAG, () => `<link rel="stylesheet" href="/${built.cssFile}" vite-ignore>`)
          .replace(SCRIPT_TAG, () => `<script src="/${built.engineFile}" vite-ignore></script>\n<script src="/${built.jsFile}" vite-ignore></script>\n${COURT_TAG}`);
      },
    },
    generateBundle(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: built.cssFile, source: built.css });
      this.emitFile({ type: 'asset', fileName: built.jsFile, source: built.js });
      this.emitFile({ type: 'asset', fileName: built.engineFile, source: built.engine });
      const sw = serviceWorker();
      if (!sw.includes(`'${STYLE_URL}', '${SCRIPT_URL}'`)) throw new Error('app/service-worker.js APP_SHELL must list /app.css and /app.js');
      const court = indexModuleFiles(bundle);
      if (!court.length) throw new Error(`index.html must load ${COURT_MODULE}`);
      const shell = [built.cssFile, built.engineFile, built.jsFile, ...court].map(f => `'/${f}'`).join(', ');
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source: sw.replace(`'${STYLE_URL}', '${SCRIPT_URL}'`, shell) });
    },
  };
}

export default defineConfig({
  root: APP_DIR,
  publicDir: 'public',
  plugins: [react(), ksmClassicBundle(), {
    // Vite drops the vite-ignore attribute but leaves its space behind.
    name: 'ksm-tidy-bundle-tags',
    transformIndexHtml: { order: 'post', handler: html => html.replace(/(\/assets\/(?:app|engine)-\w+\.(?:css|js)") >/g, '$1>') },
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
