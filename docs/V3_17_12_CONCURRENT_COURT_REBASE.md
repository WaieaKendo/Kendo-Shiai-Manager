# KSM v3.17.12-test — Concurrent Court Save Rebase Stabilization

## Purpose

This release fixes the HTTP 409 `Revision conflict` failure reproduced when Court A and Court B save within a short interval of each other.

## Root cause

v3.17.11 contained the new concurrent-court rebase implementation, but a second legacy `performCloudSave()` definition appeared later in `public/index.html`. Because JavaScript function declarations are hoisted and the later declaration wins, the legacy implementation silently replaced the new rebase implementation at runtime.

The active legacy function correctly rejected stale full-snapshot writes, but immediately surfaced `Cloud revision conflict` instead of rebasing the scorekeeper's local court actions onto the newest cloud record. This produced the observed `Save needs attention` state even though the local score remained on screen.

## Changes

- Removed the duplicate legacy `performCloudSave()` implementation so there is one authoritative save path.
- Combined the existing cloud diagnostics and authentication behavior with the concurrent-court rebase path.
- Increased automatic conflict recovery to a bounded maximum of four consecutive rebases.
- Preserved the original save base revision across retries so the same unsynced court action remains eligible for replay even if multiple newer cloud revisions arrive during recovery.
- Deduplicated already-present local action-history entries before replaying patches.
- Preserved the newest remote court state while replaying only the pinned scorekeeper court's local patch actions.
- When additional local court actions occur while a rebased save is in flight, the returned cloud state is merged with those newer local actions before the pending save runs.
- Added diagnostics for rebase attempt count, server revision, original base revision, and replayed action count.

## Intentionally unchanged

- Court pinning introduced in v3.17.11 remains intact and uses the same local-storage key so existing court assignments survive the upgrade.
- Scoring rules, brackets, pools, tiebreak logic, team logic, Kachinuki logic, TV rendering, and audience rendering are unchanged.
- The requested pool-match-order correction is intentionally deferred until this synchronization fix passes two-court testing.

## Regression coverage

`tests/v31712-concurrent-court-rebase-test.mjs` verifies:

- there is exactly one `performCloudSave()` definition;
- the rebase retry loop is bounded;
- two consecutive 409 conflicts advance retry bases from revision 48 → 50 → 51;
- the local Court A action survives both conflicts;
- the newest Court B server state survives both conflicts;
- duplicate already-applied local actions are not replayed.
