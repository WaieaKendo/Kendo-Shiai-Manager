# Testing

## One-time setup

```bash
npm install          # wrangler (local Cloudflare runtime, used by the API + end-to-end tests)
npm run test:setup   # .venv with Python Playwright + Chromium (browser tests)
```

Requirements: Node 20+ and Python 3.10+. No Cloudflare account is needed; tests never touch the deployed site.

## Running

| Command | What it runs | Time |
|---|---|---|
| `npm test` | Builds the app (`dist/`), then everything below (same as `npm run check`) | ~80 s (8+ cores) |
| `npm run test:node` | Node tests only, no browser needed (includes the type check) | ~3 s |
| `npm run test:browser` | Python/Playwright browser tests, including end-to-end | ~60 s |
| `npm run test:api` | Backend API contract, in-process | <1 s |
| `npm run test:e2e` | Both end-to-end tests (two-court sync, full tournament) against local `wrangler dev` | ~30 s |
| `npm run test:e2e:watch` | The full-tournament e2e in visible, slowed-down browser windows (see Watch mode) | ~4 min |
| `npm run test:golden` | Engine + screen snapshot comparison (76 tournaments) and the court screen snapshots (14 scenarios) | ~60 s |
| `npm run test:golden:update` | Approve intended engine/display/court screen changes by rewriting the snapshots (both golden tests) | ~100 s |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) of the classic app (`tsconfig.json`) and of `app/react/` (strict, `app/react/tsconfig.json`); also run by `typecheck-test.mjs` | ~2 s |
| `npm run verify:split` | Proves `app/` is the pre-split `public/index.html` (def5010), moved: markup (apart from the test IDs listed in `MARKUP_TEST_IDS`), CSS and JS byte-identical, JS apart from added type comments, marked post-split code, functions moved to the engine and the listed removed legacy court renderer (`REMOVED_COURT_RENDERER`) | ~1 s |
| `npm run testlab:smoke` / `testlab` / `testlab:exhaustive` | Tournament-engine simulation matrix (writes reports to `testlab-reports/`, git-ignored) | 5 s – minutes |

`run-all.mjs` builds `dist/` once before any test (a build failure fails the run). `node tests/run-all.mjs <text>` runs only test files whose name contains `<text>` (e.g. `tiebreak`, `v3171`), and `-v` prints every test's output. Browser tests run 6 at a time on 8+ cores (4 otherwise; `KSM_TEST_JOBS=n` overrides), slowest first.

Run `npm test` before every commit or release. A failing test means either a regression or an intended behaviour change; for the latter, update the test in the same commit and explain why.

## How tests find the app

The app is written in `app/` and built by Vite into `dist/` (`scripts/app-sources.mjs` describes the layout): `app/index.html` holds the markup, `app/styles/*.css` and `app/js/*.js` are concatenated in file-name order into one stylesheet and ONE classic script, exactly as the single-file `public/index.html` ran them before.

- **Browser tests load the built app.** `load_app()` (`tests/ksm_browser.py`) serves `dist/` on the fake `http://ksm.test` origin; `local_worker()` (`tests/ksm_server.py`) runs `wrangler dev`, which serves `dist/` (`wrangler.jsonc`). Both rebuild first when `dist/` is missing or older than `app/`, so a single test can be run on its own; `run-all.mjs` builds once up front. `app_html()` (`tests/ksm_source.py`) returns the built `index.html` for `load_app(page, html)`.
- **Source checks read the app as one text.** `html` in `tests/lib/ksm-source.mjs` and `app_source()` in `tests/ksm_source.py` return `app/index.html` with the stylesheet and script inlined in order: the same code, in the same order, as the old single file (only the `<style>` blocks are merged into one). So grep checks, `extractFunction` (last declaration wins) and `withDependencies` work unchanged. `sw` is `app/service-worker.js`.
- **`build-output-test.mjs`** checks that the build ships `app/` unchanged: markup identical apart from the hashed bundle URLs, the engine script tag added before `app.js` and the one module script of the React court screen (`app/react/court/main.tsx`, bundled without the classic app), the bundles equal to the concatenated sources (no transform or minify), the service worker's `APP_SHELL` pointing at the bundles and the court module's files, and every `app/public/` file at its old URL. Extra pages (`app/*.html`, React entries) must be built with their own module scripts and never load the classic bundle, and the service worker must leave their navigations to the network.
- **React code (`app/react/`)** is strict TypeScript in ES modules, bundled by Vite into the extra pages and, for the court screen islands (`app/react/court/`), into one module script of `index.html`. A React island must render the same elements, classes and test IDs as the legacy markup it replaces. The court screen islands were parity-tested against the legacy renderer island by island (M.8 steps 1–4); since the legacy court renderer was removed (step 5), `golden-court-screen-test.py` compares them with snapshots recorded from it (`tests/golden/court/`). Its pure logic has Node unit tests in `tests/react/*.test.mjs` (`node:test`, importing the `.ts` files with `--experimental-strip-types`), run by `react-unit-test.mjs`.
- **Engine code (`app/engine/`)** is pure strict TypeScript, shipped as the classic `KSMEngine` script before `app.js` (see docs/REPOSITORY_STRUCTURE.md). It is not part of `html`/`app_source()`; `engine` in `tests/lib/ksm-source.mjs` is the built script. `withDependencies` adds it whenever the code references `KSMEngine`; tests that assemble vm code by hand from `extractFunction` prepend `engine`. Unit tests live in `tests/engine/*.test.mjs` (also run by `react-unit-test.mjs`).

### Moving a function into app/engine (roadmap 2.1–2.7)

1. Write it as a typed pure function in `app/engine/<area>.ts` (inputs as parameters, no `state`/DOM/globals; return new values) and export it from `app/engine/index.ts`.
2. In `app/js`, keep the LAST declaration of the legacy function (same name and position, so last-declaration-wins and `extractFunction` still work) and replace its body with one marked delegation: `function f(a){\n  /* ksm:post-split-begin engine-bridge */return KSMEngine.f(a);\n  /* ksm:post-split-end */\n}`. Where it read globals, pass them in here (e.g. `KSMEngine.f(a, state.x)`). Earlier redeclarations stay until 2.10.
3. `scripts/verify-split.mjs`: add the name to `MOVED_TO_ENGINE` and raise the `engine-bridge` count.
   For a small inline change instead of a whole function, keep the old code in the marker: `/* ksm:post-split-begin <name> was:<old code> */new/* ksm:post-split-end */` (verify-split puts `<old code>` back; used by `engine-settings` for `tournamentSettings().teamFormat`).
4. Add `tests/engine/<area>.test.mjs` (table/edge cases plus a parity check through the legacy global, as `pools.test.mjs` does); fix any hand-assembled vm test that extracts the function (prepend `engine`). A legacy-equivalence test that reads pre-move code must use `gitShow()` from `tests/lib/git-show.mjs`, which prints SKIP when the commit is missing (shallow clone) so the test is skipped, not failed.
5. `npm run typecheck`, `npm run verify:split`, `npm test`; `tests/golden/engine/*.json` must stay byte-identical (never run `test:golden:update` in these steps).

## What is covered

**Golden snapshots (`golden-engine-test.py`): the main "did anything change?" check.** It sets up 76 tournaments:
- round robin with 3–16 players;
- single elimination with 2–16 players;
- one court and split courts;
- seeded draws, no-shows and several divisions at once;
- 3-person, 5-person and kachinuki team events, in bracket and round-robin formats.

It plays every match to the end through the same `point()` / `nextMatch()` calls the scorekeeper buttons use. Results come from a fixed rule, so some pool matches end in hikiwake and force tiebreaks.

For each tournament it records:
- the pools;
- the generated match list;
- the order matches came up on each court;
- every score and winner;
- pool/team standings and medal placements;
- any alert or page error;
- for six of them, the visible text of the Results, Live Scores, Overview and Court screens.

These records live in `tests/golden/engine/*.json` and are compared on every run.

**Court screen snapshots (`golden-court-screen-test.py`)** pin what the court (scorekeeper) screen draws, now that only the React islands draw it (roadmap M.8). The approved files in `tests/golden/court/*.json` were recorded from the legacy court renderer just before it was removed, so they hold its exact markup, quirks included (docs/ROADMAP.md, "Court quirks kept"), apart from the intended changes approved since (F2: Undo/Redo stay on the division-complete screen). Fourteen scenarios on one offline copy: every court action (points, hansoku, undo/redo, Fusen-gachi, Next Match to the end), a team representative playoff, three divisions on Court A / Court B / split with the division select, a spectator's court screen, and ten formats played through on both courts to their division-complete screens and spectator views. After every step it compares the header and match display trees, the score buttons and action row (every attribute, visibility), the Fusen-gachi dialog, the context, queue and division-complete panels (every attribute, visibility, innerText, and each element's page box), the scoreboard card's classes and children, the layout classes around the panels, the court read-out and the dialogs shown; it requires React to own the islands' elements and a set of panel variants to be covered, and checks the "Court screen could not load" notice on a copy without the court module. Element boxes depend on the platform's fonts, so they are stored per platform (`sys.platform`, recorded on `darwin`) and compared only where recorded; elsewhere (e.g. Linux CI) the rest is compared and the test prints a note. Each step is stored as its difference from the step before, one step per line. Approve an intended court screen change with `KSM_UPDATE_GOLDEN=1 .venv/bin/python tests/golden-court-screen-test.py [scenario]` and review the diff; an update keeps other platforms' boxes only when the rest is unchanged.

When the test fails, it prints what changed, e.g.:

```
FAIL rr-04-courtA: engine output changed
    /final/Open/matches[5]/winner: "P03" -> "P01"
    /final/Open/standings/A[0]/name: "P03" -> "P02"
```

- **Not intended:** you've found a regression.
- **Intended** (a deliberate rule or display change): run `npm run test:golden:update`, review the JSON diff in git, and commit it with the code change so the reviewer sees exactly what changed.
- **Just one scenario:** `.venv/bin/python tests/golden-engine-test.py rr-12`.

**Backend API contract (`worker-api-test.mjs`)** runs the real `src-worker.js` against an in-memory Cloudflare runtime and checks tournament creation, staff password auth, stale-revision rejection (409), simultaneous saves (exactly one wins), integrity validation (422), WebSocket snapshot/presence/delete broadcasts, the tournament library, deletion and admin reset.

The same contract can run against any live server:

```bash
npm run dev                                                     # in one terminal
KSM_BASE_URL=http://localhost:8787 node tests/worker-api-test.mjs  # in another
```

Use this mode to prove that a replacement backend (e.g. an AWS port) behaves identically.

**Two-court end-to-end sync (`e2e-two-court-sync-test.py`)** starts a throwaway `wrangler dev` and drives the real app in four browser sessions (director, Court A, Court B, spectator). Both courts score every match at the same time, so their saves conflict and go through the client rebase/merge path. The test then requires that no point, completion or winner from either court was lost, and that every device converged on the server copy. This is the baseline for any change to the cloud sync code.

**Full tournament end-to-end (`e2e-full-tournament-test.py`)** runs a whole tournament day through visible controls only (test IDs, via `tests/ksm_app.py`), against a throwaway `wrangler dev`, with five devices:
- the director creates the tournament in the cloud, sets up an individual round robin (Court A, 8 registered, one no-show), an individual single elimination (Court B, 6) and a 3-person team event (both courts, 4 teams) in Setup, registers everyone in Registration and generates;
- Court A and Court B scorekeepers join from the tournament link, log in, open their court from the Courts menu and score every match with the point and Next Match buttons, interleaved; when their division ends they pick the next one in the court's division selector (no auto-advance yet). A scripted pool draw forces a tiebreak;
- a spectator (Live Scores) and a Court A TV (the link from the TV menu) are checked against the court screens at checkpoints; the spectator goes offline, the TV and the spectator are reloaded mid-tournament, and both must catch up without a prompt.

Results are scripted (the stronger entrant wins), so expected placements follow from what was played. At the end every division must be complete, Results must show those placements, every device must equal the server record (`GET /api/tournaments/{id}`), and no page error or unexpected dialog may occur. ~25 s headless.

**Engine and UI behaviour.** The Python tests and TestLab load the built app (`dist/`) in Chromium, served on a fake `http://ksm.test` origin so `localStorage` works (see `tests/ksm_browser.py`). By default they enter a local staff session; pass `session=None` to `load_app()` to test the real boot state (Tournament Library, spectator).

**Per-release regression tests (`v3*.mjs`)** protect specific fixes. Some execute extracted functions in a Node `vm`; others check source text.

**Guards:**
- `version-consistency-test.mjs`: `package.json`, the HTML badge and title, the service worker cache name, `/api/health` and `CHANGELOG.md` agree. Bump the version in all of them together.
- `function-override-baseline-test.mjs`: the app redeclares 27 functions (35 before the legacy court renderer was removed in M.8 step 5), and the browser runs the last declaration (the split keeps this: the JS files still run as one classic script). The test fails if a new redeclaration appears; lower the baseline when you remove one (it notes entries that are lower or gone).
- `typecheck-test.mjs`: `npm run typecheck` passes. `tsconfig.json` has `checkJs` off; a file opts in with `// @ts-check` on its first line (today the engine files 04–07 and 12–15). Types live in `app/types/` (`tournament.d.ts`: payload, state, Match, pools, bracket nodes, court history, cloud records).
- `build-output-test.mjs`: see "How tests find the app".
- `react-unit-test.mjs`: the unit tests in `tests/react/` and `tests/engine/` (`poolSizes` for 0–40 entrants and its legacy delegation; live-record logic behind `useTournamentRecord`, the `ksm:state-changed` bridge in `app/js/00-react-bridge.js`, the overlay's URL options, band-mode layout and match selection, the court scoreboard's view model: names, dojos, points, hansoku and the representative picker; the court header's view model; the court score buttons and Undo/Redo view model and default action icons; the court queue and context panels' view models: aligned rows and point slots, queue row classes and group titles, pool cards, team standings, kachinuki lineups, every panel kind; the court division-complete panel's view model).
- `npm run verify:split` allows `data-testid` attributes on the static markup only when listed in `MARKUP_TEST_IDS` (old start tag + test ID), and deliberate post-split additions only inside `/* ksm:post-split-begin <name> */ ... /* ksm:post-split-end */` markers (in `app/js/` and, counted in `KNOWN_POST_SPLIT_CSS_EDITS`, in `app/styles/`), with the count per name pinned in `KNOWN_POST_SPLIT_EDITS` (today `react-bridge`: the bridge file plus the dispatch in `performCourtAction()` and `renderAll()`; `stream-overlay`: `app/js/33-stream-overlay-links.js`, the TV-menu overlay links).

## Test helper, test IDs and test API

Tests must not depend on how a screen is implemented: the front end is moving to Vite/TypeScript and then React, screen by screen.

- **Test IDs.** Controls and read-outs that tests use carry a `data-testid` attribute, in kebab-case: `area-thing[-detail]`, with the side spelled out and the point letter kept (`point-white-M`, `hansoku-red`, `court-white-name`), courts as a suffix (`nav-court-a`, `live-court-A`). Singletons (navigation, court screen controls, Setup/Registration controls) appear exactly once; generated rows repeat per row (`reg-row` > `reg-name`, `team-card` > `team-member-senpo`, `setup-division-row`, `pool` > `pool-player`, `result-card` > `placement-row`). A rewritten screen must keep them; `test-ids-test.py` pins the contract. Add an ID when a test needs a control; never select by `onclick` text, CSS class or layout.
- **`tests/ksm_app.py` (`KsmApp`)** is the single place Python tests talk to the app. Devices: `KsmApp.open_device(browser, base, name, problems, path)` (own browser context, answers the app's prompts, records page errors and unexpected dialogs), `KsmApp.local(page, problems=...)` (offline, via `load_app`; with a `problems` list it handles dialogs and page errors like `open_device`). `reload()` power-cycles a device; `open_device(..., clock=True, before_load=fn)` installs Playwright's clock / routes the page before it opens; `put_record()` saves a payload as another staff device; `tv_upcoming()` reads the TV Upcoming cards. Actions, all through test IDs: `create_tournament`, `staff_login/logout`, `nav(item)`, `open_court`, `tv_link`, `setup_divisions`, `setup_team_event`, `register`, `register_team`, `generate`, `pools`, `current_match`/`court_screen`, `score_point`, `hansoku`, `next_match`, `undo`, `redo`, `fusen_gachi`, `division_options`, `switch_division`, `placements`, `live_court`, `tv_screen`, `wait_for`; files through Playwright's download and file-chooser APIs: `download(testid, menu)`, `download_tournament_file`, `load_tournament_file`, `load_recovery_file`. `expect_dialog(prefix)` answers a documented dialog and records it (for expected-failure checks); `wait_for_dialogs(n)` waits for them (polling through the page, so Playwright delivers the dialog events).
- **`tests/lib/ksm-test-api.js` (`window.KSMTest`)** is the only code that touches the app's globals. `KsmApp` injects it into every page and uses it, marked "(test API)", only where the app has no UI: sync status (`wait_idle`, `wait_revision`, `revision`, `outbox`, `has_autosave`), injected live records (`receive`, `client_id`), bulk setup (`configure`), engine snapshots (`structure`, `final_state`, `standings`), `save_now`, `show_screen`, `render_tv`, and the golden test's `prepareCourt`/`play`. When a screen or the engine moves, update these two files, not the tests.

## Watch mode

`KSM_HEADED=1` makes `launch_chromium()` open visible browser windows and `KSM_SLOWMO=<ms>` slows every action (250 ms by default when headed); the default stays headless. `npm run test:e2e:watch` runs the full-tournament e2e this way (300 ms; override with `KSM_SLOWMO=100 npm run test:e2e:watch`), so a person can watch the director, both courts, the spectator and the TV run a tournament. Works for any Python browser test: `KSM_HEADED=1 .venv/bin/python tests/test-ids-test.py`.

## Continuous integration

`.github/workflows/test.yml` runs `npm test` on every push and pull request on GitHub (Ubuntu, Node 22, Python 3.12, Playwright Chromium).

## Writing tests

- **Prefer behaviour over source text.** `tests/lib/ksm-source.mjs` provides:
  - `extractFunction(html, name)`, which returns the **last** declaration (the one the browser runs);
  - `withDependencies(html, code, { exclude })`, which pulls in every app function or constant that code depends on, so vm tests don't break when helpers are added. Anything you stub on the vm context goes in `exclude`.
- Don't assert version strings in feature tests; the version-consistency test covers that.
- For browser tests use `launch_chromium(p)` and `load_app(page)` from `tests/ksm_browser.py`, not `page.set_content()` (which runs on `about:blank`, where storage access fails).
- For tests that need a real backend, use `local_worker()` from `tests/ksm_server.py`.
- New UI tests go through `KsmApp` and test IDs; if the app has no UI for what you need, add it to `KSMTest` and a documented `KsmApp` method.

Generated reports, screenshots, ZIP archives and temporary build folders should not be committed.

## Test coverage map

What every test protects, how it works, and what happens to it as the front end moves to Vite/TypeScript modules and screens move to React. Step one (M.5, `refactor/vite-typescript`) is done: `index.html` is split into `app/` files that still run as one classic script, and every test below runs unchanged against the built app and the source read as one text (see "How tests find the app").

**Ground rule: no test is deleted without a replacement that checks the same thing.** "Retire" below is only allowed because the named test already checks the same behaviour; everything marked "convert" needs its replacement first.

How it works:
- **behaviour**: loads the real app in Chromium and drives it (through `KsmApp`/test IDs, or by calling engine globals);
- **golden**: snapshot comparison; **e2e**: several devices against local `wrangler dev`;
- **vm-extract**: pulls functions out of the app source (`tests/lib/ksm-source.mjs`) and runs them in a Node `vm`;
- **source grep**: asserts that strings/regexes exist in the app source (or `src-worker.js`, `service-worker.js`);
- **layout**: measures rendered boxes at phone/desktop sizes; **API contract**: calls the Worker; **guard**: repository consistency rule.

Fate in the migration:
- **keep**: unaffected;
- **helper/test IDs**: still valid, but switch its selectors / globals to `KsmApp`, test IDs or `KSMTest`;
- **port to engine module**: import the extracted TS engine (`refactor/engine-module`) instead of calling browser globals or `extractFunction`;
- **convert**: replace with a behaviour (or layout) test before the code it checks moves into modules or React, because a grep stops meaning anything then (the M.5 split kept the code as one text, so the greps still hold for now);
- **retire — covered by X**: X already checks it.

Greps of `src-worker.js`, `wrangler.jsonc` and `service-worker.js` are not affected by the front-end split and are marked keep unless worker-api-test covers them.

| Test file | Protects | How | Migration fate |
|---|---|---|---|
| `build-output-test.mjs` | The Vite build ships `app/` unchanged: markup, CSS, one classic script, service worker bundle URLs, static files at their URLs | guard (reads `dist/`) | keep |
| `bracket-lifecycle-tiebreak-simulation-test.py` | Single elimination 4–32 (one court and split) and pool brackets play to the end through tiebreaks, without errors | behaviour (engine globals) | port to engine module |
| `cloud-foundation-test.mjs` | Cloud save entry points exist; Worker is a Durable Object that serves assets and has no engine code | source grep | client: retire — covered by e2e-two-court / e2e-full (saves reach the server); worker/wrangler: keep |
| `cloud-release-test.mjs` | Worker presence, two roles, hashed password, delete; client offline outbox, conflict recovery file, online/offline listeners, diagnostics, device identity | source grep | worker: retire — covered by worker-api-test; client: convert (list below) |
| `conflict-merge-test.mjs` | The 409 rebase merges non-court edits three-way (F4): Setup fields, registration, division settings, awards; same-field conflicts keep the server value and show a notice; repeated conflicts; no base = server copy; pins F10 (structural edits still lost) | vm-extract | port to the sync module |
| `court-actions-test.py` | Undo/Redo, Hansoku, Fusen-gachi, Next Match as one action, per-court history, limit 100, patch storage; Undo stays after the last match (F2, fixed) | e2e (helper/test IDs) | keep |
| `undo-division-complete-test.py` | F2: on the division-complete screen Undo/Redo stay (Fusen-gachi/Next Match hidden); Undo reopens the last match of a pool and of an elimination final with its score and withdraws the placements, Redo completes it again, a wrong final result can be corrected | behaviour (helper/test IDs, offline) | keep |
| `court-screen-details-test.py` | "Winner of …" placeholders, Pools tab division, Edit Pool, print slot letters, mid-tournament pool/team court context | behaviour (helper/test IDs, offline) | keep |
| `court-side-setting-test.py` | Per-court Red/White side mirrors that court's screen and print lines only | layout | helper/test IDs |
| `director-mobile-reliability-test.py` | Overview totals for direct elimination and kachinuki (variable total); mobile Setup date field width | behaviour (engine globals) + layout | totals: port to engine module; layout: helper/test IDs |
| `director-overview-test.py` | Overview progress count and court queue order on a phone, no sideways scroll | behaviour + layout | helper/test IDs |
| `director-progress-accuracy-test.py` | Overview denominators: pools + championship, direct-elimination nodes, 3/5-person teams, kachinuki | behaviour (engine globals) | port to engine module |
| `e2e-full-tournament-test.py` | A whole tournament through the UI on five devices: placements, sync convergence, follower catch-up; TV and spectator reload without a prompt (F1) | e2e (helper/test IDs) | keep |
| `e2e-two-court-sync-test.py` | Two courts scoring at once lose no point or result through 409 rebase; every device converges | e2e (helper/test IDs) | keep |
| `final-medal-team-context-polish-test.py` | Medal label styling; Wins/Points headers in the live team court context | source grep | convert |
| `final-mobile-navigation-polish-test.py` | Phone nav: safe area, icon/label rows, brand width | source grep (CSS) | convert (layout) |
| `final-tournament-ui-polish-test.py` | Division-complete panel: no heading, medal colours, boxless rows; team court context one column | source grep | "no heading": retire — covered by golden screens (`score`); rest convert |
| `function-override-baseline-test.mjs` | The app gains no new duplicate function declarations (27 left after M.8 step 5) | guard | keep: the M.5 split kept one classic script, so redeclarations still override; retire once they are removed (2.10) or the code is ES modules/TypeScript (redeclaration is an error) |
| `golden-engine-test.py` | Engine output and four screens for 76 tournaments are unchanged | golden (helper/test API) | keep; after `refactor/engine-module`, point `KSMTest` at the module (same golden files, must stay byte-identical) |
| `golden-invariants-test.mjs` | The approved golden files are themselves right (entrants placed once, winners valid, placements consistent) | golden files only | keep |
| `header-navigation-polish-test.py` | Header styling: icon baseline, brand wrapping, balanced court title | source grep (CSS) | convert (layout) |
| `inline-handler-injection-test.py` | Hostile names cannot run code through inline handlers | behaviour + source regex | behaviour: helper/test IDs; the `on…="'${esc(` regex retires with inline handlers (React) |
| `interface-polish-bundle-test.mjs` | Validation modal and results title styling, gold Next Match, role-based nav visibility, screens a spectator may open | source grep | convert |
| `layout-screens-test.py` | Phone portrait/landscape header, court, Live Scores, Results; validation modal; medal colours; gold Next Match | layout (helper/test IDs) | keep |
| `layout-setup-standardization-test.py` | All main views share left edge/width at 390 and 1440 px; Setup fits a phone | layout | helper/test IDs |
| `match-object-origin-invariant-test.py` | All championship Match Objects exist at generation; only approved dynamic types (tiebreaks, representatives) can be appended | behaviour (engine globals) + source slice | port to engine module |
| `mobile-court-density-context-test.py` | Phone court header centring, no reserved heights; live team/kachinuki context shows only the sheet (the React context, since M.8 step 5) | source grep | convert (the sheet-only rule is also pinned by `golden-court-screen-test.py`) |
| `mobile-court-portrait-test.py` | Court screen at 390 px: everything on screen, four action buttons, points under names | layout | helper/test IDs |
| `mobile-court-responsive-refinement-test.py` | Phone court division selector and score block sizes | layout | helper/test IDs |
| `mobile-dropdown-test.py` | Nav dropdowns open/close on tap and stay inside the viewport on a phone | layout + behaviour | helper/test IDs |
| `mobile-landscape-final-refinement-test.py` | Landscape phone layout of the court screen and Live Scores | source grep (CSS) | convert (layout) |
| `mobile-landscape-results-live-test.py` | Landscape phone layout of Results and Live Scores | source grep (CSS) | convert (layout) |
| `realtime-sync-test.mjs` | Worker WebSockets, broadcasts, 409 conflicts, no engine; client reconnect, stale revisions ignored, echo suppression, recovery kept | source grep | worker: retire — covered by worker-api-test (keep "no engine in worker"); client reconnect: retire — covered by e2e-full (spectator offline/online); rest convert |
| `reload-restore-test.py` | Link devices (TV, spectator, scorekeeper) reload without the restore prompt (F1); a scorekeeper's queued or not-yet-saved work survives the reload and reaches the cloud after staff login, next to another court's changes, also when the scorekeeper scores before the live connection is back or it opens while another save is in flight (F6, slow network simulated); a plain start still offers the autosave | e2e (helper/test IDs) | keep |
| `responsive-header-test.py` | Header tournament name clamps/wraps on phones | source grep (CSS) | convert (layout) |
| `role-aware-sync-test.mjs` | Worker hashed password, write auth, credentials stripped; client role links, spectator read-only, role nav | source grep | worker: retire — covered by worker-api-test; client: convert |
| `roles-access-test.py` | Home library, spectator/TV navigation and screens, no cloud writes from read-only devices, representative, Tournament Access, logout | e2e (helper/test IDs) | keep |
| `seed-locked-tiebreak-test.py` | A second tiebreak series cannot displace a seed locked by the first | behaviour (engine globals) | port to engine module |
| `shared-views-tv-display-test.mjs` | Overview naming, spectator screens, spectator court view hides controls, dual-court Live Scores, per-court read-only TV | source grep | dual Live Scores, per-court TV link, TV read-only link: retire — covered by e2e-full; rest convert |
| `specific-placeholder-medalist-test.py` | Queue and context show specific placeholders ("Winner of …") instead of TBD (the React queue's data, since M.8 step 5); medalist styling | source grep | convert |
| `spectator-experience-test.py` | Live Scores/court context details: phone name split, team lineup with current bout, Next Match, pools in progress first, ✓ on completed pools, alphabetical pools (court context: the React code, since M.8 step 5) | source grep | final-state text: retire — covered by golden screens; mid-tournament ordering and CSS: convert |
| `split-court-stabilization-test.py` | Split-court tiebreak goes to its pool's court, needs a winner, is not duplicated; split elimination queue filtered per court; championship placeholder queue groups per court (`ksmChampionshipQueueGroups()`, since M.8 step 5) | behaviour (engine globals + DOM) | engine: port to engine module; queue: helper/test IDs |
| `split-court-template-consolidation-test.py` | Split elimination: every template node instantiated, one match per node, readiness gate, court filter, medalist panels (court queue/context: the React code, since M.8 step 5) | source grep | retire — covered by golden-engine (`se-*-split`: structure, per-court order, court/Live Scores end screens), except "single-column split context" (convert, layout) |
| `sync-remote-updates-test.py` | Stale/duplicate/own-echo updates, held updates while editing, load-time repair, legacy reset; Setup edits racing another save are merged (F4, fixed): rename survives, unrelated fields both survive, same field keeps the server value with a notice | e2e (helper/test API for injected records) | keep |
| `sync-saving-test.py` | Save debounce, status wording, offline queue, Save Now, 10-minute autosave, diagnostics + retry, recovery file, court after reload (plain link and `&court=B`; `&court=A` overrides a stored B; TV keeps its court; F3 fixed) | e2e (helper/test IDs, Playwright clock) | keep |
| `template-consistency-seed-resolution-test.mjs` | Frozen championship mapping after a no-show; tie for 1st resolves seeds 1 and 2; no-show removal keeps survivors' order | vm-extract | port to engine module |
| `test-ids-test.py` | The `data-testid` contract (incl. the Save/Load, Export, Registration, exhibition row and Regenerate dialog IDs added for M.12) | behaviour (helper) | keep (the contract rewritten screens must meet) |
| `typecheck-test.mjs` | `npm run typecheck` passes (files marked `// @ts-check`, and all of `app/react/`) | guard | keep |
| `react-unit-test.mjs` | Pure logic in `app/react/` and `app/engine/`, and the legacy state-change bridge (`tests/react/*.test.mjs`, `tests/engine/*.test.mjs`) | unit (node:test) | keep |
| `overlay-test.py` | Stream overlay `/overlay` on local `wrangler dev`: idle before generation, same current match and "Next" as the Court A TV, follows a point/hansoku/Next Match within seconds, team match on `?court=B&red=left`, TV-menu copy link, transparent page, no PUT/POST/DELETE, band mode at 733×1303 on a landscape device (and `?y=`); the court page fires `ksm:state-changed` | e2e (helper/test IDs) | keep |
| `overlay-match-parity-test.py` | The overlay's pure match selection (`app/react/overlay/court-match.ts`) equals the legacy TV view model (current match, names, pool/round line, points, first upcoming) in every state of 18 golden tournaments played to the end, both courts | behaviour (offline app + Node) | keep until the TV itself uses the shared function |
| `file-import-export-test.py` | Download / Load Tournament File (`.ksm`) round trip and the 0.5 guard: file carries tournament ID and revision; same tournament asks (name, saved date, revision, ID), Cancel keeps it, Replace restores the identical state and cloud copy; another tournament's file (or an older file without an ID) is loaded as a new cloud tournament and both existing tournaments stay unchanged; invalid/recovery files refused, nothing changed. Load Recovery File refusals (not a recovery file, cancelled password); pins F7 | e2e (helper/test IDs, Playwright download/file chooser) | keep |
| `registration-screen-test.py` | Setup + Registration through the UI: Export CSV content (quotes, commas), Clear Registration confirm, exhibitions (tab, add rows, names, status, remove, generated matches), Regenerate Single Division dialog (Ready / Matches Started / Not Generated, confirm, other divisions unchanged), Export Tournament Brackets / Results & Awards / Preview Full Packet content, placeholder buttons still only show their message; pins F8 (Clear Teams/Exhibitions without confirm) and F9 (printed results of a pool-only round robin) | behaviour (helper/test IDs, offline) | keep |
| `golden-court-screen-test.py` | The court screen (React islands, `app/react/court/`) is unchanged: 14 scenarios (every court action, team playoff, two courts + split division with the division select, spectator, ten formats played through to division complete on both courts) compared after every step with snapshots recorded from the legacy court renderer before it was removed (`tests/golden/court/`): header, match display, score buttons, action row, Fusen-gachi dialog, context/queue/division-complete panels with every attribute, visibility, innerText and element boxes (per platform), card and layout classes, court read-out, dialogs; React owns the elements; covered panel variants; the missing-module notice. Replaces `court-scoreboard-parity-test.py` (M.8 steps 1–4, deleted with the legacy renderer in step 5) | golden (helper/test IDs) | keep |
| `tournament-day-experience-test.mjs` | Save status, Save Now, save on completed match, manual Next Match, 10-minute autosave, recovery files, access links, diagnostics | source grep | save on completion and manual Next Match: retire — covered by e2e; rest convert |
| `tournament-day-polish-test.mjs` | Save-status wording/refresh, save toasts, access modal hides keys, copy closes modal, QR Back | source grep | convert |
| `tournament-management-engine-test.py` | Split validation minimum, split court assignment, championship unlock per source pools, split totals | behaviour (engine globals) | port to engine module |
| `tournament-management-sweep-test.py` | Split courts for elimination 4–32 and pools 6–32 | behaviour (engine globals) | port to engine module |
| `tv-canvas-isolation-test.mjs` | TV is a fixed 1920×1080 canvas with fixed zones | source grep (CSS) | convert (TV layout) |
| `tv-display-refinement-test.mjs` | TV court heading, division, point letters, name auto-fit, team sequence, one court per link | source grep (mostly the superseded first TV renderer) | one court per link: retire — covered by e2e-full; rest convert against the tv3 renderer |
| `tv-display-test.py` | tv3 TV: individual/team/kachinuki, upcoming, self-healing refreshes, fixed 1920×1080 canvas zones | e2e (helper/test IDs, routed socket) | keep |
| `tv-fullscreen-upcoming-test.mjs` | TV court locked from the URL; fixed canvas; two Upcoming Matches; no White/Red labels | source grep | court lock: retire — covered by e2e-full; rest convert |
| `tv-live-refinement-test.mjs` | TV menu opens a per-court link; TV team names, wins/points, next match; Live Scores team sheet | source grep | TV link and Live Scores team sheet: retire — covered by e2e-full; rest convert |
| `tv-stabilization-navigation-test.mjs` | TV canvas, court lock, TV menu hidden for spectators, Search removed, Overview label | source grep | court lock: retire — covered by e2e-full; rest convert |
| `v3159-fixed-canvas-history-test.mjs` | TV canvas; per-court undo history (limit 100); Redo; Next Match is one undoable action; TV placeholders | source grep | convert |
| `v31510-tv-layout-undo-stabilization-test.mjs` | TV point positions and team layout, later team nodes in TV upcoming, per-court undo/redo stacks | source grep | convert |
| `v31511-tv-context-stabilization-test.mjs` | TV kachinuki: current bout above three-fighter lineups with status | source grep (superseded `tvKachinukiHtml`) | convert against tv3 |
| `v31514-tv-zone-rebalance-test.mjs` | tv3 grid zones, two upcoming cards, kachinuki three rows | source grep | "tv3 renderer emitted": retire — covered by e2e-full (tv3 test IDs); rest convert |
| `v31515-ui-permissions-lock-test.mjs` | Undo/Redo labels static; team representative only changeable by staff on the match's court | source grep | convert |
| `v31516-final-tv-polish-test.mjs` | TV name and footer sizes | source grep (CSS) | convert (TV layout) |
| `v3161-home-tournament-library-test.mjs` | Home library, new tournament, open as spectator, links bypass home, return paths, staff login/logout, Save Now, recovery | source grep | new tournament from home, boot to home, link bypass, staff login: retire — covered by e2e; rest convert |
| `v3162-cloud-first-library-branding-test.mjs` | Cloud library + discover endpoints, tournament created in cloud at once, library card naming, logo removed, pool selection fix | source grep | worker: retire — covered by worker-api-test; created in cloud: retire — covered by e2e; rest convert |
| `v3162-pool-division-selection-test.mjs` | Pools tab division selection is independent of the court's division | source grep | convert |
| `v3163-stability-release-test.mjs` | Registration icon asset, Setup phone alignment, representative selection roles, debounced saves, pending save queue, TV route | source grep | TV route and save queue: retire — covered by e2e; icon: keep (asset); rest convert |
| `v316-auth-tournament-library-test.mjs` | Staff Login/Logout, New Tournament, library cards, Save Now, recovery download, access modal; worker auth | source grep | login and new tournament: retire — covered by e2e; worker: retire — covered by worker-api-test; rest convert |
| `v3170-deterministic-save-queue-test.mjs` | Saves requested during a save are coalesced and every caller gets the real result | source grep | retire — covered by e2e-two-court and e2e-full (rapid scoring without waiting, nothing lost, devices converge) |
| `v3171-cloud-diagnostics-test.mjs` | Cloud Diagnostics records stage, HTTP status, error body; manual retry of a queued save | source grep | convert |
| `v31710-single-column-pool-context-test.mjs` | Court-context pool cards in one column (CSS; the React context's pool grid since M.8 step 5) | source grep (CSS) | convert (layout) |
| `v31711-pinned-court-revision-safe-sync-test.mjs` | Court pinned per device and restored; pending-change guard; remote deferral; conflict rebase | source grep | rebase/deferral: retire — covered by e2e-two-court; pinned court restored after reload: convert |
| `v31712-concurrent-court-rebase-test.mjs` | Conflict rebase replays local court actions exactly once, bounded retries | vm-extract + source grep | vm: port to engine/sync module; grep: retire — covered by e2e-two-court |
| `v31713-pool-match-order-diagnostics-cleanup-test.mjs` | Canonical 3/4-player pool orders, reused by tiebreaks; TV diagnostics hidden | vm-extract + source grep | vm: port; template greps: retire — covered by golden-engine |
| `v31714-deterministic-pool-player-slots-test.mjs` | Pool slot letters stored and shown (pools, print); edited pools re-slotted | vm-extract + source grep | vm: port; print/edit UI greps: convert |
| `v31715-state-integrity-rebase-test.mjs` | No sparse arrays from stale patches; identity-based rebase; malformed snapshots self-heal on load; Worker 422 | vm-extract + source grep | vm: port; Worker 422: retire — covered by worker-api-test; load wiring: convert |
| `v31716-elimination-result-integrity-test.mjs` | Completion carries score + winner; identity survives reordering; no Hikiwake winner propagated; Worker rejects bad completions | vm-extract + source grep | vm: port; atomic `completedResult`: retire — covered by e2e (winners checked on server); load-repair wiring: convert |
| `v31717-qf-activation-division-stability-test.mjs` | A court keeps its own division through rebases/remote snapshots; stale pointer repair | vm-extract + source grep | vm: port; greps: retire — covered by e2e-full (courts on different divisions under concurrent saves) |
| `v31718-pool-edit-championship-preservation-test.mjs` | Edit Pool keeps championship Match Objects; repairs tournaments damaged by ≤3.17.17 | vm-extract (+ function-source grep) | port; the Edit Pool UI flow: convert |
| `v31719-tv-court-follow-sync-test.mjs` | Division choice publishes at once; TV follows its court's division; scorekeeper keeps its own | vm-extract + source grep | vm: port; greps: retire — covered by e2e-full (TV follows Court A into the team event) |
| `v31720-pool-local-tiebreak-order-test.mjs` | Tiebreaks stay right after their pool, also after rebase and on load | vm-extract + source grep | vm: port; call-site wiring: convert |
| `v3172-input-focus-stability-test.mjs` | Debounced saves; remote updates wait while staff types; own echo ignored | source grep | convert |
| `v3173-logo-removal-worker-reliability-test.mjs` | Logo gone; Worker strips logo, library failures non-fatal, structured errors, admin reset; local legacy reset; input deferral | source grep | worker: keep / partly covered by worker-api-test; client: convert |
| `v3174-tv-realtime-service-worker-test.mjs` | Service worker clones before caching; TV realtime diagnostics; read-only devices apply broadcasts | source grep (html + sw) | sw: keep; TV applies broadcasts: retire — covered by e2e-full; diagnostics: convert |
| `v3175-snapshot-analysis-test.mjs` | Snapshot size analyzer in diagnostics | source grep | convert |
| `v3176-action-history-analysis-test.mjs` | Action-history analyzer in Developer Tools | source grep | convert |
| `v3177-compact-action-history-test.mjs` | Undo history stored as patches; legacy entries dropped; point/hansoku/fusen/Next Match undoable | source grep | convert |
| `v3178-tv-self-healing-sync-test.mjs` | TV refreshes from the cloud on handshake, fallback, every 15 s, revision gaps, becoming visible | source grep | handshake and court-before-socket: retire — covered by e2e-full (TV reload catch-up); periodic, revision gap, visibility: convert |
| `v3179-tv-final-results-test.mjs` | TV shows final results when its court's division completes | source grep | retire — covered by e2e-full (TV shows `division-complete` at the end), except results styling (layout) |
| `version-consistency-test.mjs` | One version in package.json, badge, title, SW cache, `/api/health`, CHANGELOG; frozen engine version | guard | keep (reads the app through `ksm-source.mjs`) |
| `worker-api-test.mjs` | Backend API contract | API contract | keep |

Support files (not run as tests): `ksm_browser.py`, `ksm_server.py`, `ksm_app.py`, `lib/ksm-test-api.js` (test infrastructure, keep); `lib/ksm-source.mjs` and `ksm_source.py` (the app source as one text and the built page; `ksm-source.mjs` retires with the last vm-extract/grep test); `run-all.mjs`; `ksm-testlab.py` (simulation matrix, engine globals: port to engine module); `verify-package.mjs` (built package contents in `dist/`, run after `npm run build`: keep); `golden/engine/*.json`.

### Source-grep checks that had no behaviour, golden or e2e coverage

These `index.html` checks were the only protection for their behaviour. Each now names the behaviour (or layout) test that covers it, or is marked **dead code, retire** when the grep only guards code that is overridden later in the file and never runs. The M.5 split kept them running unchanged (they read the app source as one text); they can be deleted as the code they check moves into modules or React. Findings F2–F4 (docs/ROADMAP.md) were found while converting them and are pinned by expected-failure checks.

Cloud sync and saving
1. Offline outbox: scoring while offline queues the snapshot and flushes it when back online. **Covered by** `sync-saving-test.py` (staff scores offline, "1 change waiting", reaches the server when back online) and `reload-restore-test.py` (queued work survives a reload and is flushed after login).
2. Conflict recovery file kept and downloadable. **Covered by** `sync-saving-test.py` (Download Recovery File carries the queued outbox and the latest local snapshot) and `reload-restore-test.py` (queued staff work is kept, not dropped, when another court saves). The give-up-after-repeated-409 path (`preserveRecovery` in `performCloudSave`) cannot be reached through the UI while the rebase succeeds; the rebase itself is vm-tested (`v31712`).
3. Device identity and own-echo suppression. **Covered by** `sync-remote-updates-test.py` (a staff device ignores a record carrying its own client ID, a spectator sharing that ID applies it) and the e2e tests (saves carry `x-ksm-client-id`; devices converge).
4. Stale/duplicate revisions ignored. **Covered by** `sync-remote-updates-test.py`.
5. Save debounce (2 s local + 1.2 s cloud). **Covered by** `sync-saving-test.py` (a point reaches the server 2.5–6 s after the tap).
6. Remote updates deferred while staff edit a field, applied on focusout. **Covered by** `sync-remote-updates-test.py` ("Live update waiting for editing to finish", applied after leaving the field).
7. 10-minute safety autosave. **Covered by** `sync-saving-test.py` (Playwright clock).
8. Save-status wording and refresh, save toasts. **Covered by** `sync-saving-test.py` ("✓ Saved just now", "✓ Saved 1 min ago", "Saved locally · 1 change waiting", "🟢 Online"/"🟠 Offline", Save Now toasts).
9. Save Now menu item. **Covered by** `sync-saving-test.py` (online and offline).
10. Recovery file download/load. **Covered by** `sync-saving-test.py` (download, then load on a fresh device into a new cloud tournament) and `file-import-export-test.py` (a non-recovery file and a cancelled password change nothing; loading on a device with an open tournament does not ask and drops its queued work: finding F7).
11. Cloud Diagnostics / Developer Tools content. **Covered by** `sync-saving-test.py` (stage, HTTP status, server response, pending queue, pinned court, snapshot and action-history analysis, Retry queued save). TV realtime diagnostics (`v3174`, `v31713`): **dead code, retire** — the page has no `#tvRealtimeDiagnostics` element, so `renderTvRealtimeDiagnostics()` never draws anything.
12. Scorekeeper's pinned court restored after a reload. **Covered by** `sync-saving-test.py`: a court chosen from the Courts menu on a plain link and a court link (`&court=B`) both come back after a reload (F3, fixed); an explicit `&court=` in the link wins; a TV link keeps its own court.
13. Load-time self-healing wired in. **Covered by** `sync-remote-updates-test.py` (a saved, un-advanced elimination winner is repaired on a live update and on a fresh load; both paths go through `applyTournamentPayload`, which also runs the sanitizer and the tiebreak-order repair, whose logic is vm-tested).
14. One-time reset of legacy local data. **Covered by** `sync-remote-updates-test.py` (runs once, not again).

Roles, links and navigation
15. Spectator and TV sessions never write to the cloud. **Covered by** `roles-access-test.py` (request log: no PUT/POST/DELETE after clicks, offline/online and live updates).
16. Role-based navigation. **Covered by** `roles-access-test.py` (spectator: no Setup/Registration/Export/Save/TV; TV: no navigation; staff: all).
17. Spectator screens and court view. **Covered by** `roles-access-test.py` (Court, Overview, Results, Live Scores allowed, others go to Live Scores; court screen without controls, with context).
18. Director/scorekeeper role links carrying a key. **Dead code, retire**: the running `initializeCloudRoleFromUrl` ignores `role`/`key` (every link opens read-only; staff log in), and the scorekeeper/director link helpers are only offered by the overridden first `openTournamentAccess`.
19. Team representative. **Covered by** `roles-access-test.py` (staff get a selector, spectators a read-only name). The "only on the match's own court" branch applies to the removed `scorekeeper` role: **dead code, retire**.
20. Home library. **Covered by** `roles-access-test.py` (cloud tournament listed by name, opens as spectator on Live Scores, Tournament Library return path, Staff Logout).
21. Tournament Access modal. **Covered by** `roles-access-test.py` (spectator link without key, QR carries it, Copy Link copies it). "Copy closes the modal" and "QR Back" belong to the overridden first `openTournamentAccess`: **dead code, retire**.

Court screen
22. Undo/Redo and history. **Covered by** `court-actions-test.py` (labels, enabled state, points/hansoku/fusen-gachi/Next Match undo and redo, per-court stacks, limit 100, patch storage, legacy entries dropped; Undo after the last match, F2 fixed) and `undo-division-complete-test.py`.
23. Specific placeholders ("Winner of …"). **Covered by** `court-screen-details-test.py` (queue, context, no TBD) and `tv-display-test.py` (TV upcoming).
24. Mid-tournament court context. **Covered by** `court-screen-details-test.py` (pools in progress first and alphabetical, preview, completed pools ✓ below, one column; live team context only the sheet with Wins/Points; team bracket Wins/Points headers, one column).
25. Pools tab division independent of the court's. **Covered by** `court-screen-details-test.py`.
26. Pool slot letters in print; Edit Pool. **Covered by** `court-screen-details-test.py` (print sheets A–D; drag between pools, re-lettered, championship kept).

TV and Live Scores
27. TV Upcoming Matches. **Covered by** `tv-display-test.py` (two cards, team names, later team rounds with their sources).
28. TV current match. **Covered by** `tv-display-test.py` (point letters, team Wins/Points, kachinuki current bout above lineups with active/waiting/eliminated).
29. TV self-healing. **Covered by** `tv-display-test.py` (revision gap triggers a full refresh, visibility and 15 s refresh with the socket held).

Layout and styling
30. TV canvas. **Covered by** `tv-display-test.py` (1920×1080 canvas at 0,0; 210/610/260 zones inside it; large names; no chrome; no White/Red labels); final results on the TV by `e2e-full-tournament-test.py`. The first renderer's CSS and markup (`tv-canvas`, `fitTvCanvas`, `tv-white-points` offsets, `tvTeamHtml`, `tvKachinukiHtml`, `tvIndividualHtml`): **dead code, retire**.
31. Phone header and navigation. **Covered by** `layout-screens-test.py` (portrait and landscape: navigation strip fits, tiles in one row, long tournament name within two lines, no sideways scroll).
32. Phone/landscape court, Live Scores, Results. **Covered by** `layout-screens-test.py` (landscape court: ten scoring buttons in one band, compact actions; Live Scores stacked in portrait, side by side on desktop; Results two columns in landscape) and the existing `mobile-court-*` layout tests.
33. Medal/placement and division-complete styling. **Covered by** `layout-screens-test.py` (gold/silver/bronze place colours, no row boxes or label badges).
34. Validation modal, Results titles, gold Next Match. **Covered by** `layout-screens-test.py` (actions inset at the right of the card, one-line titles, gold Next Match in landscape and desktop).

The TV greps that check the first TV renderer and the first `openTournamentAccess` (`tv-display-refinement`, `v31511`, parts of `tv-live-refinement` and `v31510`, `shared-views-tv-display`'s "court specific TV links") guard code that no longer runs; what they meant is now tested against the tv3 renderer. Delete that dead code and those checks together.
