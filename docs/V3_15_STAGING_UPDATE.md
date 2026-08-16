# KSM v3.15.0 Staging Update

1. Keep `main` and the production v3.12.9 Worker unchanged.
2. Switch GitHub Desktop to `cloud-v3.14-staging` (or rename it `cloud-v3.15-staging`).
3. Replace the visible repository files with this complete snapshot, preserving the hidden `.git` folder.
4. Commit: `Stage KSM v3.15.0 Tournament Day Experience`.
5. Push the staging branch.
6. In Terminal, run `npm install`, `npm run check:cloud`, and `npx wrangler deploy --dry-run`.
7. Deploy with `npx wrangler deploy`.
8. Test the staging Worker before merging to `main`.

The Wrangler project name remains `kendoshiaimanager-cloud-staging`, so this snapshot does not overwrite the existing production Worker.
