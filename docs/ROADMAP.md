# KSM roadmap and task list

Every task is done on its own branch and must pass `npm test`. Phase 0 branches are stacked (each starts from the previous one) because they all update golden snapshots; merge them in order.
Golden snapshot changes (`tests/golden/engine/*.json`) are reviewed in the diff and explained in the commit.

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
| M.4 | Convert the source-grep checks that nothing else covers into behaviour/layout tests | `test/convert-source-greps` | ⏳ | List in docs/TESTING.md; must land before M.5. Start with undo/redo, hansoku, fusen-gachi, offline outbox, roles |
| M.5 | Vite + TypeScript build; split `index.html` into modules with no behaviour change | `refactor/vite-typescript` | ⏳ | Golden files byte-identical; e2e and test-ids tests unchanged; retire `function-override-baseline` |
| M.6 | React pilot: the court (scorekeeper) screen | `feat/react-court-screen` | ⏳ | Keeps every court test ID; e2e-full and test-ids-test must pass unchanged |

## Phase 1: small scorekeeper improvements

| # | Task | Branch | Status | Notes |
|---|---|---|---|---|
| 1.1 | Court automatically moves to the next division with ready matches | `feat/court-auto-advance` | ⏳ | Today the scorekeeper switches by hand when a division ends |
| 1.2 | Preset per-court division running order in Setup | `feat/court-running-order` | ⏳ | Feeds 1.1 |

| 1.3 | One-click PDF download of print sheets (today: browser Print → Save as PDF) | `feat/pdf-export` | ⏳ | e.g. to email sheets to dojos before the event |

## Phase 2: groundwork for sync redesign (no user-visible change)

| # | Task | Branch | Status | Notes |
|---|---|---|---|---|
| 2.1 | Extract the tournament engine into a shared module | `refactor/engine-module` | ⏳ | Golden tests must stay identical |
| 2.2 | Engine stops reading DOM inputs (team format etc.); settings move into tournament data | `refactor/engine-settings` | ⏳ | |
| 2.3 | Separate device/screen state from shared tournament data | `refactor/local-view-state` | ⏳ | |
| 2.4 | Stable IDs for people and matches | `refactor/stable-ids` | ⏳ | Fixes name-change/duplicate-name risk |
| 2.5 | Remove duplicate function redeclarations | `refactor/dedupe-functions` | ⏳ | Ratchet: `function-override-baseline-test.mjs` |

## Phase 3+: needs the planning meeting 🗣

- Action-based sync, server as the official copy (Durable Object per tournament), offline queue
- Logins/sessions, court device pairing, rate limits (remove passwords from links)
- Environments: `dev.tournaments.hawaiikendofederation.org` / `tournaments.hawaiikendofederation.org`, deploy freeze while Ready/Live
- Backups: R2 exports by tournament stage, final archives, restore drill
- Control desk (court queues, move/reorder, holds, running-late, guarded bracket edits)
- Match timer, livestream overlay, shinpan rotation
- HKF-wide people/dojo registry (D1); minors' data policy
- Gradual React/TypeScript for new screens (groundwork: M.1–M.6 above)

## Findings

Bugs found by tests and not fixed yet. Each one is pinned by a test that expects the current (wrong) behaviour, so the test fails once the bug is fixed; then update the test and mark the finding fixed here.

| # | Finding | Found by | Reproduction | Status |
|---|---|---|---|---|
| F1 | A reloaded device stops on a blocking **"Restore autosaved tournament?"** confirm before it loads the cloud copy. On a TV display nobody is there to answer, so a power cut or browser restart leaves the TV frozen on the dialog; the local autosave is also pointless for a device opened from a cloud link. | `e2e-full-tournament-test.py` (TV power-cycle checkpoint; expected-failure check on `tv.seen_dialogs`) | Open a TV link (`/?role=spectator&tournament=<id>&court=A&view=tv`, from TV → Court A TV), wait for the display, reload the page. `restoreAutoSaveIfWanted()` runs at startup whenever `localStorage` holds an autosave. Same on spectator and scorekeeper devices. | ⏳ open |
