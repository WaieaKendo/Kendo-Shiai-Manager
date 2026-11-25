# KSM Cloud Operations — v3.14.0

## Session roles

- **Spectator:** public, read-only, real-time tournament view.
- **Scorekeeper:** authenticated write session intended for one assigned court. The application opens directly to that court's scorekeeper view.
- **Director:** authenticated tournament editing and director overview.
- **Admin:** retains all generated role credentials and can create all share links. Admin credentials should be kept private.

Tournament IDs are public identifiers. Role keys are credentials and must not be posted publicly.

## Recommended tournament-day setup

1. On the primary computer, create the tournament and allow the first cloud save to complete.
2. Save a local `.ksm` file as a pre-event backup.
3. Copy the Court A and Court B scorekeeper links to the appropriate devices.
4. Copy the spectator link for public displays and guests.
5. Keep the admin link in a private password manager or secure note.
6. Confirm each device appears in Cloud Diagnostics before competition begins.

## Offline behavior

Every edit is first stored locally. When cloud access is unavailable, KSM keeps one latest queued cloud snapshot with its base revision. When connectivity returns:

- If the cloud revision is unchanged, the queued snapshot is saved automatically.
- If another device changed the cloud tournament, KSM does not overwrite it. The local offline copy is preserved as a downloadable recovery `.ksm` file and the authoritative cloud state is loaded.

This deliberately avoids unsafe automatic merges of tournament engine state.

## Conflict recovery

Use **Setup → Advanced → Backup → Download Recovery File**. Review the recovery file separately before deciding whether any data needs to be manually re-entered. Never replace a live cloud tournament blindly during an active event.

## Production checks

- `/api/health` returns `ok: true` and version `3.14.0`.
- HTTPS is active; WebSockets use WSS automatically.
- Durable Object migrations are visible during `wrangler deploy --dry-run`.
- At least one director/admin device and both scorekeeper devices show `Live sync`.
- A spectator device receives a score change without refreshing.
- A local `.ksm` backup exists before the first match.
