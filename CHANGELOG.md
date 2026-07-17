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
