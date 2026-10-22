# Deployment

KSM runs as a Cloudflare Worker (`src-worker.js`) that serves the built app (`dist/`) as static assets and keeps each tournament in a `TournamentState` Durable Object (SQLite). There are two sites, each its own Worker with its own Durable Objects, so dev never sees or touches production data:

| | **Dev** | **Production** |
|---|---|---|
| Worker | `kendoshiaimanager-dev` | `kendoshiaimanager-cloud-staging` (the old name; see [Renaming production](#renaming-production)) |
| URL | the dev Worker's `workers.dev` address (repository variable `DEV_URL`); `https://ksm-tournament-dev.pages.dev`; later `dev.tournament.hawaiikendofederation.org` | the production Worker's `workers.dev` address (repository variable `PRODUCTION_URL`); `https://ksm-tournament.pages.dev`; later `tournament.hawaiikendofederation.org` |
| Data | its own test tournaments | **the real tournaments** (11th AHKC and later) |
| `wrangler.jsonc` | `env.dev` | the top level |
| Deployed by | **Deploy dev**: every push to `develop` | **Deploy production**: a release merged into `main` (new version), or by hand from `main` |

Both go through `.github/workflows/deploy.yml`: the full test suite (`test.yml`, the same as on every push) → build → `wrangler deploy` with the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` → a health check that waits until `/api/health` reports the version in `package.json` (`scripts/health-check.mjs`, retries for about two minutes). Nothing is ever deployed from a pull request.

## Dev: every push to `develop`

Merging a pull request into `develop` (or pushing to it) starts **Deploy dev**. When it is green, the dev site runs exactly that commit. The first dev deploy creates the `kendoshiaimanager-dev` Worker and its empty Durable Object namespace (migration `v1` in `env.dev`). Use dev for trying a change on phones and TVs before it goes to production; its tournaments are throwaway.

## Branches until 4.0.0 ships

From 2026-10-20 until 4.0.0 is released, `develop` holds **only 4.0**: the dev site keeps showing the
4.0 candidate, and the release path (#90) is unchanged.

- **Fixes for 4.0:** PRs to `develop`, as before. After each one, `develop` is merged into `next/4.1`.
- **New work (4.1):** PRs to **`next/4.1`** (pick it as the base). It is not deployed anywhere; CI still
  tests every PR. A change that raises `KSM_CLIENT_SCHEMA` / `MIN_CLIENT_SCHEMA` belongs here, never in
  `develop` before 4.0.0.
- **Release:** `npm run release -- 4.0.0-rc.N` on `develop`, PR `develop` → `main` (deploys production),
  then 4.0.0 the same way. No merges to `main` from about 11/7 until after 11/21 except emergency fixes.
- **After 4.0.0:** merge `next/4.1` into `develop` (a merge commit) and delete `next/4.1`; work goes to
  `develop` again.

## Paths the site answers

Screens have path URLs (roadmap M.9): `/t/<id>`, `/t/<id>/live`, `/t/<id>/court/a|b`, `/t/<id>/tv/a|b` and the stream overlay `/t/<id>/overlay/a|b`. The static assets' single-page fallback (`not_found_handling: single-page-application`) answers every `/t/...` path with `index.html`; `run_worker_first` sends `/api/*` and `/t/*` to the Worker, which answers `/t/<id>/overlay/...` with `overlay.html` (also served at `/overlay`) and hands every other `/t/...` path back to the assets. Old query links (`/?tournament=<id>&court=A`, `&view=tv`, `/overlay?tournament=...`) are still served (`/` and `/overlay`) and the page replaces them by their path. A custom domain that passes every request through to the Worker (the pass-through of PR #20) needs nothing extra for the paths.

## Staff password and sessions (security notes)

When Auth0 is unconfigured, each tournament has one shared staff password (issue #9 hardened it for 4.0.0). The opt-in account system is described under [Auth0 sign-in](#auth0-sign-in-not-enabled-in-production). Passwords and sessions live in the tournament's Durable Object (`src-worker.js`, `TournamentState`):

- **Stored as PBKDF2-SHA256** (`staffPasswordHash`: `pbkdf2-sha256$<iterations>$<salt>$<hash>`), a random 16-byte salt per tournament, **20,000 iterations**. Measured locally (M1 Pro, `wrangler dev`/workerd): 100,000 iterations took about 9 ms per check, so 20,000 is about 2 ms, which keeps a login well inside the Workers Free plan's 10 ms CPU budget (Durable Objects on a paid plan allow 30 s). Only a password check pays it (Staff Login, tournament creation, and the rollout fallback below, where the last correct password is remembered in memory so repeated saves do not pay it again). Together with the attempt limit this is far stronger than the old unsalted SHA-256. The iteration count is stored with each hash (100,000 is the most WebCrypto accepts and is still read), and a hash with fewer than the current count is upgraded at the next correct password, so raising it later (e.g. on a paid plan) is safe; after deploying, check the dashboard for `exceededCpu` errors.
- **Tournaments created before 4.0.0** keep their old unsalted SHA-256 hash until the next correct password (Staff Login, or a save from a device on the old app), which replaces it with the PBKDF2 hash of the same password, transparently. Nobody has to do anything; a tournament nobody logs into again keeps the old hash.
- **Attempt limit:** wrong staff passwords count per tournament (Staff Login, the staff live connection, staff saves and deletes). From the 5th wrong one in a row, password attempts are refused for 30 s, doubling with each further wrong one up to 15 min (HTTP 429, `Retry-After`, the app shows "Too many incorrect Staff passwords. Try again in …"). During the wait even the right password is refused; devices already logged in keep saving (their session token is not a password attempt); spectators are unaffected. A correct password resets the count. To unlock a tournament early: wait, or (operator) delete the `staffAuthFailures` key of that Durable Object.
- **Reload and tournament scope (#71):** the token stays in `ksm.staff.session.v3_16`; its tournament ID is stored alongside it in `ksm.staff.tournament.v1` in the same tab. Reload restores staff only for that ID (including a direct Library reload). Unscoped tokens from older versions are dropped and require one fresh login. Entering the Library through Switch tournament, opening another tournament, logout and deletion clear the token. TV and explicit spectator links remain read only. On boot, a PUT with impossible revision -1 validates the restored session: authorization runs first, then a valid session receives 409 without changing the record; 401 uses the existing expiry fallback and retains queued work. Server expiry, revocation and token format are unchanged.

- To view as a spectator while signed in as staff, open spectator links in a new tab or private window.

- **Session tokens:** a correct Staff Login (or creating the tournament) returns a random session token; the device keeps it in `sessionStorage` (the tab only) and sends it instead of the password with every save (`x-ksm-session-key`) and as the live connection's `key`. The Durable Object stores only the token's SHA-256 (`staffSessions`), valid until 24 h after its last use, at most 50 per tournament. Setting the password revokes every token. An expired or revoked token gets HTTP 401 and the device turns into a spectator ("Staff session expired · use Staff Login again"); its unsaved work stays queued until Staff Login.
- The token is in the live connection's URL (as the password was before), so it can appear in request logs; it expires and is not the password.
- **Delete is final (issue #26 step 1):** a staff-authorized `DELETE /api/tournaments/<id>` removes the record, the staff password hash and sessions and the library entry, closes every open socket with reason `Tournament deleted`, and leaves a **tombstone** (`deletedAt`, an ISO time) as the only thing in that Durable Object. From then on every route of that tournament (snapshot GET and PUT, `/status`, `/auth`, the staff and spectator `/live` before the upgrade, bootstrap) answers **HTTP 410** `{"error":"Tournament deleted","code":"tournament-deleted","deletedAt":"..."}`, before any authorization, so a stale device's save can neither recreate it nor learn anything; `/status` adds `exists:false, deleted:true`. The library never lists it and `discover` does not re-add it. Deleting twice is also 410 (the first `deletedAt` is kept; the Worker still clears a leftover library entry). A spectator, a wrong key or no key gets 403 as before and deletes nothing. The tombstone is tiny and is not removed by anything but the test-data reset's `reset-all` (which only reaches tournaments still in the library, so it leaves tombstones in place). Tests: `tests/tournament-delete-test.mjs`.

### Rollout of 4.0.0 and removing the password fallback

Devices still running the previous app (an open tab, or the service worker's cached copy until it updates) send the password itself as their key. **For one release the Worker still accepts the password there** (`staffAccess()` in `src-worker.js`: a key that is not a session token is checked as a password, counted by the attempt limit). So deploying 4.0.0 during or right before an event does not log anyone out, and old devices also upgrade their tournament's hash.

**Remove the fallback in a later rollout, after Auth0 adoption** (not phase 1 of #67), once every event device has reloaded the new app (any reload after the 4.0.0 deploy is enough; a device that logs in and gets a token is on the new app): in `staffAccess()` return 401 for any key that is not a session token, drop the in-memory `verifiedPassword`, and change `KsmApp.put_record(legacy_password=True)` and the compatibility checks in `staff-auth-hardening-test.mjs` / `staff-login-hardening-test.py` to expect 401. Keep the SHA-256 → PBKDF2 upgrade in Staff Login: it is what moves old tournaments over.

## Production: a release merged into `main`

Production changes only at a release (see [Versions and releases](#versions-and-releases)). A push to `main` deploys production **only when `package.json` has a version production does not already report**; any other push to `main` (a docs fix, a merge without a release) deploys nothing (the run's "New version for production?" job says so). There is no approval pause (see below), so **merging a release into `main` is the decision to deploy it**:

1. Prepare the release on `develop`: `npm run release -- <version>`, edit the CHANGELOG draft, commit, merge `develop` into `main`, tag `v<version>` on `main` and push the tag.
2. Before a risky release (data-format change, Durable Object change, the first deploy after a long break) take a backup: `npm run backup -- <production URL>` (see [Backups](#backups)).
3. The push to `main` starts **Deploy**: **New version for production?** → **Tests** → **Deploy production** → the health check. Nothing is deployed if the tests fail.
4. **By hand** (a re-deploy, e.g. after a rollback, or if the automatic run failed for a passing reason): GitHub → **Actions** → **Deploy** → **Run workflow** → Branch: **`main`** → **Run workflow**. Any other branch is refused ("Deploy production only runs from main"). Its "Version already live?" step warns if production already runs this version (installed devices would keep their old offline copy; a re-deploy of the same version is otherwise fine).
5. When it is green, do the checks below.

### Overlapping runs

Two pushes in quick succession start two runs. Each deploy job has a concurrency group (`deploy-dev`, `deploy-production`), which only makes the deploys take turns: the older run's tests can finish later, so on its own it would deploy the older commit over the newer one. So right before the deploy, the step **Still the newest commit on develop/main?** compares the run's commit (`GITHUB_SHA`) with the branch's current head (`git ls-remote origin refs/heads/<branch>`); if the branch has moved on, the run skips the deploy, the health check and the custom-domain pass-through with a notice ("… has moved on …: skipping this deploy, the newer run deploys") and stays green. If the head cannot be read the step fails (nothing is deployed). A production run by hand deploys `main` as it is when the run starts; if `main` moves on before the deploy step, it skips too (the newer push deploys if it carries a new version, or run it again).

`cancel-in-progress` stays `false` for both groups: GitHub cancels the group's *running* job with it, i.e. a deploy midway (half-uploaded Worker, no health check). Pending runs need no setting: GitHub keeps one pending job per group and a newer one replaces (cancels) it. So waiting deploys of older commits are dropped by GitHub, and one that is already past the queue is caught by the freshness check.

### After a production deploy

1. Open `<production URL>/api/health`: `ok: true` and the new version (the workflow already checked this).
2. Open the app: the version badge shows the new version; open an existing tournament.
3. Create a small test tournament, confirm `Live sync` appears after the first cloud save, then delete it.
4. Open a spectator link (`/t/<id>`) in a private window and check that it updates live.
5. Open Court A and Court B scorekeeper links (`/t/<id>/court/a`, `/t/<id>/court/b`) on two devices, plus a TV link (`/t/<id>/tv/a`) and an overlay link (`/t/<id>/overlay/a`); check Cloud Diagnostics for connected devices and revisions.
6. Staff Login on a second device works (one prompt), and an existing tournament from before 4.0.0 still accepts its staff password.
7. **Reload every device that was already open** (court tablets, director laptops, TV screens, every tab), before anyone adds a second team division or keeps scoring. A page loaded before the update is an older app: the server refuses its saves (HTTP 426, "This device runs an older version of Kendo Shiai Manager. Reload the page…"), so it shows "Not saved" until it is reloaded. Its unsaved work stays queued on the device and is sent after the reload. Read-only screens (TV, spectators) keep updating but show old layouts until reloaded.

### Version gate (saved format)

Every save sends `x-ksm-client-schema` (`KSM_CLIENT_SCHEMA`, app/js/01-team-divisions.js), and the Worker refuses tournament creates and saves below `MIN_CLIENT_SCHEMA` (src-worker.js) with 426. Both are 2 since team divisions (#85): an older app does not understand several team divisions and could rewrite them (for example, its Regenerate rebuilds one "Team Tournament" bracket over the other team divisions' draws). When a change makes older apps unsafe again, raise both numbers in the same release. Reading, live updates, Staff Login and deleting are not gated.

### No approval pause, and the event freeze

GitHub's approval gate (an environment with required reviewers) is not available here: the repository belongs to a personal account, whose owner can give collaborators Write but not Admin, and required reviewers on a private repository need GitHub Enterprise (Free, Pro and Team: public repositories only). Branch protection for private repositories is not on the free plan either. So nothing technical stops a push to `main`; the protections are the version rule above, the full test suite before every deploy, the health check after it, and [Rollback](#rollback). Agreed practice: changes reach `main` only through a reviewed pull request from `develop`, and **no merges into `main` from the event freeze until after the event** (for 11/21: from ~11/7). Revisit if the repository moves to an organization or becomes public.

## Rollback

A Worker rollback switches production back to an earlier uploaded version of the code and its assets immediately; it does **not** touch the Durable Objects (tournament data stays as it is, so a rollback never loses scoring, and never undoes a bad save either).

- Dashboard: Workers & Pages → `kendoshiaimanager-cloud-staging` → Deployments → ⋯ on the version → Rollback.
- CLI (needs `npx wrangler login` with access to the account): `npx wrangler deployments list --env=""` to find the version, then `npx wrangler rollback <version-id> --env="" --message "why"` (dev: `--env dev`).
- Limits (Cloudflare docs): only the last 100 versions, and a rollback is refused across a Durable Object class change (a migration). Plan any migration (e.g. the rename below) so that it does not need a rollback.
- Afterwards, fix forward: revert the change on `develop`, release a new version (a higher version, so devices refresh their offline copy), run **Deploy production**.

## Emergency manual deploy

Only when GitHub Actions is unavailable and production must change now. From a clean checkout of `main` (or the tag to restore):

```bash
npm ci
npm test                         # do not skip
npx wrangler login               # an account with access to the Worker
npm run deploy:production -- --dry-run
npm run deploy:production        # vite build, then wrangler deploy --env=""
node scripts/health-check.mjs <production URL>
```

`npm run deploy:production` and `npm run deploy:dev` always build first and always name their target; there is no bare `npm run deploy`. Never run `wrangler deploy` without `--env` (wrangler would pick the top level, production) and never without building (it would publish whatever is in `dist/`). Tell the team, and push the same commit to `main` afterwards so the next workflow run does not undo it.

## Backups

`npm run backup -- <base URL> [--out <dir>]` (`scripts/backup-tournaments.mjs`) is a read-only export: it sends only GET requests (`/api/health`, `/api/tournaments`, then `/api/tournaments/<id>` for each tournament in the library) and writes `backups/<host>-<UTC time>/` (git-ignored) with `library.json`, one `<id>.json` per tournament (the record exactly as the server returns it: revision, timestamps, the whole tournament payload) and `manifest.json` (URL, time, server version, revision and file per tournament). It exits with an error if any tournament could not be read.

- Run it before every risky production step: a release that changes data handling, any Durable Object configuration change, the rename. Keep the folder somewhere safe (not in git; it contains participant names).
- The records do not include staff password hashes (the server never hands them out). There is no restore command yet: restoring one means creating the tournament again from its `payload` with a new staff password (an admin import is a roadmap item), so treat the backup as the record of last resort and practise a restore before relying on it.
- It finds the tournaments listed in the library (every save updates it).
- Cloudflare's own point-in-time recovery for SQLite Durable Objects and automatic backups are proposals in docs/ROADMAP.md ("Backups and replacing Save/Load").

## Versions and releases

`package.json` `"version"` is the only place the version is written. Everything else gets it at build time:

- `app/index.html` (page title / About text, version badge), `app/js/19-cloud-diagnostics.js` (`appVersion` in the diagnostics downloads) and `app/service-worker.js` (`CACHE_NAME`) contain the placeholder `__KSM_VERSION__`; Vite fills it in from `package.json` in the build and in `npm run dev:vite` (`withVersion()` in `scripts/app-sources.mjs`). A new version renames the service worker cache, which makes installed devices drop the old offline copy.
- `src-worker.js` imports `package.json`; wrangler bundles it in, so `/api/health` reports the deployed version.
- `scripts/verify-split.mjs` lists exactly these placeholders (`VERSION_PLACEHOLDERS`) as a deliberate exception to its byte-for-byte check against the old single file.
- `tests/version-consistency-test.mjs` checks the built `dist/` and `/api/health` against `package.json`, that no source hard-codes a version, and that `CHANGELOG.md` starts with this version.

A release:

```bash
npm run release -- 4.0.0
```

runs `npm version 4.0.0 --no-git-tag-version` (`package.json` and `package-lock.json`), puts a draft `## v4.0.0` section at the top of `CHANGELOG.md` listing the commit subjects since the last `v*` tag (before the first tag: since the last version change), and runs `npm test`. It commits, tags and deploys nothing. Then: give the section a title and user-facing wording, commit, merge to `main`, `git tag v4.0.0 && git push origin v4.0.0`, run **Deploy production**. Bump the version only for a production release (every production deploy needs a new one); `develop` may carry a pre-release such as `4.1.0-dev` so the dev site's `/api/health` shows it is not production. `engineVersion` (`3.12.9`) is separate and frozen: it marks the saved data format.

## Renaming production

Production runs on a Worker still named `kendoshiaimanager-cloud-staging`. Renaming it means a new Worker (new name, new `workers.dev` URL) that must take over the existing Durable Object namespace, or every tournament stays behind with the old Worker. This is a supervised step, done with the owner, not by the workflow. It may be best combined with the hosting decision (a custom domain would make the Worker's name invisible to users), which waits for the planning meeting.

### What was verified (Cloudflare docs, 2026-10-06)

- **Transfer between Workers exists and keeps the data.** Durable Object namespaces can be moved from one Worker to another in the same account; "requests to the destination Durable Object class will have access to the source Durable Object's stored data." SQLite-backed classes are supported (the target declares `"storage": "sqlite"`).
- **Two configuration styles.** The legacy `migrations` array (what `wrangler.jsonc` uses today) has a transfer migration: `{ "tag": "v2", "transferred_classes": [{ "from": "TournamentState", "from_script": "kendoshiaimanager-cloud-staging", "to": "TournamentState" }] }` in the new Worker, which "will create the destination class for you" (do not also list it in `new_sqlite_classes`). Cloudflare's current docs describe a newer `exports` map that "replaces the imperative migrations array"; both are supported, but a Worker can use only one, and once deployed with `exports` it cannot return to `migrations`. Moving an existing Worker from `migrations` to `exports` needs no data migration ("the provisioned namespaces remain in place"). The installed wrangler (4.110) supports `exports`.
- **The `exports` transfer is a four-deploy handshake:** (1) the source Worker declares `TournamentState` as a live export; (2) the target is deployed with `"state": "expecting-transfer"`, `"transfer_from": "kendoshiaimanager-cloud-staging"` and **no** binding yet; (3) the source is deployed with `"state": "transferred"`, `"transferred_to": "<new name>"`, leaving the class in its code ("the actual handoff commits when the source Worker's deploy lands"); (4) the target is redeployed with its `TOURNAMENTS` binding. Until step 3 it can be cancelled by redeploying the target without the entry.
- **The old Worker can keep serving.** After the transfer the source may bind to the moved namespace with `script_name` pointing at the new Worker, so the old URL (links already copied onto court devices and TVs) can keep working on the same data.
- **Not stated in the docs**, so to be settled by the rehearsal: whether the source Worker can later be deleted without affecting the moved namespace, and exactly how the legacy `transferred_classes` migration behaves when the source still declares the class. A Worker rollback is refused across a Durable Object class change, so the rename cannot be undone by `wrangler rollback`; the backup is the safety net.

### Plan

1. **Backup**: `npm run backup -- <production URL>`; check `manifest.json` (every tournament, no failures). Keep it until the new Worker is verified.
2. **Rehearse on a throwaway copy** in the same account, never on production: deploy the current code as `ksm-rename-rehearsal-src` (its own config with migration `v1`), create a few tournaments there (including one with scored matches and a court device connected), back it up, then transfer its namespace to `ksm-rename-rehearsal-dst` with the chosen style (`exports` handshake preferred: it is the documented current flow). Verify: a backup of the destination equals the source backup (same IDs, revisions and payloads), live sync and staff login work on the destination, the source with a `script_name` binding still serves the same data, and what happens on deleting the source. Write down the exact commands and the config of each deploy, then delete the rehearsal Workers.
3. **Run it with the owner, before the ~11/7 freeze**, at a quiet time (no tournament running or being prepared): backup → the rehearsed deploys → backup of the new Worker and compare → the after-deploy checks on the new URL → `wrangler.jsonc` top-level `name` changed to the new name in the same pull request, and `PRODUCTION_URL` in `deploy.yml` and this document updated.
4. **Keep the old Worker** (serving the moved data via `script_name`, or redirecting to the new URL) until the new one has been verified through at least one real use; delete it only after that, and only if the rehearsal showed that deleting it does not affect the namespace.

## Custom domains

The sites are meant to live at **tournament.hawaiikendofederation.org** (production) and **dev.tournament.hawaiikendofederation.org** (dev). The domain's DNS is at GoDaddy, which rules out the direct ways: a Worker gets a custom domain only on a Cloudflare zone, and handing just the `tournament.` subdomain to Cloudflare (subdomain delegation) is Enterprise-only. Cloudflare **Pages** projects, however, accept a subdomain through a plain CNAME at another DNS provider. So each site has a small Pages project that owns the address and passes every request, WebSocket upgrades included, to that site's Worker through a service binding (`pages-proxy/`):

| | **Dev** | **Production** |
|---|---|---|
| Pages project | `ksm-tournament-dev` (`pages-proxy/dev.jsonc`) | `ksm-tournament` (`pages-proxy/production.jsonc`) |
| Forwards to | `kendoshiaimanager-dev` | `kendoshiaimanager-cloud-staging` |
| Address | `dev.tournament.hawaiikendofederation.org` | `tournament.hawaiikendofederation.org` |

- `pages-proxy/_worker.js` is the whole pass-through: `env.KSM.fetch(request)`. The Worker sees the request unchanged; nothing in it depends on the host name.
- Deployed by the deploy workflow right after each Worker passes its health check (`npm run proxy:dev` / `npm run proxy:production`, `scripts/pages-proxy.mjs`), which creates the Pages project the first time. The script runs wrangler from a temporary folder: inside the repository, `wrangler pages` reads the Worker's own config instead (Durable Object binding, no service binding).
- The API token needs **Cloudflare Pages: Edit** besides the Workers permissions.
- Workers.dev addresses keep working; the custom domains are an extra way in, and removing them changes nothing for the Workers.

**Connecting a domain (once per site, after its Pages project exists):** Cloudflare dashboard → Workers & Pages → the Pages project → Custom domains → Set up a custom domain → enter the address. Cloudflare shows the CNAME to add (`tournament` → `ksm-tournament.pages.dev`, `dev.tournament` → `ksm-tournament-dev.pages.dev`; the exact `.pages.dev` names are on the projects' pages). The HKF domain contact adds those records at GoDaddy (DNS → Add New Record → CNAME); Cloudflare then verifies the address and issues its certificate, usually within minutes to a few hours. Add the domain in the dashboard **before** the CNAME exists, or Cloudflare can refuse the address.

**Local check:** `npm run build`, `npx wrangler dev --env dev --port 8787`, then in another terminal `node scripts/pages-proxy.mjs dev --local --port 8788` and use http://127.0.0.1:8788. Measured 2026-10-06 against the local dev Worker: health, index.html, SPA paths, tournament create/list/delete, staff and spectator WebSockets (a wrong staff key refused), 20 saves broadcast in order without duplicates, a stale save's 409 all identical through the pass-through; +0.9 ms per request locally (two processes; in Cloudflare a service binding usually runs on the same machine). Still to measure on the dev site: real latency, an hour-long live connection, request counts.

## Notes

- The two sites' `workers.dev` addresses are GitHub **repository variables** `DEV_URL` and `PRODUCTION_URL` (Settings → Secrets and variables → Actions → Variables), used by the deploy workflow's health checks; they are not written in the repository.

- Worker secrets (e.g. `KSM_RESET_KEY`, which enables the destructive `/api/admin/reset`, see RESET-CLOUD-DATA.md) belong to one Worker and are not in `wrangler.jsonc`; deploys keep them. Dev has none unless someone sets them with `npx wrangler secret put <NAME> --env dev`. Check that production does not hold a reset key it no longer needs: `npx wrangler secret list --env=""`.
- Dry runs (no upload, no login needed): `npm run deploy:production -- --dry-run`, `npm run deploy:dev -- --dry-run`.
- `tests/deploy-config-test.mjs` guards the rules above (separate dev Worker and binding, production unchanged, no deploy from pull requests, production only from `main`, a deploy only of the branch's current head, no running deploy cancelled, each pass-through bound to its own site's Worker).

## Auth0 sign-in (not enabled in production)

Account sign-in is opt-in. This change does not create or modify an Auth0 tenant or production settings. With **no `AUTH0_*` settings**, the shared staff password, session tokens, public spectators
and TV work as in 4.0. Keep the password fallback described above; removing it is a later release.
A partial Auth0 configuration fails sign-in configuration checks; configure all three values together.

For dev testing, use an approved dev Auth0 tenant with a **Single Page Application** and a custom API
with an audience such as `https://ksm.example/api` and **RS256** signing. Enable Universal Login and
the desired connections. Use Authorization Code with PKCE; the SPA has no client secret. Add:

| Auth0 setting | Dev Pages site | Local Worker |
| --- | --- | --- |
| Allowed Callback URLs | `https://ksm-tournament-dev.pages.dev/` | `http://localhost:8787/` |
| Allowed Logout URLs | `https://ksm-tournament-dev.pages.dev/` | `http://localhost:8787/` |
| Allowed Web Origins | `https://ksm-tournament-dev.pages.dev` | `http://localhost:8787` |

Also register the actual `DEV_URL` Worker's origin (callback/logout with `/`), or the dev custom
hostname when it is adopted. Register each origin explicitly; no wildcards. If testing at
`http://127.0.0.1:8787`, register that origin separately. Public spectator and TV links need no account.

Set these **only in the intended dev environment**, using Wrangler vars or secrets (a local
`.dev.vars` file is ignored by Git):

```dotenv
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://ksm.example/api
AUTH0_CLIENT_ID=your-spa-client-id
ADMIN_EMAILS=kenton@example.com,braxton@example.com
```

Replace the example admin addresses with the owners' verified email addresses. `AUTH0_CLIENT_ID`,
domain and audience are public SPA configuration, served at `/api/auth/config`; `ADMIN_EMAILS` is
server-only. Wrangler environments do not inherit vars: configure dev independently. No Auth0
secrets or real credentials belong in the repository.

Auth0's standard custom-API access token does not automatically include email. Add and deploy a
**Login / Post Login Action** and attach it to the login flow:

```js
exports.onExecutePostLogin = async (event, api) => {
  if (event.user.email && event.user.email_verified === true) {
    api.accessToken.setCustomClaim('https://ksm.app/email', event.user.email);
    api.accessToken.setCustomClaim('https://ksm.app/email_verified', true);
  }
};
```

KSM requires both signed claims, plus a subject, expiry, the configured issuer/audience and an
RS256 signature from that issuer's cached JWKS. An ID token or unverified email cannot authorize
writes. Auth0 authenticates identities; its roles/metadata and all client role labels are ignored.
KSM stores grants centrally; Auth0 is sign-in only. No Management API, machine-to-machine client
secret, or email-sending service is used.

### Local review with dev Auth0

Use the approved dev SPA/API, with `http://localhost:8787/` registered for callback/logout and
`http://localhost:8787` for web origin. Keep any local overrides in the ignored `.dev.vars`,
including `ADMIN_EMAILS` for a verified dev admin; ensure any `AUTH0_*` overrides refer to dev,
not production. The `dev` environment has its own public SPA/API settings in `wrangler.jsonc`.
Build with `npm run build`, then run `npx wrangler dev --env dev --port 8787`. This runs local
Durable Object storage, not the deployed dev/production tournament store. Do not use `--remote`.

At localhost, sign in as the dev admin, open People & access, invite a creator and copy the invite
message. In a separate browser session sign in as that creator, create a tournament, confirm the
Owner strip, add a director, and check that the director can edit while access is read-only. Check
phone width, private/public visibility, sole-owner removal confirmation, and role revocation. The
mock-issuer alternatives are `tests/auth0-browser-test.py` and `tests/user-access-browser-test.py`;
they use temporary local storage and require no Auth0 tenant changes. Tenant/production changes
and deployment are separate owner-approved work, not part of these checks.

### Roles and People & access

| Role | Scope | Access |
| --- | --- | --- |
| Admin | Global | Manage all tournaments, delete tournaments, and manage People & access. |
| Creator | Global | Create tournaments or load files as new tournaments; become owner of each new tournament. No implicit access to other private tournaments. |
| Owner | Per tournament | Read/edit the tournament, change visibility, and manage owners/directors. Cannot delete the tournament. |
| Director | Per tournament | Read/edit the tournament and change visibility. See owners/directors read-only; cannot manage access or delete. |

`ADMIN_EMAILS` remains the server-side **break-glass list**, combined with stored admin grants.
A matching verified sign-in is always an admin. These entries appear as **from server settings**
and are read-only in People & access; role removal and Remove from everything return 409.
Keep a known working break-glass admin for recovery. A non-server admin cannot remove their own
admin access when they are the last stored admin.

Admins open **People & access** from the Account menu or Library. They can grant/remove global
Admin or Creator roles, inspect providers and named tournament access, and use **Remove from
everything**. That action removes grants and pending invites for the current email but retains the
user and sign-in identities. If the person is the only owner of any tournament, the confirmation
names those events and explains that admins can still manage them. Removal is permitted; an admin
can assign a replacement owner afterwards. In tournament Sharing & access, an owner cannot remove
the last signed-in owner, even with another owner invite pending; admins can override this rule.

### Invites and identity linking

Add the person's verified sign-in email and choose a role. If the user is not known yet, KSM stores
a pending invite. **KSM sends no email.** Use **Copy invite message** and send it yourself:
“You've been given access to KSM. Sign in at <origin>/ with <email>.” Existing users receive grants
immediately. Pending invites become grants on a matching verified sign-in; unverified email never
links or consumes invites. The Auth0 connection must allow the intended user to sign in/sign up.

Users have stable KSM UUIDs; `user_identities` maps Auth0 subjects/providers to those users. A new
provider subject with the same verified canonical email links to the existing KSM user, so password
and Google sign-ins share access. A known subject retains access through email changes. If a known
subject changes to another established user's email, the users are not merged: the subject retains
its user, canonical email and grants, and cannot consume the other user's invites.

### Storage, migration and rollback

`access-store.mjs` owns the schema in the SQLite-backed `TournamentState` instance named
`__ksm_access__`, alongside the existing `__ksm_library__` registry pattern. No new Durable Object
class or Wrangler migration is needed. Access is separate from tournament snapshots/files.
Schema version 2 atomically converts step 1's subject-keyed users to KSM UUIDs, maps identities and
preserves grants and matching attribution. The central tables hold users, identities, global roles,
tournament access, invites and migration/deletion markers. Profile writes are skipped unless the
email/name changes, an invite exists, or last sign-in is at least an hour old.

On the first tournament check, its old `directors` emails become director grants for known users
or pending invites. A per-tournament `meta` marker makes this **one-time and idempotent**. The old
`directors` key is kept unchanged for rollback; it is no longer authoritative and new access edits
are not mirrored into it. Losing a local migration flag does not restore a revoked legacy grant.
Older Library cards receive a one-time visibility/director backfill. Indexed listings use one
central role lookup per request, without per-tournament calls. Visibility versions prevent an older
backfill from restoring a newer private setting. Creation grants ownership before exposing a record;
failed ownership grants compensate the record, access, Library entry and slug independently.
Deletion clears access/invites and records a central marker to reject delayed grants.

A Worker code rollback does **not** revert Durable Object data or this SQL schema; Cloudflare also
warns that older code can be incompatible with changed data. See [Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
and the general [Rollback](#rollback) procedure. For an approved rollback of user management:

1. Preserve the current access inventory (admin `GET /api/people` and tournament access lists) and
   the access object's storage. Tournament file backups exclude access data. Keep a working
   `ADMIN_EMAILS` sign-in; do not delete the access singleton, its schema, or migration markers.
2. Prefer fixing forward. If returning to the Auth0-enabled #128 implementation is necessary, use
   a controlled maintenance window and reconcile each legacy `directors` list to the approved current
   owner/director emails **before reopening access**. Old keys can omit new owners/directors and
   retain users revoked since migration. Stored global admins/creators are ignored by #128; only its
   `ADMIN_EMAILS` admins manage global operations. Do not downgrade to step 1's subject-keyed store.
3. Keep the Auth0 configuration and visibility data in place. Turning off Auth0 or reverting to a
   pre-Auth0 Worker restores public/password behavior and is **not** a safe private-event rollback.
   Schema version 2 data stays intact for a later corrected build; do not attempt an automatic SQL
   downgrade or assume restoring code restores old access decisions.
4. Before reopening, verify break-glass admin management, current director access, denial for
   revoked users, private anonymous denial, and public spectator/TV viewing. Recheck owner/admin
   assignments and pending invites when returning to the current implementation.

### Sign-in and live permissions

Choose **Sign in** in Account or Library. Role strips use the reserved palette plus text; TV has no
header/strip and explicit spectator links stay read-only. Creators see New tournament and Load
Tournament File; new creation/import uses the signed-in account and no shared staff password.
With Auth0 enabled, passwords and old staff sessions cannot authorize access, even without grants.
With Auth0 unconfigured, the existing password/session behavior remains unchanged.

The server rechecks current access on every write, live handshake, live scoring message and private
broadcast. Private broadcasts batch all socket identities into one access lookup. Tournament
revocation and global admin revocation close only the affected user's live connections; other users
stay connected. Additions leave existing connections open. Socket checks do not update profiles
from an older token's email. Invalid People tokens return 401 (“Sign in again.”); verified non-admins
get 403. An expired/invalid Library token still lists public tournaments with `x-ksm-auth: invalid`,
so the UI can prompt **Sign in again** without hiding public events.

JWTs are kept in a tab-scoped SDK sessionStorage cache and renewed by the SDK; reload retains
unexpired tokens. The Worker revalidates identity and roles on reload; SDK logout clears its cache.
New tabs or an expired token may need the Auth0 session to restore sign-in silently. If browser
cookie restrictions prevent that, sign in again. Unsaved staff work stays in the outbox after
expiration. Staff live handshakes carry the access token in the WebSocket query (browsers cannot
add an Authorization header); do not log query strings at the proxy/edge. Snapshots and ordinary
API writes use a Bearer header. The local test issuer accepts HTTP only on loopback; real issuers
require HTTPS.

References: [SPA SDK / PKCE](https://auth0.com/docs/libraries/auth0-single-page-app-sdk),
[namespaced claims](https://auth0.com/docs/secure/tokens/json-web-tokens/create-custom-claims).

**Owner questions before enabling:** Auth0 currently advertises **25,000 monthly active users** on
[Free](https://auth0.com/pricing). Its support policy says inactive free tenants are permanently
deleted after **150 days**; the same article also mentions three months, so confirm the warning and
activity rules in the chosen tenant before relying on seasonal use. Who will maintain tenant
activity and own recovery/billing alerts? Confirm the chosen connection, MFA/2FA and recovery
features on Free (not every MFA option is included) and the allowance for separate dev/production
tenants. No signup or paid-plan selection is part of this phase. See
[tenant inactivity policy](https://support.auth0.com/center/s/article/tenant-unban-request).

### Public and private tournaments

With Auth0 enabled, new tournaments start **Private**. Existing tournaments without a visibility
setting remain **Public**. Admins, owners and directors can change **Public listing → Show this
tournament publicly** under Setup → Sharing & access. This setting is stored separately from the
snapshot, so an old file or concurrent save cannot publish a private tournament accidentally.

The signed-out Library lists public tournaments and offers Sign in beside the branding; New and
Load Tournament File appear for admins and creators. Signed-in users see tournaments they manage first,
including their private tournaments. Private tournaments require an admin, owner or director
account for snapshots, status, discovery and live connections. A shared password cannot open a
private tournament. A valid private link shows **Tournament not viewable** with sign-in / switch
account and Library actions; an unknown tournament still returns not found. Sign-in returns to the
original link. Making an event private closes existing viewers' live connections, and private
broadcasts recheck membership and token expiry. Publishing makes spectator and TV links available
without login. Public/private is separate from whether matches have started.

Configured clients load current tournament data from the authorized API. Explicitly public
snapshots support offline viewing; private snapshots and Library lists are not restored from cache. This does not erase staff recovery/outbox files already on a device;
privacy controls server access, not copies someone previously downloaded. With Auth0 unconfigured,
visibility settings are ignored and 4.0 behavior remains unchanged.

### Auth0 renewal, offline viewing, and stream overlays

Owner decision for rollout: enable **Allow Offline Access** for the Auth0 API and **Refresh Token Rotation** for the SPA, and choose refresh-token absolute and inactivity expiry periods suited to tournament-day sessions.
KSM requests `offline_access` and uses refresh tokens, with the SDK iframe fallback when a refresh
token is unavailable. The tab-scoped session cache stores refresh tokens alongside access tokens;
sign-out clears it. A new tab may still require sign-in.

Transient network/server errors during permission refresh retain the last authorized editing
session so work can queue locally. Explicit denial or an SDK login-required response removes
editing access. The server rechecks authorization before accepting queued changes. Startup
requests and SDK authorization have bounded timeouts (five seconds for config and ten for silent token renewal); after three seconds startup reveals a safe restricted
UI with a connection message while restoration finishes.

Only explicitly public snapshots are cached for offline viewing in Auth0 mode. These are last-known
public copies: an offline device cannot learn that a tournament was subsequently made private.
Private snapshots are not cached, and an online private-access denial removes the cached copy.
The service worker continues to bypass API caches.

The OBS overlay and TV links only work while the tournament is public. Private overlays deliberately have no
shared-token bypass in this phase; Setup explains that limitation.

### Owner decisions before the next rollout

These defaults remain easy to revise after the owners' meeting:

- How invitation emails should be sent in the future; today KSM only records invites and offers
  Copy invite message for the admin to send manually.
- Whether owners may delete tournaments; today only admins can delete.
- Which user fields to retain (verified canonical email, display name, provider/identity linkage,
  created time, and last sign-in), and the retention/removal policy. Remove from everything keeps
  sign-in history; it is not account deletion.
- What minors' data may be used for follows (#44) and participant links (#132), who can consent,
  what users/guardians can see or change, and retention/unlinking rules. Those features and their
  tables are not implemented here; settle these decisions before building them.
