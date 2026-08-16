# KSM v3.17.11-test — Pinned Court and Revision-Safe Sync

- Pins each scorekeeper/TV court locally so cloud snapshots cannot switch Court A and Court B devices.
- Defers remote snapshots while local edits, autosaves, queued writes, or in-flight saves remain pending.
- Rejects stale revisions and applies the newest deferred revision after local confirmation.
- Rebases compact local court patches once on a concurrent revision conflict, preserving changes from both courts.
- Adds temporary diagnostics for pinned court, displayed court, and pending local changes.
