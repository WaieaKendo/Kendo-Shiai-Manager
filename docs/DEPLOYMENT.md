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

## Verify after deployment

1. Open `https://YOUR_HOST/api/health` and confirm version `3.14.0`.
2. Open the application and create a small tournament.
3. Confirm `Live sync` appears after the initial cloud save.
4. Open a spectator link (`/t/<id>`) in a private browser and verify real-time updates.
5. Open Court A and Court B scorekeeper links (`/t/<id>/court/a`, `/t/<id>/court/b`) on separate devices, and a TV link (`/t/<id>/tv/a`) and an overlay link (`/t/<id>/overlay/a`).
6. Check Cloud Diagnostics for connected devices and revision changes.

## Rollback

Keep the previous Git tag and a local `.ksm` tournament backup. Application rollback does not reinterpret or migrate the stored engine payload. Do not delete the Durable Object namespace during a code rollback.
