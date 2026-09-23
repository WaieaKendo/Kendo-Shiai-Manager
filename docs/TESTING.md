# Testing

## One-time setup

```bash
npm install          # wrangler (local Cloudflare runtime, used by the API + end-to-end tests)
npm run test:setup   # .venv with Python Playwright + Chromium (browser tests)
```

Requirements: Node 20+ and Python 3.10+. No Cloudflare account is needed; tests never touch the deployed site.

## Running

| Command | What it runs | Time |
|---|---|---|
| `npm test` | Everything below (same as `npm run check`) | ~20 s |
| `npm run test:node` | Node tests only, no browser needed | ~1 s |
| `npm run test:browser` | Python/Playwright browser tests, including end-to-end | ~20 s |
| `npm run test:api` | Backend API contract, in-process | <1 s |
| `npm run test:e2e` | Two-court end-to-end sync test against local `wrangler dev` | ~15 s |
| `npm run testlab:smoke` / `testlab` / `testlab:exhaustive` | Tournament-engine simulation matrix (writes reports to `testlab-reports/`, git-ignored) | 5 s – minutes |

`node tests/run-all.mjs <text>` runs only test files whose name contains `<text>` (e.g. `tiebreak`, `v3171`), and `-v` prints every test's output.

Run `npm test` before every commit or release. A failing test means either a regression or an intended behaviour change; for the latter, update the test in the same commit and explain why.

## What is covered

**Backend API contract (`worker-api-test.mjs`)** runs the real `src-worker.js` against an in-memory Cloudflare runtime and checks tournament creation, staff password auth, stale-revision rejection (409), simultaneous saves (exactly one wins), integrity validation (422), WebSocket snapshot/presence/delete broadcasts, the tournament library, deletion and admin reset.

The same contract can run against any live server:

```bash
npm run dev                                                     # in one terminal
KSM_BASE_URL=http://localhost:8787 node tests/worker-api-test.mjs  # in another
```

Use this mode to prove that a replacement backend (e.g. an AWS port) behaves identically.

**Two-court end-to-end sync (`e2e-two-court-sync-test.py`)** starts a throwaway `wrangler dev` and drives the real app in four browser sessions (director, Court A, Court B, spectator). Both courts score every match at the same time, so their saves conflict and go through the client rebase/merge path. The test then requires that no point, completion or winner from either court was lost, and that every device converged on the server copy. This is the baseline for any change to the cloud sync code.

**Engine and UI behaviour.** The Python tests and TestLab load the real `index.html` in Chromium, served on a fake `http://ksm.test` origin so `localStorage` works (see `tests/ksm_browser.py`). By default they enter a local staff session; pass `session=None` to `load_app()` to test the real boot state (Tournament Library, spectator).

**Per-release regression tests (`v3*.mjs`)** protect specific fixes. Some execute extracted functions in a Node `vm`; others check source text.

**Guards:**
- `version-consistency-test.mjs`: `package.json`, the HTML badge and title, the service worker cache name, `/api/health` and `CHANGELOG.md` agree. Bump the version in all of them together.
- `function-override-baseline-test.mjs`: `index.html` redeclares ~35 functions, and the browser runs the last declaration. The test fails if a new redeclaration appears; lower the baseline when you remove one.

## Writing tests

- **Prefer behaviour over source text.** `tests/lib/ksm-source.mjs` provides:
  - `extractFunction(html, name)`, which returns the **last** declaration (the one the browser runs);
  - `withDependencies(html, code, { exclude })`, which pulls in every `index.html` function or constant that code depends on, so vm tests don't break when helpers are added. Anything you stub on the vm context goes in `exclude`.
- Don't assert version strings in feature tests; the version-consistency test covers that.
- For browser tests use `launch_chromium(p)` and `load_app(page)` from `tests/ksm_browser.py`, not `page.set_content()` (which runs on `about:blank`, where storage access fails).
- For tests that need a real backend, use `local_worker()` from `tests/ksm_server.py`.

Generated reports, screenshots, ZIP archives and temporary build folders should not be committed.
