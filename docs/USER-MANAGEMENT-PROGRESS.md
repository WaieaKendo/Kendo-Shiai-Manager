# User management (#131): staged implementation

Branch: `feat/user-management`, draft PR #133, based on `feat/auth0` (PR #128).

## Steps 1–2: access store, identity linking, permissions and migration

`access-store.mjs` owns the idempotent SQLite schema and all access queries.
The existing SQLite-backed `TournamentState` namespace supplies `__ksm_access__`;
no Wrangler migration, Auth0 tenant or production setting changed. Auth0 remains
sign-in only: no Management API, client secret or email sending.

### Identity policy (supersedes step 1)

- `users.id` is a random KSM UUID. `user_identities` maps each verified Auth0 sub
  to it, with provider and link time. A new sub with an existing user's verified
  canonical email links to that user, so password and Google sign-ins share grants.
- Known identities retain their user and access when email changes. A known
  identity changing to another established user's email does not merge users or
  consume that user's invites; it retains its existing canonical email and grants.
- Unverified identities cannot create or link users or consume invites.
- Schema version 2 migrates step 1's sub-keyed users, grant targets and matching
  grant/invite attribution atomically. Reopening the store does not repeat it.
- Verified requests update email/last sign-in and consume matching pending invites.
  Socket rechecks only look up the mapped user; older socket attachments cannot
  overwrite a newer sign-in's email or consume invites.
- `/api/auth/me` retains email/highest global role and adds `roles`.
  `ADMIN_EMAILS` remains a break-glass admin source alongside stored global roles.

### Permissions

- Admins and creators may bootstrap new tournaments, including file imports as new.
  The creator receives owner access before the record becomes available. A failed
  owner grant, including a lost response after it committed, compensates the record,
  access rows, Library card and slug claim. A tombstone prevents later recreation.
- Admin/owner/director may read private tournaments, write, use staff live sockets,
  and change visibility. Creators have no implicit access to others' private events.
- `/access` supports GET list, POST grant and DELETE revoke for admins/owners.
  GET also retains refresh's self-role response; nonmanagers receive only their role.
  `/directors` is a manager-only compatibility alias for director grants.
- The last signed-in owner cannot be removed by an owner, even if another owner
  invite is pending. Admins may override. The check and mutation share a central
  transaction so concurrent removals cannot leave no owner.
- Only admins delete. Deletion removes tournament grants and pending invites;
  repeated deletes retry cleanup. A central deletion marker rejects delayed grants.
- Every write, handshake, staff socket message and private broadcast rechecks
  current access. Tournament revocation closes only the affected KSM user's sockets,
  including other linked providers or sockets using a previous email.

### First-use director migration and Library

On first check, legacy director emails become grants or pending invites, with a
central per-tournament meta marker. The old `directors` key stays untouched for
rollback. A local version flag avoids repeated migration calls; central meta keeps
revoked access revoked even if that local flag is lost.

Library cards now retain authoritative visibility metadata. Existing cards receive
a one-time backfill through their tournament object, including director migration.
After indexing, a Library request uses one central access lookup for all roles and
filters registry metadata without per-tournament calls. Unindexed visibility fails
closed. A monotonic visibility version prevents delayed migration backfills from
restoring stale public metadata; private changes hide the card before the snapshot
becomes private. The Auth0-disabled password/session path is unchanged.

## Step 2 validation

- Type checking and all 9 source-split checks passed.
- 11 identity/store checks and 13 permission/migration checks passed.
- 11 unchanged Auth0 Worker checks and 39 unchanged legacy Worker API contract
  checks passed.
- 1 existing Auth0 browser scenario passed against the real local Workers runtime:
  PKCE sign-in, directors, private/public access, revocation and phone width.
- Full regression suite: 214/214 test files passed in one run.

## Next session: step 3 (UI)

Claude reviews step 2 after it is pushed, per the current request. Keep the PR a
draft; do not merge or deploy. People & access, owner/creator UI controls and role
labels remain for step 3. Step 4 adds deployment and rollback documentation.

Meeting decisions still open: invite email method, whether owners can delete,
and which user fields to retain. The new verified-email identity-linking policy
is explicit in step 2; it supersedes the original sub-keyed users decision.
