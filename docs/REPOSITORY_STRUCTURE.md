# Repository Structure

## Files kept in source control

```text
app/                 Front-end source (built by Vite into dist/, which is not committed)
  index.html          Markup
  styles/NN-*.css     Stylesheet, concatenated in file-name order
  js/NN-*.js          App code, concatenated in file-name order into ONE classic script
                      (00-react-bridge.js: the ksm:state-changed event for React islands)
  *.html              Extra pages other than index.html (Vite entries, React, no app.js):
                        overlay.html = /overlay, the stream overlay
  react/              React + strict TypeScript ES modules (own tsconfig.json):
                        island.tsx (mountIsland), legacy-bridge.ts (useLegacyState),
                        main.tsx (index.html's one module script: mounts the screens below),
                        live/ (useTournamentRecord: GET + spectator WebSocket),
                        overlay/ (stream overlay; court-match.ts = the TV's match selection),
                        court/ (the court screen: React islands inside index.html that draw
                        all of it, M.8; app/js/35-react-court.js publishes their data),
                        live-scores/ (the Live Scores screen #public, M.13;
                        app/js/36-react-live-scores.js publishes its data)
  engine/             Pure tournament-engine modules, strict TypeScript (own tsconfig.json):
                        no DOM, no globals, explicit inputs/outputs. index.ts is bundled
                        into a classic script defining `KSMEngine`, loaded before app.js;
                        app/js functions delegate to it, app/react imports the .ts files.
                        pools.ts: poolSizes
  types/*.d.ts        Tournament data types and globals for `npm run typecheck`
  public/             Icons, SVG assets and manifest, served at the site root unchanged
  service-worker.js   PWA service worker (the build adds the hashed bundle names)
src-worker.js        Cloudflare Worker backend (API + Durable Object)
scripts/             Build helpers (app-sources.mjs), verify-split.mjs, reset-cloud-data.mjs
tests/               Maintained regression tests (golden/engine, golden/court, golden/live-scores, golden/tv: approved snapshots)
docs/                Maintained documentation
README.md             Project overview
CHANGELOG.md          Consolidated release history
package.json          Scripts and development dependency metadata
vite.config.js        Front-end build (Vite)
tsconfig.json         Type checking (`npm run typecheck`; also app/react, app/engine)
wrangler.jsonc        Cloudflare deployment configuration (serves dist/)
.gitignore            Generated-file exclusions
```

## Files kept outside source control

The following are release or working artifacts and should be downloaded, archived, or attached to a GitHub Release rather than committed to `main`:

- `KSM_v*_GitHub_Repository_Upload.zip`
- complete release ZIPs
- generated `MANIFEST.json` files
- per-release `RELEASE_SUMMARY.md` files
- generated regression reports
- screenshots and temporary test output
- extracted release directories

Git history and `CHANGELOG.md` provide the permanent release record. A downloadable source snapshot can always be generated from a Git tag or GitHub Release.

## app/engine: the typed tournament engine

The engine moves out of `app/js/` one function group at a time (roadmap 2.0–2.7) into
`app/engine/*.ts`: pure strict-TypeScript ES modules. `scripts/app-sources.mjs`
`engineScript()` bundles `app/engine/index.ts` with rolldown into an IIFE
(`var KSMEngine = …`). The Vite plugin serves it at `/engine.js` in dev and, in the build,
emits `assets/engine-<hash>.js`, adds its `<script>` right before `app.js` in
`dist/index.html` and lists it in the service worker's `APP_SHELL`; `app/index.html`
itself is unchanged. Legacy code calls `KSMEngine.<name>(...)` (typed via
`app/types/globals.d.ts`); React code imports `../engine/<module>.ts` directly. The
step-by-step recipe is in docs/TESTING.md, "Moving a function into app/engine".
