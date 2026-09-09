# v3.17.17-test — QF Activation and Division Stability

This release addresses two intermittent tournament-day failures observed under live synchronization.

## 1. Pool → QF active-match freeze

A court could finish pool play and have correctly resolved quarterfinal competitors in the championship bracket, while the Scorekeeper Active Match area remained empty. The underlying failure was a stale saved court pointer: a synchronized snapshot could retain an index at the end of the old pool queue, or point at an unresolved future championship placeholder. Once the QF became ready, the pointer was not always reconsidered.

v3.17.17 treats only a currently scorable match as a valid active pointer. On load/live sync, and again before rendering the scorekeeper, KSM self-heals to the first ready match for the selected division and pinned court. This applies to both single-court and split-court divisions.

## 2. Division selector reverting after several seconds

`currentDivision` is a device-local scorekeeper view, but remote tournament snapshots previously replaced it with the division last rendered by another synchronized client. The delay matched the deferred live-sync/autosave cycle, which made a manually selected division appear to switch back several seconds later.

v3.17.17 keeps a local division preference for Court A and Court B outside serialized tournament state. Live remote snapshots preserve that local selection. During concurrent-save rebase, the local device owns only its pinned court's navigation state; the other court remains sourced from the newest server record.

No pool templates, championship mappings, scoring rules, tiebreak rules, or v3.17.16 completed-result integrity behavior were changed.
