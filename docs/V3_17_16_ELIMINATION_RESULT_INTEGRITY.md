# KSM v3.17.16-test — Elimination Result Integrity

## Observed failure

During a two-court test, a quarterfinal winner initially advanced correctly, but after another quarterfinal completed the earlier feeder could display `Hikiwake`. The semifinal then had no valid competitor and the bracket could not continue.

## Failure path addressed

KSM previously derived a completed match winner every time from the mutable `wp` / `rp` arrays. Score-button actions and the final **Next Match** completion action are separate action-history patches. Under concurrent cloud rebasing, the code therefore allowed a state in which `done: true` survived while the score patch needed to identify that winner did not. A completed elimination match with equal or empty score arrays resolves to `Hikiwake`, which could then appear in a later-round source label.

The exact production state from the failed test was not exported, so this release treats that code path as the reproducible failure class rather than claiming the original cloud record was recovered.

## Changes

### Atomic completion result

When **Next Match** completes a bout, KSM now stores `completedResult` on the Match Object with:

- `winner`
- `wp` / `rp` final point arrays
- `wt` / `rt` hansoku totals
- `recordedAt`

Because `completedResult` is newly created at completion, compact action history records it as one whole-object patch. A rebase can therefore reconstruct the completed result even when an earlier point-tap action belonged to a different cloud revision.

### Result integrity repair

On load and after concurrent rebase, KSM validates completed results before progression is rendered. A valid atomic result restores the authoritative score arrays. Legacy completed matches without a snapshot receive one when their score identifies a winner. A winner-required match that is marked complete but still has no winner is reopened rather than advanced.

### Advancement safety

Championship and single-elimination advancement is recomputed after load-time result repair. Championship source labels never treat `Hikiwake` as a competitor; an unresolved/invalid feeder remains labeled `Winner of <round> Match <n>` until a real winner exists.

### Stable action-time match identity

Each `allMatches` action patch now stores the stable match identity when the action is created. Rebase uses that stored identity first, so a later sort or insertion cannot make an old numeric array index refer to the wrong match.

### Worker boundary

The Cloudflare Worker rejects a save when a winner-required completed match is tied or when a `completedResult` winner contradicts its result score.

## Regression coverage

`tests/v31716-elimination-result-integrity-test.mjs` covers:

1. A completion replay where the remote state is missing the earlier scoring point.
2. Action patch identity after local match-array reordering.
3. Recovery of a legacy completed elimination tie.
4. Prevention of `Hikiwake` as a later-round participant label.
5. QF1/QF2 winners populating SF1 from atomic results.
6. Worker rejection of invalid completed elimination results.
