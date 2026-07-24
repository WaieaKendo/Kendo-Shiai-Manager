# KSM v3.17.8-test — Self-Healing TV Synchronization

This test release targets the intermittent condition where a Court TV could initially display stale court or division state until the TV window was reopened.

## Recovery behavior

1. The requested Court A/B assignment is stored before realtime connects.
2. On websocket open, the TV requests the latest cloud snapshot with caching disabled and force-applies it.
3. If initial verification is incomplete after three seconds, the TV requests another full snapshot.
4. Every 15 seconds, the TV verifies the current cloud revision so a silently missed websocket broadcast cannot leave it stale indefinitely.
5. A websocket revision gap triggers an immediate full refresh.
6. Returning online or bringing the TV tab back into view triggers reconnect/verification.
7. Any refreshed snapshot explicitly rerenders the TV, including a change in the active division for the selected court.

The implementation is read-only on TV pages and does not alter scoring, undo/redo, tournament progression, or save scheduling.
