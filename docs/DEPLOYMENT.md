# Production Deployment

KSM v3.14.0 deploys as a Cloudflare Worker with static assets and a Durable Object namespace.

## First deployment

```bash
npm install
npm run check:cloud
npm run check
npx wrangler login
npm run build && npx wrangler deploy --dry-run
npm run deploy
```

`npm run deploy` builds the front end (`vite build`, into `dist/`) and then runs `wrangler deploy`, which serves `dist/` as the static assets. Never run a bare `wrangler deploy` without building first: it would publish whatever is in `dist/`.

The checked-in `wrangler.jsonc` includes the `TournamentState` Durable Object and its SQLite migration.

## Paths the site answers

Screens have path URLs (roadmap M.9): `/t/<id>`, `/t/<id>/live`, `/t/<id>/court/a|b`, `/t/<id>/tv/a|b` and the stream overlay `/t/<id>/overlay/a|b`. The static assets' single-page fallback (`not_found_handling: single-page-application`) answers every `/t/...` path with `index.html`; `run_worker_first` sends `/api/*` and `/t/*` to the Worker, which answers `/t/<id>/overlay/...` with `overlay.html` (also served at `/overlay`) and hands every other `/t/...` path back to the assets. Old query links (`/?tournament=<id>&court=A`, `&view=tv`, `/overlay?tournament=...`) are still served (`/` and `/overlay`) and the page replaces them by their path. A custom domain that passes every request through to the Worker (the pass-through of PR #20) needs nothing extra for the paths.

## Staff password and sessions (security notes)

Each tournament has one shared staff password (issue #9 hardened it for 4.0.0; sign-in with Auth0 and roles follow in 4.0.1, see docs/ROADMAP.md "Login and permissions: decided"). All of it lives in the tournament's Durable Object (`src-worker.js`, `TournamentState`):

- **Stored as PBKDF2-SHA256** (`staffPasswordHash`: `pbkdf2-sha256$<iterations>$<salt>$<hash>`), a random 16-byte salt per tournament, **20,000 iterations**. Measured locally (M1 Pro, `wrangler dev`/workerd): 100,000 iterations took about 9 ms per check, so 20,000 is about 2 ms, which keeps a login well inside the Workers Free plan's 10 ms CPU budget (Durable Objects on a paid plan allow 30 s). Only a password check pays it (Staff Login, tournament creation, and the rollout fallback below, where the last correct password is remembered in memory so repeated saves do not pay it again). Together with the attempt limit this is far stronger than the old unsalted SHA-256. The iteration count is stored with each hash (100,000 is the most WebCrypto accepts and is still read), and a hash with fewer than the current count is upgraded at the next correct password, so raising it later (e.g. on a paid plan) is safe; after deploying, check the dashboard for `exceededCpu` errors.
- **Tournaments created before 4.0.0** keep their old unsalted SHA-256 hash until the next correct password (Staff Login, or a save from a device on the old app), which replaces it with the PBKDF2 hash of the same password, transparently. Nobody has to do anything; a tournament nobody logs into again keeps the old hash.
- **Attempt limit:** wrong staff passwords count per tournament (Staff Login, the staff live connection, staff saves and deletes). From the 5th wrong one in a row, password attempts are refused for 30 s, doubling with each further wrong one up to 15 min (HTTP 429, `Retry-After`, the app shows "Too many incorrect Staff passwords. Try again in …"). During the wait even the right password is refused; devices already logged in keep saving (their session token is not a password attempt); spectators are unaffected. A correct password resets the count. To unlock a tournament early: wait, or (operator) delete the `staffAuthFailures` key of that Durable Object.
- **Session tokens:** a correct Staff Login (or creating the tournament) returns a random session token; the device keeps it in `sessionStorage` (the tab only) and sends it instead of the password with every save (`x-ksm-session-key`) and as the live connection's `key`. The Durable Object stores only the token's SHA-256 (`staffSessions`), valid until 24 h after its last use, at most 50 per tournament. Setting the password revokes every token. An expired or revoked token gets HTTP 401 and the device turns into a spectator ("Staff session expired · use Staff Login again"); its unsaved work stays queued until Staff Login.
- The token is in the live connection's URL (as the password was before), so it can appear in request logs; it expires and is not the password.

### Rollout of 4.0.0 and removing the password fallback

Devices still running the previous app (an open tab, or the service worker's cached copy until it updates) send the password itself as their key. **For one release the Worker still accepts the password there** (`staffAccess()` in `src-worker.js`: a key that is not a session token is checked as a password, counted by the attempt limit). So deploying 4.0.0 during or right before an event does not log anyone out, and old devices also upgrade their tournament's hash.

**Remove the fallback in the release after 4.0.0** (4.0.1, together with Auth0), once every event device has reloaded the new app (any reload after the 4.0.0 deploy is enough; a device that logs in and gets a token is on the new app): in `staffAccess()` return 401 for any key that is not a session token, drop the in-memory `verifiedPassword`, and change `KsmApp.put_record(legacy_password=True)` and the compatibility checks in `staff-auth-hardening-test.mjs` / `staff-login-hardening-test.py` to expect 401. Keep the SHA-256 → PBKDF2 upgrade in Staff Login: it is what moves old tournaments over.

## Verify after deployment

1. Open `https://YOUR_HOST/api/health` and confirm version `3.14.0`.
2. Open the application and create a small tournament.
3. Confirm `Live sync` appears after the initial cloud save.
4. Open a spectator link (`/t/<id>`) in a private browser and verify real-time updates.
5. Open Court A and Court B scorekeeper links (`/t/<id>/court/a`, `/t/<id>/court/b`) on separate devices, and a TV link (`/t/<id>/tv/a`) and an overlay link (`/t/<id>/overlay/a`).
6. Check Cloud Diagnostics for connected devices and revision changes.
7. Staff Login on a second device works (one prompt), and an existing tournament from before 4.0.0 still accepts its staff password.

## Rollback

Keep the previous Git tag and a local `.ksm` tournament backup. Application rollback does not reinterpret or migrate the stored engine payload. Do not delete the Durable Object namespace during a code rollback.
