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
                        live/ (useTournamentRecord: GET + spectator WebSocket),
                        overlay/ (stream overlay; court-match.ts = the TV's match selection)
  types/*.d.ts        Tournament data types and globals for `npm run typecheck`
  public/             Icons, SVG assets and manifest, served at the site root unchanged
  service-worker.js   PWA service worker (the build adds the hashed bundle names)
src-worker.js        Cloudflare Worker backend (API + Durable Object)
scripts/             Build helpers (app-sources.mjs), verify-split.mjs, reset-cloud-data.mjs
tests/               Maintained regression tests
docs/                Maintained documentation
README.md             Project overview
CHANGELOG.md          Consolidated release history
package.json          Scripts and development dependency metadata
vite.config.js        Front-end build (Vite)
tsconfig.json         Type checking (`npm run typecheck`)
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
