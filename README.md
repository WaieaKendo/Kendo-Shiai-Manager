# Kendo Shiai Manager

Kendo Shiai Manager (KSM) is a hosted web/PWA application for running individual and team kendo tournaments.

## Current release

**v3.12.3 — Bracket Lifecycle and Tiebreak Resolution**

This release reorganizes repository documentation and prevents generated release artifacts from accumulating in source control. Tournament behavior is unchanged from v3.11.6.

## Repository layout

- `public/` — deployed application and static assets
- `tests/` — automated regression and package checks
- `docs/` — maintained project documentation
- `wrangler.jsonc` — Cloudflare Workers configuration
- `package.json` — project metadata and test/deploy commands
- `CHANGELOG.md` — consolidated release history

## Common commands

```bash
npm install
npm run check
npm run dev
npm run deploy
```

See `docs/DEPLOYMENT.md`, `docs/TESTING.md`, and `docs/REPOSITORY_STRUCTURE.md` for details.


See `docs/TOURNAMENT_MANAGEMENT.md` for tournament-management behavior, template authority, and tiebreak-resolution rules.
