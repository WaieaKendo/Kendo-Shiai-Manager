# Deployment

KSM runs as a Cloudflare Worker (`src-worker.js`) that serves the built app (`dist/`) as static assets and keeps each tournament in a `TournamentState` Durable Object (SQLite). There are two sites, each its own Worker with its own Durable Objects, so dev never sees or touches production data:

| | **Dev** | **Production** |
|---|---|---|
| Worker | `kendoshiaimanager-dev` | `kendoshiaimanager-cloud-staging` (the old name; see [Renaming production](#renaming-production)) |
| URL | https://kendoshiaimanager-dev.samanthakodamaworkersdev.workers.dev | https://kendoshiaimanager-cloud-staging.samanthakodamaworkersdev.workers.dev |
| Data | its own test tournaments | **the real tournaments** (11th AHKC and later) |
| `wrangler.jsonc` | `env.dev` | the top level |
| Deployed by | **Deploy dev**: every push to `develop` | **Deploy production**: a release merged into `main` (new version), or by hand from `main` |

Both go through `.github/workflows/deploy.yml`: the full test suite (`test.yml`, the same as on every push) → build → `wrangler deploy` with the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` → a health check that waits until `/api/health` reports the version in `package.json` (`scripts/health-check.mjs`, retries for about two minutes). Nothing is ever deployed from a pull request.

## Dev: every push to `develop`

Merging a pull request into `develop` (or pushing to it) starts **Deploy dev**. When it is green, the dev site runs exactly that commit. The first dev deploy creates the `kendoshiaimanager-dev` Worker and its empty Durable Object namespace (migration `v1` in `env.dev`). Use dev for trying a change on phones and TVs before it goes to production; its tournaments are throwaway.

## Production: a release merged into `main`

Production changes only at a release (see [Versions and releases](#versions-and-releases)). A push to `main` deploys production **only when `package.json` has a version production does not already report**; any other push to `main` (a docs fix, a merge without a release) deploys nothing (the run's "New version for production?" job says so). There is no approval pause (see below), so **merging a release into `main` is the decision to deploy it**:

1. Prepare the release on `develop`: `npm run release -- <version>`, edit the CHANGELOG draft, commit, merge `develop` into `main`, tag `v<version>` on `main` and push the tag.
2. Before a risky release (data-format change, Durable Object change, the first deploy after a long break) take a backup: `npm run backup -- <production URL>` (see [Backups](#backups)).
3. The push to `main` starts **Deploy**: **New version for production?** → **Tests** → **Deploy production** → the health check. Nothing is deployed if the tests fail.
4. **By hand** (a re-deploy, e.g. after a rollback, or if the automatic run failed for a passing reason): GitHub → **Actions** → **Deploy** → **Run workflow** → Branch: **`main`** → **Run workflow**. Any other branch is refused ("Deploy production only runs from main"). Its "Version already live?" step warns if production already runs this version (installed devices would keep their old offline copy; a re-deploy of the same version is otherwise fine).
5. When it is green, do the checks below.

### After a production deploy

1. Open `<production URL>/api/health`: `ok: true` and the new version (the workflow already checked this).
2. Open the app: the version badge shows the new version; open an existing tournament.
3. Create a small test tournament, confirm `Live sync` appears after the first cloud save, then delete it.
4. Open a spectator link in a private window and check that it updates live.
5. Open Court A and Court B scorekeeper links on two devices; check Cloud Diagnostics for connected devices and revisions.

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
node scripts/health-check.mjs https://kendoshiaimanager-cloud-staging.samanthakodamaworkersdev.workers.dev
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

## Notes

- Worker secrets (e.g. `KSM_RESET_KEY`, which enables the destructive `/api/admin/reset`, see RESET-CLOUD-DATA.md) belong to one Worker and are not in `wrangler.jsonc`; deploys keep them. Dev has none unless someone sets them with `npx wrangler secret put <NAME> --env dev`. Check that production does not hold a reset key it no longer needs: `npx wrangler secret list --env=""`.
- Dry runs (no upload, no login needed): `npm run deploy:production -- --dry-run`, `npm run deploy:dev -- --dry-run`.
- `tests/deploy-config-test.mjs` guards the rules above (separate dev Worker and binding, production unchanged, no deploy from pull requests, production only from `main`).
