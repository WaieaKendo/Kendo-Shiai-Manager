# KSM roadmap and task list

## How branches work

- **`develop`** holds all finished, tested work. Every new task branches from `develop` and is merged back into it once `npm test` passes and it has been reviewed, so each new branch starts with everything done so far.
- **`main`** only moves at release points (after sign-off, and never inside the pre-event freeze): `develop` is merged into `main`.
- Task branches are short-lived: `fix/…`, `feat/…`, `test/…`, `refactor/…`, `docs/…`. After merging they can be deleted — their commits live on in `develop`.
- If a task needs another unfinished branch's work, merge that branch into `develop` first, or `git cherry-pick` the specific commit.
- Golden snapshot conflicts (two branches both changed `tests/golden/engine/*.json`): merge, then run `npm run test:golden:update`, review the diff, and commit.
- Golden snapshot changes are always reviewed in the diff and explained in the commit message.

### Branch log

| Branch | Contents | State |
|---|---|---|
| `test-baseline` | Test suite repair, backend contract + two-court e2e, golden snapshots, CI, this roadmap | merged into `develop` |
| `fix/tiebreak-standings` | 0.1 | merged into `develop` |
| `fix/small-round-robin-results` | 0.2 | merged into `develop` |
| `feat/court-side-setting` | 0.3 | merged into `develop` |
| `fix/inline-handler-escaping` | 0.4 | merged into `develop` |
| `feat/test-hooks` | Test IDs + test helper | merged into `develop` |
| `test/full-tournament-e2e` | Full tournament e2e, watch mode, coverage map | merged into `develop` |
| `fix/tv-reload-restore-prompt` | F1: link devices reload without the restore prompt; unsynced staff work queued and flushed after login | open — ready for review |
| `test/convert-source-checks` | M.4: behaviour/layout tests for the 34 grep-only checks (coverage map updated); found F2–F4. Branched from `fix/tv-reload-restore-prompt` | open — ready for review |
| `refactor/vite-typescript` | M.5: Vite build (`app/` → `dist/`), `index.html` split into ordered CSS/JS files with no behaviour change, tests on the built app, tournament data types, engine files type-checked; newer test IDs pinned. Branched from `test/convert-source-checks` | open — ready for review |
| `feat/react-setup` | M.6 groundwork: React 19 + strict TypeScript in `app/react/`, extra Vite pages (`app/*.html`), `mountIsland()`, `useTournamentRecord()` (GET + spectator WebSocket, backoff, ignores older revisions), `ksm:state-changed` event from the legacy app (marked post-split edits in `verify:split`), Node unit tests. Branched from `refactor/vite-typescript` | open — ready for review |
| `feat/react-overlay` | M.6 / 1.4: stream overlay page `/overlay` (React), TV-identical match selection as a typed pure function (parity-tested against the TV on 18 tournaments), band mode for PRISM, "copy overlay link" in the TV menu. Branched from `feat/react-setup` | open — ready for review |
| `refactor/engine-bridge` | 2.0: `app/engine/` strict-TS modules built into a classic `KSMEngine` script loaded before `app.js` (and importable by `app/react/`); `poolSizes` moved as the first function; `verify:split` + vm test helpers know about it; engine unit tests. Branched from `feat/react-overlay` | open — ready for review |
| `refactor/engine-settings` | 2.1: `app/engine/settings.ts` (`TournamentSettings`, pure `readSettings(setup)` with the engine's historical defaults) + legacy `tournamentSettings()` accessor over the persisted `setup` snapshot; engine files 05/07/08/13 no longer read `teamFormat`/`teamTournamentFormat`/`teamEnabled`/`exhibitionEnabled` inputs; `verify:split` gains the inline `was:` marker form. Payload shape unchanged. Branched from `refactor/engine-bridge` | open — ready for review |
| `refactor/engine-pools` | 2.2: `buildPools` (seeds, dojo spreading via `clubGroup` incl. Aiea/Waipahu, `shuffleDeterministic`), slot assignment and pool match order/generation as typed pure functions in `app/engine/pools.ts`; legacy wrappers delegate (`buildPoolMatches` passes each pool's court from `poolCourtFor`, `assignPoolPlayerSlots` keeps its in-place update); unit tests + equivalence with the pre-move code. Branched from `refactor/engine-settings` | open — ready for review |
| `refactor/engine-standings` | 2.3: pool standings (`initialPoolStandings`, `poolStandings` with the pool record in wins/pts and the tiebreak record in tbWins/tbPts), `requiredSeedPlaces` (incl. pool-only 1st–3rd), tiebreak resolution (`tiebreakStatsForPlayers`, `tiebreakSeriesStats`, `resolveTiebreakBaseGroup`, `unresolvedRequiredTiebreakGroup`), tiebreak match objects (`makeTiebreakMatch`, `tiebreakMatchesForGroup`), `pendingTiebreak` and the winner helpers as typed pure functions in `app/engine/standings.ts`; `maybeCreateTiebreaks`/`appendApprovedDynamicMatches` stay legacy and call them. Unit tests + legacy equivalence over golden-scenario states; legacy-equivalence tests skip without the old commit and CI checks out full history. Branched from `refactor/engine-pools` | open — ready for review |
| `refactor/engine-championship` | 2.4: championship bracket as typed pure functions in `app/engine/championship.ts`: frozen 6–40 template library, `championshipLabels`, round names/counts and `championshipCourtFor`, node + Match Object construction (`buildChampionshipTemplateMatches`, `championshipMatchObjectForNode`), seeds (`poolFinished`, `poolSeedResolution`, `seedNameForLabel`), `championshipNodeSource`/`champWinnerObj`/`sourceLabelForRound`, `syncChampionshipTemplate` as a plan (missing Match Objects + field updates, applied by the legacy wrapper) and individual placements (`resultPlacements`). Team brackets/single elimination stay legacy. Unit tests + legacy equivalence (build, replayed golden advancement, self-heal, placements) over golden states, single and split courts. `reload-restore-test.py` polls the cloud copy instead of sleeping. Branched from `refactor/engine-standings` | open — ready for review |
| `refactor/engine-single-elim` | 2.5: individual single elimination as typed pure functions in `app/engine/single-elim.ts`: seed placement (`placeIndividualsForSingleElim`, `singleElimSlotInfo`, `chooseBestSeedSlot`, `protectedSeedQuadrant`, `singleElimBracketSize`), nodes + Match Objects (`buildIndividualSingleElimMatches`), `indivSide`/`sideLabelGeneric` and `syncIndividualSingleElim` as a plan (node winners + field updates, applied by the legacy wrapper; empty bye slot for 5–6 kept). Template nodes (`teamBracketNodesForCount`) stay with the team bracket (2.6) and are passed in. `verify-split` empties the LAST of identical old redeclarations. Unit tests (2–16 entrants, single/split courts, byes, labels, placements) + legacy equivalence over golden single-elimination scenarios. Branched from `refactor/engine-championship` | open — ready for review |
| `refactor/engine-teams` | 2.6: team events as typed pure functions in `app/engine/teams.ts` + `kachinuki.ts`: positions (`teamSlots`, `slotLabel`), bouts for 3/5-person and kachinuki, round robin and single elimination (`buildTeamMatches`, `teamPairMatchObjects`), the frozen bracket templates (`teamBracketNodesForCount`, 2–32; the legacy wrapper keeps the alert), `syncTeamBracket` as a plan (node winners + added bouts, applied by the legacy wrapper), pairing winners (`teamPairMatches`/`teamPairSummary`/`teamWinner`: bout wins, points, representative), the representative playoff (`maybeCreateTeamTiebreak`) and kachinuki next bout (`maybeCreateKachinukiNext`) as data, round-robin standings/progress/placements and bracket placements. Settings passed in from `tournamentSettings()`. `maybeAdvanceTeamBracket`, `sortTeamMatches`, `appendApprovedDynamicMatches` and result HTML stay legacy. Unit tests + legacy equivalence over golden team scenarios. Branched from `refactor/engine-single-elim` | open — ready for review |
| `refactor/engine-integrity` | 2.7 (engine move complete): `app/engine/integrity.ts` — completed-result snapshot, load-time result repair as a plan (restore valid snapshot / re-open winner-required match with no winner / snapshot the rest), elimination-repair plan, `uniqueIndividualMatches` (duplicate removal), `individualLogicalMatchKey`, sync identities (`matchSyncIdentity`, `matchHasSyncIdentity`, `isValidMatchObject`); `app/engine/generation.ts` — `eligibleIndividuals`/`eligibleTeams` and a pure `generateDivision(input)` plan per format (RR + championship, SE, team RR/SE incl. kachinuki, exhibitions, split courts) that the legacy `generateDivisionState` writes to `state` before running the legacy advancement syncs. `app/engine/README.md` lists modules and the pure/legacy boundary. Unit tests + legacy equivalence over all golden scenarios. Branched from `refactor/engine-teams` | open — ready for review |
| `fix/outbox-flush-local-changes` | F6: staff work queued before a reload is no longer lost after Staff Login when the live connection is slow: queued court actions are merged into the current copy at login, and the outbox flush rebases on any unconfirmed local change; `reload-restore-test.py` holds the socket shut to pin both (was a flake). Branched from `refactor/engine-integrity` | open — ready for review |
| `feat/react-court-screen` | M.8 step 1: React court scoreboard island (`app/react/court/`): the match display (names, dojos, points, hansoku, representative picker) with the legacy markup's elements and test IDs; `renderScore()` publishes the match to it (`app/js/35-react-court.js`, marked `react-court`); `index.html` gets the court module script (Vite plugin; files in `APP_SHELL`). Parity test against the legacy renderer + unit tests; `build-output-test` updated for the module script. Branched from `fix/outbox-flush-local-changes` | 🔨 in progress (step 1 of 5) |
| `feat/react-court-header` | M.8 step 2: React court header island (`#score .scoreboard-header`: logo, tournament name, court title, division select and its options, division title, match line) with the legacy markup's elements and test IDs; `updateScoreTournamentName()`, `renderDivisions()` and `renderScore()` publish their fields (`ksm:court-header`, marked `react-court`) instead of writing the elements; selection rules and `matchDisplayMeta()` stay legacy; the select still calls `selectScorekeeperDivision()`. Header logo path in `app/react/court/branding.ts` (per-tournament logo later). Parity test extended (two courts, split division, division select, division complete) + unit tests. Branched from `feat/react-court-screen` | 🔨 in progress (step 2 of 5) |
| `feat/react-court-actions` | M.8 step 3: React islands for the score buttons (`#score .score-controls-grid`) and the action row (`#score .bottom-action-row`: Undo, Redo, Fusen-gachi, Next Match) with the legacy markup's elements, test IDs and inline SVG; each button calls the same legacy global as before (`point`, `hansoku`, `undo`, `redo`, `openFusenDialog`, `nextMatch`); `updateUndoButton()` publishes Undo/Redo (`ksm:court-actions`, marked `react-court`) instead of writing them; the Fusen-gachi dialog stays legacy. Action icons in `app/react/court/branding.ts`. F2 kept as is for the planning meeting. Parity test extended (every attribute incl. `disabled` and SVG, visibility, Fusen-gachi, Redo cleared by a new action, spectator) + unit tests. Branched from `feat/react-court-screen` | 🔨 in progress (step 3 of 5) |
| `feat/react-court-context` | M.8 step 4: React islands for the queue and context panels (`#queue`, `#courtContext`: pool cards and bracket preview, single elimination one court/split, team bout sheet, kachinuki sheet, team standings/bracket, queue groups and rows) with the legacy markup's elements, classes and test IDs; the live `renderQueue()`/`renderContext()` wrappers (32-) hand over to `ksmQueuePanelInput()`/`ksmContextPanelInput()` (35-), which mirror the legacy decisions and HTML helpers as plain data (`ksm:court-queue`, `ksm:court-context`, marked `react-court`); shared HTML helpers (`bracketHtml()`, `teamSheetHtml()`, ...) unchanged for the other screens; `setCourtSupportMode()` stays legacy. Parity test extended (panels with every attribute, page box and innerText; seven formats played through on both courts to division complete and spectator; covered variants asserted) + unit tests. Branched from `feat/react-court-screen` | 🔨 in progress (step 4 of 5) |
| `feat/react-court-finish` | M.8 step 5 (M.8 complete): court screen golden snapshots recorded from the legacy renderer (`golden-court-screen-test.py`, `tests/golden/court/`: 14 scenarios, element boxes per platform); React division-complete panel (`.division-complete` on the scoreboard card + panel as a portal; `setCourtCompletePresentation()` publishes `ksm:court-complete`); the legacy court renderer removed (DOM-writing `renderScore`/`renderQueue`/`renderContext`/header and Undo writers, their redeclarations, court-only HTML helpers, the `ksmReact*` switch flags; app/js −1068 lines), deletions listed in `verify-split` (`REMOVED_COURT_RENDERER`); "Court screen could not load" notice without the module; 2.10 ratchet 46 → 27; parity test deleted, six source-grep checks repointed at the React court code. Branched from `feat/react-court-screen` (step 4) | open — ready for review |
| `fix/pre-event` | Fixes and tests for the next event, one commit per item: 0.5 Load Tournament File guard. Branched from `feat/react-court-screen` | 🔨 in progress |

Nothing has been pushed to GitHub yet; `main` is unchanged from the original repository.

Status: ✅ done · 🔨 in progress · ⏳ ready to start · 🗣 needs a decision from the planning meeting first

## Phase 0: bug fixes (before the next tournament)

| # | Task | Branch | Status | Notes |
|---|---|---|---|---|
| 0.1 | Tiebreak standings show the tiebreak-match record instead of the pool record | `fix/tiebreak-standings` | ✅ | Order was already correct; only the numbers shown were wrong |
| 0.2 | Round robins with 3–5 players never finish or show placements; **5 entrants silently dropped one competitor** | `fix/small-round-robin-results` | ✅ | Placements from final pool standings (tiebreaks for places 1–3); 5 entrants → one pool of 5. Confirm the rule with HKF |
| 0.3 | Red/White side setting for court screen and printed sheets | `feat/court-side-setting` | ✅ | Per court in Setup → Referees, from the scoring table's view; synced to all devices. Default unchanged. TV (audience view) not affected |
| 0.4 | HTML injection through names in inline click handlers | `fix/inline-handler-escaping` | ✅ | Security; no visible change. `jsArg()` for all handler string arguments |
| 0.5 | **Load Tournament File can overwrite the live event**: it replaces the open tournament with the file and autosaves, so on a staff device the file becomes the cloud copy on every device. No confirm, no check that the file is the same tournament | `fix/pre-event` | ✅ | Download Tournament File now writes the tournament ID and cloud revision into the file. Loading validates the file first (an invalid or recovery file is refused and changes nothing), then asks in the app's modal, showing the file's name, saved date, revision and ID next to the open tournament's revision: the same tournament ID can be replaced (Cancel keeps it); another tournament's file, or an older file without an ID, never replaces the open one and is offered as a **new tournament** (its own Staff password and cloud ID), after the open tournament's pending work is saved (refused if that fails, so its offline queue is never overwritten). Chosen over refusing, so another tournament's backup can still be restored. Pinned by M.12's `file-import-export-test.py` |

## Front-end migration: test safety net first

The front end moves to Vite + TypeScript and then React, screen by screen. Tests must survive that, so they drive the app through `data-testid` controls and one helper (see docs/TESTING.md: "Test helper, test IDs and test API" and "Test coverage map").

| # | Task | Branch | Status | Notes |
|---|---|---|---|---|
| M.1 | `data-testid` hooks on key controls; `tests/ksm_app.py` + `tests/lib/ksm-test-api.js` as the only way tests reach the app; golden and two-court e2e moved onto them | `feat/test-hooks` | ✅ | Attributes only; golden snapshots unchanged; `test-ids-test.py` pins the contract |
| M.2 | Full-tournament e2e: director, two courts, spectator, TV; watch mode (`npm run test:e2e:watch`) | `test/full-tournament-e2e` | ✅ | Found F1 (below) |
| M.3 | Test coverage map: every test's purpose, mechanism and migration fate | `test/full-tournament-e2e` | ✅ | docs/TESTING.md |
| M.4 | Convert the source-grep checks that nothing else covers into behaviour/layout tests | `test/convert-source-checks` | ✅ | All 34 covered or marked dead code in docs/TESTING.md; the greps stay until M.5. Found F2–F4 |
| M.5 | Vite + TypeScript build; split `index.html` into files with no behaviour change | `refactor/vite-typescript` | ✅ | Still ONE classic script (inline handlers need globals; ~35 redeclared functions rely on order), concatenated from `app/js/NN-*.js`; `npm run verify:split` proves markup/CSS/JS byte-identical to def5010. Golden files byte-identical; tests unchanged (they read the source as one text and load `dist/`). Types for the tournament data; `// @ts-check` on the engine files (pools, teams, single elimination, standings/tiebreaks, championship); the checker found no bugs. `function-override-baseline` stays until the redeclarations go (2.10) |
| M.6 | React pilot: the livestream overlay page (1.4) | `feat/react-setup`, `feat/react-overlay` | ✅ | React inside the Vite build (extra pages, islands, live record hook, state-change bridge); `/overlay` is the first React page. The legacy bundle is unchanged apart from two marked hooks and the TV-menu overlay links |
| M.7 | Typed engine module | `refactor/engine-bridge` … `refactor/engine-integrity` | ✅ | = 2.0–2.7: the engine moved into `app/engine/` step by step (see `app/engine/README.md`); golden files byte-identical |
| M.8 | React court (scorekeeper) screen | `feat/react-court-screen` … `feat/react-court-finish` | ✅ | Keeps every court test ID; e2e-full and test-ids-test pass unchanged. Island by island inside the legacy page (plan below), then the legacy court renderer was removed: the court screen is React only, the legacy code chooses matches, runs the actions and publishes the data. Pinned by `golden-court-screen-test.py` (snapshots recorded from the legacy renderer). Legacy quirks kept for the meeting: "Court quirks kept" below |
| M.9 | Path URLs for screens instead of query parameters (e.g. `/t/<id>/court/a`) | `feat/path-urls` | ⏳ | After M.8. Old `?tournament=…&court=…` links keep working (redirect); offline service worker and Cloudflare serve the app for the new paths. Plan below |
| M.10 | Sync safety net: a cheap revision check on every screen, paced by socket health and tournament phase | `feat/sync-safety-net` | ⏳ | Next to M.9. First piece: a revision-only endpoint (or ETag/304). Plan below |
| M.11 | Per-tournament theming: colors, logos, images on every screen | `feat/tournament-theming` | ⏳ | Last UI item. The structural steps (M.8–M.10, 2.8+) follow the theming rules below now, so M.11 only adds data + a Setup editor |
| M.12 | Tests for registration and file import/export, before those screens move to React | `fix/pre-event` | ⏳ | Most setups in tests skip Registration (`KSMTest.configure`), so much of it is untested. Order: `.ksm` Download/Load Tournament File round trip (the offline backup), Load Recovery File (only source-grep today), Export CSV, Clear Registration/Teams/Exhibitions, exhibitions, Regenerate Single Division dialog, Export Brackets/Results, Preview Full Packet. Decide at the meeting: implement or remove the placeholder buttons (Import CSV, Paste from Excel, Referee Assignment and Archive exports) |
| M.13 | Remaining screens to React, one at a time like M.8 | `feat/react-<screen>` | ⏳ | Needs M.12 first (Registration/files have almost no tests). Order: Live Scores + TV (display only, reuse the court data), Results/awards, Overview/director, Tournament Library/home, Pools, Setup, Registration (teams, exhibitions), then print as part of the program (1.7). Same rules: identical DOM/test IDs, snapshot or parity test before deleting legacy, theming rules. Some may land before the meeting (nothing is pushed) |

### M.8 React court screen: plan

The court screen moves to React one island at a time inside the legacy page (`app/react/court/`, loaded by `index.html` as one module script after `app.js`). Each island renders the same elements, classes, ids and test IDs as the markup it replaces, so the court CSS (incl. the Red/White side setting), every court test and the layout tests apply unchanged; a parity test ran the legacy and React renderers side by side (steps 1–4). The legacy code keeps choosing the court's match and running the actions (`point()`, `nextMatch()`, undo/redo); since step 5 it only publishes data and the legacy court renderer is gone. When the module does not load, the court screen says "Court screen could not load".

1. ✅ Match display (`#score .scoreboard-match`: names, dojos, points, hansoku, team-playoff representative picker). `renderScore()` publishes the match (`ksm:court-scoreboard`) instead of writing those elements (`app/js/35-react-court.js`). Pinned by `court-scoreboard-parity-test.py` + unit tests.
2. ✅ Header (`#score .scoreboard-header`: tournament name, court title, division select and its options, division title, match line). `updateScoreTournamentName()`, `renderDivisions()` and `renderScore()` publish their fields (`ksm:court-header`); the legacy code keeps the selection rules and `matchDisplayMeta()`. Pinned by `court-scoreboard-parity-test.py` + unit tests.
3. ✅ Score buttons and action row (`#score .score-controls-grid`, `#score .bottom-action-row`: Undo, Redo, Fusen-gachi, Next Match), calling the legacy actions; `updateUndoButton()` publishes Undo/Redo (`ksm:court-actions`); the Fusen-gachi dialog stays legacy. F2 (Undo hidden when a division completes) stays as is for the planning meeting. Pinned by `court-scoreboard-parity-test.py` + unit tests.
4. ✅ Queue and context panels (`#queue`, `#courtContext`: pools, bracket preview, single elimination, team bout sheet, kachinuki, team standings/bracket, queue groups). The live `renderQueue()`/`renderContext()` (32- wrappers) hand over to `ksmQueuePanelInput()`/`ksmContextPanelInput()` (35-), which publish their decisions and data (engine bridges for standings, pair summaries, seeds) as plain data (`ksm:court-queue`, `ksm:court-context`); the shared HTML helpers stay for Results/Live Scores/print, `setCourtSupportMode()` stays legacy. Pinned by `court-scoreboard-parity-test.py` (whole divisions of every format played through) + unit tests.
5. ✅ Division-complete panel; legacy court renderer removed (`feat/react-court-finish`). First the court screen was frozen: `golden-court-screen-test.py` records the parity test's serialization (plus the division-complete panel and the scoreboard card's classes) after every step of every scenario, from the legacy renderer, into `tests/golden/court/*.json` (element boxes per platform); the React islands matched it. Then the `.division-complete` class and panel moved to React (`setCourtCompletePresentation()` publishes `ksm:court-complete`; the panel is a portal into the legacy card). Then the legacy court DOM writing was deleted: the no-React branches of `renderScore()`, `updateUndoButton()`, `renderQueue()`/`renderContext()` (now single declarations in 32- that publish), the header writers, `setCourtCompletePresentation()`, the renderer-switch flags, the dead redeclarations (`renderScore` ×3, `renderQueue` ×4, `renderContext` ×7, `legacyUpdateUndoButton` ×4, `setMatchBadge` ×2) and the HTML helpers only they used; shared helpers (`bracketHtml()`, `teamSheetHtml()`, `divisionCompletePanelHtml()`, …) stay for Results, Live Scores, TV and print. `verify-split` lists every removed piece (`REMOVED_COURT_RENDERER`); 2.10 ratchet 46 → 27 extra declarations; the parity test was deleted (the golden test replaces it). `app/index.html` is unchanged: its court markup is only the islands' mount points.

#### Court quirks kept (for the planning meeting)

The React court screen reproduces the legacy court screen exactly, including these quirks (steps 1–5, pinned by `tests/golden/court/`). Each is a small, separate change once decided:

- **F2: Undo hidden on a completed division.** The last Next Match of a court's division hides the whole action row (CSS `.scoreboard-card.division-complete .bottom-action-row`), so a wrong final result cannot be undone on that court although the history is there (see Findings).
- **Stale header after completion.** When the division completes, only the tournament name is refreshed; the division title and match line keep showing the last match.
- **Division select.** A current division that is not one of this court's options is still assigned to the select, which then shows nothing selected; with no current division the select shows its first option although none is chosen.
- **Undo label never names the action.** Undo/Redo always read "Undo"/"Redo"; the "Undo <action>" renderers were dead redeclarations (removed in step 5).
- **Next Match and Fusen-gachi are never disabled**, even with no match on the court.
- **Spectator controls hidden by CSS only.** A spectator's court screen still has the score buttons and action row in the page, hidden by `body.ksm-spectator` CSS rules only (not removed or disabled).
- **Completed division: empty queue and the bracket.** Once the division is complete the queue panel is empty (its final-results branch is unreachable) and the context keeps the pools/bracket view next to the division-complete panel.
- **Split single elimination queue.** Rows are grouped by the raw round but titled by the normalized round, so two groups can show the same title.
- **Kachinuki sheet without an index** shows every team member as "waiting".
- **Class strings with doubled or trailing spaces** (e.g. `aligned-match-row  compact `), kept because the court CSS and tests see them.
- **`esc()` blanks 0**: a numeric 0 (e.g. a count or score printed through `esc()`) is shown as empty text.
- **Unreachable branches mirrored**, not dropped: the queue's final results, championship placeholder queue rows (the frozen templates create every championship match at generation), "No division selected.", and a complete division without placements ("Final results are available in Results.").

### M.9 Path URLs: plan

Today every screen is one page driven by query parameters (`/?tournament=<id>&court=A`, `&role=spectator&view=tv` for a TV); only the stream overlay has a path (`/overlay`). After M.8, move to path URLs, for example `/t/<id>/court/a`, `/t/<id>/tv/a`, `/t/<id>/live`, `/t/<id>/overlay/a`. Routing is its own step, not part of the React conversion. To handle:

- **Existing links**: TV, court and overlay links are copied onto devices before an event. Old query links must keep working, most likely by redirecting to the new path.
- **Offline**: the service worker serves only `/` and `/index.html` as the app shell and sends every other navigation to the network. It must serve the app for the new paths, or an offline court device gets nothing.
- **Hosting**: Cloudflare must answer the new paths with the app, as it maps `/overlay` to `overlay.html` today.
- **Passwords in links** (Phase 3: logins, device pairing): design the URL scheme together with that, so links change only once.
- **Tests**: `KsmApp.open_device` paths, the TV/overlay link tests and `e2e-full` use the query links; add the new paths and keep one check that the old links still work.

### M.10 Sync safety net: plan

Today only the TV has a fallback for a missed live update (full refresh every 15 s, on a revision gap and when it becomes visible). Scorekeepers, spectators and the overlay (`useTournamentRecord`) rely on the socket and its reconnects. Add one safety net in `useTournamentRecord`, so every React page has it:

1. **Revision-only check** (first piece): a tiny endpoint returning the latest revision, or an ETag/`If-None-Match` GET answered 304 when nothing changed. Download the full record only when the revision is newer. Add jitter so devices do not ask at the same second.
2. **Pace by socket health first**: socket healthy → every 30–60 s; socket down or reconnecting → every 5–10 s with backoff until it is back.
3. **Pace by tournament phase**: before generation → none; live → as above; after the last match (from the engine's completion data, not a UI rule) → every few minutes, because results often get corrected after the final; archived → none.
4. **Always check at once** when the page becomes visible, when the network comes back and when a socket message skips a revision (as the TV does today).
5. **Staff devices**: a polled record follows the socket rule: while the device has unconfirmed local changes it is deferred, never applied over them (see F6).

With action-based sync (Phase 3) the same check becomes "actions after revision N".

### M.11 Per-tournament theming: plan

Each tournament can set its own colors, logo and images (court screen, TV, overlay, Live Scores, Results, library card, print sheets). Tacked on at the end, but built in along the way: **every structural step (React islands and pages, CSS moves, new endpoints) follows these rules now.**

Rules for the structural steps:
- **Colors only through theme tokens**: CSS custom properties (today's `:root` set in `app/styles/02-branding.css`: `--ksm-navy`, `--ksm-gold`, …). No new hard-coded colors in React components or new CSS; when a step rewrites CSS, it replaces the hex values it touches with tokens (about 430 remain today; the overlay CSS has its own).
- **Assets from one place**: logos, watermark and background images come from one theme module / prop with today's KSM assets as defaults, never inlined in markup, so a tournament's images can replace them.
- **Kendo semantics stay fixed**: red/white side colors and completed/live states are meaning, not branding; a theme may tint accents, not swap aka/shiro. Keep contrast readable on the TV and in print.

M.11 itself:
1. **Theme data**: a `branding` object in the tournament's setup (colors, asset references), read through a typed accessor with KSM defaults (like `readSettings`), applied once at the page root as CSS variables. Synced like other setup data.
2. **Images as separate assets, not inside the snapshot**: v3.16.2 stored the logo as PNG data in the setup snapshot and v3.17.3 removed it (the Worker strips it), because the snapshot is re-sent on every save. Store images in R2 (or another asset store) by content hash, reference them from `branding`, cache them in the service worker for offline devices.
3. **Setup editor**: pick colors (with a contrast check), upload/remove images, preview on court/TV/overlay; reset to KSM defaults.
4. **Print**: printed sheets use the logo and a print-safe variant of the colors.
5. **Tests**: themed and default tournaments through the layout/parity tests; contrast check on TV and court.

## Phase 1: small scorekeeper improvements

| # | Task | Branch | Status | Notes |
|---|---|---|---|---|
| 1.1 | Court automatically moves to the next division with ready matches | `feat/court-auto-advance` | ⏳ | Today the scorekeeper switches by hand when a division ends |
| 1.2 | Preset per-court division running order in Setup | `feat/court-running-order` | ⏳ | Feeds 1.1 |
| 1.3 | One-click PDF download of print sheets (today: browser Print → Save as PDF) | `feat/pdf-export` | ⏳ | e.g. to email sheets to dojos before the event |
| 1.4 | Livestream overlay page | `feat/react-overlay` | ✅ | The first React page (M.6). See below; a real live-stream test is still to do |
| 1.8 | Edit a match result directly (correct mistakes), separate from Undo | `feat/edit-match` | ⏳ | Undo only unwinds a court's history in order, so fixing a match three bouts back means undoing everything after it. Plan below |

### 1.4 Livestream overlay page

A page the streaming app shows on top of the camera picture: the current match of one court (names, points, division), updated live.

Requirements: transparent background; one URL per court (like the TV links); read-only (spectator session, never writes); laid out for a 1920×1080 stream.

Findings so far (tested in PRISM Live Studio on iOS with a standalone test page, not yet with KSM):
- PRISM only accepts a real https domain: an IP address or a self-signed certificate was rejected; the page worked from a real domain.
- Portrait works.
- In landscape, PRISM keeps the web widget portrait-shaped (e.g. 733×1303), so a bar at the bottom of the page lands off-screen. Resizing the widget by hand in PRISM fixed it.
- The test page therefore has an automatic "band mode" (moves the bar into the visible middle band when the page is much taller than wide) and a `?y=NN` override for the bar's vertical position.

Built in `feat/react-overlay` as `/overlay?tournament=<id>&court=A|B` (options and PRISM notes in README.md): the Court's current match exactly as its TV shows it (names, dojos or teams, division · pool/round/position, points, hansoku, "Next:"), an idle state, a subtle "Reconnecting…" badge, automatic band mode (device landscape + page portrait → bar at `y`% of the height, default 74, sized by the width), `?y=`/`?band=` overrides and `?debug=1` (size, orientation, mode). Staff copy the link from the TV menu.

Still needed: a full live-stream test (a real stream, a whole match, both courts) on the real domain.

### 1.8 Edit a match: plan

Staff open any played match (from the court queue/history, the pool or bracket view, Results) and correct it without touching the court's current match or its Undo history.

- **What can be edited**: points and their order, hansoku, fusen-gachi / fusen, hikiwake, winner (hantei), encho, and for team playoffs the representatives. With match timing (1.5) / a timer: the recorded duration and whether encho was needed.
- **Sync**: the edit is a court action like any other (patch-v1), so it syncs, rebases on conflicts and can be undone, but it goes into its own history entry with who, when and a reason (audit trail), not into the court's Undo stack.
- **Consequences from the engine, shown before saving**: recompute standings; list what else changes (pool order, a tiebreak created or no longer needed, championship seeds, bracket winners, placements). If later matches were already played on seeds or winners the edit changes, warn and require confirmation, or block and point to guarded bracket edits (control desk, Phase 3). Reuse the integrity/repair plans in `app/engine/integrity.ts`; no rules in the UI.
- **Timing**: an edit must not restart or change the court's running match timer; corrected durations feed the court time estimates (running late).
- **Tests**: edit a pool bout that flips standings (and seeds), an edit after the next round started, conflicting edits from two devices, undo of an edit.

### fix/pre-event: plan

One branch on top of `feat/react-court-screen` with the work that makes the next event safer, one commit per item so each can be taken or dropped:

1. **0.5** Load Tournament File guard.
2. **M.12** tests for registration and file import/export (`.ksm` round trip first; it pins 0.5).
3. **F2** Undo/Redo stay after a division's last match, redone in the React court (the old `fix/undo-after-division-complete` edited the deleted legacy renderer). Updates the court snapshots and the F2 expected-failure check in `court-actions-test.py`.
4. **F3** court chosen from the Courts menu restored after reload (from `fix/court-pin-after-reload`).
5. **F4** Setup/Registration edits merged three-way on a save conflict (from `fix/setup-edit-conflict-merge`; also fixes the F5 numbering clash).

F2 is on the court quirks list for the meeting; its commit is ready but can be dropped.

## Phase 1b: tournament setup and the printed program

| # | Task | Branch | Status | Notes |
|---|---|---|---|---|
| 1.5 | Match timing per bracket stage | `feat/match-timing` | ⏳ | Match length per division and stage (pools, early rounds, semifinal, final; finals can be longer), encho (overtime) length or unlimited, tiebreak/representative bout length. Stored in the tournament setup, read through `readSettings` (`app/engine/settings.ts`) with today's behaviour as the default. Feeds the program (1.7), later the match timer and court time estimates |
| 1.6 | More division formats, first: single elimination into a round robin | `feat/format-se-into-rr` | ⏳ | As run at an earlier tournament: an elimination stage whose survivors play a final round robin. A new plan in `app/engine/generation.ts` (`generateDivision`) plus its advancement and placements, tested like the existing formats (unit + golden scenario). Confirm the exact rules (how many advance, tiebreaks in the final pool) |
| 1.7 | Tournament program: print / PDF export | `feat/tournament-program` | ⏳ | Needs 1.5 (and 1.6 for its formats). Cover page and extra info (event details, schedule, sponsors/notes), the rules (match length by stage, encho, how ties and tiebreaks are decided, team formats), courts and their divisions, each division with its pools/brackets. Generated from tournament data, not app screens. Own print stylesheet: no app header, navigation or screen chrome, page breaks per division, prints like a real program. Uses the M.11 theme (logo, print-safe colors). Replaces or extends Preview Full Packet |

## Phase 2: groundwork for sync redesign (no user-visible change)

| # | Task | Branch | Status | Notes |
|---|---|---|---|---|
| 2.0 | Engine bridge: `app/engine/` (pure strict TS) bundled into a classic `KSMEngine` script loaded before `app.js`; `poolSizes` moved as the proof | `refactor/engine-bridge` | ✅ | Legacy `poolSizes` keeps its name and position, body = marked delegation; `verify:split` knows moved functions; goldens byte-identical |
| 2.1 | Engine reads settings from tournament data, not DOM inputs (team format etc.) | `refactor/engine-settings` | ✅ | Engine calls `tournamentSettings()` → `KSMEngine.readSettings(setup)`; `setup` is the saved payload's object (still filled from the Setup inputs by `getSetupSnapshot()` — moving the live copy off the DOM comes with the server step); payload + goldens unchanged |
| 2.2 | Pools: pool building, slots, pool match order → `app/engine/pools.ts` | `refactor/engine-pools` | ✅ | `clubGroup`, `shuffleDeterministic`, slot helpers, `buildPools`, `poolMatchPairs`, `buildPoolMatches` moved; `poolCourtFor`/`divisionCourtMode` stay legacy (read `state`, cache `pool.court`) and feed the courts in; goldens identical |
| 2.3 | Standings and tiebreaks → `app/engine/standings.ts` | `refactor/engine-standings` | ✅ | Standings, required places, tiebreak resolution/match objects and winner helpers moved; the state-mutating parts (`maybeCreateTiebreaks`, `appendApprovedDynamicMatches`, tiebreak order repair) and `poolCourtFor`/`championshipLabels`/`isPoolOnlyDivision` stay legacy and feed their inputs in; goldens identical |
| 2.4 | Championship bracket / seeding → `app/engine/championship.ts` | `refactor/engine-championship` | ✅ | Template library, seeds, nodes/Match Objects/courts, advancement (computed as data, applied by the legacy `syncChampionshipTemplate`) and individual placements moved; `maybeAdvanceChampionship`/`recomputeChampionshipAdvancement`, bracket HTML, team placements and bye/`champSourceWinner` helpers stay legacy; goldens identical |
| 2.5 | Single elimination → `app/engine/single-elim.ts` | `refactor/engine-single-elim` | ✅ | Placement, slot info, nodes/Match Objects/courts and advancement (computed as data, applied by the legacy `syncIndividualSingleElim`) moved; `maybeAdvanceIndividualSingleElim` (state glue), match sort/dedupe, queue and bracket HTML stay legacy; template nodes come from `teamBracketNodesForCount` (2.6); goldens identical |
| 2.6 | Team events → `app/engine/teams.ts` | `refactor/engine-teams` | ✅ | Bouts, bracket templates/courts, advancement (as data, applied by the legacy `syncTeamBracket`), pairing winners, representative playoff, kachinuki progression, round-robin standings and placements moved (`teams.ts` + `kachinuki.ts`); `maybeAdvanceTeamBracket` (state glue), team match sort, dynamic-match append and result HTML stay legacy; goldens identical |
| 2.7 | State integrity / invariants → `app/engine/integrity.ts` (+ division generation → `generation.ts`) | `refactor/engine-integrity` | ✅ | Result snapshot/repair and duplicate removal as plans, sync identities and a pure per-division generation plan moved; applying plans, logging, alerts, validation and rendering stay legacy; goldens identical. Engine move complete: 2.0–2.7 replace the old "one engine module" step (M.7) |
| 2.8 | Separate device/screen state from shared tournament data | `refactor/local-view-state` | ⏳ | |
| 2.9 | Stable IDs for people and matches | `refactor/stable-ids` | ⏳ | Fixes name-change/duplicate-name risk |
| 2.10 | Remove duplicate function redeclarations | `refactor/dedupe-functions` | ⏳ | Ratchet: `function-override-baseline-test.mjs`. Progress: M.8 step 5 removed the court renderer's redeclarations (`renderScore`, `renderQueue`, `renderContext`, `legacyUpdateUndoButton`, `setMatchBadge`, `allPoolResultsContextHtml`, `poolResultCardHtml`, `singleElimRoundCardHtml`): baseline 46 → 27 extra declarations in 27 functions |

Each engine step (2.1–2.7) moves functions with the pattern in docs/TESTING.md ("Moving a function into app/engine"): one branch each, stacked, golden files byte-identical.

## Phase 3+: needs the planning meeting 🗣

- Action-based sync, server as the official copy (Durable Object per tournament), offline queue
- Logins and permissions (see "Login and permissions: proposal" below), rate limits, remove passwords from links
- Environments: `dev.tournaments.hawaiikendofederation.org` / `tournaments.hawaiikendofederation.org`, deploy freeze while Ready/Live
- Backups and replacing Save/Load (see below)
- Control desk (court queues, move/reorder, holds, running-late, guarded bracket edits)
- Match timer, shinpan rotation (livestream overlay: 1.4)
- HKF-wide people/dojo registry (D1); minors' data policy
- Gradual React/TypeScript for new screens (groundwork: M.1–M.8 above)

### Login and permissions: proposal (for the meeting)

Today: one shared staff password per tournament (4 characters minimum), stored as an unsalted SHA-256 hash in the Durable Object, sent with every save (`x-ksm-session-key`) and kept in `sessionStorage`; no limit on login attempts; the login is a browser `prompt()` (some embedded/kiosk browsers block it, e.g. the Claude browser pane).

Two separate questions: **who are you** (authentication) and **what may you do** (authorization, always checked by the Worker on every write; the UI only hides what a role can't use).

| Who | Authentication | Authorization |
|---|---|---|
| Directors / admins (a few HKF people) | **Cloudflare Access** (email one-time code or Google; free for a small team, confirm limits). Cloudflare sets the `CF_Authorization` cookie and forwards a signed token (`Cf-Access-Jwt-Assertion`); the Worker verifies it against the account's Access public keys | KSM's own per-tournament role list in the Durable Object (Access knows who, not "directs this tournament") |
| Court tablets | **Device pairing** in KSM: the director shows a short code / QR, the tablet exchanges it for its own token (tournament + court), revocable, expires after the event | The token's scope: that tournament, that court; can't edit Setup or score another court |
| Spectators / TVs | None | Read-only (or the visibility the meeting decides) |

- The front end calls `GET /api/me?tournament=<id>` → `{ email, role, court }` and shows the views for that role; every save is re-checked by the Worker.
- Access protects hostnames/paths (e.g. admin paths), not tournaments, so it pairs with M.9 path URLs; it needs the app on a domain in the HKF-owned Cloudflare account (hosting decision first).
- Offline/PWA: when an Access session expires, API calls are redirected to Cloudflare's login page; the app must detect it and show "sign in again", the service worker must never cache that page as the app, and work scored meanwhile stays queued (outbox, F6) until sign-in.
- Useful now, whatever is chosen: an in-app login dialog instead of `prompt()`, a limit on login attempts, a salted slow hash (PBKDF2 in Workers), a short-lived session token instead of the password on every save.

### Backups and replacing Save/Load (for the meeting)

Today the only cloud storage is one Durable Object per tournament (`TournamentState`, SQLite); there is no automatic backup, and docs/CLOUD_OPERATIONS.md asks staff to download a `.ksm` file before the event. Proposal: backups happen by themselves, and Save/Load leaves the main navigation.

1. **Version history in the tournament's Durable Object**: restore points as SQLite rows at generation, end of pools, each bracket stage and the final, plus the last N saves. A director picks one and restores it (e.g. "before Regenerate Single Division"). Lost if the object itself is reset or deleted, so not a backup on its own.
2. **Cloudflare point-in-time recovery** of SQLite-backed Durable Objects (currently about 30 days; confirm limits): whole-object restore for disasters, operated by an admin.
3. **Off-object copies in R2** (new bucket binding, e.g. `KSM_BACKUPS`): the Worker writes a JSON export at each stage point and a final archive (`tournaments/<id>/<stage>-rev<N>.json`), with lifecycle retention. Survives an object reset, a bad deploy or a bad save. Restore = admin import into a new or existing tournament; practise it (restore drill) before the first event that relies on it.
4. **Outside Cloudflare**: the final archive (with the program, 1.7) downloadable or sent elsewhere, in case of account-level loss.

Then: **Export / Import tournament** stays as a deliberate admin tool (Setup / Director), not the main nav; the **recovery file** becomes a Developer Tools diagnostic once action-based sync removes conflict losses; for events with no internet at all, devices keep queued work in IndexedDB (local-first) instead of anyone passing files around (today's outbox holds only one snapshot). The 0.5 guard is needed until then.

## After the meeting: publishing plan

Everything stays local until the planning meeting. If the plan is agreed:

1. The owner creates `develop` on GitHub from `main`.
2. The local branches are pushed and opened as two pull requests into `develop`, each a contiguous slice of the stack (no history rewriting): **PR 1, tests and bug fixes** (`test-baseline` … `test/convert-source-checks`: test suite, 0.1–0.4, test hooks, e2e, F1, converted grep checks; `develop` already holds the first part) together with `fix/pre-event` (0.5, M.12, F2–F4) reviewed in the same batch; **PR 2, Vite, TypeScript and React** (`refactor/vite-typescript` … `feat/react-court-screen`: build and types, React foundation, overlay, engine modules, F6, the React court screen, and any M.13 screens converted before the meeting). `fix/pre-event` sits on top of PR 2's tip, so it merges after it.
3. Review, possibly by the creator's AI agent; CI runs `npm test` on every PR.
4. `main` only moves at release points: `develop` is merged into `main` after sign-off.

## Findings

> **Numbering clash:** F5 is used twice — on this branch line (`refactor/engine-*`: team-format default, below) and on `fix/setup-edit-conflict-merge` (restructuring edits). Renumber one of them when the branches are merged.

Bugs found by tests and not fixed yet. Each one is pinned by a test that expects the current (wrong) behaviour, so the test fails once the bug is fixed; then update the test and mark the finding fixed here.

| # | Finding | Found by | Reproduction | Status |
|---|---|---|---|---|
| F1 | A reloaded device stopped on a blocking **"Restore autosaved tournament?"** confirm before it loaded the cloud copy. On a TV display nobody is there to answer, so a power cut or browser restart left the TV frozen on the dialog. The prompt was also useless for link devices: the cloud load replaced whatever it restored. | `e2e-full-tournament-test.py` (TV power-cycle checkpoint) | Open a TV link (`/?role=spectator&tournament=<id>&court=A&view=tv`), wait for the display, reload. Fixed in `fix/tv-reload-restore-prompt`: devices opened from a tournament link skip the prompt; unsynced staff work is queued in the outbox (also at page unload), survives the read-only reload and is merged into the cloud copy when staff logs in again. Pinned by `reload-restore-test.py` and the e2e TV/spectator reloads. A plain start (no link) still offers the autosave. | ✅ fixed |
| F2 | When the last match of a court's division is completed, the court screen switches to the division-complete panel and hides the whole action row, including **Undo**. A wrong final result (last pool bout, final) can no longer be undone on that court, although the undo history is still there. | `court-actions-test.py` (expected-failure check: Undo enabled but not visible); kept by the React court screen (M.8), pinned by `golden-court-screen-test.py` | Play a division to the end on its court, press Next Match on the last match: the Undo button disappears (`.scoreboard-card.division-complete .bottom-action-row{display:none}`), while `undo()` would still reopen the match. | ⏳ open |
| F3 | A scorekeeper who opened a plain tournament link (`/?tournament=<id>`) and chose **Court B** in the Courts menu comes back on **Court A** after a reload. The pinned court is stored under a key that includes the session role (staff before the reload, spectator after it), and the link boot defaults the court to A. | `sync-saving-test.py` (expected-failure check) | Open `/?tournament=<id>`, Staff Login, Courts → Court B, reload, open the court screen: it shows Court A. A link with `&court=B` is restored correctly. | ⏳ open |
| F4 | A Setup/Registration edit made while a court is scoring is silently lost when the two saves conflict: the 409 rebase keeps the server copy and replays only court actions, so the director's field reverts and the change never reaches the cloud. | `sync-remote-updates-test.py` (expected-failure check) | Director on Setup, Court B scores a point, about 1 s later the director renames the tournament and tabs out: after both saves the server and the director's field still show the old name. | ⏳ open |
| F5 | With no team format saved, the engine defaults to **5-Person** (`DEFAULT_SETTINGS`), while a new Setup form shows **3-Person**. Harmless: saving Setup stores the shown value, so the default only applies to data saved without one. Noted in `refactor/engine-pools`; no test pins it. | review of `app/engine/settings.ts` | New tournament, do not save Setup: engine settings read team format 5-Person while the form shows 3-Person. | ℹ️ note |
| F6 | Staff work queued on a scorekeeper device before a reload could be **silently lost** after Staff Login, depending on when the live connection came back: (a) a point scored before the socket opened (its opening sends the queue) was overwritten by the flushed copy, which replayed only actions taken *while* the flush was in flight; (b) a save that finished before the flush (e.g. the socket opened while it was in flight) succeeded without the queued work and cleared the queue, because after a link reload the queued work exists only in the outbox. Slow venue Wi-Fi makes both real; on the test machine they showed up as a `reload-restore-test.py` flake under load. | `reload-restore-test.py` (flake) | After a reload with queued work, log in and (a) score before the socket opens, or (b) let the socket open while another save is in flight (the test holds the socket shut, then releases it). Fixed in `fix/outbox-flush-local-changes`: at Staff Login the queued court actions are replayed onto the current copy (`mergeQueuedStaffWork`, the 409 rebase), so every save carries them; the flush rebases whenever the device has unconfirmed local changes. Each part is pinned deterministically by its own section of `reload-restore-test.py`. | ✅ fixed |
