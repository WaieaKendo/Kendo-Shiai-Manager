# One-time cloud test-data reset

This release includes a protected reset endpoint that deletes every tournament currently listed in the cloud Tournament Library, then clears the library itself.

1. Set a Cloudflare Worker secret:

   `npx wrangler secret put KSM_RESET_KEY`

2. Deploy v3.17.3-test.

3. Run from the repository root:

   `KSM_BASE_URL=https://YOUR-KSM-DOMAIN KSM_RESET_KEY=YOUR_SECRET node scripts/reset-cloud-data.mjs`

4. Confirm the response reports `ok: true`, then open KSM. The Tournament Library should be empty.

The reset endpoint requires the Worker secret and is not exposed in the KSM interface.
