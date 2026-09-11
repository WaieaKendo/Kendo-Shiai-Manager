# v3.17.20-test — Pool-Local Tiebreak Ordering

## Problem

During live testing, some individual pool tiebreak matches were created at the end of the division instead of directly after the pool that required them. Example: in a four-pool division, a Pool A tiebreak could appear after Pool D. The issue was intermittent and affected both two-player and three-player tiebreaks.

## Root cause

Two independent synchronization paths could produce the same bad ordering.

1. Dynamic insertion used JavaScript object identity (`arr.indexOf(afterMatch)`) to find the completed pool match that should anchor the tiebreak. A remote snapshot or conflict rebase can replace Match Objects with cloned equivalents, causing that lookup to fail. The fallback was `arr.length`, which appended the tiebreak to the end of the division.
2. During concurrent cloud conflict replay, a valid dynamic Match Object that did not yet exist in the authoritative remote snapshot was safely appended before its field patches were replayed. That prevented sparse-array corruption, but it did not restore the tiebreak to its pool-local position.

## Canonical invariant

For every individual pool:

- all normal pool matches remain in their fixed template order;
- tiebreak series 1 follows immediately after the final normal match of that pool;
- later tiebreak series follow series 1 in `tiebreakSeries` / `tiebreakIndex` order;
- the next pool cannot begin before pending tiebreak matches for the preceding pool in that court's timeline.

The invariant is now normalized after dynamic creation, after conflict rebasing, and on tournament load. Existing misplaced tiebreaks therefore self-heal.

## Synchronization identity

Tiebreak Match Object identity now includes `tiebreakSeries` and `tiebreakIndex`. This makes repeated series between the same two competitors distinct during rebase. A compatibility matcher still recognizes the pre-v3.17.20 identity format in existing action history.

## Split courts

Reordering updates saved court pointers by stable Match Object identity and then falls back to the first ready match for that court. In a four-pool split division, for example, a Pool C tiebreak on Court B is guaranteed to run before Pool D.

## Unchanged

This release does not change pool match templates, qualification/tiebreak criteria, championship mappings, score entry, results calculation, Edit Pool behavior, TV synchronization, team matches, or Kachinuki logic.
