# Repository Structure

## Files kept in source control

```text
app/                 Front-end source (built by Vite into dist/, which is not committed)
  index.html          Markup
  styles/NN-*.css     Stylesheet, concatenated in file-name order
  js/NN-*.js          App code, concatenated in file-name order into ONE classic script
                      (00-path-urls.js: path URLs, M.9: an old ?tournament= link becomes its
                      path first, ksmLinkParams()/ksmLinkUrl(); 00-react-bridge.js: the
                      ksm:state-changed event for React islands)
  *.html              Extra pages other than index.html (Vite entries, no app.js):
                        privacy.html = /privacy, static privacy notice (no JavaScript)
                        overlay.html = /t/<id>/overlay/a|b (and /overlay), the stream overlay
  react/              React + strict TypeScript ES modules (own tsconfig.json):
                        main.tsx (index.html's one module script: mounts the screens below),
                        shared/lib/ (island.tsx = mountIsland, legacy-bridge.ts =
                        useLegacyState, keyboard.ts),
                        shared/ui/ (pieces used by several screens: branding.ts, the
                        court context/match rows (CourtContext.tsx, context-model.ts,
                        MatchRows.tsx, rows-model.ts), CourtComplete.tsx (the
                        division-complete panel + complete-model.ts), scoreboard-model.ts),
                        features/<screen>/ (one folder per screen, each with its own main.tsx):
                        live/ (useTournamentRecord: GET + spectator WebSocket),
                        overlay/ (stream overlay; court-match.ts = the TV's match selection),
                        court/ (the court screen: React islands inside index.html that draw
                        all of it, M.8; app/js/35-react-court.js publishes their data),
                        live-scores/ (the Live Scores screen #public, M.13;
                        app/js/36-react-live-scores.js publishes its data),
                        tv/ (the TV display #tvLive, ?view=tv, M.13;
                        app/js/37-react-tv.js publishes its data; the Final Results
                        reuse shared/ui/'s DivisionCompletePanel),
                        results/ (the Results screen #results: cards, awards editor,
                        bracket modal, M.13; app/js/38-react-results.js publishes its
                        data; the modal reuses shared/ui/'s Bracket),
                        overview/ (the Overview screen #director, M.13;
                        app/js/39-react-overview.js publishes its data),
                        library/ (the Tournament Library, the home page #home, M.13;
                        app/js/40-react-library.js publishes its data; logo and card
                        mark from shared/ui/branding.ts),
                        pools/ (the Pools view's #poolOutput, Registration -> Pools, and
                        the Edit Pool editor, M.13; app/js/41-react-pools.js publishes
                        its data; the preview reuses shared/ui/'s Bracket),
                        setup/ (the Setup screen's divisions table rows #divisionSetupRows
                        and hero name #setupTournamentName, M.13; app/js/42-react-setup.js
                        publishes their data; the Setup fields stay legacy markup),
                        registration/ (Registration, M.13. Part 1: the players table
                        #regTable and the status card's contents #tournamentStatusCard;
                        part 2 (RegistrationTeams.tsx, teams-model.ts): the team cards
                        #teamTable, the exhibition table #exhibitionTable and the tab
                        bar; app/js/43-react-registration.js publishes their data; the
                        toolbars, filters and the cards' visibility stay legacy),
                        shell/ (the shell, M.13's last step: the navigation bar
                        nav.minimal-nav and the header's status row .cloud-status-wrap,
                        the Fusen-gachi, generation check and Regenerate Single Division
                        dialogs, the cloud modal #ksmCloudModal as a portal into <body>;
                        app/js/44-react-shell.js publishes their data; the brand, the
                        spectator banner and the toast stay legacy)
  engine/             Pure tournament-engine modules, strict TypeScript (own tsconfig.json):
                        no DOM, no globals, explicit inputs/outputs. index.ts is bundled
                        into a classic script defining `KSMEngine`, loaded before app.js;
                        app/js functions delegate to it, app/react imports the .ts files.
                        pools.ts: poolSizes; routes.ts: the path URL scheme (M.9), shared
                        by the classic app, the overlay page and the tests; divisions.ts: division renames (#25)
  types/*.d.ts        Tournament data types and globals for `npm run typecheck`
  public/             Icons, SVG assets and manifest, served at the site root unchanged
  service-worker.js   PWA service worker (the build adds the hashed bundle names); serves the
                      offline app for /, /index.html and the path URLs /t/... (not the overlay)
src-worker.js        Cloudflare Worker backend (API + Durable Object); answers /t/<id>/overlay/...
                      with overlay.html (wrangler.jsonc run_worker_first: /api/*, /t/*)
scripts/             Build helpers (app-sources.mjs), verify-split.mjs, reset-cloud-data.mjs, pages-proxy.mjs
tests/               Maintained regression tests (golden/engine, golden/court, golden/live-scores, golden/tv, golden/results, golden/overview, golden/library, golden/pools, golden/setup, golden/registration, golden/registration-teams, golden/shell: approved snapshots)
docs/                Maintained documentation
README.md             Project overview
CHANGELOG.md          Consolidated release history
package.json          Scripts and development dependency metadata
vite.config.js        Front-end build (Vite)
tsconfig.json         Type checking (`npm run typecheck`; also app/react, app/engine)
wrangler.jsonc        Cloudflare deployment configuration (serves dist/)
pages-proxy/          Custom-domain pass-through: a Pages project per site forwarding to its Worker (docs/DEPLOYMENT.md)
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
