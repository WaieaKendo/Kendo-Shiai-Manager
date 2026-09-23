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

## Verify after deployment

1. Open `https://YOUR_HOST/api/health` and confirm version `3.14.0`.
2. Open the application and create a small tournament.
3. Confirm `Live sync` appears after the initial cloud save.
4. Open a spectator link in a private browser and verify real-time updates.
5. Open Court A and Court B scorekeeper links on separate devices.
6. Check Cloud Diagnostics for connected devices and revision changes.

## Rollback

Keep the previous Git tag and a local `.ksm` tournament backup. Application rollback does not reinterpret or migrate the stored engine payload. Do not delete the Durable Object namespace during a code rollback.
