# Kendo Shiai Manager

Kendo Shiai Manager (KSM) is a hosted, installable tournament-management application for kendo events.

**Current release: v3.16.1 — Home Tournament Library**  
**Frozen Tournament Management Engine: v3.12.9**

## Cloud capabilities

- Permanent Tournament IDs backed by Cloudflare Durable Objects
- Authoritative cloud snapshots with revision conflict protection
- Real-time WebSocket synchronization
- Spectator, Scorekeeper, Director, and Admin sessions
- Court-specific scorekeeper links for Courts A and B
- Public read-only spectator links
- Shared read-only Tournament Overview for Admin, Scorekeeper, and Spectator sessions
- Shared Courts presentation with spectator controls removed
- Responsive dual-court Live Scores and dedicated Court A / Court B TV display links
- Connected-device presence
- Local-first autosave and an offline cloud outbox
- Conflict-safe recovery copies rather than silent last-write-wins
- Cloud diagnostics and manual `.ksm` backup/export

The cloud layer stores the existing KSM tournament payload as an opaque snapshot. It does not generate pools, create Match Objects, reorder matches, advance brackets, or regenerate tournament templates.

## Local development

The front end lives in `app/` and is built with Vite into `dist/`, which the Worker serves (see `docs/REPOSITORY_STRUCTURE.md`).

```bash
npm install
npm run dev          # build, then wrangler dev: app + API on http://localhost:8787
npm run build        # build only (dist/)
npm run typecheck    # TypeScript: classic files marked // @ts-check, and app/react/ (strict)
```

Open the local URL printed by Wrangler. Verify the Worker at `/api/health`.

For quicker front-end edits, run `npm run dev` in one terminal and `npm run dev:vite` in another: the Vite dev server (http://localhost:5173) serves `app/` without a build step (reload to see changes) and passes `/api` to wrangler on port 8787.

## Tests

```bash
npm install
npm run test:setup   # one-time: Python Playwright + Chromium for browser tests
npm test             # builds, then the full suite (~80 s): engine snapshots, UI, types, backend API contract, end-to-end sync
```

See `docs/TESTING.md` for the individual suites, TestLab profiles, and how to run the API contract against a live server.

## Deployment

```bash
npx wrangler login
npm run deploy       # builds dist/ first, then wrangler deploy
```

See `docs/DEPLOYMENT.md` and `docs/CLOUD_OPERATIONS.md` before production use.
