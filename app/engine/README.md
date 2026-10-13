# app/engine — the tournament engine

Strict TypeScript, no DOM, no `state`, no globals. The build turns `index.ts` into the classic
`window.KSMEngine` script that loads before `app.js`. `app/react/` imports the modules directly.
Import from `index.ts` only: it is the public API.

## Modules

| Module | What it does |
|---|---|
| `settings.ts` | `TournamentSettings` and `readSettings(setup)`, which applies the engine's historical defaults |
| `pools.ts` | Pool sizes, dojo spreading (`clubGroup`), seeded pool building, slot letters, pool match order and Match Objects |
| `standings.ts` | Winner helpers (`winnerOf`, `matchRequiresWinner`, snapshot validity), pool standings, tiebreak groups, stats and matches |
| `championship.ts` | Championship templates (6–40), labels and rounds, courts, nodes and Match Objects, seed resolution, the advancement plan (`syncChampionshipTemplate`) and individual placements |
| `single-elim.ts` | Individual single elimination: seed placement, nodes and Match Objects, the advancement plan (`syncIndividualSingleElim`) and side labels |
| `teams.ts`, `kachinuki.ts` | Team bouts (3/5-person, kachinuki), bracket templates (2–32, also used for individual SE), the bracket advancement plan, pairing winners, the representative playoff, the kachinuki next bout, round-robin standings and placements |
| `integrity.ts` | Completed-result snapshot, the load-time repair plan (restore / re-open / create), the elimination-repair plan, duplicate individual match removal, match identity for sync (`matchSyncIdentity`, `matchHasSyncIdentity`) |
| `generation.ts` | Eligibility (`eligibleIndividuals`, `eligibleTeams`) and `generateDivision(input)`: the pools, templates, nodes and Match Objects for one division in any format |
| `divisions.ts` | Division renames (#25): the rules (`divisionRenameError`: trimmed, non-empty, unique ignoring case, not the team event, nothing after the draw), the rewrite (`renamedDivisionState`), presets followed through their renames (`presetNames`) and the save-conflict replay (`rebaseDivisionRenames`) |
| `routes.ts` | Not tournament logic, but pure and shared the same way: the path URL scheme (M.9). `resolveUrl(pathname, search)` (a path's route, or an old `?tournament=…` link's path to redirect to), `routePath`/`routeUrl` (the links the app generates), `legacyQuery` (the old link parameters for the classic code that still reads them), `servesAppShell`/`servesOverlay` (which page a path gets) |

## Pure/legacy boundary

Engine functions take plain data (matches, pools, nodes, settings) and **return new values or
a plan** (`{ updates, winners, added, missing, repairs, … }`). They never change their inputs.
The only exception is the pool objects that `generateDivision` creates itself: it sets `court`
on them. Each moved legacy function in `app/js` keeps its name and position. Its body is a
marked `engine-bridge` delegation that reads `state`, calls `KSMEngine.*`, and writes the result
back. Settings come from `tournamentSettings()`.

These parts are still in `app/js`, and why:

- **Applying plans to `state`** (the `engine-bridge` wrappers): the legacy UI and sync code share one mutable `state`, and Match Object identity has to be preserved.
- **Orchestration that combines several state reads**: `generateDivisionState` writes the plan and then runs the advancement syncs, which need standings, court modes and existing matches. The same applies to `maybeAdvance*`, `maybeCreateTiebreaks`, `appendApprovedDynamicMatches`, applying no-shows and `regenerateSingleDivision`.
- **Queue and court selection**: `sortTeamMatches`, `sortIndividualDivisionMatches`, `nextIndexForCourt`, `matchBelongsToCourt` and `setActiveDivision` read local court and view state. That state gets split out in 2.8.
- **Scoring actions** (`point()`, `nextMatch()`, undo/history) and **sync/persistence** (rebase, autosave, load/sanitize): these are tied to local storage, the network and the device session.
- **Validation dialogs, alerts, logging and all HTML rendering** (results, brackets, pools, TV).

For a new screen such as the React court screen (M.8), read the tournament record, call the
engine for derived data (standings, winners, placements, identities), and send changes as the
same actions the legacy court uses. Don't re-implement any of these rules in the UI.
