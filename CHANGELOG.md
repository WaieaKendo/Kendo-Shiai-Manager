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
