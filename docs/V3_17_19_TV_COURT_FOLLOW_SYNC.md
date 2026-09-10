# v3.17.19-test — TV Court Follow Synchronization

## Reported behavior

The Court B TV display could remain locked to the division/court runtime state it first loaded. Changing the active division on the Court B scorekeeping screen did not reliably move the TV display with it. Court A often appeared normal because its initial/default runtime state happened to match the scorekeeper.

## Root cause

v3.17.17 correctly prevented remote snapshots from changing a scorekeeper's locally selected division. However, that preservation rule was applied to every live-sync client, including read-only TV windows. A TV window therefore remembered its own old `ksmLocalCourtDivision` value and reapplied it after every incoming cloud snapshot, overriding the newer `courtState` / `courtActiveDivision` published for its assigned court.

A second responsiveness issue was that manually changing the scorekeeper division did not itself trigger a cloud save. The TV could therefore wait until the next scoring/edit action before receiving the new active-division state.

## Fix

- Local-division preservation during incoming live sync now applies only to writable scorekeeper/staff sessions.
- TV and spectator clients always follow the authoritative per-court runtime state in the newest cloud snapshot.
- TV synchronization uses the TV window's URL-assigned court as its authoritative court identity.
- The scorekeeper division dropdown now calls `selectScorekeeperDivision()`, which publishes the new per-court active division immediately through the normal critical-save/rebase pipeline.
- The v3.17.17 protection remains intact: a remote Court A/B update cannot force a writable scorekeeper off the division it selected locally.

No scoring, pool, bracket, advancement, Edit Pool, tiebreak, team, Kachinuki, or tournament-template behavior was changed.
