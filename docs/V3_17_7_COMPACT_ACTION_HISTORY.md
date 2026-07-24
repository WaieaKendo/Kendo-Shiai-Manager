# KSM v3.17.7-test — Compact Action History

This test build replaces newly recorded court undo/redo snapshots with compact recursive patches.

## Scope
- Applies to every action routed through `performCourtAction`, including scoring, hansoku, fusen-gachi, representative selection, and Next Match/progression actions.
- Preserves the existing tournament action logic; only history recording and replay were changed.
- Discards legacy snapshot-format undo/redo entries created by v3.17.6 and earlier so existing oversized history does not continue causing save failures. Tournament data is preserved; only the old undo/redo stack is cleared.
- Continues to maintain separate Court A and Court B undo/redo stacks with the existing 100-action limit.

## Expected result
A score should record only the score and active-match fields that changed instead of full copies of `allMatches` and `matches`. Next Match may create more patches because it can advance brackets or teams, but it should still store only changed paths.

## Test priorities
1. Score and undo/redo M, K, D, T on both sides.
2. Apply first and second hansoku, then undo/redo each step.
3. Use fusen-gachi and undo/redo.
4. Score a match, press Next Match, then undo and redo across the full sequence.
5. Repeat for pool, championship, team, kachinuki, and playoff matches.
6. Confirm Court A and Court B histories remain independent.
7. Re-run Snapshot Analysis and Action History Analysis after 50–100 actions.
