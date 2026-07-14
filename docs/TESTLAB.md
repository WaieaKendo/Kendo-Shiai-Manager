# KSM TestLab

KSM TestLab is an internal deterministic simulation harness. It loads the real application in headless Chromium and exercises the same generation, advancement, queue, no-show, tiebreak, and persistence functions used by KSM.

It is not exposed in the tournament interface and does not modify production tournament data.

## Profiles

```bash
npm run testlab:smoke
npm run testlab
npm run testlab:exhaustive
```

- **smoke**: representative templates and high-risk scenarios; intended for quick development checks.
- **standard**: every supported individual elimination and pool competitor count, plus no-show matrices and maintained engine regressions.
- **exhaustive**: expands the no-show matrix across additional competitor counts and positions.

## Current coverage

- Single-court and split-court individual elimination exhaustion from 4–32 competitors
- Template node and Match Object one-to-one invariants
- Final completion and no post-generation standard Match Object growth
- Split court queue order against canonical template node order
- Individual pool-to-championship exhaustion from 6–32 competitors
- Pool and match ordering after no-shows
- No-show position matrices on single and split courts
- Seed ownership contracts for first-place and second-place tiebreaks
- Save/load payload round-trip for split brackets
- Existing maintained Tournament Management, split-court, lifecycle, origin, and tiebreak regression suites

## Reports

Every run creates both Markdown and JSON reports under `testlab-reports/`. This directory is ignored by Git.

A failing report identifies the category, exact scenario, and assertion message. Use a fixed `--seed` when randomized scenarios are added in the future so a failure can be reproduced.

## Design rules

- TestLab must call the real KSM engine functions; it must not implement a separate tournament engine.
- A TestLab failure is evidence to investigate. Tests must not patch production behavior.
- Standard Match Objects must remain template-origin objects. Only the approved tiebreak allowlist may create dynamic Match Objects.
- User acceptance testing remains necessary for visual behavior, device-specific browser issues, and real tournament workflow usability.
