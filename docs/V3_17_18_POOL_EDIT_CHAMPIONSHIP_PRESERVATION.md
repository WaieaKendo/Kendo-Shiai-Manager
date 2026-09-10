# v3.17.18-test — Pool Edit Championship Preservation

## Reproduced failure

A generated pool division could work correctly until the user manually moved competitors in **Edit Pool** and pressed **Save Pool Changes**. The bracket preview still showed the correct quarterfinal qualifiers after pool play, but the Court Scorekeeper could show **No active match** when elimination play began. This was reproduced conceptually by the 14-person single-court and 12-person split-court reports.

## Root cause

`saveEditedPools()` rebuilt `state.allMatches[division]` with `buildPoolMatches()` only. That replaced the complete generated division Match Object array and silently discarded every championship template Match Object (QFs, semifinals, and final).

The bracket preview did not expose this immediately because it is rendered from the frozen championship seed template plus pool standings. Therefore the QF names could appear completely correct in the visual bracket even though there were no QF Match Objects for the Court queue to score.

This is why the failure correlated specifically with divisions where competitors had been moved in **Edit Pool**, and why the same bracket sizes worked when the generated pools were left unchanged.

## Fix

- Saving edited pools now rebuilds the complete generated division state:
  - canonical pool Match Objects;
  - frozen championship template Match Objects;
  - championship nodes and court assignments.
- The frozen championship mapping remains unchanged; editing pool membership/order does not regenerate a different bracket template.
- Affected Court A/B queue pointers are recomputed after the edit because the Match Object array has intentionally been rebuilt.
- The management revision increments and the edited state is autosaved.

## Self-healing protection

`syncChampionshipTemplate()` now recreates a missing championship Match Object from its canonical championship node. This makes v3.17.18 able to repair an older/broken state created by the <=v3.17.17 Edit Pool behavior rather than merely logging a template-invariant error.

## Regression coverage

`tests/v31718-pool-edit-championship-preservation-test.mjs` verifies:

- 14 competitors with manually edited pools retain all 18 pool matches plus 7 championship Match Objects;
- all four 14-person QFs become scorable once pool seeds resolve;
- a 12-person split-court edited division retains 7 championship Match Objects;
- the four 12-person QFs remain assigned 2 to Court A and 2 to Court B;
- a legacy state with all championship Match Objects deleted is automatically reconstructed, and its resolved QFs become scorable.

No championship seed mappings, pool match ordering, scoring rules, tiebreak rules, Kachinuki behavior, or v3.17.17 division-selection protections were changed.
