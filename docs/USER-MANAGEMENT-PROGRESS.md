# User management (#131): staged implementation

Branch: `feat/user-management`, based on `feat/auth0` (PR #128).

## Step 1 complete: access store and identity linking

- `access-store.mjs` owns the idempotent SQLite schema and all access queries.
- The existing SQLite-backed `TournamentState` namespace provides the central
  `__ksm_access__` object. No Wrangler migration or tenant settings changed.
- Binding-only internal operations: resolve, grant, revoke, listPeople,
  listTournament, removeTournament. Public Worker routing never forwards them.
- Verified identities are keyed by Auth0 sub; sign-in normalizes/updates email
  and last-sign-in time and atomically converts pending invites into grants.
  A conflicting email attached to another sub fails closed; grants never move
  between subs. An email change on the same sub preserves access.
- `/api/auth/me` retains email and highest global role and adds `roles`.
  `ADMIN_EMAILS` is combined with stored roles as a break-glass admin grant.
- Request account access reads the store. The existing admin-only Directors
  controls mirror new grant/revoke changes into it and retain the old key.
- Auth0 remains sign-in only: no Management API, secret or email sending.

This is an incomplete draft, not ready to deploy. Existing director keys are
**not migrated** yet. Socket authorization still uses the #128 email-based
checks until step 2, so the new sub-based roles are not complete end-to-end.
Creator bootstrap, owner permissions, tournament deletion cleanup, and the
People & access UI are also deliberately deferred.

## Next session: step 2

Re-read the supplied request, issue #131/comments, and latest branch commits.
Implement permission checks, creator bootstrap with owner-grant rollback,
access management, deletion cleanup, per-request/socket store rechecks, and
idempotent migration of existing directors. Preserve the Auth0-disabled path.
The request calls for an Opus review of this step; that model is unavailable in
this Codex session and will need to be arranged separately.

## Validation for step 1

- 9 access-store checks: real SQLite through Node's test adapter, including
  invite conversion, email changes, unverified identities, collisions/rollback,
  role precedence, revoke, schema reinitialization and deletion cleanup.
- 11 existing Auth0 Worker access checks.
- 1 existing Auth0 browser scenario against the real local Workers runtime:
  PKCE sign-in, directors, private/public access, revocation and phone width.
- Type checking passed; all 9 source-split checks passed; diff whitespace clean.

The full regression suite is reserved for step 4, once, per the request.
Later steps add UI/browser coverage and deployment/rollback documentation.
Meeting decisions still open: invite email method, whether owners can delete,
and which user fields to retain.
