# Kendo Shiai Manager

Kendo Shiai Manager (KSM) is a hosted web/PWA application for running individual and team kendo tournaments.

## Current release

**v3.12.9 — Template Consistency and Seed Resolution**

This release fixes three pool-play edge cases while preserving the template-first engine architecture: first-place tiebreaks populate both advancing seeds, no-show removal preserves the original pool/match order, and the native six-competitor championship mapping remains available after a no-show reduces one pool to two competitors.

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

## v3.12.9 engine invariant

All standard elimination and championship matches originate from the Tournament Template Library. Only the explicit tiebreak allowlist may create Match Objects after generation.


## KSM TestLab

Run deterministic engine simulations with `npm run testlab:smoke`, `npm run testlab`, or `npm run testlab:exhaustive`. Reports are written to `testlab-reports/`. See `docs/TESTLAB.md`.
