# Agent instructions for Kendo Shiai Manager

Read by Codex (and other agents that read `AGENTS.md`); `CLAUDE.md` points here for Claude Code.
The details and the reasons are in `docs/DEPLOYMENT.md`; this file lists the rules agents get wrong.

## Branches

- `main` is production. A push to `main` with a new `package.json` version deploys production.
- `develop` is the version being worked on; every push deploys the dev site.
- When a tournament gets close, `develop` becomes a release candidate (`X.Y.Z-rc.N`). From then on,
  `develop` takes only fixes for that release. New work goes to `next/<version>` (for example
  `next/4.1`) until the release is in `main`; then `next/<version>` is merged into `develop`.
- Pick the PR base by that rule. A fix for the candidate goes to `develop`, and a new feature goes to `next/<version>`.

## Version: never edit it by hand

The version is written only in `package.json` (and `package-lock.json`). Change it only with
`npm run release`, which also drafts the `CHANGELOG.md` section the tests require.

| Situation | Command | Result |
|---|---|---|
| A PR into `develop` while it is an rc (`X.Y.Z-rc.N`) | `npm run release -- rc` | `X.Y.Z-rc.(N+1)` |
| The candidate is approved for production | `npm run release -- final` (a PR into `develop`) | `X.Y.Z` |
| Starting an rc phase | `npm run release -- X.Y.Z-rc.1` | `X.Y.Z-rc.1` |

- **Every PR into `develop` during the rc phase bumps the rc number, one per PR.** Do this as the last
  commit on the branch. If `develop` moved on (another PR took that number), merge `develop` in,
  take `develop`'s `package.json`, `package-lock.json` and `CHANGELOG.md` top section, and run
  `npm run release -- rc` again.
- **`main` never gets an rc.** The release is: `npm run release -- final` in a PR into `develop`
  (rewrite the drafted CHANGELOG section into one user-facing summary of the rc sections), then a PR
  `develop` → `main`. After the merge the owner tags `v<version>` on `main`.
- After `npm run release`, replace `TITLE` in the drafted CHANGELOG heading and turn the commit
  subjects into user-facing wording.
- PRs into `next/<version>` and other branches do not change the version.

CI enforces this: the `version rules` job in `.github/workflows/test.yml`
(`scripts/version-rules.mjs`) fails a PR into `main` that has a pre-release version or is not
newer than `main`, and a PR into `develop` in its rc phase that does not move rc.N to rc.N+1 (or to
the final version). It is part of the required `test` check.
