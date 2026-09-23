import crypto from 'node:crypto';
import { defineConfig } from 'vite';
import {
  APP_DIR, DIST_DIR, STYLE_TAG, SCRIPT_TAG, STYLE_URL, SCRIPT_URL,
  appStyles, appScript, serviceWorker, styleFiles, scriptFiles,
} from './scripts/app-sources.mjs';

// The app is still one classic script plus one stylesheet (see scripts/app-sources.mjs).
// This plugin serves them in dev and emits them verbatim (no transform or minify) as
// hashed files in the build; Vite handles index.html and copies app/public/.
function ksmClassicBundle() {
  const hashed = (name, ext, source) => `assets/${name}-${crypto.createHash('sha256').update(source).digest('hex').slice(0, 10)}${ext}`;
  let built = null;
  return {
    name: 'ksm-classic-bundle',
    configureServer(server) {
      server.watcher.add([...styleFiles(), ...scriptFiles()]);
      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0];
        const send = (type, body) => { res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-store'); res.end(body); };
        if (url === STYLE_URL) return send('text/css; charset=utf-8', appStyles());
        if (url === SCRIPT_URL) return send('text/javascript; charset=utf-8', appScript());
        if (url === '/service-worker.js') return send('text/javascript; charset=utf-8', serviceWorker());
        next();
      });
    },
    buildStart() {
      for (const file of [...styleFiles(), ...scriptFiles()]) this.addWatchFile(file);
      const css = appStyles(), js = appScript();
      built = { css, js, cssFile: hashed('app', '.css', css), jsFile: hashed('app', '.js', js) };
    },
    transformIndexHtml: {
      // Before Vite parses the page, so it does not try to bundle the two tags itself.
      order: 'pre',
      handler(html, ctx) {
        if (ctx.server || !built) return html;
        if (!html.includes(STYLE_TAG) || !html.includes(SCRIPT_TAG)) throw new Error('app/index.html must contain the app.css and app.js tags');
        return html
          .replace(STYLE_TAG, () => `<link rel="stylesheet" href="/${built.cssFile}" vite-ignore>`)
          .replace(SCRIPT_TAG, () => `<script src="/${built.jsFile}" vite-ignore></script>`);
      },
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: built.cssFile, source: built.css });
      this.emitFile({ type: 'asset', fileName: built.jsFile, source: built.js });
      const sw = serviceWorker();
      if (!sw.includes(`'${STYLE_URL}', '${SCRIPT_URL}'`)) throw new Error('app/service-worker.js APP_SHELL must list /app.css and /app.js');
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source: sw.replace(`'${STYLE_URL}', '${SCRIPT_URL}'`, `'/${built.cssFile}', '/${built.jsFile}'`) });
    },
  };
}

export default defineConfig({
  root: APP_DIR,
  publicDir: 'public',
  plugins: [ksmClassicBundle(), {
    // Vite drops the vite-ignore attribute but leaves its space behind.
    name: 'ksm-tidy-bundle-tags',
    transformIndexHtml: { order: 'post', handler: html => html.replace(/(\/assets\/app-\w+\.(?:css|js)") >/g, '$1>') },
  }],
  build: {
    outDir: DIST_DIR,
    emptyOutDir: true,
    minify: false,
    cssMinify: false,
    modulePreload: false,
  },
  server: {
    // `npm run dev:vite`: the app from Vite, /api from `wrangler dev` (port 8787).
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
});
