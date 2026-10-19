# Printable documents

`/print/scorekeeper-guide` is public, works offline after the service worker installs,
and prints to the front and back of US Letter. Use double-sided printing, flip on the long edge.
The guide reflects the deployed app version. Owners still need to check a paper copy (#79).

## Regenerate the guide

Install project dependencies (`npm install`, `npm run test:setup`). Then:

```
npm run guide
```

This recreates the sample court screenshots through the golden tests' KsmApp/KSMTest
fixture, rebuilds the app and writes `dist/print/scorekeeper-guide.pdf` and its review copy `docs/scorekeeper-guide.pdf`.
Do this after #85 or any other court-screen change; never hand-edit the images.
The fixture uses a tablet landscape viewport. Save states are deterministic inputs to
the production status renderer, not hand-written screenshot labels.

Separately:

```
npm run guide:screenshots
npm run build
npm run print-pdf -- scorekeeper-guide
npm run print-pdf -- scorekeeper-guide --out /tmp/scorekeeper-guide.pdf
```

PDF generation starts a throwaway local built worker, uses Playwright `page.pdf()`
with Letter and print backgrounds, and shuts it down. `KSM_BASE_URL` can reuse an
already running local worker. `--out` selects a different output location.

## Add a document (next: tournament program, #63)

1. Create `app/print/program.html` and register one entry in `app/print-documents.mjs`:
   `'program': 'print/program.html'`. Vite entries, clean worker routes and document
   precaching all use this registry. Query strings, e.g. `?tournament=<id>`, survive routing.
2. Link `/print/theme.css` and load `/print/shell.js` as a module. The shared shell
   supplies app/version header and footer; `print.css` supplies Letter margins,
   page numbers, mobile layout and unbroken sections/figures. Use `article.side`
   for explicit sides. Colours come from the existing theme tokens.
3. A data-driven document may add its own module to read its query and render into
   `main`. Keep private tournament data out of the precache; registration caches
   only the public shell and its static dependencies. Render sections/figures with
   the shared layout. Add document-specific readiness checks before exporting a
   data-driven program if its content loads asynchronously.
4. Add its link inside Setup's `setup-print-group` in Sharing & access, beside the guide.
5. `npm run build && npm run print-pdf -- program` reuses the exporter.
   Add browser tests for its route, content, images, offline behavior and page count.

`tests/print-guide-test.py` checks the guide route, Setup popup, all images, phone
width, service worker installation/offline navigation, exact current court button
labels, and the PDF's two-page count. Label expectations live together in that test.

Setup goldens re-recorded for the Print group: `setup-defaults`, `setup-details`,
`setup-divisions`, `setup-live` (and their platform geometry). No other screen goldens change.
