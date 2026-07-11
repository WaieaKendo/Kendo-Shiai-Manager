# KSM v3.10.2 — Mobile Navigation Reliability

This release corrects the remaining hosted-mobile navigation issue observed after v3.10.0 deployment: dropdown navigation buttons did not reliably open or remain usable on phones.

## Mobile behavior

- One tap opens Courts, Live Scores, Export, or Save/Load.
- Tapping the same trigger closes it.
- Opening another dropdown closes the prior dropdown.
- Tapping outside or pressing Escape closes all dropdowns.
- Menus remain inside the mobile viewport and support vertical scrolling when necessary.
- Submenu controls use 48-pixel minimum touch targets.

## Deployment

Upload the repository package contents to the root of `WaieaKendo/Kendo-Shiai-Manager` and commit to `main`. Cloudflare should deploy automatically.

After deployment, close and reopen KSM on the phone. If an older cached screen remains, refresh once in Safari; the service-worker cache name changed for this release.
