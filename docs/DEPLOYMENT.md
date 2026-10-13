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
