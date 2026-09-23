#!/usr/bin/env node
// Proves that app/ is the old single-file public/index.html, moved and not changed.
//
//   node scripts/verify-split.mjs [commit]     (default def5010, the last single-file version)
//
// 1. Markup: app/index.html is the old file with the <style> blocks replaced by the
//    app.css <link> and the <script> element by the app.js <script src>.
// 2. CSS: app/styles/*.css in order are the old <style> blocks' lines, in order.
// 3. JS: app/js/*.js in order are the old <script> contents. Byte-identical when only
//    moved; once type annotations (comments) are added, the check compares the code
//    with comments and formatting removed (Vite's minifier with compress/mangle off),
//    and reports which it did.
//
// Deliberate post-split additions are wrapped in markers, one line or several:
//   /* ksm:post-split-begin <name> */ ...added code... /* ksm:post-split-end */
// The check removes those regions (and one newline right after an end marker) before
// comparing, and KNOWN_POST_SPLIT_EDITS pins how many regions each <name> has, so an
// unmarked or unlisted change still fails.
import { execFileSync } from 'node:child_process';
import { minify } from 'vite';
import { ROOT, STYLE_TAG, SCRIPT_TAG, indexHtml, appStyles, appScript } from './app-sources.mjs';

const commit = process.argv[2] || 'def5010';
const KNOWN_POST_SPLIT_EDITS = {
  // feat/react-setup: app/js/00-react-bridge.js + the ksm:state-changed dispatch in
  // performCourtAction() and renderAll(), so React islands re-render with `state`.
  'react-bridge': 3,
};
const old = execFileSync('git', ['show', `${commit}:public/index.html`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 });
let failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; };

const scriptStart = old.indexOf('\n<script>\n') + 1, scriptEnd = old.indexOf('</script>\n</body>');
const oldScript = old.slice(scriptStart + '<script>\n'.length, scriptEnd);
const headStyles = old.slice(old.indexOf('<style'), old.indexOf('</head>'));
const oldStyleBlocks = [...headStyles.matchAll(/<style[^>]*>\n([\s\S]*?)<\/style>/g)];
const outsideBlocks = headStyles.replace(/<style[^>]*>\n[\s\S]*?<\/style>/g, '');

check(!outsideBlocks.trim(), `old <head> held only <style> blocks between <title> and </head> (${oldStyleBlocks.length} blocks)`);
const oldMarkup = old.slice(0, old.indexOf('<style')) + STYLE_TAG + '\n' + old.slice(old.indexOf('</head>'), scriptStart) + SCRIPT_TAG + old.slice(scriptEnd + '</script>'.length);
check(indexHtml() === oldMarkup, 'app/index.html is the old markup, byte for byte');
check(appStyles() === oldStyleBlocks.map(m => m[1]).join(''), 'app/styles/*.css concatenated = old <style> blocks, byte for byte');

const POST_SPLIT = /\/\* ksm:post-split-begin ([\w-]+) \*\/[\s\S]*?\/\* ksm:post-split-end \*\/\n?/g;
const found = {};
for (const m of appScript().matchAll(POST_SPLIT)) found[m[1]] = (found[m[1]] || 0) + 1;
check(JSON.stringify(found) === JSON.stringify(KNOWN_POST_SPLIT_EDITS),
  `post-split edits are the known ones (${Object.entries(found).map(([k, n]) => `${k}: ${n}`).join(', ') || 'none'})`);
const js = appScript().replace(POST_SPLIT, '');
check(!/ksm:post-split-(begin|end)/.test(js), 'every post-split marker is paired');
if (js === oldScript) check(true, 'app/js/*.js concatenated = old <script>, byte for byte');
else {
  const normalize = async code => (await minify('app.js', code, { compress: false, mangle: false, codegen: { removeWhitespace: false } })).code;
  const [a, b] = await Promise.all([normalize(oldScript), normalize(js)]);
  check(a === b, 'app/js/*.js concatenated = old <script> apart from comments (type annotations) and formatting');
  if (a !== b) {
    const at = [...a].findIndex((ch, i) => ch !== b[i]);
    console.log(`  first difference near:\n  old: ${a.slice(at - 80, at + 80)}\n  new: ${b.slice(at - 80, at + 80)}`);
  }
}
if (failed) process.exit(1);
