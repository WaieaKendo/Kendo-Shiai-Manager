# Kendo Shiai Manager

Kendo Shiai Manager (KSM) is a hosted, installable tournament-management application for kendo events.

**Current release: v3.15.11 — TV Context Stabilization**  
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

```bash
npm install
npm run dev
```

Open the local URL printed by Wrangler. Verify the Worker at `/api/health`.

## Tests

```bash
npm run check:cloud
npm run check
```

For the full TestLab profiles:

```bash
npm run testlab:smoke
npm run testlab
npm run testlab:exhaustive
```

## Deployment

```bash
npx wrangler login
npm run deploy
```

See `docs/DEPLOYMENT.md` and `docs/CLOUD_OPERATIONS.md` before production use.
