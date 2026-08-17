# KSM v3.17.13-test — Pool Match Order + Live Display Cleanup

## Scope

This is a focused tournament-day refinement release based on live testing of v3.17.12-test.

## Canonical individual pool order

The pool generator now uses one authoritative template library:

- 3 competitors: `A–B`, `C–B`, `C–A`
- 4 competitors: `A–B`, `C–D`, `C–A`, `B–D`, `B–C`, `D–A`

A/B/C/D are the competitors' positions in the generated pool. Generated Match Objects record their pool and template positions so the intended order can be inspected and tested directly.

Individual pool tiebreak groups reuse the same pairing templates.

## Live display cleanup

The temporary on-screen `TV Realtime Diagnostics` overlay has been removed from the TV/live display. The internal realtime diagnostic counters, refresh logic, console logging, and Cloud Developer Tools remain available for troubleshooting.

## Regression test

`tests/v31713-pool-match-order-diagnostics-cleanup-test.mjs` verifies the exact 3- and 4-person generated pairing sequences and confirms that the visible TV diagnostic overlay is no longer rendered.
