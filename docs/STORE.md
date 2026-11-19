# The store: plan for moving `state` into Redux Toolkit (#15 step 2.8)

Status (2026-11-17): **prep done (PR 2), Undo/Redo without device keys (PR 3), loads keep the device view (PR 4), device fields moved: `regMode`, `poolViewDivision` (PR 5), the court view (PR 6), `matches` derived and `current` / `score` moved (PR 7), the Setup form in `tournament.settings` (PR 8), `teamAwardMode` and the team court read it (PR 8b), the divisions (PR 9), the people (PR 10), the awards and grand champions (PR 11), the draw structure (PR 12a), the bracket nodes (PR 12b), the court pointers (PR 13a), the court history and Undo/Redo (PR 13b)**. `app/store/` holds a Redux Toolkit store (slices
`tournament` and `device`). app.js imports it as a separate tree-shaken, minified
bundle (+9.2 kB gzip since PR 10, section 5) and sets `window.KSMStore`; `app/modules/app-state.js` has the helpers the field
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
view from `courtState[court]`; until PR 4 it fell back to the payload's `currentDivision` / `current` when that
was empty, so another device's view fields reached this device on a load. Since PR 4 they never do (section 2,
point 4).

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
| `divisions` | 46 / 8 / 11 | setup (division-setup), registration | **Moved (PR 9)** with the next four (section 3 item 9). Renames: one engine call (`renamedDivisionState`) rewrites `divisions`, `divisionTypes`, `divisionCourts`, `competitors` together: one action (`tournament/divisionRenamed`, `competitors` in it since PR 10) |
| `hiddenPresets` | 5 / 2 / 1 | setup (react-bridges/setup) | **Moved (PR 9)**: `presetHidden` / `presetsRestored` |
| `divisionRenames` | 0 in app/modules (5 in 2 files by name) / via `Object.assign` / 2 | division rename (react-bridges/setup, through `renamedDivisionState`), the rebase (`rebaseDivisionRenames`) | The rename log `{id, from, to}` the save-conflict replay uses (#25, #36). **Moved (PR 9)**: appended by `tournament/divisionRenamed`; typed in `TournamentState` |
| `divisionTypes` | 18 / 7 / 9 | setup, registration | **Moved (PR 9)**: `divisionFormatChanged` (and added / removed / renamed with the division) |
| `divisionCourts` | 57 / 26 / 18 | setup, registration, team divisions, grand champion, court order, generation, **sync** (load normalizes `'Both'`→`'split'`), `applySetupSnapshot` (`teamCourt`) | **Moved (PR 9)**: `divisionCourtChanged`; its `'Team Tournament'` entry is derived from `settings.teamCourt` in the store (`withTeamCourt()`), so `ksmSetTeamCourt()` is `tournament/settingChanged` alone |
| `teamAwardMode` | 0 (getter) | Setup field `teamAwardMode` (`tournament/settingChanged`) | Since PR 8b a store getter over `settings.teamAwardMode` (section 3 item 8); the snapshot still carries it |
| `competitors` | 30 / 8 / 9 | registration (+ its React bridge, rows edited in place) | Three-way merged on save conflicts (`KSM_MERGED_STATE_KEYS`). **Moved (PR 10)** with the next three (section 3 item 10): `competitorAdded` / `…Updated` / `…Removed` / `…StatusCycled`, `peopleLoaded`; renamed with the division in `divisionRenamed` |
| `teams` | 31 / 9 / 10 | registration | Merged by team id (#95). **Moved (PR 10)**: `team…` row actions; the team division edits that move or re-format teams carry them |
| `teamDivisions` | 12 / 2 / 6 | team divisions (load-time migration `migrateTeamDivisions`) | **Moved (PR 10)**: `teamDivisionAdded` / `…Updated` / `…Moved` / `…Removed`; the migration is `peopleLoaded` |
| `grandChampions` | 10 / 3 / 4 | grand champion | Merged by id on save conflicts (`KSM_MERGED_STATE_KEYS`). **Moved (PR 11)**: `grandChampionAdded` / `…Updated` / `…Moved` / `…Removed`; renamed with the division in `divisionRenamed`. Absent until a row is added |
| `exhibitions` | 11 / 5 / 4 | registration | **Moved (PR 10)**: `exhibition…` row actions |
| `awards` | 8 / 4 / 3 | results (`ksmSetResultAward` edits a row in place) | Three-way merged on save conflicts. **Moved (PR 11)**: `awardAdded` / `awardSet` / `awardRemoved` / `awardsLoaded` |
| `generated` | 23 / 2 / 11 | generation (no other writer left; the "registration (clear)" of this table's first count is gone) | **Moved (PR 12a)** with the next six (section 3 item 12): `tournamentGenerated` |
| `managementRevision` | 14 / 7 / 5 | generation, pool edits, No Shows, sync (load default) | Bumped by structural edits; the rebase compares it (on payload copies). **Moved (PR 12a)**: in the same action as the edit it counts |
| `pools` | 36 / 7 / 13 | generation, pool editing, No Shows, a court change after the draw, the grand champion's stand-in | Structural (replayed per division on conflicts, `KSM_STRUCTURAL_DIVISION_KEYS`). **Moved (PR 12a)** |
| `teamPools` | 5 / 3 / 1 | generation, a team's No Show (one list with `pools` after a team round robin's draw) | Structural. **Moved (PR 12a)** |
| `brackets` | 18 / 5 / 5 | generation, pool editing | Structural. **Moved (PR 12a)** |
| `championshipNodes` | 21 / 7 / 6 | generation, Edit Pool (the template's nodes; championship advancement writes only matches) | Structural. **Moved (PR 12b)** with the next three: in the draw's actions (`divisionGenerated`, `poolsEdited`, …) |
| `singleElimNodes` | 33 / 7 / 9 | generation, single-elim advancement, split-court templates | Structural. **Moved (PR 12b)**: a scored bout's winners are `tournament/advancementApplied` |
| `singleElimComps` | 18 / 4 / 7 | generation, a No Show, the grand champion's stand-in, a Registration edit of a drawn row | Structural. **Moved (PR 12a)** |
| `byeWinners` | 9 / 3 / 2 | generation (reset to `{}` only; no code adds an entry) | Structural. **Moved (PR 12a)** |
| `teamBracketNodes` | 32 / 7 / 12 | generation, team matches | Structural. **Moved (PR 12b)**: `advancementApplied`; a team's No Show `drawEntriesUpdated` |
| `teamElimTeams` | 19 / 8 / 4 | generation, team matches, sync (load default) | Structural. **Moved (PR 12b)**: Registration's team rows themselves (followed on an edit) |
| `allMatches` | 162 / 22 / 31 | court actions (scoring, Next Match, tiebreaks, playoffs), generation, every advancement sync, pool editing, sync apply/rebase, undo/redo | The core. Plus the alias writes on Match Objects. Legacy code relies on **Match Object identity** (the engine README's "identity has to be preserved") |
| Setup form (`payload.setup`, not in `state`) | — | `applySetupSnapshot()` (`tournament/settingsLoaded`), an edit of a Setup input (`tournament/settingChanged`), `ksmSetSetting()` | **Moved (PR 8)** to `tournament.settings`: every reader reads the store (`getSetupSnapshot()`, `tournamentSettings()`, `ksmSetting()`, the islands' `setupSetting()`); the inputs show it |

### 1.2 Device / screen state, mixed fields and dead fields

| Field | Class | Refs / writes / files | Who writes it | Target and why |
|---|---|---|---|---|
| `currentCourt` | M | 39 / 3 / 12 | court choice, `applyCourtState`, load (pinned court), `restorePinnedCourt` | **device** (moved, PR 6: `device/courtChosen`): the court this device scores or shows. Saved but ignored on apply (pin wins) |
| `publicCourt` | M | 6 / 4 / 3 | court order, sync load (TV pin) | **device** (moved, PR 6: `device/publicCourtChanged`): the court Live Scores / the TV follows |
| `currentDivision` | M | 38 / 3 / 15 | `applyCourtState`, load | **device** (moved, PR 6: `device/divisionShown`): the division this device's court screen shows. The rebase still reads it as a fallback (`localState.currentDivision`), from the payload copy, which keeps it (the getter is enumerable, so `tournamentPayload()` still writes it) |
| `poolViewDivision` | D | 6 / 2 / 2 | court order, generation | **device** |
| `regMode` | D | 5 / 1 / 4 | navigation (`regTab`) | **device** (open Registration tab) |
| `matches` | M | 23 / 7 / 11 | `applyCourtState` (`= state.allMatches[div]`), load | **neither: a selector** (derived, PR 7: a read-only getter returning the live `allMatches[currentDivision]`, `[]` when there is none; no writer left). It was an *alias* of `allMatches[currentDivision]` (writes through either name change both; still true). Saved, so every snapshot carries one division's match list twice |
| `current` | M | 25 / 5 / 10 | `applyCourtState`, generation, load | **device** (moved, PR 7: `device.currentMatchIndex`, `device/matchShown`): the index of the match this device's court screen shows. Not a selector over `courtState[currentCourt].index`: since PR 6 a device that is not the court's scorekeeper shows its own match, and the scorekeeper's pointer can be ahead of its screen until the next render (section 3 item 7) |
| `score` | M | 45 / 15 (on 8 lines: `point()` has several) / 8 | scoring (`point`, `hansoku`, `fusen`), `loadScoreFromMatch`, the court view resets | **device** (moved, PR 7: `device.activeScore[court]`, `device/scoreChanged`; `state.score` is this device's court's pad) working copy of the current match's points, copied into the match by `syncActiveScoreToMatch()`; ends as a selector over the match once court actions are actions |
| `courtState` | M | 33 / 12 / 12 | `applyCourtState` (any local view choice: a division picked, a court chosen), Next Match, generation, setup, grand champion, sync load (`rehydrateLoadedTournamentState`, the payload's value or the self-heal) and rebase (`nextReadyIndexInState`) | **split** (see below): "what is on Court B now" (TV, Live Scores, the other court) is tournament data; a device *viewing* a court or division is device state. **Moved (PR 13a)** to `tournament.courtState`: `court/divisionSelected` / `court/pointerMoved` / `court/pointersResolved` (`meta.court`) |
| `courtActiveDivision` | M | 19 / 10 / 11 | same writers as `courtState` | **tournament**: it is `courtState[c].division` kept twice. **Moved (PR 13a)** as stored data, not a selector: after a 4.0 load without it, or a load whose `courtState` lacks a court, the two differ (only the healed court gets an entry; section 3 item 13) |
| `currentByDivision` | M | 13 / 9 / 5 | `applyCourtState` (every local view choice), generation, grand champion, sync load | **split**, then a selector: where each division's queue stands is derivable from the matches (`nextReadyIndexInState`); the remembered position is device state. **Moved (PR 13a)** as stored data (it is the scorekeeper's remembered position, not the next ready bout: no selector gives its values); a division's draw carries its entry |
| `courtActionHistory` | T | 19 / 7 / 4 | `performCourtAction`, undo/redo, rebase | **tournament**, per court: saved so a replacement tablet on the court can still undo; replayed by the rebase. **Moved (PR 13b)**: `court/actionRecorded`, `court/undo` / `court/redo`, `court/historyNormalized`, `court/historyForgotten` (`meta.court`) |
| `courtRedoHistory` | T | 16 / 8 / 2 | undo/redo, rebase | **tournament** with the history. **Moved (PR 13b)** |
| `courtUndoLog` | T | 5 / 2 / 1 | undo/redo (F30 log the rebase replays) | **tournament** with the history. **Moved (PR 13b)**: appended by `court/undo` / `court/redo`; absent until the first Undo/Redo, as before |
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
**Decided in PR 6: only Court *c*'s scorekeeper moves Court *c*'s shared pointer.** Before PR 6 every view choice
moved it, on any device. A device is Court *c*'s scorekeeper (`isCourtScorekeeper(c)`, `court-match-order.js`) when
it may write the tournament (`canCloudWrite()`: staff, or a local tournament with no cloud) and its court
(`state.currentCourt`, from the pin) is *c*. A cloud TV link is never staff (`initializeCloudRoleFromUrl()`), so a TV
never moves a pointer; an offline TV is the same app as its court (no other device; the TV goldens score on it).
"Only Court *c*'s scorekeeper" covers more devices than it sounds: a device whose link names no court is given Court A
(`initializeCloudRoleFromUrl()`: the link's court, else the stored pin, else `A`), so the director's desk device, once
logged in, counts as Court A's scorekeeper; its division picks, generation and dashboard self-heal still move Court A's
pointer, as before PR 6.
**Catching up after Staff Login** (#180 review): a tablet that opens the Court B link before logging in (the F3 reload
flow) is a spectator until Staff Login, so a division it picks then moves only its view. When it becomes Court *c*'s
scorekeeper, or takes a court action on *c* (a point, Next Match, Undo, Redo), `syncOwnCourtPointer()` brings
`courtState[c]` / `courtActiveDivision[c]` / `currentByDivision` to its view if they differ, once, as that court's own
write: on Staff Login (`ksmAccountSetRole()`) with a save of its own, before a court action in that action's save (not
in its Undo entry). Before PR 6 the pre-login pick had already moved the local pointer, so the first save carried it. Opening a court from the court menu pins the device to that court,
so a staff device (the director's included) that opens Court B is Court B's device, as before. On every other device a
view choice changes only that device's view (`currentCourt`, `currentDivision`, `matches`, `current`, `score`,
`device.localCourtDivision`): a spectator or a TV picking a division on Court B, a load's rehydrate on a spectator or
TV, and the self-heal when Live Scores, the TV or the director's dashboard draws Court B on a device pinned to Court A
(`courtCurrentMatch()` computes the next bout for that render only). Why: the pointer is what Court B's scorekeeper,
the TV and Live Scores show as "on Court B now"; a device that cannot save (a spectator, a TV) moved it only in its own
copy, so its own Live Scores showed its choice as Court B's bout until the next remote apply put the real one back, and
a writable device drawing another court's screen should not save a pointer for a court it does not run.
Structural edits keep re-resolving the pointers on any writable device, as before: generation (`initCourtStates`),
pool edits, division setup, grand champion draws, tiebreak index fixes and the rebase / load reconciliation (a load
heals this court's pointer only on its scorekeeper). In this PR `courtState`, `courtActiveDivision` and
`currentByDivision` stay plain tournament fields (they move in PR 13, where `court/divisionSelected` becomes an action
with `meta.court`); only who writes them changed (`setCourtPointer()`). PR 13a moved them (section 3 item 13); the rule
is unchanged: a view choice on a device that is not the court's scorekeeper dispatches only `device/…` actions.

### 1.3 Other mutable state

- **Whole-object writes to `state`** (the mechanism below must handle each): `applyTournamentPayload()` and the
  tournament switcher (`Object.keys(state).forEach(k=>delete state[k]); Object.assign(state, loaded)`); division
  rename (`Object.assign(state, renamedDivisionState(...))`, react-bridges/setup; since PR 9 `assignState()` of the plain
  fields it rewrites, then `tournament/divisionRenamed`, with `competitors` in it since PR 10 and `grandChampions` since PR 11); the team-division migration
  (`Object.assign(state, migrateTeamDivisions(...))`; since PR 10 `tournament/peopleLoaded` with the two lists it
  changes); undo/redo `applyHistoryPatch()`, which walks a `patch-v1`
  path from `state` and writes in place; `historyComparableState()`, which deep-clones every key before and after a
  court action; grand champion removal (`state[key][c]`, `delete state[k][id]`).
- **Device state outside `state`** → `device` slice when a screen needs it reactive: `ksmLocalCourtDivision`
  (sync-state-and-rebase.js, the division per pinned court; moved in PR 6 to `device.localCourtDivision`,
  `device/localCourtDivisionChosen` / `…Cleared`, not in `state` or the snapshot), the court pin (`sessionStorage`/`localStorage`),
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
   `assignState(partial)` (the division rename in `react-bridges/setup.js`; the team-division migration in
   `ksmTeamDivisions()` until PR 10 made it `tournament/peopleLoaded`). Each dispatches one action for the store-owned keys (`legacy/stateReplaced` /
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
   Done in PR 4: `rehydrateLoadedTournamentState()` builds this device's view only from this device's own state: the
   court (`currentCourt`, set from the pin first; `A` when the device knows no court, never the payload's), the division
   a writable court device chose (`ksmLocalCourtDivision`), the court's shared `courtState` entry, else the court's first
   scorable match (`findNextForCourt`); with nothing to show it keeps this device's division (or the tournament's first)
   and empties the pad. The payload's `currentDivision` / `current` / `matches` / `score` / `currentCourt` are still in
   the payload (and saved by every device, for 4.0) but are always overwritten on a load. `tests/load-keeps-device-view-test.mjs`
   runs every load path with the code before and after: the same `state` where the view came from the shared entry
   (remote apply, rebase result, reload, first load, file load, tournament switch, TV), and the three cases that took
   another device's view (no shared entry for the court, no draw yet, no court known).
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
   - **Undo/Redo and store-owned keys** (PR 3). `applyHistoryPatch()` never deletes or assigns a store-owned top-level
     key directly: a patch whose path is `[key]` for a key `moveToStore()` owns goes through `assignState({[key]: value})`
     (`undefined` for a missing value, where it did `delete state[key]`, which throws on the non-configurable getter in
     strict mode, in production too), and a missing parent at `[key, …]` is created the same way. Patches on device keys
     are skipped (point 6). A deeper path into a moved key (since PR 9; e.g. `['divisionCourts', d]`, recorded when a
     court action's render gave a division its default court) is written into a copy of that key. Since PR 13b the new
     values of every store-owned key an entry changes are collected while its patches apply and go to the store in the
     entry's one `court/undo` / `court/redo` (with its bouts, `allMatches`, since PR 13c-2), with the history move and the F30 log
     entry: no notification shows half an entry (#199 review L1). Tested with a key made a getter
     (`tests/undo-device-keys-test.mjs`).
   - **Strict: the Node tests and the browser tests.** A write the conversion missed throws: an assignment to a
     moved field hits the getter's setter, which throws; a nested write into store data (`state.awards[i].x = …`)
     hits Immer's deep freeze (strict-mode modules throw a `TypeError`). The Node tests run strict because
     `process.env.NODE_ENV` is not `"production"` there (RTK's immutability check also reports a nested write at
     the next dispatch); the Python browser tests load the production app.js, so `launch_chromium()` (`tests/ksm_browser.py`, the only place they
     start Chromium; `tests/store-bundle-test.mjs` checks) sets `window.KSM_STRICT_STORE = true` on every context and page
     before the app runs (as `tests/lib/ksm-test-api.js` also does), and `app/main.js` calls `setStoreStrict(true)`. So every
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
  `const cs = state.courtState[c]; dispatch(…); cs.index`); read again. `state.matches` was exactly this (an alias),
  so since PR 7 it is a getter that returns `allMatches[currentDivision]` on every read (the live list, never a copy),
  before `allMatches` moves.
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
  carry patches on `score`, `matches`, `current` and `currentDivision`. Since PR 3 `applyHistoryPatch()` skips them
  (`KSM_LOCAL_VIEW_STATE_KEYS`) and the court view is rebuilt from `courtState` after the entry, so such an Undo never
  writes a device getter.
- **Undo/Redo deleting or assigning a store getter.** A top-level patch (`[key]`) on a store-owned key goes to the
  store (since PR 13b in the entry's `court/undo` / `court/redo`), never `delete state[key]` or `state[key] = …` (both
  throw on the non-configurable getter; point 8).
- **Half an Undo/Redo** (since PR 13b). An entry's store-owned keys, its bouts (since PR 13c-2) and its history move are
  one dispatch; `tests/bracket-nodes-store-test.py` and `tests/court-pointers-store-test.py` check every notification
  while bouts are scored, undone and redone.
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
3. **Undo/Redo without device keys** (**done**), before any device field moves: `applyHistoryPatch()` skips patches whose
   path starts with a device key (the `KSM_LOCAL_VIEW_STATE_KEYS` set the rebase already skips: `currentCourt`,
   `publicCourt`, `currentDivision`, `matches`, `current`, `score`), and the court view is rebuilt after the entry's
   tournament patches as `applyHistoryValues()` already does (`applyCourtState` reloads `score` from the match).
   `matches` patches duplicate the `allMatches` patches of the same entry (the alias), so nothing is lost.
   `historyComparableState()` stops recording those keys in new entries if the goldens allow; otherwise they keep
   being recorded and only skipped on apply. Risk: medium (undo semantics). Tests: Undo/Redo of old recorded
   entries (fixtures with `score` / `matches` / `current` / `currentDivision` patches, as saved by 4.0) give the same
   result as today; court-actions tests; undo after a reload and after a remote apply.
   Done: `historyComparableState()` **keeps recording** the device keys (dropping them would change every saved
   `courtActionHistory` entry, so the snapshot JSON, and 4.0 devices read these entries); they are only skipped on
   apply. A top-level patch on a store-owned key goes through `assignState()` (point 8). `tests/undo-device-keys-test.mjs`
   runs Undo/Redo of recorded entries with the code before and after and gets the same `state` (point, hansoku, Next
   Match, after a reload with and without the rehydrate, after a remote apply, Redo after Undo). Two cases differ, both
   4.0 bugs: an Undo after the court was switched to another division wrote the entry's `matches` patches by index into
   that division's matches; an entry that changed the court's division swapped the two match lists on Undo/Redo.
4. **Loads keep the device view** (**done**; behaviour change, section 2 point 4): `rehydrateLoadedTournamentState()` takes
   this device's view from its own state (pin, `ksmLocalCourtDivision`, the court's shared entry), not from the
   payload's `currentDivision` / `current`. Risk: medium. Tests: the cases in point 4; v31711, v31719.
   Done: see section 2 point 4; the snapshot JSON and the save path are unchanged.
5. **Device, first fields** (**done**): `regMode`, `poolViewDivision` → `device/registrationTabChanged`,
   `device/poolViewDivisionChanged`. Risk: low (few writers, ignored by the rebase). Tests: getter throws on write
   (tests) and dispatches (production path); snapshot JSON byte-identical; Registration tab / Pools goldens.
   Done: the `device` slice holds both (defaults as in `app-state.js`); `moveToStore()` runs once in `app-state.js`
   right after `state` is built. Writers: `regTab()` (`navigation.js`) dispatches `registrationTabChanged`; the Pools
   division select, `renderDivisions()` (`court-match-order.js`), `renderPools()` / generation (`engine-generation.js`)
   call `ksmSetPoolViewDivision()` (one helper, also on `window` for the inline `onchange`); a division rename
   (`react-bridges/setup.js`) takes `poolViewDivision` out of the `assignState()` patch and dispatches the action.
   Readers are unchanged (`state.x`). **A load keeps this device's value**: `replaceState()` skips every key whose
   store path is in `device` (ignores the payload's value, and does not clear one the payload lacks), so a payload's
   `regMode` / `poolViewDivision` no longer reach this device (before: a load, remote apply, file load or tournament
   switch overwrote both; the tab shown is unchanged until `regTab()` runs, as before). The snapshot JSON still
   carries both. Undo/Redo: these two are not in `KSM_LOCAL_VIEW_STATE_KEYS`, so a recorded patch on them still applies,
   through `assignState()` into the store, as before. **For later moves:** (1) a test's own `Object.assign(state, …)`
   or `state.x = …` on a moved key throws in the browser tests: use the app's helper (`ksmTeamDivisions()`) or an
   action (`tests/lib/ksm-test-api.js` did the first); (2) source-text tests that grep an inline handler
   (`v3162-*`) need the new text; (3) one visible effect of getters keeping their place in `Object.keys(state)`:
   after a load a moved key stays where it was while plain keys follow in payload order, so the order of snapshot
   keys (and of tied rows in Developer Tools' state breakdown, `golden-shell` nav-staff) differs from before the
   move; the values and the JSON content are the same.
6. **Device, court view** (**done**): `currentCourt`, `publicCourt`, `currentDivision`, plus `ksmLocalCourtDivision` →
   `device/courtChosen`, `device/publicCourtChanged`, `device/divisionShown`, and the `courtState` /
   `currentByDivision` split of section 1.2 (`court/divisionSelected` for a pinned scorekeeper). Risk: medium
   (pinned court, TV follow, the rebase fallback reads the payload copy). Tests: v31711 pinned court, v31719 TV
   follow, court and TV goldens.
   Done (**PR 6**): `currentCourt`, `publicCourt`, `currentDivision` are store getters (`moveToStore()` in
   `app-state.js`), written only through `ksmSetCurrentCourt()` / `ksmSetPublicCourt()` / `ksmShowDivision()` (one
   action each; an unchanged value dispatches nothing). `ksmLocalCourtDivision` is a read-only view of
   `device.localCourtDivision`, written by `rememberLocalCourtDivision()` / `setLocalCourtDivision()` /
   `clearLocalCourtDivisions()`. A load keeps all four (`replaceState()` skips device paths); the tournament reset
   (`ksmResetTournament()`) sets the three `state` fields to the empty state's values, as its `replaceState()` did
   before. The snapshot still carries the three `state` fields with their values. The court pointer writers and the
   decision: section 1.2. Four #177 review fixes: with no shared entry the load opens the court's active division
   before the first ready one; `findNextForCourt(court, null)` scans (and so sorts) only divisions with a match on
   that court, so the other court's lists are not re-sorted or replaced; a file import that throws after
   `replaceState()` restores with this device's division and court choices from before the file; and
   `tests/load-keeps-device-view-test.mjs` prints a loud SKIP on a shallow clone (and fails on CI). Tests:
   `tests/store/device-court-view.test.mjs`, `tests/court-pointer-writers-test.mjs`, the load test's new cases.
   **Left for PR 7 / 13**: `matches`, `current`, `score` (PR 7, done); `court/divisionSelected` as a store action and
   `courtState` / `courtActiveDivision` / `currentByDivision` into the store as tournament data with selectors (PR 13).

7. **Derive `matches` and `current`**: getters over `allMatches[courtState[currentCourt].division]` and
   `courtState[…].index`; drop their assignments. `score` → `device.activeScore[court]` with
   `device/scoreChanged`. Risk: medium-high (scoring path, the alias). Tests: court-actions, timer, scoreboard
   goldens; snapshot still carries `matches`/`current` (from the getters) until the owner decides (open question 1).
   Done (**PR 7**), with one change to the plan: the formula follows **this device's shown division and match**, not
   the court's shared pointer, because since PR 6 the two differ on every device that is not the court's scorekeeper
   (a spectator, a TV, a director drawing another court) and, for one render, on the scorekeeper itself (a render's
   self-heal moves the pointer past a bout finished elsewhere before the screen moves).
   - `state.matches` is a read-only getter (`deriveInState()` in `app-state.js`): `allMatches[currentDivision]`, the
     same array object (so `state.matches[i].x = …` and a push land in `allMatches`, as with the alias), `[]` when that
     division has no list. A replaced list (`sortIndividualDivisionMatches()`, the tiebreak order repair,
     `enforceUniqueIndividualMatches()`) is followed at once, where the alias went stale until the next
     `applyCourtState()`; no test flow (Node or browser, goldens included) shows a difference.
   - `state.current` is `device.currentMatchIndex`, written only by `ksmShowMatch()` (`device/matchShown`; an unchanged
     value dispatches nothing): `applyCourtState()`, `setActiveDivision()`, the grand champion draw and clear, the
     load's empty view, the tiebreak repair on the live state (`reindexPointersAfterMatchReorder()`), the tournament
     reset (`ksmResetCourtPads()`).
   - `state.score` is `device.activeScore[currentCourt]` (a store path that depends on the court), written only by
     `ksmSetScore()` (`device/scoreChanged`, none for an equal pad): `loadScoreFromMatch()`, `point()`, `hansoku()`,
     `fusen()`, `applyCourtState()` without a score, the grand champion clear, the load's empty view, the reset. The
     pad is frozen store data: each point builds a new pad. The match timer only reads it. A device switching courts
     reloads the pad from the match (`applyCourtState()`), as before.
   - Writers that set `state.matches` and now write nothing: `applyCourtState()`, `setActiveDivision()`,
     `ensureScorableCurrentMatch()`, `enforceUniqueIndividualMatches()`, the grand champion draw and clear, the load's
     empty view.
   - **Per role, no difference**: Court A's and Court B's scorekeeper (points, hansoku, fusen, Next Match, Undo, Redo,
     a division picked), a director pinned to Court A picking and drawing Court B, a TV following Court B, a
     spectator pinned to Court B show the same division, `current`, `score` and match list as before, step by step
     (`tests/derived-court-view-test.mjs` runs the #180 code and the new code side by side).
   - **Known differences** (#181 review), none visible on a screen:
     - The load's empty view (`rehydrateLoadedTournamentState()` with no pointer for the court and nothing ready on it)
       shows no match, as before, but now as `current` = the shown division's list length with `matches` = that list,
       where it was `current` 0 and `matches` `[]` (index 0 of the derived list would be a real bout: the other court's,
       or one not ready, which a point would have written). So this device's snapshot carries that list and index
       there, and if its scorekeeper then takes a court action, `syncOwnCourtPointer()` saves the court's pointer as
       that division past its end instead of its bout 1 (both show nothing on the court).
       `tests/load-keeps-device-view-test.mjs` case 8 and `tests/derived-court-view-test.mjs` compare it with the #180 code.
     - Undo/Redo's F30 log (`recordCourtUndoLog()`, replayed by 4.0's rebase): `applyCourtHistoryEntry()` leaves an
       entry's `matches` patches out of the logged entry when `state.matches` is the alias of a patched division. The
       old alias went stale after a list was replaced (a sort, the tiebreak repair) until the next `applyCourtState()`,
       and in that window the logged entry kept its `matches` patches; the derived getter is never stale, so it now
       always leaves them out. 4.0 skips `matches` patches on replay (`KSM_LOCAL_VIEW_STATE_KEYS`), so nothing changes.
   - Loads: `replaceState()` ignores a payload's `matches` (derived), `current` and `score` (device paths), as it does
     `currentDivision`; the rehydrate sets this device's own, as since PR 4. `assignState()` ignores `matches`.
     Undo/Redo still records the three (4.0 devices read them) and skips them on apply (`KSM_LOCAL_VIEW_STATE_KEYS`).
   - A stray assignment: strict throws (all three); production logs it and applies it for `current` / `score`
     (`legacy/fieldAssigned` at the resolved path) and ignores it for `matches` (its sources already say what it is).
   - #180 review Low fixed: `syncOwnCourtPointer()` never moves the court's pointer back onto a finished bout of the
     same division (the screen catches up on its next render), so an auth-token refresh after the self-heal no longer
     rewinds it; a wrong `courtActiveDivision` still syncs there, keeping the court's index
     (`tests/court-pointer-writers-test.mjs` case 7).
   Tests: `tests/store/match-view.test.mjs`, `tests/derived-court-view-test.mjs`, the vm tests' plain `state` gets the
   same derived `matches` (`tests/lib/derived-matches.mjs`).
8. **Settings**: the Setup form (`payload.setup`) → `tournament.settings`; `applySetupSnapshot` becomes
   `tournament/settingsLoaded`, field edits `tournament/settingChanged`; inputs render from the store;
   `teamAwardMode` and the `teamCourt` part of `divisionCourts` read settings. Risk: medium (DOM reads by id in many
   places, `tournamentSettings()`). Tests: setup goldens, edit-conflicts (Setup fields merge), print.
   Done (**PR 8** and **PR 8b**): PR 8 moved the Setup form; PR 8b made `teamAwardMode` and the `teamCourt` entry of
   `divisionCourts` follow it (below).
   - `tournament.settings` holds the 26 Setup fields (`TournamentSetup`, `app/store/slices/tournament.ts`), each the
     text its input holds, in the order `payload.setup` has always had (`KSMEngine.SETUP_KEYS`, `app/engine/settings.ts`).
     Defaults are the page's (`initialSettings`; `tests/store/settings.test.mjs` checks them and the select options
     against `app/index.html`). Actions carry `meta` (`court: null`, the device).
   - `tournament/settingsLoaded` (one action, the whole object): `applySetupSnapshot()` (a load, remote apply, rebase
     result, file, tournament switch, reset). As the inputs did, a field the object names is set and one it does not
     name keeps its value (a tournament switch first applies the empty Setup, so a missing field is the page's default
     there, as before). The page opening is one too (`initSetupSettings()`, `app/main.js`): the store takes what the
     inputs opened with, which is the one read of the inputs' values left besides the edit listener and the render.
   - `tournament/settingChanged {key, value}`: an edit of a Setup input (a document `input` / `change` listener in the
     capture phase, registered before every other listener, so the autosave's listener and the field's inline
     handler, `saveSetup()` or `ksmSaveTimerSettings()`, read the new value from the store), and `ksmSetSetting()`
     for the app's own writes (`ksmSyncLegacyTeamDivision()`, `renderDivisionSetup()`, `ksmSaveTimerSettings()`, the
     court screen's red side / audience side / timer, the new tournament's name). An unchanged value dispatches nothing.
     Like the old `el.value = …`, `ksmSetSetting()` schedules no save and fires no event.
   - Values are normalized before the dispatch (`KSMEngine.normalizeSetup()` / `normalizeSetupValue()`) to what the
     field's input holds once set: text inputs drop line breaks, the referee textareas turn CR LF into LF, the date and
     number inputs hold `''` for what they reject, a select holds one of its options or `''`.
     `tests/setup-settings-store-test.py` checks this against Chromium's own inputs, so the snapshot's `setup` is the
     same text the old `getSetupSnapshot()` read from the inputs (also checked there, for a 4.0 save, an old save
     without the timer / audience fields and odd values).
   - Inputs render from the store: `renderSetupInputs()` after every `settingsLoaded`, and `ksmSetSetting()` renders
     its field; a field is written only when it shows something else, so an equal value never moves a caret. A Setup
     applied while a field has focus still replaces its text, as before (a remote save is still deferred while
     someone types, `ksmLastEditorInputAt`, unchanged).
   - Save conflicts: unchanged. The rebase merges `payload.setup` per field (`mergeValueThreeWay`), on payload copies
     whose `setup` now comes from the store; its result is applied with `settingsLoaded`. Undo/Redo never recorded
     Setup (it is not in `state`), and the undo-regenerate restore point is a payload: both unchanged.
   - Readers (`state`'s DOM reads by id): see the PR description's table. React islands read `setupSetting(key)`
     (`app/react/shared/legacy.ts`: `window.KSMStore`); `legacyTournamentNameInput()` and the Setup entries of
     `legacyInput()` are gone. The print renderer still reads the snapshot it is given. A source check
     (`tests/store/settings.test.mjs`) fails on any read of a Setup input's value in `app/`.
   - **PR 8b** (done): one value each.
     - `state.teamAwardMode` is a store getter over `settings.teamAwardMode` (`moveToStore()`, `app-state.js`), so the
       snapshot still carries the top-level copy 4.0 devices read, with the same value. Writers dispatch
       `tournament/settingChanged`: the Setup select (the capture listener; its inline `onchange` no longer assigns
       `state`), `ksmSyncLegacyTeamDivision()` (the 'Team Tournament' team division's value), `saveSetup()` ('top2' for an
       empty value). `replaceState()` skips a key whose store path is a Setup field (as it skips device keys) and
       `assignState()` writes only a text there; `applySetupSnapshot()` sets it. A stray assignment: strict throws,
       production logs it and applies it to the Setup field.
     - `divisionCourts['Team Tournament']` follows `settings.teamCourt` through one helper, `ksmSetTeamCourt()`
       (`registration/team-divisions.js`), which sets the Setup field and then the entry to the field's value; every
       writer calls it (the legacy select's `saveSetup()`, the team division sync and court edit, the load, the team
       generation, the sample tournament, the removal of the 'Team Tournament' division, which now keeps the entry).
       `renderDivisionSetup()` no longer copies the entry back into the Setup.
     - **Why the Setup field is the value**: the old load already ended there. The load's `renderAll()` ran `saveSetup()`,
       which copied the Setup fields over both top-level copies (after the 'Team Tournament' division's own values); a
       payload's top-level copies count only where `KSMEngine.migrateTeamDivisions()` builds that division from them (no
       team divisions saved, no Setup value). `applySetupSnapshot()` now gives that result at once
       (`tests/team-settings-store-test.py` compares seven loads, the 4.0 fixture among them, and six save conflicts with
       values recorded from the PR 8 code: all the same, one difference below).
     - One difference: a load whose Setup team court is empty and that has no 'Team Tournament' division saved `''` in
       the `divisionCourts` entry while the field showed `'Both'`, until the next render; now both are `'Both'`.
9. **Divisions**: `divisions`, `divisionTypes`, `divisionCourts`, `hiddenPresets`, `divisionRenames` → `tournament/divisionAdded`,
   `…Removed`, `…Renamed` (calls `renamedDivisionState`), `…FormatChanged`, `…CourtChanged`, `presetsRestored`.
   The rename (with its `divisionRenames` record) is one action. Risk: medium (`divisionCourts` has 26 writes).
   Tests: divisions engine tests, rename conflict tests (#25, #36), setup goldens.
   **The team court (from PR 8b)**: `divisionCourts['Team Tournament']` is a copy of `settings.teamCourt`, written only by
   `ksmSetTeamCourt()`. When `divisionCourts` moves, that entry becomes derived (a selector or the getter's value from
   `settings.teamCourt`, so the snapshot keeps the key), `ksmSetTeamCourt()` becomes `tournament/settingChanged` alone,
   and the division actions must not write that key (`…CourtChanged` for 'Team Tournament' = the Setup field). The
   rebase still merges `setup.teamCourt` and the `divisionCourts` entry separately (both copies agree on each device's
   save, so the merge picks the same winner for both; `tests/team-settings-store-test.py`).
   Done (**PR 9**):
   - The five fields are `tournament` slice fields and `state` getters (`moveToStore()`, `app-state.js`); the slice's
     initial lists are the standard divisions (`DIVISION_PRESETS`, now `app/engine/division-lists.ts`). `hiddenPresets`
     and `divisionRenames` stay undefined (not in the snapshot) until set, as before. The snapshot keeps every key, value
     and type (`tests/divisions-store-test.py` compares every key of the saved `state` with the PR 8b code's, value for
     value, after 26 steps: Setup edits, renames, removals, the sample tournament, five kinds of load).
   - Actions: `divisionAdded`, `divisionRemoved`, `divisionMoved`, `divisionRenamed`, `divisionFormatChanged`,
     `divisionCourtChanged`, `divisionsReplaced` (the sample tournament), `presetHidden`, `presetsRestored`. They share one
     reducer that sets the lists the payload names: what each edit does is pure engine code (`addedDivision()`,
     `removedDivision()`, `movedDivision()`, `defaultedDivisionCourts()`, `withDivisionCourts()`,
     `renamedDivisionState()`), run by the app's helpers (`app/modules/setup/divisions-store.js`, one per edit) on the
     current lists right before the dispatch. Why not in the reducers: the store bundle's gzip budget (section 5); ten
     reducers repeating the engine's rules cost +640 bytes gzip, over it. A load still lands through `replaceState()`.
   - The rename is one `divisionRenamed` with the lists `renamedDivisionState()` rewrote and the record appended to
     `divisionRenames`. What else it rewrites is still plain `state` (`competitors`, `grandChampions`, `courtState`,
     `courtActiveDivision`; the first two moved in PRs 10 and 11): `ksmRenameSetupDivision()` assigns those first (`assignState()`, no dispatch), then
     dispatches, in one synchronous step, so the store's subscribers (notified only by the dispatch) never see the two
     halves disagree; the device fields (`poolViewDivision`, `currentDivision`) follow.
   - The team court: `withTeamCourt()` (the root reducer, after every action, the legacy writes included) keeps
     `divisionCourts['Team Tournament']` equal to `settings.teamCourt` (created when missing, at the payload's place when
     it names it). `ksmSetTeamCourt()` is `tournament/settingChanged` alone; `ksmSetDivisionCourt('Team Tournament', c)`
     is `ksmSetTeamCourt(c)`; no division action writes the key. Team divisions' own courts and their precedence are
     unchanged (`applySetupSnapshot()`: the 'Team Tournament' team division's court wins through
     `ksmSyncLegacyTeamDivision()`, the others' entries are set from their records, now one `divisionCourtChanged`).
   - #185 review L1: an individual division can no longer be named 'Team Tournament' (or 'Exhibition Matches', the
     rename's other reserved name): `KSMEngine.divisionAddError()` on Add division (a toast; nothing added) and on a
     Registration row choosing a division that is no longer offered. A 4.0 save that has such a division loads as it is
     (no data is dropped); its court is the team court (the one key), as it already was in 4.0.
   - The load's `'Both'` → `'split'` normalisation runs on the loaded copy before `replaceState()`
     (`KSMEngine.loadedDivisionCourts()`; it read only what the copy holds). Save conflicts are unchanged (payload copies;
     the result is applied with the same load). Undo/Redo: a deeper patch path into a moved key goes through
     `assignState()` (section 2 point 8). The undo-regenerate restore point is a payload: unchanged.
   - Tests: `tests/store/divisions.test.mjs` (a unit test per action, the rename as one dispatch, the team court, L1, the
     load normalisation, strict / production stray writes, `replaceState()` / `assignState()`),
     `tests/divisions-store-test.py`. Test code that wrote these fields directly sets them through
     `KSMTest.app.setDivisionLists()` (`ksmReplaceDivisions()`).
10. **People**: `competitors`, `teams`, `exhibitions`, `teamDivisions` → `tournament/competitorAdded`, `…Updated`,
   `…Removed`, `…StatusCycled`, team and exhibition equivalents, `teamDivision…`. Risk: medium (rows edited in
   place by the Registration bridge). Tests: registration goldens, the #95 merge tests.
   Done (**PR 10**), no behaviour change (no golden changed):
   - The four fields are `tournament` slice fields and `state` getters (`moveToStore()`, `app-state.js`): `competitors`,
     `teams`, `exhibitions` start as `[]`; `teamDivisions` stays undefined (not in the snapshot) until the load-time
     migration builds it, as before. The snapshot keeps every key, value, type and row order
     (`tests/people-store-test.py` compares every key of the saved `state` with the PR 9 code's after 47 steps:
     Registration edits, team divisions, exhibitions, a draw with edits after it, four kinds of load, four save conflicts).
   - Actions: `competitorAdded` / `…Updated` (`{index, changes}`) / `…Removed` (`{index}`) / `…StatusCycled` (`{index}`,
     the engine's `statusCycle()` in the reducer), the same four for `team…` and `exhibition…` (one reducer factory for
     the three lists), `peopleLoaded` (whole lists: the samples, Clear, the team-division migration, the test API's
     `setPeople()`), and `teamDivisionAdded` / `…Updated` / `…Moved` / `…Removed`, which set `teamDivisions` and, when a
     team division edit changes its teams (the first one takes the teams without one; a new match format; a removal moves
     them), `teams` in the same action. Every writer goes through `app/modules/registration/people-store.js`; readers keep
     `state.x`. A source check (`tests/store/people.test.mjs`) fails on an assignment, a list method or a known alias write.
   - **How a row is named: by its index.** Players and exhibition matches have no id, and a 4.0 save's teams get one only
     at the migration, so a row action names its row by its index in the list, resolved by the caller right before the
     dispatch in the same synchronous step: an inline handler's index, or the row the island showed (F17 / F20: its own
     object, else the one row with the same fields in a new list; none or several: the edit is dropped with a notice, as
     before). Tested with a list reordered by another device, a row removed before it and a filtered table.
   - **Rows are store data**: each edit makes a new row object (untouched rows keep theirs), where the in-place write kept
     the old one. Two places relied on that identity, and both follow the row now (`ksmCurrentPerson()`, `people-store.js`):
     the island's bound rows (a typed field committed by the redraw a status click caused found its row by identity;
     `golden-registration-teams` step 44), and the draw's own lists, which hold the drawn rows themselves until the next
     load: an individual single elimination's entrants (`singleElimComps`) and a team bracket's teams (`teamElimTeams`,
     whose rosters the next rounds' bouts are built from). An edit of such a row showed there too, so the new row takes
     the old one's place there (a list a load gave holds copies, which no edit reached then or now). Round-robin pools
     hold copies (checked on the PR 9 code).
   - **The rename is one action**: `tournament/divisionRenamed` carries `competitors` from `renamedDivisionState()` with the
     division lists (`KSM_RENAMED_STATE_KEYS`); the separate assignment is gone. `grandChampions` joined it in PR 11;
     `courtState` and `courtActiveDivision` were still assigned just before it until PR 13a, which put them in it.
   - **Team divisions and the team court**: unchanged. `ksmSyncLegacyTeamDivision()` still copies the 'Team Tournament'
     team division's format, awards and court into the Setup, so its court wins over `settings.teamCourt` on a load and on
     its own court edit (the snapshot test checks `divisionCourts['Team Tournament']` equals the Setup field after every
     step, including the legacy team division's court edit and a load with team divisions).
   - **Save conflicts**: unchanged. `competitors` (three-way) and `teams` (by id, #95) are merged on payload copies; the
     result lands through `replaceState()` with the same rows in the same order (the snapshot test: both devices add, an
     edit against a removal, a status cycled on both, teams by id with an add, an edit and a removal).
   - **Undo/Redo and the restore point**: unchanged (a patch into a moved key goes through `assignState()`, section 2
     point 8; the undo-regenerate restore point is a payload).
   - Test code that wrote these fields sets them through `KSMTest.app.setPeople()`; a row is never edited in place there
     either (a sloppy-mode test script would fail silently: `team-award-mode-change-test.py` did).
   - The store bundle 8,964 → 9,206 bytes gzip, over the 9,000 budget: raised to 9,300 on purpose (section 5).
11. **Awards and grand champion**: `awards`, `grandChampions` → `tournament/awardSet`, `grandChampion…`. Risk:
   low-medium. Tests: results goldens, grand champion tests.
   Done (**PR 11**), no behaviour change (no golden changed):
   - Both fields are `tournament` slice fields and `state` getters. `awards` starts as `[]`; `grandChampions` stays
     undefined (not in the snapshot) until a row is added or loaded. The snapshot keeps every key, value, type and row
     order (`tests/awards-store-test.py` compares every key of the saved `state` with the PR 10 code's after 35 steps:
     awards added, edited, removed; grand champions added, renamed, sources toggled, moved, removed; a source renamed; the
     grand champion drawn and edited after the draw; four kinds of load; four save conflicts).
   - Actions: `awardAdded` / `awardSet` / `awardRemoved` / `awardsLoaded` and `grandChampionAdded` / `…Updated` / `…Moved`
     / `…Removed`: one reducer sets the list the app computed from the current rows (an award has no id: its row is found
     by its index right before the dispatch, in the same synchronous step; a grand champion edit is the whole list, as a
     team division's). Every writer goes through `app/modules/results/awards-store.js`; readers keep `state.x`. The
     director's decisions (keep / rebuild, a stand-in) are `grandChampionUpdated` too. A source check
     (`tests/store/awards.test.mjs`) fails on an assignment, a list method or a known in-place write.
   - **The rename** carries `grandChampions` with the division lists (`KSM_RENAMED_STATE_KEYS`): one action, one
     notification. `courtState` / `courtActiveDivision` were still assigned just before it until PR 13a.
   - **Grand champion draws** are unchanged: `singleElimComps`, `allMatches`, `divisionCourts` and the rest of the draw are
     still plain `state` (PR 12), written in the same synchronous step as before; only the row list moved.
   - **Save conflicts**: unchanged. The merge runs on payload copies (`mergeGrandChampionRecords`, awards three-way) and its
     result lands through `replaceState()` with the same rows in the same order (the snapshot test: a grand champion edited
     on both devices, an edit against a removal, both adding one, awards edited and added on both).
   - Test code that wrote `state.awards` sets it through `KSMTest.app.setAwards()` / `setAward()`; a row is never edited in
     place there either.
   - **One fix, found by the snapshot test**: a moved key whose value is undefined is still a key of `state` (a getter), so
     `historyComparableState()` compared two "missing" markers and wrote a no-op patch for it in every court action's
     history entry (PR 9's `hiddenPresets` already did; `grandChampions` would have made two). It now leaves undefined
     values out, as an absent key was before the move. The entries lose that patch; nothing reads it (Undo applies each
     patch's `after`). `tests/store/fixtures/people-snapshots-before.json`'s `courtActionHistory` hashes (7 of them, one
     court session carried through the later steps) are refreshed for it, checked as the old history minus its no-op
     patches; `awards-snapshots-before.json` was recorded with the fix applied to the PR 10 code.
   - The store bundle 9,206 → 9,262 bytes gzip, inside the 9,300 budget (section 5).
12. **Structure**: `pools`, `teamPools`, `brackets`, `championshipNodes`, `singleElimNodes`, `singleElimComps`,
    `byeWinners`, `teamBracketNodes`, `teamElimTeams`, `generated`, `managementRevision` →
    `tournament/divisionGenerated` (the engine's `generateDivision` plan), `…Regenerated`, `poolsEdited`,
    advancement plans as `tournament/advancementApplied`. Risk: high (orchestration, `generateDivisionState`).
    Tests: golden-engine, pool-edit and regenerate tests, undo-regenerate. Split in two by the coordinator: **12a** the
    draw (done, below), **12b** the bracket nodes.
    Done (**PR 12a**), no behaviour change (no golden changed):
    - `pools`, `teamPools`, `brackets`, `singleElimComps`, `byeWinners`, `generated`, `managementRevision` are `tournament`
      slice fields and `state` getters (`moveToStore()`, `app-state.js`), at the literal's places; `singleElimComps` and
      `byeWinners` stay undefined (not in the snapshot) until Generate Tournament, as before. The snapshot keeps every key,
      value, type and order inside each value (`tests/structure-store-test.py` compares every key of the saved `state` with
      the PR 11 code's after 32 steps: every format drawn, Edit Pool, single-division regenerates, No Shows in a pool, a
      bracket, a team round robin and a team bracket, a court change after the draw and back to split, the grand champion drawn and cleared,
      five kinds of load including the undo-regenerate restore point, three save conflicts).
    - Actions (one shared reducer that sets the maps it is given, as PRs 9-11): `drawReset` (Generate Tournament's
      start), `divisionGenerated` (one division's plan), `tournamentGenerated` (`generated` and the bump), `divisionRegenerated`
      (Regenerate Single Division: the old entries out, the new draw, the bump), `divisionCleared` (a grand champion's draw
      cleared; a failed regenerate put back), `poolsEdited` (Save Pool Changes: pools, template, bump), `drawEntriesUpdated`
      (rows changed without a new draw: a No Show with its bump, the grand champion's stand-in, a court change after the
      draw dropping the pools' `court`, a pool's split court kept on it by `poolCourtFor()` (it wrote `pool.court` in place;
      found by the strict browser tests, not by the first draft of the snapshot test), a Registration edit followed into
      `singleElimComps`). Every writer goes through
      `app/modules/engine/structure-store.js` (`ksmSetDraw()`, `ksmDrawWith()`: one division's entries with the key order a
      `delete` and an assignment left, `ksmEditedPools()`); readers keep `state.x`. A source check
      (`tests/store/structure.test.mjs`) fails on an assignment, a `delete`, a list method or a known in-place write.
    - **Order, and why no half-drawn division is visible**: `generateDivisionState()` writes the plain parts first
      (`allMatches`, `currentByDivision`, the nodes, `teamElimTeams`), then dispatches the division's draw, then runs what
      reads the new draw from the store (`syncChampionshipTemplate()`, the division court); Generate Tournament resets the
      plain maps right before `drawReset`. Save Pool Changes dispatches first (its match builders read the new pools and
      template from the store) and rebuilds the matches right after. Each is one synchronous step; the store's only
      subscribers are the React islands (`useSyncExternalStore`, which re-render after the step) and
      `ksm:state-changed` is coalesced to a microtask after it (`ksmNotifyStateChanged()`). The browser test checks that every notification of a
      Generate shows the same divisions in the store's `pools` and in `state.allMatches`.
    - **Shared objects**: a team round robin's pools are its team pools (one list from the engine) until a load copies
      them; a team's No Show edited both through that list, so `ksmEditedPools()` replaces the pool in both and keeps one
      list. A bracket node won by a bye holds the entrant's row itself: the grand champion's stand-in (a new row now) is
      followed into `singleElimNodes`, as the in-place swap reached it.
    - **The rename**: `renamedDivisionState()` rewrites none of these fields (a division with a draw cannot be renamed), so
      `divisionRenamed` is unchanged. **Save conflicts**: unchanged; the structural replay and the merges run on payload
      copies and land through `replaceState()` with `managementRevision` as computed. **Undo/Redo and the restore point**:
      unchanged (a patch into a moved key goes through `assignState()`; the undo-regenerate restore point is a load).
    - **The load**: `managementRevision ||= 0` (with `teamElimTeams ||= {}`, in that order) runs on the loaded copy before
      `replaceState()`.
    - Known difference on an error path only: a regenerate whose map is missing (`singleElimComps` on a never-generated save)
      threw in the old code and was put back; the new code creates the map. Unreachable: a regenerate needs `generated`, and
      Generate Tournament creates the maps.
    - Test code that wrote these fields sets them through `KSMTest.app.setDraw()`; an entry is never edited in place there.
    - The store bundle 9,262 → 9,346 bytes gzip (seven action names), over the 9,300 budget: raised to 9,400 (section 5).
    Done (**PR 12b**), no behaviour change (no golden changed):
    - `championshipNodes`, `singleElimNodes`, `teamBracketNodes`, `teamElimTeams` are `tournament` slice fields and `state`
      getters (`moveToStore()`, `app-state.js`) at the literal's places, `{}` until drawn. The snapshot keeps every key, value,
      type and order inside each value (`tests/bracket-nodes-store-test.py` compares every key of the saved `state` with the
      PR 12a code's after 40 steps: every bracket drawn and played through on both courts, Undo/Redo of advancing bouts,
      regenerates, a team's and a player's No Show in a bracket, the grand champion drawn, a runner-up standing in and the
      draw cleared, three kinds of load including a 4.0 save without `teamElimTeams` and the undo-regenerate restore point,
      three save conflicts). One thing compared loosely, on purpose: a court action's patches grouped by top-level key,
      since their order follows `Object.keys(state)`, which after a load differs once a key is a getter (item 5 (3)); the
      patches on one key, and every value, are the same.
    - Writes: a division's nodes go in its draw action (`drawReset`, `divisionGenerated`, `divisionRegenerated`,
      `divisionCleared` (the grand champion's clear, a failed regenerate put back), `poolsEdited` (Edit Pool's championship
      nodes, built from the template before the dispatch)), so a division is still drawn in one dispatch: the bracket's
      first sync runs on the plan's own nodes (a `draft`). While bouts are scored, `syncIndividualSingleElim()` /
      `syncTeamBracket()` take the engine's plan, write the bouts (plain `allMatches`), and then dispatch the nodes with
      their new winners (`ksmNodesWithWinners()`: a new node per winner) as **one `tournament/advancementApplied` per sync**
      (none when nothing advanced). A team's No Show in a bracket (`teamElimTeams` with the team's place `null`, the nodes'
      winners cleared and synced again, the bump) and a player's No Show (the new bracket) are one `drawEntriesUpdated` each;
      the grand champion's stand-in carries the nodes with the entrants; Registration's follow carries `teamElimTeams` with
      `singleElimComps`; the load's single-elimination repair dispatches `advancementApplied` when it found other winners. Two
      dead functions that wrote nodes went (`syncSingleElimNodeWinnerFromMatch()`, `buildTeamMatches()`). A source check
      (`tests/store/bracket-nodes.test.mjs`) fails on an assignment, a `delete`, a list method or a `.winner=` in app code.
    - **Order, and why no half state is visible**: in every path that advances a bracket (Next Match, a grand champion's
      Fusen-sho, a load's repair) the plain bout writes come first and the nodes' dispatch last, in the same synchronous
      step, so even a synchronous store subscriber never sees a finished bout without its node's winner (the browser test
      checks this on every notification while both courts score every bracket). Undo/Redo applies an entry's patches in
      their recorded order, a node patch through `assignState()` (a copy of the key, section 2 point 8), so inside that one
      step the node can change before its bout; no reader runs inside it: the islands re-render after the step
      (`useSyncExternalStore`) and `ksm:state-changed` is a microtask after it, as with the plain writes before.
    - **Identity**: nodes hold values, not rows: a single elimination's winners are `{name, dojo}` objects built by the
      engine (never a `singleElimComps` row; the grand champion's follow is kept for a save that has one), a team bracket's
      winners are team names, and every reader compares by name or id (checked: no `===`, `indexOf` or `includes` on a node
      winner). `teamElimTeams` holds Registration's team rows themselves (Immer keeps a frozen row's reference), which
      Registration's follow finds by identity, as before; a load gives copies, as before.
    - **The rename**: `renamedDivisionState()` rewrites none of the four (a division with a draw cannot be renamed), so
      `divisionRenamed` is unchanged. **Save conflicts**: unchanged; the structural replay and the merges run on payload
      copies and land through `replaceState()`. **The undo-regenerate restore point**: a load, unchanged. **The load
      default** (`teamElimTeams ||= {}`) already runs on the loaded copy (PR 12a).
    - The store bundle 9,346 → 9,390 bytes gzip (one action name), inside the 9,400 budget.

13. **Matches and courts**: `allMatches`, `courtState`, `courtActiveDivision` (→ selector), `currentByDivision`,
    `courtActionHistory`, `courtRedoHistory`, `courtUndoLog` → `court/pointScored`, `court/hansoku`,
    `court/nextMatch`, `court/undo`, `court/redo`, tiebreak/playoff creation, `patch-v1` from Immer patches. Risk:
    highest. Tests: court-actions, concurrent rebase (v31712, v31715), edit-conflicts, e2e full tournament, all
    goldens; time a point on the oldest TV/tablet. Split in three by the coordinator: **13a** the court pointers (done,
    below), **13b** the court history and undo, **13c** `allMatches` and the court actions.
    Done (**PR 13a**), no behaviour change (no golden changed):
    - `currentByDivision`, `courtState`, `courtActiveDivision` are `tournament` slice fields and `state` getters
      (`moveToStore()`, `app-state.js`) at the literal's places, with the literal's initial values. The snapshot keeps every
      key, value, type and order (`tests/court-pointers-store-test.py` compares every key of the saved `state` with the
      PR 12b code's after 36 steps: a court's division picked and renamed before the draw; pools, a single elimination, two
      round robins and a team bracket drawn on two courts; a regenerate; Edit Pool; Kids' bouts drawn into a tiebreak; Next
      Match through pools and brackets on both courts; a director on Court A picking a division and drawing Court B; a
      spectator and a TV on Court B picking and drawing; a remote apply while the spectator shows another division; Staff
      Login's catch-up and the catch-up before a court action; Undo / Redo across Next Match; three 4.0-shaped loads
      (without `courtActiveDivision`, a court missing from `courtState`, without both); two save conflicts; the reset; a
      tournament switch).
    - **Both stay stored**: `courtActiveDivision` is not always `courtState[c].division` (a 4.0 save without it, or a
      `courtState` without a court: the load heals only this device's court, so the other court has no
      `courtActiveDivision` entry; the fixture has both), and `currentByDivision` is the scorekeeper's remembered position,
      which no selector over the matches gives.
    - Actions (one reducer: the entries the payload names are set, a missing map created): `court/divisionSelected` (a
      court's scorekeeper picks a division: `openCourt()`, `setActiveDivision()`), `court/pointerMoved` (Next Match through
      `applyCourtState()`, a render's self-heal `courtCurrentMatch()`, `syncOwnCourtPointer()` on Staff Login and before a
      court action, the load's reconciliation, the view rebuilt after Undo/Redo), `court/pointersResolved` (`meta.court`
      null: generation's `initCourtStates()`, a regenerate, the No Shows, Edit Pool, a division's court changed, the grand
      champion's draw and clear, the tiebreak reorder on the live state). A division drawn carries its queue position in its
      draw action (`divisionGenerated`, `divisionRegenerated`, `divisionCleared`; `drawReset` empties the map); the rename
      carries `courtState` / `courtActiveDivision` in `tournament/divisionRenamed` (`KSM_RENAMED_STATE_KEYS`: it is now
      everything `renamedDivisionState()` rewrites). Every writer goes through `app/modules/court/court-pointers-store.js`
      (`ksmMoveCourtPointers()`: only the entries that change, none when nothing does, so a self-heal that lands where the
      court is notifies no one); readers keep `state.x`. A source check (`tests/store/court-pointers.test.mjs`) fails on an
      assignment, a `delete` or an `Object.assign` of the three in app code.
    - **The PR 6 rule is unchanged**: only `isCourtScorekeeper(c)` moves Court *c*'s pointer; a spectator's, a TV's or
      another court's view choice dispatches only `device/…` actions (the fixture's spectator and TV steps).
    - **Order, and why no half state is visible**: Next Match writes the bout (`m.done`, plain `allMatches`), runs the
      advancement (plain bouts, then `advancementApplied`), then `applyCourtState()` dispatches the pointer; generation writes
      `allMatches` first, then the division's draw with its queue position, then `initCourtStates()`; Edit Pool rebuilds the
      matches before `pointersResolved`; the tiebreak reorder replaces the list before it. So a pointer never points into a
      list the store's notification cannot yet see (the browser test checks at every `court/…` notification that each
      court's index is inside its list and that Next Match's pointer is not on the bout it just finished). As before, a
      notification inside Next Match from another action (`advancementApplied`) still shows the court on the bout being
      finished; no reader runs inside the step (islands re-render after it, `ksm:state-changed` is a microtask).
    - **Save conflicts**: unchanged. The rebase (`preserveOwnedCourtRuntimeState()`, the structural replay's re-resolve,
      `sanitizeLoadedTournamentState()`) works on payload copies; its result lands through `replaceState()` unchanged
      (fixture: both courts pressing Next Match at once; a Court B tablet catching up after Staff Login against Court B's
      Next Match elsewhere; a remote apply while a spectator shows another division).
    - **Undo/Redo**: a patch on `courtState.A.index` / `currentByDivision.X` goes through `assignState()` with a copy of the
      key (section 2 point 8) until 13b, as for the other moved keys. **Frozen values**: the tiebreak reorder wrote
      `cs.index` into the live pointer; on the live state it now builds `{...cs, index}` (a payload copy is still written in
      place). Tests that wrote the pointers set them through `KSMTest.app.setCourtPointers()` (whole maps); the vm tests get
      a plain-state `ksmMoveCourtPointers()` (`tests/lib/derived-matches.mjs`).
    - Known difference on an error path only: a scorekeeper's view choice on a save without `currentByDivision` threw
      (`state.currentByDivision[div]=…` on undefined) and now creates the map.
    - Measured (headless Chromium, 6x CPU throttling, 6 divisions of 16 on split courts, 48 bouts and 15 applies per run,
      four runs each, before and after interleaved): a point and Next Match, median 43-55 ms before and 45-50 ms after; a
      remote snapshot apply 20-25 ms both. No difference beyond the run-to-run noise (a self-heal that changes nothing
      dispatches nothing). The owner times a point on the oldest TV/tablet before 13c.
    Done (**PR 13b**), no behaviour change (no golden changed):
    - `courtActionHistory`, `courtRedoHistory`, `courtUndoLog` are `tournament` slice fields and `state` getters
      (`moveToStore()`, `app-state.js`): the first two at the literal's places with `{A: [], B: []}`; the Undo log's getter
      comes last (it was never in the literal) and is undefined until the first Undo/Redo, so the snapshot leaves it out
      as before. The snapshot keeps every key, value, type and order, the entries' patch order included
      (`tests/court-history-store-test.py` compares every key of the saved `state` with the PR 13a code's after 60 steps,
      the history exactly: points, hansoku, Next Match, each undone and redone on both courts; a new action clearing Redo;
      an advancing bracket bout and a tiebreak-drawing Next Match undone and redone; the 100-entry limit; the 40-entry Undo
      log limit; a Redo after a remote apply; a 4.0-shaped save with old entries (no identities, a pre-`patch-v1` entry);
      four save conflicts; the grand champion drawn, its history forgotten when cleared; the reset; a tournament switch).
    - Actions (`meta.court`; the app computes each court's new list from the store's, right before the dispatch, in
      `app/modules/court/court-history-store.js`): `court/actionRecorded` (the entry pushed, the court's Redo list cleared,
      the oldest dropped beyond 100), `court/undo` / `court/redo` (the entry moved, the F30 log entry appended, trimmed to
      40, and every store-owned key the entry's patches changed), `court/historyNormalized` (`ensureCourtHistory()`: maps
      created, pre-`patch-v1` entries dropped; now only when something changes, where it reassigned both lists on every
      render), `court/historyForgotten` (a grand champion's draw gone: its bouts' patches dropped). Their payload is
      `writes` (`{path, value}`, as the legacy writes), applied by the root reducer: an Immer reducer given a new list of
      100 entries walks all of them when it finalizes (+15 ms per point and +23 ms per remote apply at 6x throttling,
      production build), so `applyStoreWrites()` is now a path copy (only the objects on a written path are copied; strict
      mode deep-freezes what it wrote, as Immer did), which also serves `replaceState()` / `assignState()`.
    - **Undo/Redo in one step** (#199 review L1): the entry's patches on plain keys (`allMatches`) are written first, then
      one `court/undo` / `court/redo` carries the history move, the log entry and the new value of every store-owned key
      (nodes, pointers, …; device keys still skipped, section 2 point 6). The court view is rebuilt after it as before
      (`applyCourtState()`: `court/pointerMoved` and the `device/…` actions). It stays a separate dispatch: it reads the
      patched pointer and lists and writes device state, so folding it in would mean running `applyCourtState()` on copies;
      after the one dispatch every pointer is already inside its list (the checks below). The F30 log entry is now built before that rebuild and render (it
      was built after them); the fixture shows the same entries.
    - **Every notification, no half state** (#201 review L2): the checks in `tests/court-pointers-store-test.py` (pointers
      inside their lists, not left on a deleted list) and `tests/bracket-nodes-store-test.py` (a finished bout's winner on
      its node, and no winner on a node whose bout is not finished) run at every store notification, with Undo/Redo, Generate
      Tournament and a grand champion's draw and clear in the run. The grand champion's clear now re-resolves its courts in
      its own `tournament/divisionCleared` (same values; the old `court/pointersResolved` came right after it). Allowed by
      name with their reason: Generate Tournament (`drawReset` empties every draw; the courts are re-resolved at its end by
      `initCourtStates()`, which needs the new draw; resetting them in `drawReset` would change the saved pointers when
      nothing gets drawn), and the grand champion's draw (`ksmDrawGrandChampion()`: a court on it is kept through its clear
      and new draw and re-resolved after it, from the new lists). Each is allowed only from the action that opens it
      (`drawReset`, `divisionCleared`) until the court is re-resolved or the draw is back, for a court on that division, and
      the test fails if either never occurs (a step redraws the grand champion with a court on it).
    - **Save conflicts**: unchanged. The rebase's history merge, the match-op replay (`replayCourtMatchOps`) and the F30 log
      replay run on payload copies; the result lands through `replaceState()` (fixture: two courts scoring, then one
      undoes; an Undo here while the other court's entry arrives; the F30 log replayed; a Redo here against the other
      court's Next Match).
    - **Frozen values**: no code kept a list across a write (the old `stack.pop()` / `push()` on the live lists became the
      actions above); a grand champion's forget builds new lists. Test code wrote the history only on payload copies;
      the vm tests get plain-state stand-ins (`historyHelpers()`, `tests/lib/derived-matches.mjs`). A source check
      (`tests/store/court-history.test.mjs`) fails on an assignment, a `delete` or a list method on the three in app code.
    - Known difference on an error path only: an Undo/Redo whose patches throw midway left the entry popped (lost) and the
      store keys written so far; now the entry stays on its list and no store key is written, while the plain `allMatches`
      writes made before the throw stay (as before). So such a throw can leave a bout changed without its node or pointer;
      before, it left whichever of them came first in the entry. Dispatching the collected keys on a throw is not done:
      without the history move it would leave an entry that is half applied and still on the Undo list.
      (13c-1 made the entry's `allMatches` writes one batch: a throw before it left no bout written, one inside it the
      batch's writes so far. Since 13c-2 the batch goes in the court/undo or court/redo too, so a throw anywhere leaves
      nothing written: #206 re-review L-a.)
    - Measured (headless Chromium, 6x CPU throttling, 6 divisions of 16 on split courts, 48 bouts and 15 applies per run,
      production build, before and after interleaved): a point + Undo + Redo 43-45 ms both; Next Match 22-23 ms both; a
      remote snapshot apply 21-23 ms before, 18-21 ms after. The strict test build pays for freezing (a load 23-27 → 30 ms).
    **13c** (last): `allMatches` and the court actions (`court/pointScored`, `court/hansoku`, `court/nextMatch`, tiebreak /
    playoff creation, `patch-v1` from Immer patches). Design note from 13a's survey (app/modules, app/main.js, app/engine):
    - Identity uses of a Match Object: `arr.indexOf(m)` in `activeScoreArrays()` (court-queue-and-views), the court island's
      model (react-bridges/court, twice), Live Scores (`all.indexOf(current)`), the playoff insertion
      (`arr.indexOf(m)` then `splice`, court-context-and-pool-editing); `state.matches===state.allMatches[div]` in
      `applyCourtHistoryEntry()` (the alias test); `state.matches[state.current]` held across `performCourtAction()` in
      `nextMatch()` (`m` is read before and written inside); every `cs.index` / `state.current` is an index into a list (6
      reads of `list[cs.index]`). Also (found in #201's review and a re-grep): Director Progress
      (`ordered.indexOf(current)`, setup/director-progress.js:99); `canonicalSingleElimMatch()` (`m !== kept`, then
      `arr.indexOf(m)` + `splice`, engine/bracket-helpers.ts:39); the court island's queue (react/features/court/publish.ts:
      `all.indexOf(current)` at 341 and `m === current` / `m !== current` at 321, 335, 342, 352); the overlay's upcoming
      bouts (`all.indexOf(current)`, react/features/overlay/court-match.ts:242); the TV's active bout (`x === m`,
      react/features/tv/publish.ts:54). So `===` / `!==` between matches **is** used. No `Map` / `Set` / `WeakMap` keyed
      by a match and no `includes(m)`. The sync code already compares by `matchSyncIdentity()`.
    - Writes through an alias: about 22 field writes on a match held in a variable (`m.done`, `m.wp` …: Next Match,
      `syncActiveScoreToMatch()`, the grand champion's Fusen-sho, the division court's `m.court`, the results' name fix),
      2 `Object.assign(match, …)` (result integrity), 12 list mutations (`push` / `splice` / `sort` on a division's list),
      22 assignments of `state.allMatches[div]`, the engine syncs (`single-elim.ts`, `teams.ts`) writing plan values into
      matches, and `replayCourtMatchOps(state, …)` / `applyHistoryPatch()` walking paths on the live state.
    - A brief half state (found in 13a): a `tournament/…` notification showing `courtState` on a division whose `allMatches`
      entry was just deleted. Since 13b every notification is checked: the grand champion's clear is fixed, Generate
      Tournament and the grand champion's draw are allowed by name (13b above). 13c's new store subscribers must keep
      those two in mind, or re-resolve the pointers inside those draw actions.
    - From 13b: an Immer reducer that is given a large new value (a whole list) walks it when it finalizes, also in
      production (Immer 11 skips that only when no draft is left unfinalized). 13c's reducers should edit drafts in place
      (a bout's fields, one match inserted) rather than assign rebuilt lists, and the time of a point, Next Match and an
      apply should be measured as in 13b.
    - Approach: first, as its own PR, **ids instead of identity** (no store change): give every match a stable id
      (`matchSyncIdentity()` already exists), switch the `indexOf(match)` and `===` sites above and `nextMatch()`'s held `m` to look the
      match up again by id after each write, and keep `state.matches` derived. Then move `allMatches` with a reducer per
      court action that runs the existing engine/app logic on an Immer draft (`produceWithPatches`, so the `patch-v1` entry
      comes from the patches), converting the alias writes file by file behind the strict browser tests.
    - **Done: ids instead of identity** (the PR before 13c; no store change, no saved field, no behaviour change, no golden
      changed). One helper: `KSMEngine.matchIndexIn(list, match, hint)` / `findMatchAgain()` (`app/engine/integrity.ts`;
      the React side through `shared/legacy.ts`, the overlay from the engine file): the same object first (what `indexOf`
      gave), else the entry with the same `matchSyncIdentity()`. The identity is **not unique**: a kachinuki pairing's
      bouts share one (`team-pair:…:Kachinuki:kachinuki`, and `team-node:…` in a bracket; seen 3-5 per pairing in the
      test), so among several the one equal in every field wins, else the one at `hint` (the index the caller held), else
      the first. When no entry has the identity (pool and tiebreak identities hold the names, so a rename between holding
      and looking up misses), the entry at `hint` is taken if it is the same slot (`sameMatchSlot()`: every placement
      field equal, `poolTemplateOrder` included, names aside) and no other entry of the list is (exhibitions and pool bouts
      saved before the slots share one slot), else -1 (and `nextMatch()` / `setRepresentative()` keep the held object, as before).
      Converted: `activeScoreArrays()` and `ksmHansokuCounts()` (through `isScoringMatch(m)`), `ksmTeamSheet()`, the court
      island's pool card and queues (`m === current` → the current bout found again in the list read after
      `enforceUniqueIndividualMatches()`, or compared by index), the TV's team rows, `tvUpcomingMatches()`, the overlay's
      upcoming bouts, Director Progress, the kachinuki insertion (`nextMatch()` passes its held index),
      `appendApprovedDynamicMatches()`'s anchor (the pre-2.x tiebreak identity kept as the last fallback),
      `canonicalSingleElimMatch()` (by position; a second reference to the kept object stays, as before),
      `applyCourtHistoryEntry()`'s alias test (by division, not list identity), and the two writers that held a match
      across `performCourtAction()`: `nextMatch()` and `setRepresentative()` look it up again inside the action, and
      `nextMatch()` looks it up once more right after writing the result, so the calls after it (tiebreaks, kachinuki,
      brackets) are given the list's match, not the object it wrote. Left as
      same-moment identity (the objects come from one list read in the same call, with no write between):
      `normalizeIndividualPoolTiebreakOrderInState()`'s "order changed" test, `uniqueIndividualMatches()`,
      `syncTeamBracket()`'s `current===arr` (a list, read just before by its callers), and `ksmScoreboardInput()`'s request
      (handled in the same synchronous event).
    - **No hint** where the searched list is sorted or filtered (`tvUpcomingMatches()`, the overlay, `courtSummaryFor()`,
      the TV's team rows): there two entries equal in every field (e.g. two unplayed exhibitions of the same two names)
      resolve to the first once 13c gives them new objects, where `indexOf` found the one held. `ksmTeamSheet()` and the
      court queues pass `state.current` (their list is `allMatches[div]`). 13c can pass the court's index through
      `courtCurrentMatch()` if that case matters.
    - What 13c can assume: no code compares a Match Object it read before a write, or before a call that may write, with
      one read after it; reads by `state.matches[state.current]` / `list[cs.index]` are re-read after a write. **Rule for
      13c: every read after a write uses the match looked up again**, never the object the write went through (in 13c that
      object keeps its old values). Still to do
      in 13c: the alias writes (fields written one by one through a held match: `nextMatch()`'s result (`wp`, `rp`, `wt`,
      `rt`, `completedResult`, `done`, the match now found again first), `syncActiveScoreToMatch()`, the grand champion's
      Fusen-sho, the division court's `m.court`, `appendApprovedDynamicMatches()`'s `origin` / `dynamicType`,
      `setRepresentative()`'s name, `Object.assign(m, …)` in result integrity, the engine syncs) become one action each.
    - The guard is `tests/match-identity-copy-test.py`: two pages play the same tournaments; in one, every Match Object is
      replaced by a structural copy at every store notification, every app event (`window.dispatchEvent`), every
      assignment of a division's list, just before a court action's body and right after Next Match's result write (two
      test-only hooks, `globalThis.KSMTestBeforeCourtAction?.('action' | 'result')`, in `court-scoring-and-history.js`; at
      the second, the objects copied at the first are put back to their values from then, so a held match is as stale as
      in 13c), and every screen (saved
      state, this device's view, the court screen's inputs, Live Scores, the TV's model and island input, Director
      Progress; the overlay in Node, `tests/lib/overlay-copy-check.mjs`) must match. Each converted site reverted alone:
      caught are `nextMatch()`'s and `setRepresentative()`'s look-up inside the action, `tvUpcomingMatches()`,
      `ksmTeamSheet()`, the split single elimination's queue and the overlay. `nextMatch()`'s look-up after the result write
      and the kachinuki insertion guard the same case: reverted together they are caught (30 divergences); either alone is
      not, because the other one still finds the bout, and the stale match differs from the list's only in `done` and
      `completedResult`, which no call after the write reads from `m` (each point already wrote `wp` / `rp` / `wt` / `rt`
      through `syncActiveScoreToMatch()`; the calls read `done` from the list). Not caught, and why: the anchor of
      `appendApprovedDynamicMatches()` (the old code already fell back to the identity, and `sortTeamMatches()` reorders the
      kachinuki playoff after it), Director Progress (its list is already sorted in place, so the fallback gives the same
      bouts), `ksmHansokuCounts()` (on Live Scores' team and kachinuki path, `tvUpcomingMatches()` → `sortTeamMatches()`
      rewrites the list between reading the bout and the call, as for `ksmTeamSheet()`, but the stored `wt` / `rt` equal the
      live counts, since each hansoku writes them), and `activeScoreArrays()`, `ksmPoolCard()`, the pool and dedupe queues,
      `ksmQueuePanelInput()`, the TV's team rows, the alias test and `canonicalSingleElimMatch()` (the objects compared come
      from one read with no write between, so a new object per write cannot separate them; the alias test compares lists,
      which the copies keep). On next/4.1 it fails in four places: the TV's Upcoming Matches, the overlay's upcoming bouts
      and the split single elimination's court queue list the bout being played, and Live Scores' team sheet loses its
      "NOW" row. When `allMatches` moves, its copy hook (a plain write into `state.allMatches` today) becomes a test action
      that replaces the matches in the store, and the two hooks become the actions' own dispatches.
    - 13c is split in two by the coordinator: **13c-1** routes every `allMatches` write through one module while it stays a
      plain field (done, below); **13c-2** moves it into the `tournament` slice by changing only that module's bodies.
    Done (**PR 13c-1**, #206), no behaviour change (no golden changed, no saved-format or store change; the store bundle is
    the same):
    - **One write module**: `app/modules/court/match-writes.js`.
      - `ksmSetAllMatches(map)`: Generate Tournament's reset, the rename's renamed map; assigned as given.
      - `ksmSetDivisionMatches(div, list)`: a draw, a rebuild, a reorder into a new list, a dedupe. `undefined` is stored
        as the old assignment stored it (the regenerate's restore of a division that had none).
      - `ksmDeleteDivisionMatches(div)`: the old `delete` (a regenerate before its new draw, a grand champion's clear).
      - `ksmUpdateMatch(div, index, set, remove)`: one bout's fields in one write; returns the bout read again.
        `ksmUpdateMatches(div, [{index, set, remove}])`: several bouts in one write. An index without a bout throws, as
        `Object.assign` on it did.
      - `ksmInsertMatches(div, at, matches)`, `ksmAppendMatches(div, matches)`, `ksmRemoveMatches(div, at, count)`.
      - `ksmSortDivisionMatches(div, compare)`: a stable sort; returns the list read again.
      - `ksmWriteMatchPath(path, value, missing, 'history' | 'replay')`: one path write, with `writeHistoryValue()`'s or
        `applyPatchToStateObject()`'s rules (the rebase's per-patch replay on its server copy).
      - `ksmWriteMatchPaths(writes)`: several writes in one step, in order, each look-up by identity seeing the writes
        before it (fixed paths, a bout found by the first of its identities, a removal by identity, an insertion after a
        bout by identity). An Undo/Redo entry's `allMatches` writes (its match ops, then its patches) and
        `replayCourtMatchOps()` are one batch each (#206 review M2).

      Each call names its division and the bout by index or identity (callers that held a bout find its index just before
      with `KSMEngine.matchIndexIn()`). The last argument `root` is `state` by default; any other object is a payload copy
      (a load being built, the rebase's server copy), written in place, also in 13c-2. Here every helper still writes in
      place.
    - **No write when nothing changes** (#206 review M1): `ksmSetDivisionMatches()` writes nothing when the division
      already holds the same entries in the same order, and `ksmSortDivisionMatches()` nothing when the order would not
      change. The read paths that sort or dedupe a division's list on every call (`sortTeamMatches()`,
      `sortIndividualDivisionMatches()`, `enforceUniqueIndividualMatches()`, `dedupeSingleElimMatches()`; the court queue,
      Live Scores, the TV, Director Progress, `findNextForCourt()`) so write only when the list really changes.
      `tests/match-writes-store-test.py` checks that a second round of those paths writes nothing (without the rule: 11
      writes per round).
    - **Batched per step**: a point (`wp`, `rp`, `wt`, `rt`: `syncActiveScoreToMatch()`), a result (those, `completedResult`,
      `done`: `nextMatch()`, the grand champion's Fusen-sho; the snapshot is taken from the bout with its final points before
      `done`, as before), a representative (`white` / `red`), a result repair (its `set`, then `completedResult` removed for a
      reopen), the engine syncs' plan values (`ksmUpdateMatches()` with the plan's updates), a division's courts after its
      court changed, a substitution's names (`white`, `wdojo`, `red`, `rdojo` per bout) and an Undo/Redo entry are one call
      each; the keys keep their old order (`Object.assign`).
    - **Engine syncs, same order**:
      - `syncIndividualSingleElim()`: a list that is not the division's yet (a draw's) is put in place first; then the
        plan's values, the bracket order and the dedupe; then the nodes' `advancementApplied`.
      - `syncTeamBracket()`: the list put in place when it is a draw's, the new bouts appended, the team order.
      - The championship template: a missing list created, the missing bouts appended, the plan's values.
      - The dynamic bouts: tiebreaks appended then the pool order repaired; playoffs, daihyosen and kachinuki's next bout
        inserted after their anchor.

      Bouts first, nodes after, as before. Every caller reads the list again after a sync:
      `buildIndividualSingleElimMatches()` returns the division's list, not the draft it was given, and generation no longer
      re-assigns the draft after the sync. `sortTeamMatches()`'s keys read the list as it was before the sort (V8 sorts a
      copy and writes it back at the end, so the in-place sort's comparator read that order too).
      `sortIndividualSingleElimMatches()` returns a sorted copy (its only caller, `dedupeSingleElimMatches()`, replaced the
      list right after).
    - **History, rebase, load**:
      - `patch-v1` entries are built as before (whole-state comparison).
      - An Undo/Redo writes its `allMatches` part as one `ksmWriteMatchPaths()` batch: the match ops of its divisions first,
        then its patches in the entry's order; the patches on other keys and the match-index fields after it, as before.
        The applied/skipped record for the Undo log is the same.
      - The rebase writes its server copy's `allMatches` through the helpers with `root`: the replayed patches
        (`ksmWriteMatchPath(…, 'replay')`), a bout added for a patch (`ksmAppendMatches()`), a structural division copied
        (`copyStructuralDivision()`) and the match ops (`replayCourtMatchOps()`, one batch).
      - `sanitizeLoadedTournamentState()` and the result repairs write through the helpers with their `root`.
      - The load (`applyTournamentPayload()` → `replaceState()`) and the tournament switch still put the payload's
        `allMatches` in place with every other key (section 2 point 3). In 13c-2, `moveToStore('allMatches', …)` makes it
        part of the same `legacy/stateReplaced` (one whole-map write, not a second dispatch).
    - **Checks**:
      - `tests/store/match-writes.test.mjs`: the helpers' rules, no write when nothing changes, the batch, the test hooks,
        and a source check. The source check finds, in app code outside the module (main.js, the modules, React, the
        engine): `allMatches` / `state.matches` assigned, deleted or list-mutated; a bout's field (`wp`, `done`, `white`,
        `hansoku`, … on any receiver) assigned, compounded, incremented or its point list mutated; and the same through a
        name bound from `allMatches` / `state.matches` in the file (`const rows = state.allMatches[div]`, `{[div]: L} =
        state.allMatches`). On next/4.1 it flagged 48 lines in 14 files with the PR's first, narrower rules; now none.
        Allowed by exact line: the engine's plan objects (`set.…`, new bouts in `teams.ts`).
      - A regex reads lines, not scopes: an alias passed through a function or a computed field name is beyond it. **The
        frozen pages are the backstop**.
      - `tests/match-writes-store-test.py` compares every key of the saved state with next/4.1's after 59 steps, once as
        the app runs and once on a page as 13c-2 will leave it (`tests/lib/match-freeze-hook.js`). The steps: a rename
        before the draw; pools with a championship, a single elimination with byes, two round robins and a team bracket;
        a team's and two players' No Shows; a division's court changed; Edit Pool; a regenerate; points, hansoku,
        Fusen-gachi, Undo / Redo across Next Match on both courts; an advancing bracket bout and a tiebreak-drawing Next
        Match undone and redone; a remote apply; three save conflicts; a 4.0-shaped load (a bout without its result
        snapshot, an invalid entry, no `teamElimTeams`); a team round robin with representative playoffs and the
        daihyosen of a widened award mode; kachinuki round robin and single elimination; a grand champion drawn, undone
        and cleared.
      - On the frozen page the map, every list and every bout are frozen copies, new ones at each helper write, store
        notification and app event. So a write that misses the helpers throws, and an object held across a write keeps
        its old values.
      - `tests/match-identity-copy-test.py` runs that frozen page as a third page, and its copied page now copies (and
        makes stale) at every helper write. On next/4.1 the frozen page throws at the first draw.
      - Known, as in #205: a match held across Next Match's result write and passed on (instead of the one the write
        returns) is not caught, since nothing after the write reads `done` / `completedResult` from it.
    - **Left for 13c-2 (tests)**: about 20 test files write `allMatches` in the page or in a vm `state` directly
      (fixtures: `KSMTest.app.state.allMatches[d] = …`, a bout's `done` set in place). In the browser they need a test
      helper over the module (e.g. `KSMTest.app.setDivisionMatches`); the vm tests keep their plain `state`.
    **13c-2** (the plan): `allMatches` into the `tournament` slice.
    - `moveToStore('allMatches', ['tournament', 'allMatches'])` at the literal's place; the slice's initial value `{}`.
    - Only the bodies of `match-writes.js` change, for `root === state`:
      - Each helper dispatches one `court/…` action (a point, a result, a representative, an Undo/Redo's batch:
        `meta.court`) or `tournament/…` action (draws, syncs, repairs). Its payload is `writes` (`{path, value}` under
        `['tournament', 'allMatches', …]`), applied by the root reducer through `applyStoreWrites()`. That is a path copy:
        only the bout and the list on the path are copied, never an Immer reducer over a whole list (#15 PR 13b).
      - An insert, removal or sort writes the division's new list (the same bout objects); a field write writes the bout's
        new object; `ksmUpdateMatches()` writes each bout it changes in one dispatch.
      - `ksmWriteMatchPaths()` runs its writes on a working copy of the touched lists (path copies) and dispatches their
        new values once.
      - A payload copy (`root !== state`) is still written in place.
    - **Must: no write when nothing changes.** The no-op checks of `ksmSetDivisionMatches()` / `ksmSortDivisionMatches()`
      stay in front of the dispatch (a sort or dedupe in a render must never dispatch: a subscriber that renders would
      loop). `tests/match-writes-store-test.py`'s read-path check stays.
    - Undo/Redo keeps 13b's order: the entry's plain `allMatches` writes (now one batch, one dispatch), then the one
      `court/undo` / `court/redo` with the history move and the store-owned keys; then the court view's rebuild.
    - The test hooks (`KSMTestMatchWrite`, `KSMTestBeforeCourtAction`) go; the frozen page of the guard becomes the strict
      store itself (deep-frozen data), so `tests/lib/match-freeze-hook.js` is replaced by checking the store's objects.
    - Every notification checks (`tests/court-pointers-store-test.py`, `tests/bracket-nodes-store-test.py`) see the bouts
      too: Generate Tournament and the grand champion's draw are allowed by name as in 13b; a sync writes its bouts before
      its nodes' `advancementApplied` (as now).
    - Measure a point, Next Match and a remote apply as 13b did (6x throttling, production build).
    Done (**PR 13c-2**), no behaviour change (no golden changed; `tests/match-writes-store-test.py`'s 59 steps match the
    next/4.1 fixture value for value, now on the store):
    - **The field**: `moveToStore('allMatches', ['tournament', 'allMatches'])` at the literal's place (between `teamPools`
      and `currentByDivision`); the slice starts with `{}`; `TOURNAMENT_SLICE_VERSION` 9 → 10. A load puts the payload's
      map in place in its one `legacy/stateReplaced`.
    - **The actions** (`matchActions`, `app/store/slices/tournament.ts`): `court/matchUpdated` (`ksmUpdateMatch()`: a point,
      a result, a representative, a grand champion's Fusen-sho, a repair; `meta.court` is this device's court),
      `tournament/allMatchesSet` (`ksmSetAllMatches()`), `tournament/divisionMatchesSet` (`ksmSetDivisionMatches()`,
      `ksmDeleteDivisionMatches()`), `tournament/matchesUpdated` (`ksmUpdateMatches()`), `tournament/matchesAdded`
      (`ksmInsertMatches()`, `ksmAppendMatches()`), `tournament/matchesRemoved`, `tournament/matchesSorted`,
      `tournament/matchesPatched` (`ksmWriteMatchPath()`, `ksmWriteMatchPaths()`). Each carries one write, the new map at
      `['tournament', 'allMatches']`, applied by the root reducer (`applyStoreWrites()`); no Immer reducer.
    - **The bodies** (`app/modules/court/match-writes.js`): on the live `state` a helper runs its old body on a working root
      whose objects are copied on first write (`ksmCopyOnWrite()`: the map, the touched lists, the touched bouts, a point
      list on a path), then dispatches the new map once; nothing is dispatched when the body threw or wrote nothing. A
      payload copy (`root !== state`) is written in place as before. A vm test's own plain `state` too
      (`ksmInStore()`, stood in by `tests/lib/ksm-source.mjs`).
    - **No write when nothing changes**, now for fields too: `ksmUpdateMatch()` / `ksmUpdateMatches()` leave out an update
      whose fields already hold the values (JSON-equal) and dispatch nothing when none is left. Without it a remote apply
      dispatched 9 times more (the result repair and the championship template's sync rewrite the same values on every
      load), 58 notifications instead of 5.
    - **Undo/Redo is one dispatch**: the entry's bouts are planned (`ksmPlanMatchPaths()`: the batch on a copy-on-write
      root, not dispatched) and go as `allMatches` with the entry's other store-owned keys in its one `court/undo` /
      `court/redo`; the index fields and the F30 log entry read the planned map. So a throw anywhere in an entry writes
      nothing (#206 re-review L-a), and no notification shows a bout undone while its node or pointer is not.
    - **One notification per step** (`store.hold()`, `holdNotifications()`): dispatches inside change the state at once
      (`getState()` is new after each), but subscribers run once at the end of the outermost hold. Used by
      `performCourtAction()`, `undo()` / `redo()`, `generateDivisionState()`, Generate Tournament's reset (bouts emptied +
      `tournament/drawReset`), a regenerate, the two No Shows and a grand champion's clear. Why: a court action writes its
      bout (`court/matchUpdated`) before the bracket sync's `tournament/advancementApplied`, and a draw its bouts before
      `tournament/divisionGenerated`; carrying the bouts in those actions would need the bouts' reads in between (the
      syncs read the list they just wrote) to see a map that is not dispatched yet. The every-notification checks
      (`tests/court-pointers-store-test.py`, `tests/bracket-nodes-store-test.py`) now see the bouts and pass, with only
      Generate Tournament and the grand champion's draw allowed by name as in 13b (the "pointer on the bout it finished"
      check compares the bout by its sync identity at every notification).
    - **The history's key order**: a court action's `patch-v1` patches follow `Object.keys(state)`. A plain `allMatches` was
      re-added by every load after the store getters (before `history`, `contextMode`), so its patches came after
      `matches`' ones; as a getter it keeps the literal's place. `historyKeyOrder()` puts it back where the plain key was
      once a load has moved the plain keys behind it, so saved entries keep their patch order (the fixture found it).
    - **#206 re-review Lows**: L-a above; L-b the source check (`tests/store/match-writes.test.mjs`) also finds `m.court =`
      / `m.position =` (not on `cloudSession.`, `pool.`, `set.`), `?.push` / `?.splice` and `?.[…]` on the way to a list
      method (on `allMatches` and on an alias), `.length =` on an alias, `Object.assign(x, {done: …})` and `m['done'] =`,
      with probes; L-c the rebase's replay (`sync-state-and-rebase.js`) clones a patch's value inside the walk, only on a
      write (`ksmWriteMatchPaths([{…, clone: true}])`), so a patch that cannot be replayed with `after: undefined`
      returns false again instead of throwing.
    - **Tests**: the test hooks (`KSMTestMatchWrite`, `KSMTestBeforeCourtAction`) and `tests/lib/match-freeze-hook.js` are
      gone: the store's own deep-frozen data is the frozen page. `tests/match-writes-store-test.py` checks after each step
      that `state.allMatches` is the store's and frozen, and counts the store's bout writes for the read-path check;
      `tests/match-identity-copy-test.py` runs two pages (the store page, and one whose copies are a
      `tournament/allMatchesSet` at every notification and app event). `KSMTest.app.setAllMatches`, `setDivisionMatches`,
      `updateMatch`, `updateMatches`, `updateBout` write bouts in the browser tests; 15 browser test files (and
      `tests/store/match-view.test.mjs`) that wrote `allMatches` or a bout in the page were converted (in sloppy page code a write to a frozen bout is silently ignored, so some
      only showed up as golden differences). The vm tests keep their plain `state`.
    - Measured (headless Chromium, 6x CPU throttling, production build, before = next/4.1 and after interleaved, 5 runs,
      medians of the runs' medians, range of run medians): a point 8.8 (8.4-10.1) → 8.8 (8.5-9.1) ms; a point + Undo +
      Redo 44.7 (41.5-54.1) → 44.2 (43.3-45.6); Next Match in pools 22.6 (22.2-25.8) → 23.1 (22.5-23.4), advancing a
      bracket 10.1 (10.0-10.8) → 11.0 (10.2-11.5), kachinuki 8.9 (8.4-9.2) → 8.2 (8.1-8.8); a remote snapshot apply 21.7
      (21.4-24.8) → 21.6 (21.1-23.1); Generate Tournament of 8 divisions of 32 63.1 (58.4-65.7) → 63.5 (61.3-64.9). Store
      notifications: a point 2 → 1, an Undo 5 → 1, Next Match 5-6 → 1, an apply 5 → 5; dispatches: a point 2 → 3, an
      Undo 5 → 5, Next Match in pools 5 → 6.
14. **`state` retired**: drop the dead fields (`history`, `contextMode`, `teamBracketState`; with a load-time drop,
    owner OK on the format), `app-state.js` keeps only the getters until the reads are converted, then goes;
    `ksm:state-changed` → `store.subscribe`.
    After 13c-2 every tournament field is in the store; what is left in `state`: the three dead plain keys above, the
    derived `matches` and the device getters. What 14 needs: (1) the plain keys dropped with a load-time drop, and then
    `historyKeyOrder()` (13c-2) can go only if the saved patch order of `allMatches` vs `matches` may change, or `matches`
    patches stop being recorded (they are never applied: device key); (2) the reads of `state.x` → selectors or
    `getState()` per module (the getters make this mechanical, file by file); (3) `replaceState()` / `assignState()` →
    `tournament/loaded` and per-group actions (no plain keys left to assign); (4) `ksm:state-changed` → `store.subscribe`
    with `holdNotifications()` already giving one notification per court action and structural step; (5) the vm tests'
    plain `state` stand-ins (`tests/lib/ksm-source.mjs` `VM_STAND_INS`, `derived-matches.mjs`) replaced by a real store
    per test.

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
  are deleted. `useLegacyState` / `ksm:state-changed` go when `state` does. Since PR 8 the islands read the Setup form from the
  store (`setupSetting()`), not the DOM.

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
- PR 8 (the Setup form): the store bundle 8,270 → 8,611 bytes gzip (the slice's defaults and two reducers; the
  normalization rules are in `app/engine/settings.ts`, in app.js); app.js 658,603 → 664,764 bytes, gzip 170,765 →
  172,883; the React bundle 626,197 → 625,991 bytes.
- PR 9 (the divisions): the store bundle 8,611 → 8,964 bytes gzip (22,814 → 23,789 raw; the slice's initial lists, one
  shared reducer, `withTeamCourt()`); app.js 666,859 → 678,855 bytes (gzip 173,785 → 177,230: the helpers module, the engine edits and their JSDoc); the
  React bundle unchanged (625,991).
- PR 10 (the people): the store bundle 8,964 → 9,206 bytes gzip (23,789 → 24,471 raw: 17 action names, one row reducer
  factory, `statusCycle()`), over the 9,000 budget, which is now 9,300 (`tests/store-bundle-test.mjs`; the reducers are
  already shared, the names are the cost); app.js 679,493 → 686,256 bytes (gzip 177,264 → 180,104: `people-store.js` and
  its JSDoc); the React bundle unchanged (625,991).
- PR 11 (awards and grand champions): the store bundle 9,206 → 9,262 bytes gzip (24,471 → 24,631 raw: eight action names on
  the one list-setting reducer), inside the 9,300 budget; app.js 686,256 → 689,076 bytes (gzip 180,104 → 181,035:
  `awards-store.js` and its JSDoc); no React source changed.
- PR 12a (the draw structure): the store bundle 9,262 → 9,346 bytes gzip (24,631 → 24,837 raw: seven action names on the
  shared reducer), over the 9,300 budget, which is now 9,400 (`tests/store-bundle-test.mjs`; the reducer is shared, the
  names are the cost); app.js 689,102 → 695,727 bytes (gzip 181,042 → 183,399: `structure-store.js` and its JSDoc); the
  React bundle unchanged (625,991).
- PR 12b (the bracket nodes): the store bundle 9,346 → 9,390 bytes gzip (24,837 → 24,935 raw: `advancementApplied` and the
  four initial maps), inside the 9,400 budget; app.js 696,501 → 699,436 bytes (gzip 183,887 → 184,996); no React source
  changed.
- PR 13a (the court pointers): the store bundle 9,390 → 9,553 bytes gzip (24,935 → 25,427 raw: three `court/…` actions,
  their reducer and the three initial maps), over the 9,400 budget, which is now 9,600 (`tests/store-bundle-test.mjs`; a
  second slice or one matcher saved under 20 bytes); app.js 699,803 → 704,181 bytes (gzip 184,886 → 186,279); no React
  source changed.
- PR 13b (the court history): the store bundle 9,553 → 9,736 bytes gzip (25,427 → 25,896 raw: five `court/…` action names,
  the two initial maps, and `applyStoreWrites()` as a path copy instead of an Immer update, +100 of it), over the 9,600
  budget, which is now 9,750 (`tests/store-bundle-test.mjs`; the history reducers on Immer drafts were 9,907 and walked
  the whole list on each point); app.js 704,181 → 711,705 bytes (gzip 186,279 → 188,682); no React source changed.
- PR 13c-2 (the bouts): the store bundle 9,736 → 9,928 bytes gzip (25,896 → 26,448 raw: the eight `matchActions`, built
  from their names (−8 against eight `createAction` calls), +87; the notification hold, +105), over the 9,750 budget,
  which is now 9,950 (`tests/store-bundle-test.mjs`; a hold that flushed through a no-op dispatch was 11 bytes smaller but
  showed listeners a fake last action); app.js 731,281 → 739,359 bytes (gzip 194,483 → 196,772); no React source changed.
  Times: section 3 item 13 (no slowdown at 6x throttling).
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
