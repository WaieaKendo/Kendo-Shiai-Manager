# The store: plan for moving `state` into Redux Toolkit (#15 step 2.8)

Status (2026-11-11): **prep done (PR 2), no field moved yet**. `app/store/` holds a Redux Toolkit store (slices
`tournament` and `device`, each with only a `sliceVersion`). app.js imports it as a separate tree-shaken, minified
bundle (+7.9 kB gzip, section 5) and sets `window.KSMStore`; `app/modules/app-state.js` has the helpers the field
moves use (`moveToStore()`, `replaceState()`, `assignState()`, section 2). All app data is still the one mutable
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
it. The device fields are kept out on the way *in* only in part: a court-action replay in the rebase skips them
(`KSM_LOCAL_VIEW_STATE_KEYS` in `sync-state-and-rebase.js`), but a load (`applyTournamentPayload()`) puts the
whole payload into the live `state` (`Object.keys(state).forEach(k=>delete state[k]); Object.assign(state, loaded)`),
including the payload's `currentDivision`, `current`, `score`, `matches` and `courtState`. Then, on the live `state`:
`sanitizeLoadedTournamentState()` and `normalizeAllIndividualPoolTiebreakOrder()` run, this device's
`currentCourt` / `publicCourt` are restored from the pin, and `rehydrateLoadedTournamentState()` rebuilds the court
view from `courtState[court]`, or from the payload's `currentDivision` / `current` when that is empty
(`cloud-realtime-save-and-load.js`, ~650–695). So another device's view fields *do* reach this device on a load
today, as a fallback.

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
| `divisionRenames` | 0 in app/modules (5 in 2 files by name) / via `Object.assign` / 2 | division rename (react-bridges/setup, through `renamedDivisionState`), the rebase (`rebaseDivisionRenames`) | The rename log `{id, from, to}` the save-conflict replay uses (#25, #36); not in `TournamentState`'s type yet. Moves with the divisions (PR 9) |
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
| `score` | M | 45 / 15 (on 8 lines: `point()` has several) / 8 | scoring (`point`, `hansoku`), `loadScoreFromMatch`, match timer | **device** working copy of the current match's points, copied into the match by `syncActiveScoreToMatch()`; ends as a selector over the match once court actions are actions |
| `courtState` | M | 33 / 12 / 12 | `applyCourtState` (any local view choice: a division picked, a court chosen), Next Match, generation, setup, grand champion, sync load (`rehydrateLoadedTournamentState`, the payload's value or the self-heal) and rebase (`nextReadyIndexInState`) | **split** (see below): "what is on Court B now" (TV, Live Scores, the other court) is tournament data; a device *viewing* a court or division is device state |
| `courtActiveDivision` | M | 19 / 10 / 11 | same writers as `courtState` | **tournament**, and then a selector: it is `courtState[c].division` kept twice |
| `currentByDivision` | M | 13 / 9 / 5 | `applyCourtState` (every local view choice), generation, grand champion, sync load | **split**, then a selector: where each division's queue stands is derivable from the matches (`nextReadyIndexInState`); the remembered position is device state |
| `courtActionHistory` | T | 19 / 7 / 4 | `performCourtAction`, undo/redo, rebase | **tournament**, per court: saved so a replacement tablet on the court can still undo; replayed by the rebase |
| `courtRedoHistory` | T | 16 / 8 / 2 | undo/redo, rebase | **tournament** with the history |
| `courtUndoLog` | T | 5 / 2 / 1 | undo/redo (F30 log the rebase replays) | **tournament** with the history |
| `history` | – | 3 / 3 / 3 | reset to `[]` only | **drop** (pre-`patch-v1` undo stack, always empty) |
| `contextMode` | – | 0 | initial value only | **drop** |
| `teamBracketState` | – | 0 | initial value only | **drop** |

**How `courtState` and `currentByDivision` split.** Today `applyCourtState(court, cs)` writes `currentCourt`,
`courtState[court]`, `courtActiveDivision[court]`, `currentDivision`, `matches`, `current` and
`currentByDivision[div]` in one go, whether the device is the scorekeeper of that court or only looking at it (the
director's Court B view, a load's rehydrate). The split:
- `tournament.courts[c] = {division, index}`: what Court *c* is running. Written only by actions of that court
  (`meta.court === c`): a scorekeeper pinned to *c* choosing a division (`court/divisionSelected`), Next Match,
  generation, and the rebase/load reconciliation. `courtActiveDivision` becomes a selector over it.
- `device.view = {court, division}` (from `currentCourt`, `currentDivision`, `ksmLocalCourtDivision`): what this
  device shows. A view choice on a device that is not that court's scorekeeper writes only this.
- `currentByDivision`: the shared part becomes a selector (next ready index per division and court); the "come
  back to where I was" position, if still wanted, is `device.view` state.
Whether a non-scorekeeper's view choice should still move the court's shared pointer (it does today) is decided in
PR 6 with tests; the default is to keep today's behaviour for a pinned scorekeeper only.

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
   property as an **enumerable, non-configurable getter** over `getState()` (one helper in `app-state.js`:
   `moveToStore('regMode', ['device', 'regMode'])`; a store path, not a selector, so the stray-write fallback of
   point 8 knows where to put a value). Enumerable, so `JSON.stringify(state)` (the snapshot) and
   `Object.keys(state)` (`historyComparableState`) still see it and the saved formats do not change. A missed
   write is handled by point 8.
2. **Every write of that group becomes a dispatched action in the same PR.** The counts in section 1 are the
   checklist (plus the alias writes, found by reading each writer). Reads stay `state.x` until a later cleanup.
3. **Whole-object writes go through two helpers** (done in PR 2): `replaceState(loaded)` (load, remote apply,
   tournament switch: `applyTournamentPayload()`, `ksmResetTournament()` in `tournament-switcher.js`) and
   `assignState(partial)` (the division rename in `react-bridges/setup.js`, the team-division migration in
   `ksmTeamDivisions()`). Each dispatches one action for the store-owned keys (`legacy/stateReplaced` /
   `legacy/stateAssigned`, a list of `{path, value}` the root reducer puts in place; a store key missing from
   `loaded` is set to `undefined`) and assigns the rest exactly as `delete` + `Object.assign` did (tests:
   `tests/store/legacy.test.mjs`). Without them, `delete state[k]` + `Object.assign` would remove a getter and put
   a plain copy in its place. As a group moves, its PR may give these writes a domain action (`tournament/loaded`,
   point 4) instead. Note for PR 5: a moved key keeps its place in `Object.keys(state)` (the getter is never
   deleted), while today a load re-adds every key in the payload's order, so the snapshot's key order can differ
   after a load; check the goldens that compare snapshot text.
4. **A snapshot apply is one action**: `tournament/loaded` with the migrated payload. Today
   `sanitizeLoadedTournamentState()` and `normalizeAllIndividualPoolTiebreakOrder()` ran on the live `state` after
   the payload was assigned (section 1); both take the target object as an argument and read nothing else (the
   engine helpers they call are pure), so since PR 2 they run on the loaded copy *before* `replaceState()`.
   `tests/store/load-order.test.mjs` runs the old and the new order on 307 payloads (the 76 engine goldens, each
   also with invalid entries, misplaced pool tiebreaks and both; the v3.17.20 four-pool case) while `state` holds
   another tournament, and gets the same `state` and the same console output. One difference on an error only: if
   a repair throws, `state` now still holds the previous tournament instead of a half-loaded one. Repairs that call
   the rest of the app (`repairLoadedEliminationAdvancement`, `rehydrateLoadedTournamentState`) follow as their own
   actions. **"`tournament/loaded` never touches `device`" is a behaviour change**: today the payload's
   `currentDivision` / `current` / `courtState` feed this device's court view on a load (the rehydrate fallback).
   It gets its own PR (PR 4) with tests: a remote apply on Court A keeps Court A's division; a reload and a first
   load on a fresh device still open the court's current division and match; a file load; a TV following a court.
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
8. **A stray write never breaks a tournament in production.** Decided in PR 2 (review of #172): two modes, one
   switch (`setStoreStrict()`, `app/store/legacy.ts`).
   - **Strict: the Node tests and the browser tests.** A write the conversion missed throws: an assignment to a
     moved field hits the getter's setter, which throws; a nested write into store data (`state.awards[i].x = …`)
     hits Immer's deep freeze (strict-mode modules throw a `TypeError`). The Node tests run strict because
     `process.env.NODE_ENV` is not `"production"` there (RTK's immutability check also reports a nested write at
     the next dispatch); the Python browser tests load the production app.js, so `tests/lib/ksm-test-api.js` sets
     `window.KSM_STRICT_STORE = true` before the app runs and `app/main.js` calls `setStoreStrict(true)`. So every
     test, Node or browser, finds such a write.
   - **Production: app.js for users.** No crash during a tournament, and the write is not lost:
     - an assignment to a moved field (`state.regMode = x`): the setter logs it to the cloud diagnostics
       (`writeCloudDiagnosticsState({storeStrayWrite: {field, path, stack, at}})`, wired in `app/main.js`) and
       dispatches `legacy/fieldAssigned {key, path, value}`, whose reducer puts the value at the field's path, so
       subscribers are notified. Only `moveToStore()`'s setter dispatches it (`tests/store/legacy.test.mjs` checks
       the sources): a fallback, never a way to write.
     - a nested write into store data: Immer's auto-freeze is off in production (`app/store/legacy.ts` calls
       `setAutoFreeze(false)` at load when `NODE_ENV` is `"production"`), so the write goes into the store's current
       object as it goes into `state` today. What follows (tested in `tests/store/legacy.test.mjs`, production
       path): the store state is the same object, so **no subscriber runs**; the **next snapshot carries it** (it is
       `JSON.stringify(state)` through the getters); the **next dispatch** of any action runs every subscriber, and a
       direct read sees the new value, but a `createSelector` whose input is that object (or an ancestor Immer
       kept, by structural sharing) **keeps returning its old result** until an action replaces that object; older
       store states share the object, so they change too. It is not logged: it cannot be seen without a Proxy
       (too slow and identity-breaking on old TVs).
   - **Why this design, not "log + apply" for nested writes too.** Catching a nested write in production needs a
     Proxy over all store data (a cost on every read on the oldest TVs, and `indexOf(match)` identity breaks) or a
     deep diff per dispatch (RTK's immutability check, an O(size) walk). Both cost every user to catch a bug the
     tests already catch: both test suites run strict, so a missed nested write fails a test before it ships. In
     production the cost of a missed one is a screen that redraws one action late, never a crash or lost data
     (the snapshot and the next dispatch see it).
What must never happen (each PR's tests check the ones it touches):

- **A stale read after a dispatch.** `dispatch` is synchronous and `getState()` is new right after, but an object
  read *before* the dispatch is the old frozen copy. No code keeps a store object across a dispatch (e.g.
  `const cs = state.courtState[c]; dispatch(…); cs.index`); read again. `state.matches` is exactly this today (an
  alias), so it becomes a getter over `allMatches` / `courtState` before `allMatches` moves.
- **Legacy code mutating a frozen object in production.** In tests it throws (good: loud), so every write is found
  first; in production it is applied (and logged, for an assignment; point 8), never a crash during a tournament. Match
  Object identity (`indexOf(match)`, objects kept across calls) must switch to `matchSyncIdentity()` / ids where it
  crosses a dispatch.
- **A remote apply losing a local unsent change.** The deferral (`localChangesPending()` → `deferRemoteRecord`)
  depends on the mutation version: every local store write must bump it (point 7) before a remote
  `tournament/loaded` can be dispatched, and `tournament/loaded` must never be applied while changes are pending
  without the rebase.
- **Device state from another device** (after PR 4). No `device` field is filled from a payload, and the per-court
  entries of the other court come only from the server.
- **Undo/Redo writing device fields.** `performCourtAction()` diffs every key of `state` except the history keys
  (`historyComparableState()`, `court-scoring-and-history.js`), so `patch-v1` entries, old synced ones included,
  carry patches on `score`, `matches`, `current` and `currentDivision`, and `applyHistoryPatch()` writes those paths
  straight into `state`. Once a device field is a getter or frozen, that Undo would throw. PR 3 fixes this before
  any device field moves.
- **Two stores.** The React bundle is separate from app.js, so it must use `window.KSMStore`, never import
  `app/store/store.ts` (that would make a second, empty store).

## 3. Order of the PRs

Each line: fields → actions; risk; tests to add. Every PR keeps every golden unchanged.

1. **Foundation** (this PR): empty store, metadata helper, island hook, this plan; not imported by app.js. Risk:
   none. Tests: `tests/store/*.test.mjs`, `tests/store-package-builds-test.mjs` (replaced in PR 2 by
   `tests/store-bundle-test.mjs`).
2. **Prep, no field moves** (**done**): app.js imports the store and sets `window.KSMStore` (+7.9 kB gzip with
   section 5's tree-shaken pass); `replaceState()` / `assignState()` helpers for the whole-object writes in 1.3;
   `sanitizeLoadedTournamentState` / `normalizeAllIndividualPoolTiebreakOrder` run on the loaded copy before it is
   assigned (identical result); the `moveToStore()` getter helper with its production path (section 2, point 8),
   unused; a test that every `state` key is a plain property or a store getter. Risk: low (the load path). Tests:
   load / remote apply / tournament switch / rename unchanged (existing sync and rename tests), helper unit tests
   for both the throwing and the production path (`tests/store/legacy.test.mjs`), the load-order identity test
   (`tests/store/load-order.test.mjs`), the bundle guard (`tests/store-bundle-test.mjs`).
3. **Undo/Redo without device keys**, before any device field moves: `applyHistoryPatch()` skips patches whose
   path starts with a device key (the `KSM_LOCAL_VIEW_STATE_KEYS` set the rebase already skips: `currentCourt`,
   `publicCourt`, `currentDivision`, `matches`, `current`, `score`), and the court view is rebuilt after the entry's
   tournament patches as `applyHistoryValues()` already does (`applyCourtState` reloads `score` from the match).
   `matches` patches duplicate the `allMatches` patches of the same entry (the alias), so nothing is lost.
   `historyComparableState()` stops recording those keys in new entries if the goldens allow; otherwise they keep
   being recorded and only skipped on apply. Risk: medium (undo semantics). Tests: Undo/Redo of old recorded
   entries (fixtures with `score` / `matches` / `current` / `currentDivision` patches, as saved by 4.0) give the same
   result as today; court-actions tests; undo after a reload and after a remote apply.
4. **Loads keep the device view** (behaviour change, section 2 point 4): `rehydrateLoadedTournamentState()` takes
   this device's view from its own state (pin, `ksmLocalCourtDivision`, the court's shared entry), not from the
   payload's `currentDivision` / `current`. Risk: medium. Tests: the cases in point 4; v31711, v31719.
5. **Device, first fields**: `regMode`, `poolViewDivision` → `device/registrationTabChanged`,
   `device/poolViewDivisionChanged`. Risk: low (few writers, ignored by the rebase). Tests: getter throws on write
   (tests) and dispatches (production path); snapshot JSON byte-identical; Registration tab / Pools goldens.
6. **Device, court view**: `currentCourt`, `publicCourt`, `currentDivision`, plus `ksmLocalCourtDivision` →
   `device/courtChosen`, `device/publicCourtChanged`, `device/divisionShown`, and the `courtState` /
   `currentByDivision` split of section 1.2 (`court/divisionSelected` for a pinned scorekeeper). Risk: medium
   (pinned court, TV follow, the rebase fallback reads the payload copy). Tests: v31711 pinned court, v31719 TV
   follow, court and TV goldens.
7. **Derive `matches` and `current`**: getters over `allMatches[courtState[currentCourt].division]` and
   `courtState[…].index`; drop their assignments. `score` → `device.activeScore[court]` with
   `device/scoreChanged`. Risk: medium-high (scoring path, the alias). Tests: court-actions, timer, scoreboard
   goldens; snapshot still carries `matches`/`current` (from the getters) until the owner decides (open question 1).
8. **Settings**: the Setup form (`payload.setup`) → `tournament.settings`; `applySetupSnapshot` becomes
   `tournament/settingsLoaded`, field edits `tournament/settingChanged`; inputs render from the store;
   `teamAwardMode` and the `teamCourt` part of `divisionCourts` read settings. Risk: medium (DOM reads by id in many
   places, `tournamentSettings()`). Tests: setup goldens, edit-conflicts (Setup fields merge), print.
9. **Divisions**: `divisions`, `divisionTypes`, `divisionCourts`, `hiddenPresets`, `divisionRenames` → `tournament/divisionAdded`,
   `…Removed`, `…Renamed` (calls `renamedDivisionState`), `…FormatChanged`, `…CourtChanged`, `presetsRestored`.
   The rename (with its `divisionRenames` record) is one action. Risk: medium (`divisionCourts` has 26 writes).
   Tests: divisions engine tests, rename conflict tests (#25, #36), setup goldens.
10. **People**: `competitors`, `teams`, `exhibitions`, `teamDivisions` → `tournament/competitorAdded`, `…Updated`,
   `…Removed`, `…StatusCycled`, team and exhibition equivalents, `teamDivision…`. Risk: medium (rows edited in
   place by the Registration bridge). Tests: registration goldens, the #95 merge tests.
11. **Awards and grand champion**: `awards`, `grandChampions` → `tournament/awardSet`, `grandChampion…`. Risk:
   low-medium. Tests: results goldens, grand champion tests.
12. **Structure**: `pools`, `teamPools`, `brackets`, `championshipNodes`, `singleElimNodes`, `singleElimComps`,
    `byeWinners`, `teamBracketNodes`, `teamElimTeams`, `generated`, `managementRevision` →
    `tournament/divisionGenerated` (the engine's `generateDivision` plan), `…Regenerated`, `poolsEdited`,
    advancement plans as `tournament/advancementApplied`. Risk: high (orchestration, `generateDivisionState`).
    Tests: golden-engine, pool-edit and regenerate tests, undo-regenerate.
13. **Matches and courts**: `allMatches`, `courtState`, `courtActiveDivision` (→ selector), `currentByDivision`,
    `courtActionHistory`, `courtRedoHistory`, `courtUndoLog` → `court/pointScored`, `court/hansoku`,
    `court/nextMatch`, `court/undo`, `court/redo`, tiebreak/playoff creation, `patch-v1` from Immer patches. Risk:
    highest. Tests: court-actions, concurrent rebase (v31712, v31715), edit-conflicts, e2e full tournament, all
    goldens; time a point on the oldest TV/tablet.
14. **`state` retired**: drop the dead fields (`history`, `contextMode`, `teamBracketState`; with a load-time drop,
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
- The store instance is `window.KSMStore`, set by `app/main.js` (since PR 2) (the islands are a separate Vite
  bundle, so this is the only way to share one instance). `app/store/react.ts` imports only React and types.
- Selectors are module-level functions; derived lists use `createSelector` (Reselect, already in RTK) keyed per
  division / court, so a point on Court A does not rebuild Court B's bracket.
- The `ksm:*` publishers go away screen by screen: today legacy code computes `window.ksmXInput` and dispatches
  `ksm:x` (`app/react/features/*/publish.ts`). Once the data a screen reads is in the store, its `*-model.ts` view
  functions (already pure) become selectors, and that screen's publisher, its event and its `ksmXRequested` flag
  are deleted. `useLegacyState` / `ksm:state-changed` go when `state` does. Screens that read the DOM Setup form
  wait for PR 8.

## 5. Bundle size and re-renders (old TVs and tablets)

- app.js bundles the store **on its own, tree-shaken and minified** (decided in PR 2): `storeBundle()` in
  `scripts/app-sources.mjs` bundles `app/store/index.ts` and its packages (their default ESM builds) with
  tree-shaking, minify and `process.env.NODE_ENV` defined as `"production"`, as one self-contained script
  (`var __ksmStoreModule = …`, no imports). `appBundle()` keeps `app/store/index.ts` external and, after bundling,
  puts that script into app.js as it is and turns the imports into `const {…} = __ksmStoreModule` (app.js itself
  is neither minified nor tree-shaken, its top-level code is reached through `window`, and rolldown would re-print
  a minified module unminified: +31 kB raw instead of +21 kB). This leaves out the development-only checks (RTK's
  immutability check, a deep walk of the whole state on every dispatch), `createAsyncThunk`'s and the listener
  middleware's unused code and the entity adapter. redux-thunk stays (configureStore imports it even with
  `thunk: false`; under 1 kB). The other option, RTK's published production builds bundled as they are, cost
  +20.9 kB gzip; nothing in the store needs what tree-shaking drops. The Node tests import the sources and the
  default builds, so the serializable and immutability checks run there. `tests/store-bundle-test.mjs` guards it:
  one Immer (RTK has no copy of its own), RTK pinned, no `process.env` or immutability check left, a gzip budget
  (9,000 bytes), the bundle run in a vm (production mode, every export of `index.ts`), the script in app.js as it
  is, and app code importing only `app/store/index.ts`.
- Size of app.js (default gzip level): before PR 2 620,674 bytes, gzip 157,824. After: **646,229 bytes (+25.6 kB),
  gzip 167,107 (+9.3 kB)**: the store bundle is 21,095 bytes, gzip 7,939; the rest is the helpers in
  `app-state.js` and their JSDoc (app.js keeps JSDoc comments).
- Nothing in the React bundle changes (it imports no store code yet; `react.ts` adds only React, which it already
  has).
- Re-renders: `store.subscribe` listeners run on every dispatch, so selectors must be cheap and return stable
  references. A remote snapshot is one action, one notification (today `ksmNotifyStateChanged` coalesces per
  microtask). Immer copies only the changed path (structural sharing); the deep freeze of a loaded snapshot is one
  O(size) pass per load.
- Check on the oldest TV/tablet before PR 13 (issue #15): time a point and a snapshot apply (`performance.now()` in
  the diagnostics panel).

## Open questions for the owner

1. **Device fields in the saved snapshot** (still open; until it is answered, the plan assumes they **keep being
   written** for 4.0 devices: the getters are enumerable, so the snapshot stays byte-identical). `currentCourt`, `publicCourt`, `currentDivision`, `poolViewDivision`,
   `regMode`, `score`, `current` and `matches` (a second copy of one division's whole match list) are saved today
   and ignored on load. Keep writing them until 4.0 devices no longer open 4.1 tournaments, or drop them when they
   move (smaller snapshots, a format change)?
2. **Redux DevTools**: off for now (`devTools: false`; tablets have no extension). Turn it on for `npm run dev`
   later if wanted.
