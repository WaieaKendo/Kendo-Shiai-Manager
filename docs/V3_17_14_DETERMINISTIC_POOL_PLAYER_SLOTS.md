# KSM v3.17.14-test — Deterministic Pool Player Slots

## Scope

This is a focused pool-order stabilization release. It does not change championship pairing templates, scoring, cloud synchronization, undo/redo, team logic, or Kachinuki logic.

## Authoritative player-slot rule

Within every generated individual pool, the displayed top-to-bottom order is the canonical slot identity:

- Player 1 = `A`
- Player 2 = `B`
- Player 3 = `C`
- Player 4 = `D`

The existing canonical match sequences therefore resolve against exactly the order visible to tournament staff:

- 3 competitors: `A–B`, `C–B`, `C–A`
- 4 competitors: `A–B`, `C–D`, `C–A`, `B–D`, `B–C`, `D–A`

## Persistence

Generated pool entries store `poolSlot` and `poolSlotIndex`. Match Objects store `whitePoolSlot` and `redPoolSlot`. Manual pool edits deliberately reassign slots from the saved visual order. Structural no-shows do not reassign surviving slots.

## UI

Generated Pools and printed pool sheets display A/B/C/D next to each competitor so staff can verify the matchup template without inferring letters from match order.
