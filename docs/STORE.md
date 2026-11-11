# The store: plan for moving `state` into Redux Toolkit (#15 step 2.8)

Status (2026-11-11): **foundation only**. `app/store/` holds an empty Redux Toolkit store (slices `tournament` and
`device`, each with only a `sliceVersion`); nothing reads or writes it yet. All app data is still the one mutable
global `state` (`app/modules/app-state.js`). This document is the inventory of that object and the order in which
its fields move into the store. Decision: Redux Toolkit (issue #15, 2026-10-18); see ROADMAP.md "After the React
screens: the remaining architecture".

Rules that hold for every step: each PR is green with **every golden unchanged**; the saved formats (cloud
snapshot, autosave, outbox, `.ksm` file, `patch-v1` court actions) do not change unless a PR says so and the owner
agrees; reducers stay thin and call `app/engine`; actions are plain JSON and carry `meta` (who / when / device /
court, `app/store/meta.ts`).

## 1. What is in `state` today

Every field of `state` goes into **all three saved copies**: `tournamentPayload()`
(`app/modules/sync/cloud-session-and-autosave.js`) is `JSON.parse(JSON.stringify(state))` plus the Setup form, and
the cloud save, the autosave (`localStorage`), the outbox and the file export (`tournamentFilePayload()`) all use
it. The device fields are only kept out on the way *in*: a court-action replay skips them
(`KSM_LOCAL_VIEW_STATE_KEYS` in `sync-state-and-rebase.js`), and `applyTournamentPayload()` restores this device's
`currentCourt` / `publicCourt` after replacing everything.

Counts are over `app/main.js` and `app/modules` (`git grep -P '\bstate\.FIELD\b'`): **refs** = all occurrences,
**writes** = assignments (`state.f… =`, `++`, `+=`) plus mutating calls (`push`, `splice`, `sort`, …) on that path,
**files** = files that mention it. Not counted: writes through an alias (`const m=state.allMatches[d]; m.done=true`,
about 30 more match-field writes in 5 files), and the whole-object writes listed under 1.3. In all, 52 files and
~960 `state.x` references.

Class: **T** tournament data (shared, synced), **D** device/screen state (this device only), **M** mixed today,
**–** dead.

### 1.1 Tournament data → `tournament` slice

| Field | Refs / writes / files | Who writes it | Notes |
|---|---|---|---|
| `divisions` | 46 / 8 / 11 | setup (division-setup), registration | Renames: one engine call (`renamedDivisionState`) rewrites `divisions`, `divisionTypes`, `divisionCourts`, `competitors` together: one action |
| `hiddenPresets` | 5 / 2 / 1 | setup (react-bridges/setup) | |
| `divisionTypes` | 18 / 7 / 9 | setup, registration | |
| `divisionCourts` | 57 / 26 / 18 | setup, registration, team divisions, grand champion, court order, generation, **sync** (load normalizes `'Both'`→`'split'`), `applySetupSnapshot` (`teamCourt`) | Most-written settings field; partly derived from the Setup form |
| `teamAwardMode` | 5 / 3 / 4 | setup, team divisions, `applySetupSnapshot` | Duplicates the Setup form field of the same name |
| `competitors` | 30 / 8 / 9 | registration (+ its React bridge, rows edited in place) | Three-way merged on save conflicts (`KSM_MERGED_STATE_KEYS`) |
| `teams` | 31 / 9 / 10 | registration | Merged by team id (#95) |
| `teamDivisions` | 12 / 2 / 6 | team divisions (load-time migration `migrateTeamDivisions`) | |
| `grandChampions` | 10 / 3 / 4 | grand champion | |
| `exhibitions` | 11 / 5 / 4 | registration | |
| `awards` | 8 / 4 / 3 | results (`ksmSetResultAward` edits a row in place) | |
| `generated` | 23 / 2 / 11 | generation, registration (clear) | |
| `managementRevision` | 14 / 7 / 5 | generation, pool edits, undo-regenerate, sync | Bumped by structural edits; the rebase compares it |
| `pools` | 36 / 7 / 13 | generation, pool editing | Structural (replayed per division on conflicts, `KSM_STRUCTURAL_DIVISION_KEYS`) |
| `teamPools` | 5 / 3 / 1 | generation | Structural |
| `brackets` | 18 / 5 / 5 | generation, pool editing | Structural |
| `championshipNodes` | 21 / 7 / 6 | generation, championship advancement | Structural |
| `singleElimNodes` | 33 / 7 / 9 | generation, single-elim advancement, split-court templates | Structural |
| `singleElimComps` | 18 / 4 / 7 | generation | Structural |
| `byeWinners` | 9 / 3 / 2 | generation | Structural |
| `teamBracketNodes` | 32 / 7 / 12 | generation, team matches | Structural |
| `teamElimTeams` | 19 / 8 / 4 | generation, team matches, sync (load default) | Structural |
| `allMatches` | 162 / 22 / 31 | court actions (scoring, Next Match, tiebreaks, playoffs), generation, every advancement sync, pool editing, sync apply/rebase, undo/redo | The core. Plus the alias writes on Match Objects. Legacy code relies on **Match Object identity** (the engine README's "identity has to be preserved") |
| Setup form (`payload.setup`, not in `state`) | — | `applySetupSnapshot()` writes DOM inputs; everything reads them back by element id (`getSetupSnapshot()`, `tournamentSettings()`) | Tournament data stored in the DOM. Moves into `tournament.settings` |

### 1.2 Device / screen state, mixed fields and dead fields

| Field | Class | Refs / writes / files | Who writes it | Target and why |
|---|---|---|---|---|
| `currentCourt` | M | 39 / 3 / 12 | court choice, `applyCourtState`, load (pinned court), `restorePinnedCourt` | **device**: the court this device scores or shows. Saved today but ignored on apply (pin wins) |
| `publicCourt` | M | 6 / 4 / 3 | court order, sync load (TV pin) | **device**: the court Live Scores / the TV follows |
| `currentDivision` | M | 38 / 3 / 15 | `applyCourtState`, load | **device**: the division this device's court screen shows. The rebase still reads it as a fallback (`localState.currentDivision`), from the payload copy, which keeps it |
| `poolViewDivision` | D | 6 / 2 / 2 | court order, generation | **device** |
| `regMode` | D | 5 / 1 / 4 | navigation (`regTab`) | **device** (open Registration tab) |
| `matches` | M | 23 / 7 / 11 | `applyCourtState` (`= state.allMatches[div]`), load | **neither: a selector.** It is an *alias* of `allMatches[currentDivision]` (writes through either name change both). Saved, so every snapshot carries one division's match list twice |
| `current` | M | 25 / 5 / 10 | `applyCourtState`, generation, load | **selector**: duplicates `courtState[currentCourt].index` |
| `score` | M | 45 / 15 / 8 | scoring (`point`, `hansoku`), `loadScoreFromMatch`, match timer | **device** working copy of the current match's points, copied into the match by `syncActiveScoreToMatch()`; ends as a selector over the match once court actions are actions |
| `courtState` | M | 33 / 12 / 12 | `applyCourtState`, Next Match, generation, setup, grand champion, sync load and rebase (`nextReadyIndexInState`) | **tournament**, per court: "what is on Court B now" is read by the TV, Live Scores and the other court; each court writes only its own entry, the rebase recomputes it |
| `courtActiveDivision` | M | 19 / 10 / 11 | same writers as `courtState` | **tournament**, and then a selector: it is `courtState[c].division` kept twice |
| `currentByDivision` | M | 13 / 9 / 5 | `applyCourtState`, generation, grand champion, sync | **tournament**: where each division's queue stands; synced and rebased (in `KSM_STRUCTURAL_DIVISION_KEYS` handling). Candidate to derive later |
| `courtActionHistory` | T | 19 / 7 / 4 | `performCourtAction`, undo/redo, rebase | **tournament**, per court: saved so a replacement tablet on the court can still undo; replayed by the rebase |
| `courtRedoHistory` | T | 16 / 8 / 2 | undo/redo, rebase | **tournament** with the history |
| `courtUndoLog` | T | 5 / 2 / 1 | undo/redo (F30 log the rebase replays) | **tournament** with the history |
| `history` | – | 3 / 3 / 3 | reset to `[]` only | **drop** (pre-`patch-v1` undo stack, always empty) |
| `contextMode` | – | 0 | initial value only | **drop** |
| `teamBracketState` | – | 0 | initial value only | **drop** |

### 1.3 Other mutable state

- **Whole-object writes to `state`** (the mechanism below must handle each): `applyTournamentPayload()` and the
  tournament switcher (`Object.keys(state).forEach(k=>delete state[k]); Object.assign(state, loaded)`); division
  rename (`Object.assign(state, renamedDivisionState(...))`, react-bridges/setup); the team-division migration
  (`Object.assign(state, migrateTeamDivisions(...))`); undo/redo `applyHistoryPatch()`, which walks a `patch-v1`
  path from `state` and writes in place; `historyComparableState()`, which deep-clones every key before and after a
  court action; grand champion removal (`state[key][c]`, `delete state[k][id]`).
- **Device state outside `state`** → `device` slice when a screen needs it reactive: `ksmLocalCourtDivision`
  (sync-state-and-rebase.js, the division per pinned court), the court pin (`sessionStorage`/`localStorage`),
  `KSM_TV_ASSIGNED_COURT`, the shell's open menu / dialogs, the pool editor draft, Registration row caches. Many of
  these are UI-only and can become React state instead.
- **Session and sync adapter state stays out of the store**: `cloudSession`, timers, the socket, the outbox, the
  mutation versions (`ksmLocalMutationVersion` / `ksmConfirmedMutationVersion`), `ksmApplyingRemoteSnapshot`,
  `KSM_CLOUD_BASE`, the undo-regenerate restore point. These are process state (timers, sockets, large snapshots),
  not data a screen draws; the sync adapter stays our own code (issue #15).

## 2. How legacy code and the store coexist

Redux Toolkit uses Immer, and Immer **freezes** what it produces, deeply, in the production build too (checked with
`immer.production.mjs`). Every app module is strict-mode ESM, so writing to a frozen object throws a `TypeError`.
Today ~50 files write `state.x` in place. The cutover:

1. **A field group moves all at once.** In one PR, the group's data moves into its slice, and `state` keeps the
   property as an **enumerable, non-configurable getter** over `getState()` (one helper in `app-state.js`, e.g.
   `moveToStore('regMode', s => s.device.regMode)`). Enumerable, so `JSON.stringify(state)` (the snapshot) and
   `Object.keys(state)` (`historyComparableState`) still see it and the saved formats do not change; no setter, so
   a missed `state.regMode = …` throws in tests instead of silently forking.
2. **Every write of that group becomes a dispatched action in the same PR.** The counts in section 1 are the
   checklist (plus the alias writes, found by reading each writer). A missed nested write (`state.awards[i].x = …`)
   throws because the object is frozen. Reads stay `state.x` until a later cleanup.
3. **Whole-object writes go through two helpers first** (the preparatory PR): `replaceState(loaded)` (load,
   remote apply, tournament switch) and `assignState(partial)` (rename, migrations). Each dispatches one action for
   the store-owned keys and assigns the rest. Without them, `delete state[k]` + `Object.assign` would remove a
   getter and put a plain copy in its place.
4. **A snapshot apply is one action**: `tournament/loaded` with the migrated, sanitized, repaired payload
   (`sanitizeLoadedTournamentState`, `normalizeAllIndividualPoolTiebreakOrder` and the migrations already work on
   a fresh JSON copy, so they run before the dispatch). It replaces the `tournament` slice and never touches
   `device`: what `KSM_LOCAL_VIEW_STATE_KEYS` and the pinned-court restore do by hand today. Repairs that call the
   rest of the app (`repairLoadedEliminationAdvancement`, `rehydrateLoadedTournamentState`) follow as their own
   actions.
5. **The rebase is unchanged.** `rebaseLocalPayloadOnRecord()` and the three-way merges work on payload copies
   (JSON), not the live object; their result is applied with the same `tournament/loaded`.
6. **Court actions, undo and redo.** `patch-v1` stays the saved format (old histories, the rebase, the outbox
   depend on it). When `allMatches` moves: a court action is an action whose reducer calls the engine, and its
   `patch-v1` entry is built from Immer's patches and inverse patches (`produceWithPatches`; the inverse patch gives
   each `before`) instead of deep-cloning the whole state twice. Undo and Redo become `court/undo` / `court/redo`,
   whose reducer applies the entry's patches (the same path walk as `applyHistoryPatch`, on the draft). The F30
   undo log and the match-op replay (`replayCourtMatchOps`) keep working on payloads.
7. **Saving.** Each converted writer keeps calling what it called before (`scheduleAutoSave`, `criticalAutoSave`,
   `ksmNotifyStateChanged`), so save timing and `ksmLocalMutationVersion` are unchanged. With the command layer, a
   store listener takes this over: a local action (not `tournament/loaded`) bumps the mutation version and
   schedules the save.

What must never happen (each PR's tests check the ones it touches):

- **A stale read after a dispatch.** `dispatch` is synchronous and `getState()` is new right after, but an object
  read *before* the dispatch is the old frozen copy. No code keeps a store object across a dispatch (e.g.
  `const cs = state.courtState[c]; dispatch(…); cs.index`); read again. `state.matches` is exactly this today (an
  alias), so it becomes a getter over `allMatches` / `courtState` before `allMatches` moves.
- **Legacy code mutating a frozen object.** It throws (good: loud), so every write must be found first; Match
  Object identity (`indexOf(match)`, objects kept across calls) must switch to `matchSyncIdentity()` / ids where it
  crosses a dispatch.
- **A remote apply losing a local unsent change.** The deferral (`localChangesPending()` → `deferRemoteRecord`)
  depends on the mutation version: every local store write must bump it (point 7) before a remote
  `tournament/loaded` can be dispatched, and `tournament/loaded` must never be applied while changes are pending
  without the rebase.
- **Device state from another device.** No `device` field is ever filled from a payload, and the per-court entries
  of the other court come only from the server.
- **Two stores.** The React bundle is separate from app.js, so it must use `window.KSMStore`, never import
  `app/store/store.ts` (that would make a second, empty store).

## 3. Order of the PRs

Each line: fields → actions; risk; tests to add. Every PR keeps every golden unchanged.

1. **Foundation** (this PR): empty store, metadata helper, island hook, `window.KSMStore`, this plan. Risk: none
   (no consumers). Tests: `tests/store/*.test.mjs`.
2. **Prep, no field moves**: `replaceState()` / `assignState()` helpers for the whole-object writes in 1.3; the
   `moveToStore()` getter helper (unused); a test that every `state` key is a plain property or a store getter.
   Risk: low (the load path). Tests: load / remote apply / tournament switch / rename unchanged (existing sync and
   rename tests), helper unit tests.
3. **Device, first fields**: `regMode`, `poolViewDivision` → `device/registrationTabChanged`,
   `device/poolViewDivisionChanged`. Risk: low (few writers, ignored by the rebase). Tests: getter throws on write;
   snapshot JSON byte-identical; Registration tab / Pools goldens.
4. **Device, court view**: `currentCourt`, `publicCourt`, `currentDivision`, plus `ksmLocalCourtDivision` →
   `device/courtChosen`, `device/publicCourtChanged`, `device/divisionShown`. Risk: medium (pinned court, TV
   follow, the rebase fallback reads the payload copy). Tests: v31711 pinned court, v31719 TV follow, court and TV
   goldens.
5. **Derive `matches` and `current`**: getters over `allMatches[courtState[currentCourt].division]` and
   `courtState[…].index`; drop their assignments. `score` → `device.activeScore[court]` with
   `device/scoreChanged`. Risk: medium-high (scoring path, the alias). Tests: court-actions, timer, scoreboard
   goldens; snapshot still carries `matches`/`current` (from the getters) until the owner decides (open question 1).
6. **Settings**: the Setup form (`payload.setup`) → `tournament.settings`; `applySetupSnapshot` becomes
   `tournament/settingsLoaded`, field edits `tournament/settingChanged`; inputs render from the store;
   `teamAwardMode` and the `teamCourt` part of `divisionCourts` read settings. Risk: medium (DOM reads by id in many
   places, `tournamentSettings()`). Tests: setup goldens, edit-conflicts (Setup fields merge), print.
7. **Divisions**: `divisions`, `divisionTypes`, `divisionCourts`, `hiddenPresets` → `tournament/divisionAdded`,
   `…Removed`, `…Renamed` (calls `renamedDivisionState`), `…FormatChanged`, `…CourtChanged`, `presetsRestored`.
   Risk: medium (`divisionCourts` has 26 writes). Tests: divisions engine tests, rename conflict tests, setup goldens.
8. **People**: `competitors`, `teams`, `exhibitions`, `teamDivisions` → `tournament/competitorAdded`, `…Updated`,
   `…Removed`, `…StatusCycled`, team and exhibition equivalents, `teamDivision…`. Risk: medium (rows edited in
   place by the Registration bridge). Tests: registration goldens, the #95 merge tests.
9. **Awards and grand champion**: `awards`, `grandChampions` → `tournament/awardSet`, `grandChampion…`. Risk:
   low-medium. Tests: results goldens, grand champion tests.
10. **Structure**: `pools`, `teamPools`, `brackets`, `championshipNodes`, `singleElimNodes`, `singleElimComps`,
    `byeWinners`, `teamBracketNodes`, `teamElimTeams`, `generated`, `managementRevision` →
    `tournament/divisionGenerated` (the engine's `generateDivision` plan), `…Regenerated`, `poolsEdited`,
    advancement plans as `tournament/advancementApplied`. Risk: high (orchestration, `generateDivisionState`).
    Tests: golden-engine, pool-edit and regenerate tests, undo-regenerate.
11. **Matches and courts**: `allMatches`, `courtState`, `courtActiveDivision` (→ selector), `currentByDivision`,
    `courtActionHistory`, `courtRedoHistory`, `courtUndoLog` → `court/pointScored`, `court/hansoku`,
    `court/nextMatch`, `court/undo`, `court/redo`, tiebreak/playoff creation, `patch-v1` from Immer patches. Risk:
    highest. Tests: court-actions, concurrent rebase (v31712, v31715), edit-conflicts, e2e full tournament, all
    goldens; time a point on the oldest TV/tablet.
12. **`state` retired**: drop the dead fields (`history`, `contextMode`, `teamBracketState`; with a load-time drop,
    owner OK on the format), `app-state.js` keeps only the getters until the reads are converted, then goes;
    `ksm:state-changed` → `store.subscribe`.

Then **#15 step 3, commands**: one function per user action (`scorePoint`, `nextMatch`, `undo`, `editPool`, …) that
checks it is allowed, builds the action with `meta`, and dispatches; inline `onclick` globals and the React islands
call commands instead of window functions.

## 4. How the React islands read the store

- The islands stay separate roots with **no Provider**. They read with `useStoreSelector(selector)`
  (`app/store/react.ts`): `useSyncExternalStore` over `store.subscribe`, with the selector's result cached per state
  object and compared with `Object.is` (or a given equality), so a dispatch that does not change the selection does
  not re-render.
- The store instance is `window.KSMStore` (set by `app/main.js`; the islands are a separate Vite bundle, so this is
  the only way to share one instance). `app/store/react.ts` imports only React and types.
- Selectors are module-level functions; derived lists use `createSelector` (Reselect, already in RTK) keyed per
  division / court, so a point on Court A does not rebuild Court B's bracket.
- The `ksm:*` publishers go away screen by screen: today legacy code computes `window.ksmXInput` and dispatches
  `ksm:x` (`app/react/features/*/publish.ts`). Once the data a screen reads is in the store, its `*-model.ts` view
  functions (already pure) become selectors, and that screen's publisher, its event and its `ksmXRequested` flag
  are deleted. `useLegacyState` / `ksm:state-changed` go when `state` does. Screens that read the DOM Setup form
  wait for PR 6.

## 5. Bundle size and re-renders (old TVs and tablets)

- app.js bundles the store's packages from their **published production builds** (`STORE_PACKAGE_BUILDS` in
  `scripts/app-sources.mjs`): rolldown neither minifies nor tree-shakes app.js, and the default ESM builds would
  ship ~150 kB of development-only code, including RTK's immutability check (a deep walk of the whole state on
  every dispatch). `process.env.NODE_ENV` is defined as `"production"` for app.js. The Node tests import the
  default builds, so the serializable and immutability checks run there. Immer still freezes in production.
- Size of app.js: **620,664 → 686,660 bytes (+66.0 kB); gzip 157,744 → 178,631 (+20.9 kB)**. Nothing in the React
  bundle changes (it imports no store code yet; `react.ts` adds only React, which it already has).
- Re-renders: `store.subscribe` listeners run on every dispatch, so selectors must be cheap and return stable
  references. A remote snapshot is one action, one notification (today `ksmNotifyStateChanged` coalesces per
  microtask). Immer copies only the changed path (structural sharing); the deep freeze of a loaded snapshot is one
  O(size) pass per load.
- Check on the oldest TV/tablet before PR 11 (issue #15): time a point and a snapshot apply (`performance.now()` in
  the diagnostics panel).

## Open questions for the owner

1. **Device fields in the saved snapshot.** `currentCourt`, `publicCourt`, `currentDivision`, `poolViewDivision`,
   `regMode`, `score`, `current` and `matches` (a second copy of one division's whole match list) are saved today
   and ignored on load. Keep writing them until 4.0 devices no longer open 4.1 tournaments, or drop them when they
   move (smaller snapshots, a format change)?
2. **Redux DevTools**: off for now (`devTools: false`; tablets have no extension). Turn it on for `npm run dev`
   later if wanted.
