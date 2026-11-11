# Repository Structure

## Files kept in source control

```text
app/                 Front-end source (built by Vite into dist/, which is not committed)
  index.html          Markup
  styles/NN-*.css     Stylesheet, concatenated in file-name order
  main.js             The ONE entry file of the app, an ES module (<script type="module">): the imports of
                      app/modules, the load-time calls in their old order (the path-URL rewrite first, the
                      init*() calls, the autosave listeners) and, last, the window exports (what inline
                      handlers, app/react and the tests reach: #136 steps 3c and 4d;
                      tests/window-exports-test.mjs keeps the list complete). rolldown bundles it and the
                      modules into the single /app.js file
  modules/            Real ES modules the entry imports, plain `.js` with `// @ts-check`
                      (#136 step 3d, area by area; a module never imports from the entry):
                        app-state.js: `state` and DIVISION_PRESETS;
                        engine/engine-*.js: the adapters around the KSMEngine global (pools,
                        team matches, single elimination, team bracket, result integrity,
                        standings and tiebreaks, championship, plus the two single-elimination
                        builders that needed the court's syncIndividualSingleElim);
                        court/*.js: the court (match order, scoring and undo history, queue and
                        views, pool editing, scorekeeper screen, support-mode layouts, split-court
                        templates, match timer); html-text.js: esc(), jsArg();
                        registration/*.js: registration rows and teams, validation and Generate,
                        team divisions, grand champion; setup/*.js: division setup and the
                        header, the Danger zone, Overview progress (director-progress.js);
                        results/*.js: result placements and awards, print sheets, Live Scores
                        and TV helpers, the Results screen;
                        sync/*.js: the sync state and the 409 rebase, two tabs, cloud diagnostics,
                        the cloud session and autosave, live sync / saves / tournament files, Undo
                        regenerate (their `let`s are assigned elsewhere only through setNAME(value);
                        their load-time side effects are init*() calls in app/main.js where the files
                        loaded);
                        session/*.js: staff sessions, the role and the Tournament Library, switching
                        tournaments; links/*.js: the tournament short name and cached records, the
                        stream overlay links; auth/auth0-access.js: Auth0 accounts in the legacy app
                        (the account-aware setSessionRole(), cloudHeaders(), ... around the plain
                        ksmAccount*() functions they call);
                        boot.js: the start-up (initBootstrap(), run where 34-bootstrap.js loads);
                        react-bridges/*.js: the classic side of the React islands (the signal stubs, the
                        builders other code calls, the state the islands read; their load-time side
                        effects are init*() functions that initReactBridges() runs in the old order);
                        replaceable.js: replaceable(name, impl), the one way for a function that tests replace after
                        load (KSMTest.app.NAME = ..., the goldens' window wrappers) to stay replaceable: a stable
                        exported function callers use, and a live window.NAME accessor (10 functions: the pool
                        standings and tiebreak ones in engine/, the autosave ones in sync/; #136 step 4d);
                      (00-path-urls.js: path URLs, M.9: an old ?tournament= link becomes its
                      path first, ksmLinkParams()/ksmLinkUrl(); the ksm:state-changed event for
                      React islands is app/modules/react-bridges/state-bridge.js)
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
                        all of it, M.8; publish.ts computes their data when
                        app/modules/react-bridges/court.js and the court writers signal; the builders
                        other classic code calls (ksmBracket(), ksmTeamResults(), the team
                        sheets, ksmDivisionCompleteInput(), ...), the Red side actions
                        and the module-missing notice stay classic there),
                        live-scores/ (the Live Scores screen #public, M.13;
                        publish.ts computes its data when
                        app/modules/react-bridges/live-scores.js signals; the between-matches
                        helpers ksmUpNext() etc. stay classic there until the court
                        file moves),
                        tv/ (the TV display #tvLive, ?view=tv, M.13;
                        publish.ts computes its data when
                        app/js/37-react-tv.js signals; the Final Results
                        reuse shared/ui/'s DivisionCompletePanel),
                        results/ (the Results screen #results: cards, awards editor,
                        bracket modal, M.13; publish.ts computes its data when
                        app/js/38-react-results.js signals; the modal reuses
                        shared/ui/'s Bracket),
                        overview/ (the Overview screen #director, M.13;
                        publish.ts computes its data when
                        app/js/39-react-overview.js signals),
                        library/ (the Tournament Library, the home page #home, M.13;
                        publish.ts computes its data when app/js/40-react-library.js
                        signals; the draft reading, staff tokens and actions stay
                        classic; logo and card mark from shared/ui/branding.ts),
                        pools/ (the Pools view's #poolOutput, Registration -> Pools, and
                        the Edit Pool editor, M.13; publish.ts computes their data when
                        app/js/41-react-pools.js signals; the F12 edit copy stays
                        classic; the preview reuses shared/ui/'s Bracket),
                        setup/ (the Setup screen's divisions table rows #divisionSetupRows
                        and hero name #setupTournamentName, M.13; publish.ts computes
                        their data when app/js/42-react-setup.js signals; the Setup
                        actions and fields stay legacy),
                        registration/ (Registration, M.13. Part 1: the players table
                        #regTable and the status card's contents #tournamentStatusCard;
                        part 2 (RegistrationTeams.tsx, teams-model.ts): the team cards
                        #teamTable, the exhibition table #exhibitionTable and the tab
                        bar; publish.ts computes their data when
                        app/js/43-react-registration.js signals; the actions, the F17/F20
                        binding state and ksmHtmlText() stay classic; the toolbars, filters
                        and the cards' visibility stay legacy),
                        account/ (Auth0 sign-in and the session cache: auth0.tsx, auth-session-cache.ts),
                        shell/ (the shell, M.13's last step: the navigation bar
                        nav.minimal-nav and the header's status row .cloud-status-wrap,
                        the Fusen-gachi, generation check and Regenerate Single Division
                        dialogs, the cloud modal #ksmCloudModal as a portal into <body>;
                        publish.ts computes their data when app/modules/react-bridges/shell.js
                        signals; the state the shell's writers patch and read back
                        stays classic; the brand, the spectator banner and the toast
                        stay legacy)
  engine/             Pure tournament-engine modules, strict TypeScript (own tsconfig.json):
                        no DOM, no globals, explicit inputs/outputs. app/modules import
                        index.ts (`import * as KSMEngine`) and the build bundles it into app.js;
                        app/react imports the .ts files; Node tests import them directly.
                        pools.ts: poolSizes; routes.ts: the path URL scheme (M.9), shared
                        by the classic app, the overlay page and the tests; divisions.ts: division renames (#25);
                        registration.ts: registration helpers moved from app/js (#136);
                        match-helpers.ts, labels.ts, sync-helpers.ts: more pure helpers moved from app/js (#136 step 1b);
                        html-text.ts, bracket-helpers.ts: a third batch (#136 step 1c)
  types/*.d.ts        Tournament data types and globals for `npm run typecheck`
  public/             Icons, SVG assets and manifest, served at the site root unchanged
  service-worker.js   PWA service worker (the build adds the hashed bundle names); serves the
                      offline app for /, /index.html and the path URLs /t/... (not the overlay)
src-worker.js        Cloudflare Worker backend (API + Durable Object); answers /t/<id>/overlay/...
                      with overlay.html (wrangler.jsonc run_worker_first: /api/*, /t/*)
scripts/             Build helpers (app-sources.mjs), reset-cloud-data.mjs, pages-proxy.mjs
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

The engine moved out of the app's code one function group at a time (roadmap 2.0–2.7) into
`app/engine/*.ts`: pure strict-TypeScript ES modules. Since step 4b of #136 `app/modules` import
`app/engine/index.ts` (`import * as KSMEngine from '.../engine/index.ts'`) and `appBundle()` bundles it
into `app.js`; there is no separate engine script. `app/main.js` still puts the
namespace on `window.KSMEngine` for anything outside the bundle. React code imports `../engine/<module>.ts`
directly. The step-by-step recipe is in docs/TESTING.md, "Moving a function into app/engine".
