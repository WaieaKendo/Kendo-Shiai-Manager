# KSM v3.10.0 — Hosted Mobile Foundation

## Added
- Cloudflare Workers Static Assets project scaffold.
- Hosted HTTPS-compatible asset paths.
- PWA web app manifest and KSM PNG application icons.
- Service-worker app-shell caching for hosted use.
- iPhone safe-area metadata and mobile navigation shell refinements.
- Package integrity test for all required icons and hosted files.
- Clear warning when KSM is opened through an unsupported `file://` preview.

## Changed
- Version markers updated from v3.9.10 to v3.10.0.
- Removed the legacy mobile `touchend`-to-`click` shim. Normal hosted browser click behavior is authoritative.
- Asset references are root-relative so future hosted deep links do not break icons.

## Unchanged
- Tournament rules, templates, machine data, Match Object schema, scoring, advancement, queue behavior, Results, printing, and White-left/Red-right orientation.
- Cloud Match Object authority and multi-device synchronization are not part of this release.
