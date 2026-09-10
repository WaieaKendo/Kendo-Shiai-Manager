## v3.17.19-test — TV Court Follow Synchronization

- Fixed a Court B TV display failure where the TV could remain locked to the division/runtime state it first loaded instead of following the Court B scorekeeper.
- Root cause: the v3.17.17 local-division preservation rule correctly protected scorekeepers from remote UI switching, but was also applied to read-only TV/spectator clients; the TV therefore reapplied its own stale local division after every live snapshot.
- Incoming TV/spectator snapshots now follow the authoritative `courtState` / `courtActiveDivision` for the TV window's assigned court, while writable scorekeeper/staff sessions retain the v3.17.17 local-selection protection.
- TV sync now resolves its identity from the fixed TV URL court assignment rather than mutable cloud/public court state.
- Changing the scorekeeper division now immediately publishes that court's active division through the normal critical-save/rebase pipeline, so the TV does not wait for the next scored point or edit before changing divisions.
- Added `test:v31719` regression coverage for Court B TV following a remote division change while Court B scorekeeper local division remains protected.
- No scoring, pool, bracket, advancement, Edit Pool, tiebreak, team, Kachinuki, or tournament-template logic changes.

## v3.17.18-test — Pool Edit Championship Preservation

- Fixed the reproducible pool-to-elimination freeze that occurred specifically after competitors were moved with **Edit Pool**.
- Root cause: `saveEditedPools()` rebuilt `allMatches[division]` with pool matches only, deleting the generated QF/SF/Final Match Objects while the separate bracket preview continued to display the correct resolved qualifiers.
- Saving pool edits now rebuilds the complete division Match Object set: pool matches plus the frozen championship template.
- Championship nodes/court assignments are regenerated from the existing frozen bracket mapping, so manual pool edits do not alter the approved elimination template.
- Court A/B pointers that referenced the pre-edit Match Object array are recalculated after the edit.
- `syncChampionshipTemplate()` now self-heals missing championship Match Objects from canonical nodes, allowing older broken pool-edit states to recover instead of remaining visually populated but unplayable.
- Added `test:v31718` coverage for the reported 14-person single-court and 12-person split-court edited-pool cases, including automatic repair of a <=v3.17.17 missing-QF state.
- Pool match order, championship seed mappings, scoring/tiebreak logic, synchronization, and v3.17.17 device-local division behavior are unchanged.

## v3.17.17-test — QF Activation + Division Stability

- Fixed an intermittent pool-to-quarterfinal freeze where the bracket had resolved QF players but the Scorekeeper Active Match area remained empty.
- Court pointers now self-heal when saved at the end of the old queue or on an unresolved/non-scorable championship placeholder.
- Added a final score-render guard that selects the first currently scorable match for the pinned court/division when the current pointer is stale.
- Fixed division selections reverting several seconds later after a live remote snapshot. Scorekeeper division selection is now device-local per court.
- Concurrent rebase now preserves only the local device's pinned-court navigation state and recomputes its active index against the newest match list.
- Other-court runtime state remains sourced from the newest server record.
- Pool templates, elimination mappings, scoring rules, and v3.17.16 completed-result integrity are unchanged.

## v3.17.16-test — Elimination Result Integrity

- Fixed a bracket-progression failure mode where a completed quarterfinal could later resolve as `Hikiwake`, causing a semifinal feeder to lose the actual winner and become unplayable.
- Match completion now writes an atomic `completedResult` snapshot containing the winner, final white/red point arrays, and hansoku totals. This keeps the result reconstructable even if earlier point-tap patches were saved under a different cloud revision.
- Completed-result snapshots are validated before use; a winner-required elimination match can never legitimately advance `Hikiwake`.
- Loaded/rebased tournament state restores completed scores from the atomic result snapshot before recomputing championship/single-elimination advancement.
- Legacy or malformed winner-required matches that are marked complete but have no identifiable winner are reopened instead of propagating `Hikiwake` into the next round.
- Championship placeholder/source labels now remain `Winner of …` when a feeder result is invalid instead of displaying `Hikiwake` as if it were a competitor.
- Court action patches now store the stable Match Object identity at the moment the action is created, so later array sorting/insertion cannot cause a rebase patch to target a different match.
- Cloud Worker validation rejects completed winner-required matches with ties or inconsistent `completedResult` winner/score data.
- Added `test:v31716` regression coverage for atomic completion replay, match-index reordering, invalid elimination recovery, safe source labels, QF→SF advancement, and Worker result validation.

## v3.17.15-test — Tournament State Integrity & Identity-Safe Rebase

- Fixed a concurrency corruption path where index-based replay could create sparse `allMatches` arrays; JSON serialization converted those holes to `null`, which could crash spectator/live rendering and make a tournament appear unloadable.
- Concurrent rebase now resolves `allMatches` patches by stable match identity before applying them.
- Patch replay refuses to synthesize sparse array slots.
- Tournament loads automatically remove invalid/null match entries and adjust saved court/current indexes before rendering.
- Critical completion helpers are null-safe so one malformed entry cannot crash the entire tournament UI.
- Cloud Worker now rejects malformed `allMatches` payloads with HTTP 422 instead of persisting corrupt state.
- Updated the tournament-open error message so a render/data problem is not mislabeled solely as an internet problem.

## v3.17.14-test — Deterministic Pool Player Slots

- Made each generated pool's visible top-to-bottom player order the authoritative intra-pool slot order: **Player 1 = A, Player 2 = B, Player 3 = C, Player 4 = D**.
- Pool players now retain explicit `poolSlot` / `poolSlotIndex` metadata, and generated Match Objects retain `whitePoolSlot` / `redPoolSlot` metadata.
- Pool match generation resolves A/B/C/D directly from the player order shown in the pool card, eliminating ambiguous or apparently random slot identity.
- Manual pool edits reassign A/B/C/D from the newly saved top-to-bottom order before rebuilding pool matches.
- Structural no-show removal preserves the surviving competitors' original slot identity because slots are stored on pool entries rather than inferred after removal.
- Generated Pools and printed pool sheets now visibly show A/B/C/D beside each competitor.
- Added `test:v31714` regression coverage for generated slots, explicit match-slot metadata, edit re-slotting, and no-show slot preservation.

## v3.17.13-test — Canonical Pool Match Order + Live Display Cleanup

- Centralized individual pool match templates so generated 3-person pools always use **A–B → C–B → C–A**.
- Centralized individual pool match templates so generated 4-person pools always use **A–B → C–D → C–A → B–D → B–C → D–A**.
- Pool Match Objects now retain explicit `poolOrder` and `poolTemplateOrder` metadata at generation time so their intended sequence is inspectable and regression-testable.
- Individual pool tiebreak series reuse the same canonical pairing templates instead of maintaining a second copy of the matchup logic.
- Removed the temporary visible **TV Realtime Diagnostics** overlay from the live display while retaining the underlying realtime diagnostic state and console/debug tooling.
- Added `test:v31713` regression coverage for both canonical pool sizes and removal of the visible diagnostic overlay.

## v3.17.12-test — Concurrent Court Save Rebase Stabilization

- Fixed the reproduced two-court HTTP 409 save failure that could leave one scorekeeper on “Save needs attention.”
- Removed a duplicate legacy `performCloudSave()` definition that was shadowing the v3.17.11 conflict-rebase implementation at runtime.
- Consolidated cloud saving into one authoritative function with diagnostics, authentication, and automatic rebase behavior.
- Added bounded multi-revision conflict retries and preserved the original base revision across retries.
- Deduplicated already-applied local actions while preserving the newest remote court state.
- Merges newer local court actions back onto a successfully rebased cloud result before a queued follow-up save.
- Added `test:v31712` regression coverage for consecutive Court A/Court B revision conflicts.
- No scoring, tournament progression, pool, bracket, team, Kachinuki, TV, or audience logic changes.

## v3.17.11-test — Pinned Court and Revision-Safe Sync

- Pinned Court A/B assignment locally so remote snapshots and reconnects cannot switch scorekeeper identity.
- Deferred incoming snapshots while local changes are unsaved, queued, or in flight.
- Added one-pass compact patch rebase for concurrent Court A/Court B revision conflicts.
- Added temporary pinned-court and pending-change diagnostics.

## v3.17.10-test — Single-Column Pool Court Context

- Changed every pool-play Court Context collection to a permanent single-column layout on desktop, tablet, and mobile.
- Reduced spacing between pool cards slightly to keep the vertical stack compact without reducing text size.
- Preserved pool standings, match rows, completion ordering, championship preview, scoring, undo/redo, and synchronization behavior.

## v3.17.9-test — TV Final Results

- Shows the completed division results on the assigned Court TV after the final match instead of an empty display.
- Reuses the existing read-only Court division-completion results markup and existing placement calculations.
- Keeps results visible until a different division is assigned, then automatically returns to the live TV presentation.
- Makes no changes to scoring, tournament progression, undo/redo, cloud saves, or realtime synchronization.

## v3.17.8-test — Self-Healing TV Synchronization

- Requests and force-applies a fresh cloud snapshot when a TV realtime socket connects.
- Adds a three-second initial synchronization fallback plus periodic 15-second cloud verification.
- Detects websocket revision gaps and automatically recovers with a full state refresh.
- Preserves the selected Court A/B assignment before opening realtime so the correct court context is used in the initial handshake.
- Forces the TV display to rerender after a refreshed snapshot, including active-division changes.
- Reconnects and verifies automatically when network connectivity returns or the TV tab becomes visible again.
- Expands temporary TV diagnostics with verified revision, verification time, and full-refresh count.
- Leaves scoring, compact undo/redo history, tournament progression, and cloud-save behavior unchanged.

## v3.17.7-test — Compact Action History

- Replaced newly recorded court undo/redo snapshots with compact path-level patches.
- Applies the unified patch history to scoring, hansoku, fusen-gachi, representative selection, Next Match, and progression actions.
- Clears legacy snapshot-format undo/redo entries during upgrade to prevent existing oversized history from continuing to break saves.
- Preserves separate Court A/B histories, the 100-action limit, and all existing tournament action logic.
- Added targeted compact-history tests and implementation notes.

## v3.17.6-test — Action History Analysis

- Added a read-only Action History Analysis section under Developer Tools.
- Reports Court A/B entry counts, total and average sizes, and first/latest/largest records.
- Added a compact action-history sample export containing first, latest, and largest entries per court.
- No changes to scoring, undo/redo behavior, autosave, cloud synchronization, or TV behavior.

## v3.17.5-test — Snapshot Growth Analysis

- Adds per-save snapshot size analysis without changing save timing or tournament behavior.
- Reports total payload size, top-level state sections, and largest nested paths.
- Adds a downloadable JSON analysis report in Cloud Diagnostics.
- Makes diagnostic-state storage nonfatal if browser storage is full.
- Retains TV realtime diagnostics and v3.17.4 service-worker fixes.

## v3.17.4-test — TV Realtime and Service Worker Reliability

- Fixed service-worker response cloning and cache writes.
- Bumped the app-shell cache to force installation of the corrected service worker.
- Fixed same-browser Staff/TV synchronization by allowing read-only TV sessions to apply Staff-originated broadcasts.
- Added temporary TV realtime diagnostics and a reconnect button.
- Left cloud saving, autosave timing, tournament logic, and scoring unchanged.

# Changelog

## v3.17.3-test — Logo Removal and Cloud Reset

- Removed the optional tournament-logo upload, preview, storage, library-card rendering, and snapshot field.
- Added server-side payload sanitization so legacy `tournamentLogo` data is discarded.
- Reduced Tournament Library records to tournament ID, name, and update time.
- Made Tournament Library metadata updates nonfatal to tournament saves.
- Added structured JSON handling for uncaught Worker request errors.
- Added a reset-key-protected endpoint and utility script for deleting all cloud test tournaments listed in the Tournament Library.
- Clears prior local tournament autosaves, cloud sessions, queued snapshots, recovery state, diagnostics, and cached Tournament Library data once on first launch.
- Strengthened editing protection by deferring remote snapshots during active or very recent text entry.

## v3.17.2-test — Input Focus and Autosave Stabilization

- Restored the calmer v3.16.2 autosave cadence: 2 seconds before local autosave and 1.2 seconds before cloud synchronization.
- Ignores self-originated realtime snapshot echoes so a successful save cannot rebuild the active editor.
- Defers snapshots from other devices while a Staff user is actively editing an input, textarea, select, or contenteditable field, then applies the newest deferred revision after focus leaves the editor.
- Preserves the existing deterministic save queue, cloud diagnostics, TV synchronization, and spectator behavior.

## v3.17.1-test — Cloud Save Diagnostics

- Added persistent cloud-save diagnostics showing the last save stage, HTTP status, server response, retry count, queued revision, queue age, and snapshot size.
- Added a Staff-only **Retry queued save** control in Cloud Diagnostics.
- Preserved the v3.17.0 save behavior so this build can identify the exact failure without introducing another save-logic change.

## v3.17.0 — Deterministic Save Queue

- Replaced the boolean cloud-save queue with a single pending save request.
- Save Now now waits for an in-progress autosave and reports the actual queued-save result.
- Rapid edits continue to collapse into one latest-state cloud write.
- Preserved the existing authorization, outbox, worker, TV, and tournament-engine behavior.

## v3.16.3 — Stability Release

- Updated the Registration navigation icon with the supplied SVG.
- Fixed mobile Setup icon/text alignment.
- Enabled Staff users to select team representatives for tiebreak playoffs.
- Improved synchronization responsiveness and preserved edits made while a cloud save is already in progress.
- Fixed TV Display routing so TV links open the dedicated TV screen.

## 3.16.2 — Cloud-First Tournament Library and Branding

- Made the Tournament Library cloud-backed so tournaments appear across devices.
- New tournaments are created in the cloud immediately and cached locally for offline use.
- Added automatic discovery of existing locally remembered cloud tournaments.
- Moved tournament names below square library cards.
- Added Tournament Branding in Setup with upload, replace, and remove logo controls.
- Stored tournament logos in cloud snapshots and backup files.
- Retained the Pools division-selection stability fix so the selector no longer resets to Women’s Open.
- Preserved Staff/Spectator authentication, Save Now, autosave, recovery, scoring, results, and TV workflows.

## 3.16.1

- Added a dedicated Home page with the Tournament Library.
- New Tournament is available before authentication and opens the created tournament in Staff mode.
- Existing tournament cards open directly in Spectator mode.
- KSM brand and Save / Load menu return to the Tournament Library.

# Changelog

## 3.16.0
- Replaced role-specific access with Spectator and Staff.
- Added Staff Login and Logout.
- Added square-card Tournament Library under Save / Load.
- Preserved Save Now, autosave, cloud status, tournament files, and recovery files.
- Simplified Tournament Access to one public link and QR code.
- Recovery restore asks for a new Staff password.

## v3.15.16 — Final TV Display Polish

- Increased player-name line height and descender clearance so letters such as g, y, p, q, and j render fully.
- Compacted the Upcoming Matches footer while reserving a 40px bottom safe area inside the fixed 1920×1080 canvas.
- Preserved the v3.15.15 permissions lock, court action history, cloud synchronization, and frozen v3.12.9 Tournament Management Engine.

## v3.15.15 — UI & Permissions Lock

- Simplified the court action controls so the buttons always read **Undo** and **Redo** while preserving the complete per-court action history.
- Made team representative selection read-only for Spectator sessions.
- Added an action-layer permission check so unauthorized sessions cannot change representative players even if an interface control is exposed.
- Restricted Scorekeeper representative changes to the assigned court; Director, Admin, and Local sessions retain authorized access.
- Preserved the v3.15.14 TV display baseline and the frozen v3.12.9 Tournament Management Engine.

## v3.15.14 — TV Zone Rebalance

- Reduced the fixed Upcoming Matches region from 390px to 260px.
- Reallocated space to the header and current-context regions.
- Prevented pool/round labels from clipping in the header.
- Removed inherited vertical white/red side borders from the clean-room TV renderer.
- Increased Kachinuki lineup clearance so the third fighter remains fully visible.
- Preserved the fixed 1920×1080 canvas and all tournament, cloud, and Undo/Redo logic.

## v3.15.13 — TV Clean-Room Rebuild

- Replaced TV markup and CSS with a clean-room fixed-grid renderer.
- Eliminated inherited app layout styles and major absolute positioning.
- Kept Upcoming Matches in a permanent independent grid row.
- Preserved Court Context-derived team/Kachinuki data and sequential Undo/Redo.

# v3.15.12 — TV Renderer Replacement

- Replaced all emitted TV markup with one isolated renderer and one TV view model.
- Added hard non-overlapping header, current-context, and Upcoming Matches zones.
- Added one unconditional two-card Upcoming Matches component for every format.
- Centered 3/5-person team and Kachinuki content in a shared 1720 px composition.
- Preserved Court Context-derived team summaries and Kachinuki active/eliminated/waiting states.
- Removed vertical frame lines from the new renderer; only white/red top rules remain.
- Preserved sequential per-court Undo/Redo and the frozen v3.12.9 Tournament Engine.

## v3.15.12 — TV Context Stabilization

- Added shared non-overlapping TV header, current-match, and Upcoming Matches zones.
- Centered and widened standard three- and five-person team Court Context layouts.
- Added a dedicated Kachinuki TV presentation that mirrors Kachinuki Court Context: current match above the complete three-fighter lineup, with active/eliminated/waiting states only.
- Restored persistent two-card Upcoming Matches across individual, team, and Kachinuki TV modes.
- Preserved fixed 1920×1080 canvas behavior and sequential court Undo/Redo.

## v3.15.10 — TV Layout & Undo/Redo Stabilization

- Corrected individual TV point placement into fixed medial score zones.
- Centered and widened the team TV composition with equal team columns.
- Restored pool/round context beneath the division heading.
- Restored Upcoming Matches as two separate outlined match cards.
- Included unresolved individual and team bracket placeholders, including team Semifinals and Finals.
- Preserved independent, persistent, sequential Undo/Redo histories for Court A and Court B.
- Tournament Engine remains frozen at v3.12.9.

# Changelog

## v3.15.9 — TV Fixed Canvas & Court Action History

- Converted TV mode to a fixed 1920×1080 picture-like canvas controlled by browser zoom.
- Fixed the individual red-side region to explicit canvas coordinates.
- Added unresolved Semifinal/Final team placeholders to TV Upcoming Matches.
- Replaced generic individual championship TBD labels with generated bracket source placeholders when available.
- Added persistent, court-isolated, sequential Undo and Redo histories for scorekeeper actions, including Next Match.
- Kept the Tournament Engine frozen at v3.12.9.

## v3.15.9 — TV Canvas Isolation

- Replaced inherited responsive TV layout with an isolated fixed-position 1920×1080 presentation canvas.
- Centers and uniformly scales the complete canvas as one object.
- Uses fixed coordinate zones so header, scoring, team context, and Upcoming Matches cannot overlap.
- Removes KSM shell, sticky header, page padding, and scroll-container interference from TV mode.

## v3.15.7 — TV Display Stabilization & Navigation Freeze

- Replaced the fluid TV layout with a fixed 1920×1080 (16:9) presentation canvas that scales as one unit.
- Locked Court A and Court B TV sessions to the court encoded in their URL.
- Removed the portrait-only rotation gate; non-16:9 devices may scroll while preserving the canvas.
- Kept Upcoming Matches as two chronological rows.
- Removed Search from navigation and the application interface.
- Limited TV navigation to Admin/Director and Scorekeeper roles; Spectator navigation excludes TV.
- Standardized the shared read-only page label as Tournament Overview.

## v3.15.6 — Full-Screen Court TV Display

- Locked each TV session to the court specified by its Court A or Court B link.
- Prevented synchronized tournament state from reverting Court B displays to Court A.
- Made TV mode landscape-only with a rotate-device prompt in portrait orientation.
- Bound TV mode to the full dynamic viewport with hidden overflow and no scrolling.
- Renamed the footer to Upcoming Matches and displayed the next two court matches in chronological order.
- Enlarged Upcoming Matches headings, names, and VS labels for distance viewing.
- Kept individual TV matches free of redundant White and Red text labels.
- Updated the Live Scores heading to use the same framed page-heading language as other KSM views.
- Tournament Engine remains frozen at v3.12.9.

## v3.15.5 — TV & Team Live Scores Refinement

- Removed residual header chrome from the dedicated TV display.
- Enlarged and tightened the Court / Division / Pool hierarchy.
- Split individual competitor names over first-name and remaining-name lines.
- Moved point letters medially beside the VS marker and preserved large name text.
- Reduced unused vertical space and enlarged the Next Match area.
- Added auto-fitting team names, current-player outlines, and team Wins/Points totals.
- Team TV next-match information now uses the next team pairing.
- Team Live Scores now reuse the full Court Context match sheet.
- Added Court A and Court B TV launch access to the main navigation.

## v3.15.5 — Court TV Display Refinement

- Rebuilt the dedicated one-court TV display for 16:9 screens.
- Removed tournament-name and numeric-score presentation from TV mode.
- Made Court the largest white heading and Division the secondary gold heading.
- Added automatic name shrinking to prevent competitor-name wrapping.
- Positioned point letters medially beside each competitor.
- Strengthened white/red court-side indicators.
- Enlarged the Next Match section for distance readability.
- Added a team TV layout derived from Court Context: sequential lineups, medial point letters, and gold outlines around the current player pair.
- Tournament Engine remains frozen at v3.12.9.

## v3.15.5 — Shared Views & TV Display

- Renamed the Director navigation destination to Tournament Overview and made the same read-only overview available to Admin, Scorekeeper, and Spectator sessions.
- Made the Courts view structurally identical across roles; spectators see current match, Court Context, and Court Queue without scoring, Undo, Fusen-gachi, or Next Match controls.
- Rebuilt Live Scores as a dual-court glance view showing the active match, score, and next match for both courts.
- Live Scores stacks Court A and Court B vertically in phone portrait and uses two columns at wider sizes.
- Added dedicated one-court TV Display links for Court A and Court B with large, high-contrast text and no normal navigation.
- Kept TV Display read-only by using spectator authorization and court-specific URLs.
- Preserved the frozen v3.12.9 Tournament Management Engine.

## v3.15.2 — Interface Polish Bundle

- Removed the Generate Tournament validation modal header and redundant close control.
- Improved modal content and action-button spacing.
- Reduced Results division-title size consistently and kept titles to one line.
- Kept the scorekeeper Next Match action permanently gold.
- Limited Spectator and Scorekeeper navigation to Courts, Live Scores, Director, and Results.
- Preserved Spectator read-only behavior and Scorekeeper scoring privileges.
- Registration icon intentionally unchanged pending replacement SVG.

## v3.15.1 — Tournament Day Experience Polish

- Removed the card background, border, and shadow from the persistent cloud status.
- Stacked Online/Offline and last-save information vertically in the upper-right header.
- Changed save-age display to minute-level updates; after one hour it shows the saved clock time.
- Added automatic Save Now progress and success/failure toasts.
- Removed raw URLs from Tournament Access.
- Added copy confirmation and automatic modal close after link copying.
- Kept QR panels open for scanning and added a Back control.
- No Tournament Engine or cloud architecture changes.

## v3.15.0 — Tournament Day Experience

- Added an always-visible upper-right Online/Offline and Last Saved status.
- Added immediate local and cloud saving when a match is completed while preserving the manual Next Match workflow.
- Added two-second debounced autosave for setup and registration edits plus a ten-minute safety autosave.
- Retained a manual Save Now action with visible saving confirmation.
- Added downloadable and reloadable KSM recovery packages containing the local snapshot, tournament identity, cloud revision, court assignment, and queued offline state.
- Added Tournament Access for spectator, Court A, Court B, and Admin links with copy and QR-code actions.
- Added in-app Cloud Diagnostics and reorganized the Save / Load menu.
- Preserved the frozen v3.12.9 Tournament Management Engine and manual match advancement.


## v3.14.0 — Complete Cloud Release Candidate

- Completes the v3.13.x Cloud Foundation roadmap in one self-contained repository.
- Adds Spectator, Scorekeeper, Director, and Admin cloud roles.
- Adds court-specific scorekeeper links and protected role credentials.
- Adds connected-device presence over Durable Object WebSockets.
- Adds offline local-first outbox synchronization.
- Adds revision-safe conflict handling with downloadable recovery snapshots.
- Adds cloud diagnostics, production deployment guidance, and tournament-day operations documentation.
- Preserves the frozen v3.12.9 Tournament Management Engine as an opaque payload.

## v3.13.2 — Role-Aware Real-Time Synchronization

- Added separate director and spectator cloud session roles.
- Added unguessable director credentials required for all cloud writes.
- Kept tournament IDs publicly shareable for read-only spectator access.
- Added shareable spectator and director links.
- Added read-only spectator startup mode with live WebSocket updates.
- Hid all tournament editing, court control, export, and save controls in spectator mode.
- Added visible Local, Director, and Spectator session status.
- Preserved revision conflict handling, reconnect behavior, local autosave fallback, and the opaque v3.12.9 engine payload boundary.
- Added role-aware synchronization invariant coverage.

# Changelog

## v3.13.1 — Real-Time Synchronization Checkpoint 2

- Added Durable Object WebSocket subscriptions for live tournament snapshots.
- Added revision-aware optimistic concurrency; stale director saves receive HTTP 409 and the authoritative snapshot.
- Added automatic reconnect and live connection status.
- Added remote snapshot application without cloud echo-save loops.
- Preserved the complete v3.12.9 tournament payload as an opaque cloud snapshot.
- Added real-time synchronization architecture tests.

## v3.13.0 — Cloud Foundation checkpoint 1

- Added opaque UUID Tournament IDs.
- Added a Cloudflare Worker API for tournament create, save, and load.
- Added one Durable Object per tournament for authoritative persisted snapshots.
- Preserved the complete v3.12.9 save payload as the cloud persistence boundary.
- Added local-first cloud auto-save with offline fallback and connection status.
- Added director controls to save/load cloud tournaments and copy Tournament IDs.
- Added cloud-layer invariants preventing tournament-generation logic from entering the Worker.

## v3.12.9 — Medal Badge and Team Context Labels

- Removed the residual background from the first-place medal label in completed Court and Live Scores presentations.
- Added compact Wins and Points headers above both team-total columns in team Court Context round summaries.
- Preserved White-left and Red-right alignment without redundant side labels.
- No tournament-engine, Match Object, template, advancement, or save-schema changes.

## v3.12.8 — Final Tournament UI Polish

- Removed the redundant “Division Complete” heading from Court and Live Scores medalist presentations.
- Matched first-, second-, and third-place label colors to the Results tab.
- Removed residual box styling around completed-division medalist names.
- Rendered completed team-match summaries in Court Context as one vertical column.
- No tournament-engine, Match Object, template, advancement, or save-schema changes.

# KSM Changelog

## v3.12.7 — TestLab Foundation

- Added an internal deterministic simulation harness that runs the real KSM browser engine in headless Chromium.
- Added smoke, standard, and exhaustive TestLab profiles.
- Added automated individual elimination exhaustion for single and split courts from 4–32 competitors.
- Added pool-to-championship exhaustion, split queue-order verification, no-show position matrices, seed-resolution contracts, and save/load round-trip coverage.
- Added Markdown and JSON failure reports under an ignored `testlab-reports/` directory.
- Added `docs/TESTLAB.md` and npm commands for repeatable pre-release verification.
- No tournament behavior, Match Object schema, templates, or production UI changed.

# KSM v3.12.6 — Template Consistency and Seed Resolution

- Two-person tiebreaks for first place now resolve both Seed 1 and Seed 2 explicitly; ties at the second-place boundary resolve only Seed 2.
- Championship seed placeholders now read from the resolved seed ownership map, so first-place tiebreak winners and losers populate the correct bracket positions immediately.
- Pool no-show handling now removes only matches involving the absent competitor and preserves every surviving template Match Object in its original global order.
- Generated championship seed mappings remain frozen after a no-show, fixing the native six-competitor 3+3 template when one pool becomes a two-person pool.
- Added a focused executable regression test for frozen championship mappings, first-place seed resolution, and immutable no-show ordering.
- No new tournament formats, bracket templates, or Match Object types were added.

# KSM v3.12.4 — Match Object Origin Invariant

- Standard elimination and championship Match Objects are instantiated from templates during generation.
- Championship advancement now populates existing template nodes and never appends quarterfinal, semifinal, or Final matches.
- Added an explicit dynamic Match Object allowlist for individual pool tiebreaks, 3-person and 5-person representative matches, Kachinuki representative matches, and team round-robin tiebreak pairings.
- Approved dynamic matches receive `origin: TIEBREAK` and an explicit `dynamicType`.
- Unauthorized dynamic Match Object creation is rejected.
- Added automated Match Object origin and template-immutability tests.

# Changelog

## v3.12.4 — Bracket Lifecycle and Tiebreak Resolution

- Removed the legacy dynamic direct-elimination semifinal/final creation path.
- All canonical single-elimination template nodes now receive exactly one Match Object at generation.
- Advancement now fills those existing template Match Objects and never creates replacement standard bracket matches.
- Added readiness gating so unresolved template nodes cannot enter the active court queue.
- Corrected court-specific championship ordering by preserving canonical round and bracket-slot order before filtering by court.
- Limited winner-required hard stops to explicitly marked two-person tiebreaks.
- Three- and four-person tiebreak matches may end in ties; unresolved seed groups generate another appropriately sized tiebreak series.
- Added tiebreak series/index identity so repeated approved tiebreak series remain distinct and are not deduplicated.
- Enlarged the completed-division medalist presentation and removed box-like styling around names.
- Added automated lifecycle simulations covering single- and split-court direct elimination from 4–32 competitors plus forced 2-, 3-, and 4-person tiebreak scenarios.

## v3.12.4 — Split-Court Stabilization

- Reused the existing single-court pool tiebreak algorithm for split divisions; tiebreak Match Objects now inherit the owning pool court.
- Added the shared winner-required stop rule for two-person individual tiebreaks.
- Restored Court Queue for split direct-elimination divisions while preserving the no-queue single-court presentation.
- Filtered split pool championship queue matches and placeholders to the active court only.
- Enforced one Match Object per logical individual tiebreak or bracket node and prevented repeated semifinal/final creation.
- Kept Court Context unchanged so staff can still see the complete division structure.
- Added a focused split-court stabilization regression suite.

## v3.12.0 — Tournament Management Engine

- Added Court A, Court B, and Split Between Courts assignment for individual divisions.
- Split pool play keeps pools intact; Court B receives the extra pool when pool count is odd.
- Split direct-elimination and championship brackets preserve canonical halves; Finals remain on Court A.
- Championship matches may unlock when their required pool placements are finalized.
- Added pre-generation validation and a live Tournament Status card in Registration.
- Added transactional Regenerate Single Division workflow with Ready / Matches Started / Not Generated status.
- Added fixed-position structural no-show handling before a division's first completed match.
- Updated save schema to 1.1 and engine version to 3.12.0.
- No generation report was added.

## v3.11.9 — Final Mobile Navigation Polish

- Added consistent portrait safe-area spacing above the KSM navigation brand.
- Aligned every mobile navigation icon to one fixed icon row, including Live Scores and Save / Load.
- Reserved a protected branding column in phone landscape so Setup cannot overlap the KSM logo.
- Shifted the first landscape navigation item slightly right while preserving horizontal scrolling on narrow devices.
- No tournament-engine, Match Object, scoring, queue, advancement, template, or save-format changes.

## v3.11.9 — Responsive Tournament Header Refinement

- Reduced tournament-name typography in Court and Live Scores headers.
- Kept the KSM logo and tournament name on one row whenever space permits.
- Added strict two-line word-boundary wrapping for long tournament names.
- Prevented tournament branding from colliding with Court titles and gold divider lines.
- Applied the same header rules to Court and Live Scores across desktop, portrait, and landscape.
- No tournament-engine, Match Object, scoring, queue, advancement, template, or save-format changes.

## v3.11.7 — Repository Cleanup and Release Hygiene

- Removed generated `MANIFEST.json` and per-release `RELEASE_SUMMARY.md` files from the GitHub source package.
- Removed accumulated per-release test-report documents from `docs/`.
- Retained focused regression test source files because they protect distinct application contracts.
- Added maintained testing and repository-structure documentation.
- Expanded `.gitignore` to prevent release ZIPs, manifests, reports, and working directories from being committed accidentally.
- Corrected project version metadata and cache label to v3.11.7.
- No tournament-engine, Match Object, scoring, queue, advancement, template, or save-format changes.

## v3.11.6 — Header and Navigation Polish

- Aligned the Live Scores navigation icon with the shared icon baseline.
- Standardized Court and Live Scores tournament branding alignment.
- Kept tournament names beside the KSM logo when space permits and allowed clean two-line wrapping when needed.
- Standardized Court title divider lengths to match Live Scores.
- No tournament-engine, Match Object, scoring, advancement, template, or save-format changes.


## Seed-locked tiebreak resolution

Once a tiebreak series uniquely secures an advancing seed, that seed is frozen. Later tiebreak series may resolve only the remaining unresolved seed range and may not displace already secured players or teams.
