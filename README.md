# Kendo Shiai Manager v3.10.0

Hosted Mobile Foundation for Cloudflare Workers Static Assets.

## Deploy through the connected Cloudflare Git integration

1. Upload the **contents of this folder** to the root of the private GitHub repository `Kendo-Shiai-Manager`.
2. Commit to the `main` branch.
3. Cloudflare will run the configured deploy command: `npx wrangler deploy`.
4. Open the successful deployment URL ending in `.workers.dev`.

Cloudflare project name and `wrangler.jsonc` name must both be `kendoshiaimanager`.

## Local verification

```bash
npm install
npm run check
npm run dev
```

## Scope

This release hosts the existing v3.9.10 tournament runtime over HTTPS and adds the mobile/PWA shell. It does not yet move Match Object authority to the cloud or synchronize devices.
