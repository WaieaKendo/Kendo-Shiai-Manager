# KSM roadmap and task list

Every task is done on its own branch off `test-baseline` and must pass `npm test`.
Golden snapshot changes (`tests/golden/engine/*.json`) are reviewed in the diff and explained in the commit.

Status: ✅ done · 🔨 in progress · ⏳ ready to start · 🗣 needs a decision from the planning meeting first

## Phase 0: bug fixes (before the next tournament)

| # | Task | Branch | Status | Notes |
|---|---|---|---|---|
| 0.1 | Tiebreak standings show the tiebreak-match record instead of the pool record | `fix/tiebreak-standings` | ⏳ | Order was already correct; only the numbers shown were wrong |
| 0.2 | Round robins with 3–5 players never finish or show placements | `fix/small-round-robin-results` | ⏳ | Default: place from final pool standings. Confirm the rule with HKF |
| 0.3 | Red/White side setting for court screen and printed sheets | `feat/court-side-setting` | ⏳ | Per-device setting; default unchanged (White left) |
| 0.4 | HTML injection through names in inline click handlers | `fix/inline-handler-escaping` | ⏳ | Security; no visible change |

## Phase 1: small scorekeeper improvements

| # | Task | Branch | Status | Notes |
|---|---|---|---|---|
| 1.1 | Court automatically moves to the next division with ready matches | `feat/court-auto-advance` | ⏳ | Today the scorekeeper switches by hand when a division ends |
| 1.2 | Preset per-court division running order in Setup | `feat/court-running-order` | ⏳ | Feeds 1.1 |

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
- Gradual React/TypeScript for new screens
