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

Nothing has been pushed to GitHub yet; `main` is unchanged from the original repository.

Status: ✅ done · 🔨 in progress · ⏳ ready to start · 🗣 needs a decision from the planning meeting first

## Phase 0: bug fixes (before the next tournament)

| # | Task | Branch | Status | Notes |
|---|---|---|---|---|
| 0.1 | Tiebreak standings show the tiebreak-match record instead of the pool record | `fix/tiebreak-standings` | ✅ | Order was already correct; only the numbers shown were wrong |
| 0.2 | Round robins with 3–5 players never finish or show placements; **5 entrants silently dropped one competitor** | `fix/small-round-robin-results` | ✅ | Placements from final pool standings (tiebreaks for places 1–3); 5 entrants → one pool of 5. Confirm the rule with HKF |
| 0.3 | Red/White side setting for court screen and printed sheets | `feat/court-side-setting` | ✅ | Per court in Setup → Referees, from the scoring table's view; synced to all devices. Default unchanged. TV (audience view) not affected |
| 0.4 | HTML injection through names in inline click handlers | `fix/inline-handler-escaping` | ✅ | Security; no visible change. `jsArg()` for all handler string arguments |

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
| M.8 | React court (scorekeeper) screen | `feat/react-court-screen` | 🔨 | Keeps every court test ID; e2e-full and test-ids-test must pass unchanged. Island by island inside the legacy page (plan below). Steps 1–2 done: the match display, the header |
| M.9 | Path URLs for screens instead of query parameters (e.g. `/t/<id>/court/a`) | `feat/path-urls` | ⏳ | After M.8. Old `?tournament=…&court=…` links keep working (redirect); offline service worker and Cloudflare serve the app for the new paths. Plan below |

### M.8 React court screen: plan

The court screen moves to React one island at a time inside the legacy page (`app/react/court/`, loaded by `index.html` as one module script after `app.js`). Each island renders the same elements, classes, ids and test IDs as the markup it replaces, so the court CSS (incl. the Red/White side setting), every court test and the layout tests apply unchanged; a parity test runs the legacy and React renderers side by side. The legacy code keeps choosing the court's match and running the actions (`point()`, `nextMatch()`, undo/redo) until the last island is in; then the legacy court renderer is deleted. When the module does not load, the legacy renderer keeps drawing everything.

1. ✅ Match display (`#score .scoreboard-match`: names, dojos, points, hansoku, team-playoff representative picker). `renderScore()` publishes the match (`ksm:court-scoreboard`) instead of writing those elements (`app/js/35-react-court.js`). Pinned by `court-scoreboard-parity-test.py` + unit tests.
2. ✅ Header (`#score .scoreboard-header`: tournament name, court title, division select and its options, division title, match line). `updateScoreTournamentName()`, `renderDivisions()` and `renderScore()` publish their fields (`ksm:court-header`); the legacy code keeps the selection rules and `matchDisplayMeta()`. Pinned by `court-scoreboard-parity-test.py` + unit tests.
3. Score buttons and action row (Undo/Redo labels, Next Match, Fusen-gachi dialog), still calling the legacy actions; fixes F2 (Undo hidden when a division completes) as part of the rewrite.
4. Queue and context panels (`renderQueue`/`renderContext`: pools, bracket, team rounds), from `app/engine/` data.
5. Division-complete panel; remove the legacy court renderer, its redeclarations (2.10 ratchet) and the parity test.

### M.9 Path URLs: plan

Today every screen is one page driven by query parameters (`/?tournament=<id>&court=A`, `&role=spectator&view=tv` for a TV); only the stream overlay has a path (`/overlay`). After M.8, move to path URLs, for example `/t/<id>/court/a`, `/t/<id>/tv/a`, `/t/<id>/live`, `/t/<id>/overlay/a`. Routing is its own step, not part of the React conversion. To handle:

- **Existing links**: TV, court and overlay links are copied onto devices before an event. Old query links must keep working, most likely by redirecting to the new path.
- **Offline**: the service worker serves only `/` and `/index.html` as the app shell and sends every other navigation to the network. It must serve the app for the new paths, or an offline court device gets nothing.
- **Hosting**: Cloudflare must answer the new paths with the app, as it maps `/overlay` to `overlay.html` today.
- **Passwords in links** (Phase 3: logins, device pairing): design the URL scheme together with that, so links change only once.
- **Tests**: `KsmApp.open_device` paths, the TV/overlay link tests and `e2e-full` use the query links; add the new paths and keep one check that the old links still work.

## Phase 1: small scorekeeper improvements

| # | Task | Branch | Status | Notes |
|---|---|---|---|---|
| 1.1 | Court automatically moves to the next division with ready matches | `feat/court-auto-advance` | ⏳ | Today the scorekeeper switches by hand when a division ends |
| 1.2 | Preset per-court division running order in Setup | `feat/court-running-order` | ⏳ | Feeds 1.1 |
| 1.3 | One-click PDF download of print sheets (today: browser Print → Save as PDF) | `feat/pdf-export` | ⏳ | e.g. to email sheets to dojos before the event |
| 1.4 | Livestream overlay page | `feat/react-overlay` | ✅ | The first React page (M.6). See below; a real live-stream test is still to do |

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
| 2.10 | Remove duplicate function redeclarations | `refactor/dedupe-functions` | ⏳ | Ratchet: `function-override-baseline-test.mjs` |

Each engine step (2.1–2.7) moves functions with the pattern in docs/TESTING.md ("Moving a function into app/engine"): one branch each, stacked, golden files byte-identical.

## Phase 3+: needs the planning meeting 🗣

- Action-based sync, server as the official copy (Durable Object per tournament), offline queue
- Logins/sessions, court device pairing, rate limits (remove passwords from links)
- Environments: `dev.tournaments.hawaiikendofederation.org` / `tournaments.hawaiikendofederation.org`, deploy freeze while Ready/Live
- Backups: R2 exports by tournament stage, final archives, restore drill
- Control desk (court queues, move/reorder, holds, running-late, guarded bracket edits)
- Match timer, shinpan rotation (livestream overlay: 1.4)
- HKF-wide people/dojo registry (D1); minors' data policy
- Gradual React/TypeScript for new screens (groundwork: M.1–M.8 above)

## After the meeting: publishing plan

Everything stays local until the planning meeting. If the plan is agreed:

1. The owner creates `develop` on GitHub from `main`.
2. The local branches are pushed and opened as pull requests into `develop`, in Branch-log order (each builds on the one before). They can be grouped into a few PRs: tests (`test-baseline`, `feat/test-hooks`, `test/full-tournament-e2e`, `test/convert-source-checks`), bug fixes (`fix/…`, `feat/court-side-setting`), test infrastructure, and the refactor (`refactor/vite-typescript`).
3. Review, possibly by the creator's AI agent; CI runs `npm test` on every PR.
4. `main` only moves at release points: `develop` is merged into `main` after sign-off.

## Findings

> **Numbering clash:** F5 is used twice — on this branch line (`refactor/engine-*`: team-format default, below) and on `fix/setup-edit-conflict-merge` (restructuring edits). Renumber one of them when the branches are merged.

Bugs found by tests and not fixed yet. Each one is pinned by a test that expects the current (wrong) behaviour, so the test fails once the bug is fixed; then update the test and mark the finding fixed here.

| # | Finding | Found by | Reproduction | Status |
|---|---|---|---|---|
| F1 | A reloaded device stopped on a blocking **"Restore autosaved tournament?"** confirm before it loaded the cloud copy. On a TV display nobody is there to answer, so a power cut or browser restart left the TV frozen on the dialog. The prompt was also useless for link devices: the cloud load replaced whatever it restored. | `e2e-full-tournament-test.py` (TV power-cycle checkpoint) | Open a TV link (`/?role=spectator&tournament=<id>&court=A&view=tv`), wait for the display, reload. Fixed in `fix/tv-reload-restore-prompt`: devices opened from a tournament link skip the prompt; unsynced staff work is queued in the outbox (also at page unload), survives the read-only reload and is merged into the cloud copy when staff logs in again. Pinned by `reload-restore-test.py` and the e2e TV/spectator reloads. A plain start (no link) still offers the autosave. | ✅ fixed |
| F2 | When the last match of a court's division is completed, the court screen switches to the division-complete panel and hides the whole action row, including **Undo**. A wrong final result (last pool bout, final) can no longer be undone on that court, although the undo history is still there. | `court-actions-test.py` (expected-failure check: Undo enabled but not visible) | Play a division to the end on its court, press Next Match on the last match: the Undo button disappears (`.scoreboard-card.division-complete .bottom-action-row{display:none}`), while `undo()` would still reopen the match. | ⏳ open |
| F3 | A scorekeeper who opened a plain tournament link (`/?tournament=<id>`) and chose **Court B** in the Courts menu comes back on **Court A** after a reload. The pinned court is stored under a key that includes the session role (staff before the reload, spectator after it), and the link boot defaults the court to A. | `sync-saving-test.py` (expected-failure check) | Open `/?tournament=<id>`, Staff Login, Courts → Court B, reload, open the court screen: it shows Court A. A link with `&court=B` is restored correctly. | ⏳ open |
| F4 | A Setup/Registration edit made while a court is scoring is silently lost when the two saves conflict: the 409 rebase keeps the server copy and replays only court actions, so the director's field reverts and the change never reaches the cloud. | `sync-remote-updates-test.py` (expected-failure check) | Director on Setup, Court B scores a point, about 1 s later the director renames the tournament and tabs out: after both saves the server and the director's field still show the old name. | ⏳ open |
| F5 | With no team format saved, the engine defaults to **5-Person** (`DEFAULT_SETTINGS`), while a new Setup form shows **3-Person**. Harmless: saving Setup stores the shown value, so the default only applies to data saved without one. Noted in `refactor/engine-pools`; no test pins it. | review of `app/engine/settings.ts` | New tournament, do not save Setup: engine settings read team format 5-Person while the form shows 3-Person. | ℹ️ note |
| F6 | Staff work queued on a scorekeeper device before a reload could be **silently lost** after Staff Login, depending on when the live connection came back: (a) a point scored before the socket opened (its opening sends the queue) was overwritten by the flushed copy, which replayed only actions taken *while* the flush was in flight; (b) a save that finished before the flush (e.g. the socket opened while it was in flight) succeeded without the queued work and cleared the queue, because after a link reload the queued work exists only in the outbox. Slow venue Wi-Fi makes both real; on the test machine they showed up as a `reload-restore-test.py` flake under load. | `reload-restore-test.py` (flake) | After a reload with queued work, log in and (a) score before the socket opens, or (b) let the socket open while another save is in flight (the test holds the socket shut, then releases it). Fixed in `fix/outbox-flush-local-changes`: at Staff Login the queued court actions are replayed onto the current copy (`mergeQueuedStaffWork`, the 409 rebase), so every save carries them; the flush rebases whenever the device has unconfirmed local changes. Each part is pinned deterministically by its own section of `reload-restore-test.py`. | ✅ fixed |
