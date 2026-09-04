# KSM v3.17.15-test — Tournament State Integrity & Identity-Safe Rebase

## Problem
During simultaneous two-court operation, a revision conflict could require client-side patch replay. Patch paths were index-based. If a replay targeted a nested field at an array index that did not exist in the newer server state, JavaScript direct assignment could create a sparse array. `JSON.stringify` serializes sparse array holes as `null`. A later render then dereferenced `match.championship` on `null`, stopping Live/Spectator rendering and making the tournament appear unable to load.

## Changes
- Resolve allMatches patches by stable match identity instead of trusting stale numeric indexes.
- Refuse sparse-array creation during generic patch replay.
- Sanitize invalid/null match entries before tournament rendering and normalize saved indexes.
- Add null-safe completion checks.
- Reject malformed allMatches snapshots at the Worker boundary.

## Scope
Scoring rules, pool/bracket templates, Kachinuki logic, and v3.17.14 deterministic pool slots are unchanged.
