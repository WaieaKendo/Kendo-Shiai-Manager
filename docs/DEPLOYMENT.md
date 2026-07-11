# Cloudflare deployment steps

## GitHub upload

Upload all repository-scaffold files and folders to the repository root. The root must visibly contain:

- `public/`
- `tests/`
- `wrangler.jsonc`
- `package.json`
- `README.md`
- `.gitignore`

Do not upload the enclosing `Kendo-Shiai-Manager` folder as one nested folder.

## Cloudflare build settings

- Repository: `WaieaKendo/Kendo-Shiai-Manager`
- Production branch: `main`
- Build command: none required
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

After committing, use **Deployments** in Cloudflare to watch the automatic build. A successful deployment should provide a `workers.dev` URL.
