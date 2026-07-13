# Changelog

## v3.12.2 — Split-Court Stabilization

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
