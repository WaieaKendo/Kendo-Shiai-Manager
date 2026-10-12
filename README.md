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

## Stream overlay (OBS / PRISM)

`/t/<id>/overlay/a` (or `/b`; the old `/overlay?tournament=<id>&court=A` still works) is a read-only, transparent lower third for a livestream: the court's current match exactly as its TV display shows it (names and dojos, or teams and the current position for team matches; division · pool/round; points and hansoku; the next match), updated live over the spectator WebSocket. It needs no login and never writes. Staff copy the link from the **TV** menu (**Copy Court A/B overlay link**).

The court is in the path (`/overlay/a` or `/overlay/b`); the options are query parameters, e.g. `/t/<id>/overlay/b?red=left`:

| Option | Default | |
|---|---|---|
| `red=left\|right` | `right` | Side of the bar Red is on |
| `pos=top\|bottom` | `bottom` | Bar position on a landscape page |
| `y=NN` | `74` in band mode | Band mode: the bar's top edge at NN % of the page height (setting it turns band mode on) |
| `band=1\|0` | auto | Force band mode on or off |
| `debug=1` | off | Shows page size, page/device orientation, mode and connection |

Designed for a 1920×1080 browser source; it scales with the page width. In **OBS** add a Browser Source of that size. In **PRISM Live Studio** the page must come from a real https domain (an IP address or self-signed certificate is rejected). PRISM keeps web widgets portrait-shaped even when streaming landscape; either resize the widget to landscape by hand, or rely on band mode, which detects a landscape device with a portrait page and moves the bar into the visible band (adjust with `y=`).

## Local development

The front end lives in `app/` and is built with Vite into `dist/`, which the Worker serves (see `docs/REPOSITORY_STRUCTURE.md`).

```bash
npm install
npm run dev          # build, then wrangler dev: app + API on http://localhost:8787 (overlay: /t/<id>/overlay/a)
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

GitHub Actions deploys: every push to `develop` goes to the dev site, production is deployed when a release (a new version) is merged into `main`, or by hand from `main` (Actions → Deploy → Run workflow). Releases: `npm run release -- <version>` (the version lives only in `package.json`). Backups: `npm run backup -- <site URL>`.

See `docs/DEPLOYMENT.md` (dev and production, rollback, emergency deploy, backups, releases) and `docs/CLOUD_OPERATIONS.md`.
