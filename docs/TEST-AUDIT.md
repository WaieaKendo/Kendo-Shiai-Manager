# Test audit (issue #19)

Due diligence before the store + commands refactor (roadmap 2.8) and stable IDs (2.9, issue #15), which change how every edit flows through the app. This lists every place the app changes tournament data, which tests follow each change, and what is missing, ranked by risk. Part 1 (this branch, `test/audit`) also starts filling the highest-risk gaps; part 2 takes the network cases at the end.

How the data flows today (the thing the refactor replaces): every edit mutates the one global `state` (or a Setup input, read back by `getSetupSnapshot()`), then asks for a save. Court actions go through `performCourtAction()` (`app/js/10`), which records a `patch-v1` history entry; Next Match, Undo and Redo save at once (`criticalAutoSave()`), everything else is saved by the document-wide `input`/`change`/button-`click` listeners (`app/js/21`, `scheduleAutoSave()`: 2 s debounce, then 1.2 s to the cloud). A save sends the whole tournament (`performCloudSave()`, `app/js/33`); on a conflict (HTTP 409) `rebaseLocalPayloadOnRecord()` (`app/js/18`) takes the server copy, replays this device's new court actions, merges the other edits three-way (F4) and replays structural edits per division (F10). Other devices take the saved copy over the live socket (`applyRemoteCloudRecord()`), held while a staff device is editing a field.

## Coverage by edit path

Columns: **(1)** the edit itself does what it should; **(2)** it is saved to the server; **(3)** it reaches a second device; **(4)** it survives a reload (the edited device or a fresh one); **(5)** it survives a save conflict with another device's save.
✅ a behaviour or end-to-end test checks it · ◐ partly (offline or vm only, one variant, or only indirectly) · ✗ nothing · — not applicable.
Test names drop `-test.py`/`-test.mjs`; `vm` tests run extracted app code in Node. New in this audit: `edit-conflicts`, `edit-sync`, `engine/edge-cases`.

### Court actions

| # | Edit | Where | (1) edit | (2) saved | (3) 2nd device | (4) reload | (5) conflict |
|---|---|---|---|---|---|---|---|
| C1 | Point (M/K/D/T) | `10:point()` → `performCourtAction()` | ✅ court-actions, golden-court-screen | ✅ court-actions, sync-saving | ✅ e2e-two-court-sync, e2e-full-tournament, tv-display, overlay, live-scores-courts | ✅ reload-restore, e2e-full-tournament, edit-conflicts | ✅ e2e-two-court-sync, sync-remote-updates (F4), edit-conflicts 1–3, 5 |
| C2 | Hansoku (two give the opponent H) | `10:hansoku()` | ✅ court-actions | ✅ court-actions | ✅ overlay, edit-conflicts 9 | ✅ reload-restore | ✅ edit-conflicts 9 |
| C3 | Fusen-gachi | `22:openFusenDialog()/confirmFusen()` → `10:fusen()` | ✅ court-actions | ✅ court-actions | ✅ edit-conflicts 9 | ✅ edit-conflicts (reload) | ✅ edit-conflicts 9 |
| C4 | Hikiwake (Next Match on a level score) | `10:nextMatch()` | ✅ golden-engine, golden-court-screen | ✅ e2e-full-tournament (scripted draw) | ✅ e2e-full-tournament | ◐ e2e-full-tournament (TV/spectator reload) | ✗ e2e-two-court-sync plays wins only |
| C5 | Encho / must-win bout refuses a draw | `10:nextMatch()` alert, `matchRequiresWinner()` | ✅ split-court-stabilization, engine/edge-cases | — nothing saved | — | — | — |
| C6 | Hantei | not modelled: entered as a point (**F28**) | — | — | — | — | — |
| C7 | Next Match: completion + tiebreaks, championship, single-elim, team bracket, kachinuki | `10:nextMatch()` → `maybeCreateTiebreaks()` … `maybeAdvanceIndividualSingleElim()` | ✅ golden-engine (76 tournaments), court-actions | ✅ court-actions, e2e-full-tournament | ✅ e2e-two-court-sync, e2e-full-tournament, tv-display | ✅ e2e-full-tournament, reload-restore | ✅ e2e-two-court-sync; vm v31712, v31715–v31720 |
| C8 | Undo | `10:undo()` | ✅ court-actions, undo-division-complete | ✅ court-actions, edit-conflicts 8 | ✅ edit-conflicts 8 | ◐ edit-conflicts (the reload at the end) | ✅ edit-conflicts 8, undo-rebase (**F30**, fixed) |
| C9 | Redo | `10:redo()` | ✅ court-actions | ✅ court-actions, edit-conflicts 8 | ✅ edit-conflicts 8 | ◐ as Undo | ✅ edit-conflicts 8, undo-rebase (F30, fixed) |
| C10 | Team representative pick | `09:setRepresentative()` (a court action) | ✅ roles-access, golden-court-screen | ✅ roles-access | ✅ roles-access | ✗ | ✗ |
| C11 | Court division select | `08:selectScorekeeperDivision()` (court runtime state) | ✅ e2e-full-tournament, court-screen-details | ◐ | ◐ vm v31719 (TV follows) | ◐ sync-saving (court pin) | ◐ vm v31711 (own court kept) |
| C12 | Court choice on a device | `23:chooseCourt()`, `18:pinCourtLocally()` (device-local) | ✅ sync-saving | — | — | ✅ sync-saving (F3) | — |

### Setup

| # | Edit | Where | (1) | (2) | (3) | (4) | (5) |
|---|---|---|---|---|---|---|---|
| S1 | Tournament details (name, host, date, location, courts, type) | input listeners → `20:getSetupSnapshot()` | ✅ golden-setup | ✅ sync-remote-updates | ✅ sync-remote-updates, edit-conflicts | ✅ edit-conflicts | ✅ sync-remote-updates (F4), conflict-merge, edit-conflicts 1 |
| S2 | Save Setup & Continue | `01:saveSetup()` | ✅ golden-setup | ◐ golden-setup (asks for a save) | ◐ | ✗ | ◐ as S1 |
| S3 | Division on/off, format, court | React Setup → `01:toggleDivision()/setDivisionFormat()/setDivisionCourt()` | ✅ golden-setup, setup-preset-toggle | ✅ e2e-full-tournament | ✅ e2e-full-tournament | ◐ e2e-full-tournament | ◐ conflict-merge (vm) |
| S4 | Custom division add / remove | `01:addDivision()`, `42:ksmRemoveSetupDivision()` | ✅ setup-add-division, golden-setup | ✅ edit-sync | ✅ edit-sync | ✅ edit-sync | ◐ conflict-merge (vm) |
| S5 | Team settings (enabled, format, tournament format, court) | team selects → `saveSetup()` | ✅ golden-setup | ✅ e2e-full-tournament | ✅ e2e-full-tournament | ◐ e2e-full-tournament | ◐ conflict-merge (vm) |
| S6 | Team awards | `#teamAwardMode` → `state.teamAwardMode` | ✅ golden-setup, golden-results | ✅ edit-sync | ✅ edit-sync | ✅ edit-sync | ◐ vm |
| S7 | Exhibitions on/off | `#exhibitionEnabled` | ✅ registration-screen | ✅ edit-sync | ✅ edit-sync | ✅ edit-sync | ◐ vm |
| S8 | Referees and red side per court | `#court1RedSide` … → `saveSetup()`, `18:applyCourtSides()` | ✅ court-side-setting | ✅ edit-sync | ✅ edit-sync (Court B mirrors) | ✅ edit-sync | ◐ vm |

### Registration

| # | Edit | Where | (1) | (2) | (3) | (4) | (5) |
|---|---|---|---|---|---|---|---|
| R1 | Add a player / + 5 Rows / edit name, dojo, division, seed | `03:addRow()`, `43:ksmUpdateCompetitor()` | ✅ golden-registration, registration-screen | ✅ e2e-full-tournament, edit-conflicts | ✅ e2e-full-tournament, edit-conflicts | ✅ edit-conflicts | ✅ edit-conflicts 2–4, 6, 7 (**F29** open: two desks) |
| R2 | Status (Registered / Checked In / No Show) before generation | `03:cycleCompetitorStatus()` | ✅ golden-registration, keyboard-controls | ✅ edit-sync, e2e-full-tournament | ✅ edit-sync | ✅ edit-sync | ◐ vm |
| R3 | × a player | `43:ksmRemoveCompetitor()` | ✅ golden-registration | ✅ edit-sync | ✅ edit-sync | ✅ edit-sync | ◐ vm |
| R4 | Paste from Excel | `16:` paste listener | ✅ registration-paste | ✅ edit-sync (**F31**, fixed) | ✅ edit-sync | ✅ edit-sync | ◐ vm |
| R5 | Load Sample Players / Teams / Tournament | `03:loadSamples()/loadTeamSamples()/loadFullTournament()` | ✅ sample-load-confirm, goldens | ✗ | ✗ | ✗ | ✗ |
| R6 | Clear Registration / Teams / Exhibitions | `03:clearCompetitors()/clearTeams()/clearExhibitions()` | ✅ registration-screen | ✗ | ✗ | ✗ | ✗ |
| R7 | Team add / + 3 / auto team / team name and members | `03:addTeamRow()/addAutoTeam()`, `43:ksmSetTeamField()` | ✅ golden-registration-teams | ✅ e2e-full-tournament, edit-sync | ✅ e2e-full-tournament, edit-sync | ✅ edit-sync | ◐ vm |
| R8 | Team status / × a team | `03:cycleTeamStatus()`, `43:ksmRemoveTeam()` | ✅ golden-registration-teams | ◐ e2e-full-tournament | ◐ | ✗ | ◐ vm |
| R9 | Exhibition match add / names / status / × | `03:addExhibitionRow()`, `43:ksmSetExhibitionField()/ksmCycleExhibitionStatus()/ksmRemoveExhibition()` | ✅ registration-screen | ✅ edit-sync | ✅ edit-sync | ✅ edit-sync | ◐ vm |
| R10 | A field being edited when an update is applied (F17/F20) | `43:ksmUpdateCompetitor()/ksmSetTeamField()/ksmSetExhibitionField()` | ✅ registration-live-edit, registration-teams-live-edit (offline, test API) | ✗ | ✗ | — | ✗ the real triggers (409 rebase on the editing device, Staff Login merge) |

### Generation and structure

| # | Edit | Where | (1) | (2) | (3) | (4) | (5) |
|---|---|---|---|---|---|---|---|
| G1 | Generate Tournament | `03:requestTournamentGeneration()` → `08:generatePools()` | ✅ registration-screen, e2e-full-tournament | ✅ e2e-full-tournament | ✅ e2e-full-tournament | ✅ e2e-full-tournament | ◐ conflict-merge (vm) |
| G2 | Regenerate Single Division | `03:continueRegenerateDivision()` → `08:regenerateSingleDivision()` | ✅ registration-screen | ✅ edit-conflicts | ✅ edit-conflicts | ✅ edit-conflicts | ✅ edit-conflicts 6, 7; conflict-merge |
| G3 | Edit Pool → Save Pool Changes | `41:ksmPoolEditToSave()` → `16:saveEditedPools()` | ✅ pool-edit-safety, golden-pools | ✅ structural-edit-conflict | ✅ structural-edit-conflict | ✗ | ✅ structural-edit-conflict (F10) |
| G4 | No Show after generation (player: pool rebuilt in the standard order for its new size, #24; team: pairings removed) | `08:applyIndividualNoShow()/applyWholeTeamNoShow()` | ✅ tournament-management-engine, edit-sync, engine/pools, no-show-pool-order | ✅ edit-sync | ✅ edit-sync | ✅ edit-sync | ✗ |

### Awards, files, library

| # | Edit | Where | (1) | (2) | (3) | (4) | (5) |
|---|---|---|---|---|---|---|---|
| A1 | Special awards add / edit / × | `27:addResultAward()/removeResultAward()`, `38:ksmSetResultAward()` | ✅ golden-results, awards-save | ✅ awards-save | ✅ awards-save, edit-conflicts | ✅ edit-conflicts | ✅ edit-conflicts 5, conflict-merge |
| F1 | Load Tournament File: replace the open tournament | `21:replaceTournamentFromFile()` | ✅ file-import-export | ✅ file-import-export | ✗ | ✗ | ✗ |
| F2 | Load Tournament File as a new tournament | `21:loadTournamentFileAsNew()` | ✅ file-import-export | ✅ file-import-export | — | ✗ | — |
| F3 | Load Recovery File | `21:loadRecoveryFile()` | ✅ file-import-export, sync-saving | ✅ file-import-export | — | ✗ | — (F7 guard ✅) |
| F4 | Restore autosaved tournament (no link) | `21:restoreAutoSaveIfWanted()` | ✅ reload-restore | — | — | ✅ reload-restore | — |
| L1 | New Tournament (create, staff password) | `33:createNewTournament()` | ✅ most server tests | ✅ | ✅ roles-access (library) | ✅ | — |
| L2 | Delete a tournament / admin reset | API only (`src-worker.js`), no app control | ✅ worker-api, cloud-release | ✅ | ✅ worker-api (delete broadcast) | — | — |
| L3 | Staff password, login and session (issue #9) | `33:toggleStaffSession()`, `src-worker.js` | ✅ staff-auth-hardening, staff-login-hardening | ✅ | — | ✅ staff-login-hardening | — |

### Sync paths (how the edits above travel)

| # | Path | Where | (1) | (2) | (3) | (4) | (5) |
|---|---|---|---|---|---|---|---|
| Y1 | Autosave (debounce, immediate court saves, Save Now, 10-minute safety save) | `20:scheduleAutoSave()/criticalAutoSave()/saveNow()`, `21:saveTournamentToCloudWithReason()` | ✅ sync-saving | ✅ sync-saving | ✅ every e2e | ✅ reload-restore | ✅ via the rows above |
| Y2 | Outbox: offline, failed save, page unload | `20:writeOutbox()`, `21:queueUnsyncedStaffWorkBeforeUnload()` | ✅ sync-saving, reload-restore | ✅ | ✅ | ✅ reload-restore | ✅ reload-restore (F6) |
| Y3 | Outbox flush (socket open, back online, Retry) | `21:flushCloudOutbox()` | ✅ reload-restore, sync-saving | ✅ | ✅ | ✅ | ✅ reload-restore (F6 b) |
| Y4 | Staff Login merges queued work (F6) | `21:mergeQueuedStaffWork()` | ✅ reload-restore | ✅ | ✅ | ✅ | ✅ |
| Y5 | Applied live update (held while editing; stale, duplicate and own-echo records ignored) | `21:applyRemoteCloudRecord()`, `18:deferRemoteRecord()` | ✅ sync-remote-updates | — | ✅ every e2e | ✅ | ◐ sync-remote-updates (held update) |
| Y6 | 409 rebase: this device's court actions replayed | `18:pendingLocalCourtActionsForRebase()/resolveRebasePatch()` | ✅ e2e-two-court-sync, vm v31712 | ✅ | ✅ | ✅ edit-conflicts | ✅ (Undo/Redo replayed too: F30, fixed) |
| Y7 | 409 rebase: other edits merged three-way (F4) | `18:mergeLocalEditsThreeWay()` | ✅ conflict-merge, sync-remote-updates, edit-conflicts | ✅ | ✅ | ✅ | ✅ (F29 open: lists) |
| Y8 | 409 rebase: structural edit replayed per division (F10) | `18:replayStructuralEdit()` | ✅ structural-edit-conflict, conflict-merge, edit-conflicts | ✅ | ✅ | ◐ edit-conflicts | ✅ |
| Y9 | Repairs on load (results, elimination winners, duplicate matches) | `21:repairLoadedEliminationAdvancement()`, `12:repairCompletedMatchResults()`, `18:sanitizeLoadedTournamentState()` | ✅ sync-remote-updates, vm v31715/v31716, engine/integrity | — | ✅ sync-remote-updates | ✅ sync-remote-updates (fresh link) | — |

### Headline numbers

- **51 edit paths** (12 court actions, 8 Setup, 10 Registration, 4 structural, 1 awards, 4 files, 3 library, 9 sync paths).
- **Fully covered** (every applicable column ✅, C6 hantei not counted): **21** after this audit (C1, C2, C3, C5, C7, C12, S1, R1, G2, A1, F4, L1–L3, Y1–Y4, Y6, Y7, Y9; R1, Y6 and Y7 with an open finding pinned). **Before the audit: 15**: C2, C3, S1, R1, G2 and A1 lacked the second-device, reload or conflict check that `edit-conflicts`/`edit-sync` add. Of the other 30, most miss only the conflict column (covered by the vm merge tests, not end to end).
- **Gaps by risk** (below): 17 ranked gaps (5 high event impact, 8 medium, 4 low): 3 closed in part 1 (ranks 4, 5, 6 apart from its conflict case), 3 pinned by expected-failure checks (ranks 1, 2, 11), 11 with a planned test; plus 10 network cases for part 2: **5 covered** (N1–N4, N6), **5 planned** (N5, N7–N10).
- **Findings:** F26–F31 (F31 fixed here; F26, F27, F30 fixed in `fix/pre-event-2`; F29 open and pinned by an expected-failure check; F28 a note).

## Gaps, ranked by risk

Risk = what could go wrong at an event × how likely the store refactor (2.8 commands, 2.9 stable IDs) breaks it without a test noticing. **Closed** = a test added in this audit.

| Rank | Gap | Event impact | Refactor risk | State / planned test |
|---|---|---|---|---|
| 1 | Undo/Redo whose save conflicts (C8, C9, Y6): **F30**, the undone point came back | High: a wrong result stays after the scorekeeper fixed it | High: undo becomes a command | **Closed** in `fix/pre-event-2` (F30 fixed): `edit-conflicts` 8 races Undo and then Redo against the other court's save; `undo-rebase` (vm) covers a point undone before it was saved, undo + redo of a saved and an unsaved point, a redo after a saved undo, two undos in a row and a saved undo not replayed twice. Still planned: Undo of Next Match through a conflict, Undo after a reload |
| 2 | Two Registration edits at once (R1, Y7): **F29**, one desk's change dropped (with a notice) | High at check-in | High: 2.9 changes the merge | **Pinned** (`edit-conflicts` 4). When fixed: two desks adding, renaming and no-showing different players; the same player on both (still a conflict) |
| 3 | Registration fields being edited when an update is applied by the real triggers (R10, F17/F20) | High: typed text into the wrong player | High: the `3N-react-*` glue goes | Planned: a desk typing (field focused) while its own held save conflicts, and while Staff Login merges queued work; the text stays with its player or is dropped with a notice, on the server too |
| 4 | Hansoku / Fusen-gachi to other devices and through a conflict (C2, C3) | High: results | High: court commands | **Closed** (`edit-conflicts` 9 + reload) |
| 5 | Registration remove / status / paste / exhibitions / teams reaching the server and devices (R2–R4, R7, R9) | High: lost registrations | High | **Closed** (`edit-sync`); found and fixed **F31** (paste never saved) |
| 6 | Setup rows, red side, team awards, exhibitions to devices and reload (S3–S8) | Medium: wrong court colours, wrong award rows | High: Setup moves off the DOM (`getSetupSnapshot()`) | **Closed** for (2)–(4) (`edit-sync`). Still planned: a division format/court change racing a court save (e2e of the per-field merge) |
| 7 | Structural no-show after generation through a conflict (G4) | Medium | High: structural commands | Planned: a no-show in Kids racing a court point in Open (replayed silently) and racing a point in Kids (the F10 question) |
| 8 | Representative pick after a reload and through a conflict (C10) | Medium: the wrong player in a playoff | High: court command | Planned: pick while the other court saves first; reload the court device |
| 9 | Court division select / court runtime state through a rebase and a reload (C11) | Medium: a court jumps to another division | High: 2.8's main point (device state out of tournament data) | Planned: both courts switch divisions while the other saves; each keeps its own after the rebase and a reload |
| 10 | Hikiwake completion through a conflict (C4) | Medium: a draw replayed as unfinished | Medium | Planned: e2e-two-court-sync with drawn pool bouts on both courts |
| 11 | Engine: 4-way tie ordering (**F26**), team round-robin ties by name (**F27**), hantei (**F28**) | Medium: a wrong bronze / medal order | Low (engine is pure, unchanged by 2.8) | **Closed** for F26 and F27 in `fix/pre-event-2` (`engine/edge-cases`, `engine/teams`, `team-daihyosen` e2e); F28 a note; plus the edge-case checks that pass |
| 12 | Load Tournament File (replace) while another device saves; other devices follow it (F1) | Medium (recovery situations) | Medium | Planned: replace while a court scores: which copy wins, is anyone told; Court B follows the replaced copy |
| 13 | Load samples / Clear on a cloud tournament (R5, R6) | Medium: one tap wipes (they ask first, F8/F24) | Medium | Planned: Clear Teams (OK) reaches the server and Court B; Cancel sends nothing |
| 14 | Edit Pool survives a reload (G3) | Low | Medium | Planned: reload the director and the court after structural-edit-conflict's first race |
| 15 | Generate Tournament racing a court save (G1) | Low (generated before the courts start) | Medium | vm only (conflict-merge); planned with rank 7 |
| 16 | Team status / × a team to the server (R8) | Low | Medium | Planned: add to `edit-sync` |
| 17 | Load Recovery / file as new survive a reload (F2, F3) | Low | Low | Planned: reload after the load in file-import-export |

### Network cases (part 2)

| # | Case | What exists | Planned test |
|---|---|---|---|
| N1 | **A save that never answers.** `performCloudSave()` had no timeout; while a request hung `ksmCloudSaveInFlight` stayed true and every later save only queued behind it. **Fixed with F35** (docs/ROADMAP.md): a save to an existing tournament is given up after 20 s and queued; a queued save is retried by itself (it was sent only when the socket reopened, on `online` or with the next edit, so one 503 with the socket open left a device "unsaved": the CI `wait_idle()` flakes) | `save-retry-test.py` | ✅ done: `hold_next_save()` never released (`drop_held_save()`), Playwright clock past the timeout; a 503 with the socket open. `wait_idle()` now reports why a device is still unsaved (`KSMTest.pendingReason()`) |
| N2 | Offline mid-match while the other court keeps saving, then reconnect | `network-offline-test.py` | ✅ done: Court A offline for three points and Next Match while Court B saves twice; assert a 409 rebase, both courts’ exact points and completion on server/both devices, and the advanced match on both devices |
| N3 | Failed saves: 500, 422 (integrity), 403/401, and 409 more than `KSM_CLOUD_REBASE_MAX_ATTEMPTS` (4) times in a row | `network-failed-saves-test.py` | ✅ done: route each refusal (five consecutive 409s, four rebases); staff outbox retained, status warns, server unchanged; clear route and recover without another edit (401: Staff Login; 403: Retry queued save); exact point on server/both devices |
| N4 | Reload while a save is in flight (not only before it) | `network-reload-test.py` | ✅ done: hold save, reload, observe staff outbox before recovery, release/drop the old request; same staff token and Logout survive refresh (#74); exact point reaches server/both devices without Staff Login |
| N5 | Stale tab: a device asleep for hours saves from a very old base; a staff token expired (F25) | none (F25 noted) | Old base revision + rebase; F25's status row |
| N6 | Server restart (wrangler restart / Durable Object evicted) | `network-restart-test.py` | ✅ done: stop/start the real local worker on the same port and persisted storage; score during outage, observe queue; both sockets reconnect and answer ping/pong, revisions continue, exact points converge without duplicates |
| N7 | Late, duplicate and out-of-order socket messages, one arriving during a rebase | sync-remote-updates (stale, duplicate, own echo) | Deliver an older record after a newer one during a held save; a delete broadcast |
| N8 | Two tabs of one browser on the same tournament (shared localStorage outbox and autosave) | none | Two pages in one context: queued work of one is not cleared or blocked by the other |
| N9 | App update mid-event (service worker) with queued work in the old format | path-urls (offline copy) | Queue work on version N, load N+1: the outbox still flushes |
| N10 | Device clocks that disagree (history entries are keyed and sorted by device time) | none | Two courts with skewed clocks (Playwright clock) through a rebase: no history entry lost or duplicated |

The first #60 PR stops at N6 in the requested execution order (N2, N3, N4, N6). N5 and N7–N10 remain planned for the next PR; N9 still needs a reliable old/new service-worker fixture. No new F-findings in these cases.

### Harness notes

- Save races are now made deterministic by holding a save at the network (`KsmApp.hold_next_save()` / `wait_held_save()` / `release_save()`, counted by `conflicts()`). `sync-remote-updates-test.py` (F4, including its additional Setup merge races) and `structural-edit-conflict-test.py` (all three F10 choices) now hold the director’s save until the competing save completes and assert `conflicts() >= 1`; no fixed sleeps remain in these race tests.
- The test API gained `watchConflicts()`/`conflicts()`; KsmApp gained `set_competitor_field`, `regenerate_division`, `add_award`/`awards`, `blur` (docs/TESTING.md).
- Kachinuki rule (pinned, not a finding; **confirmed by the owners**): a team's last player must **lose** for the team to lose; a draw eliminates only the other team's player while that team still has players (the current behaviour).
