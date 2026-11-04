#!/usr/bin/env node
// One-off (#136 step 3b): strips the ksm:post-split markers from app/js, app/styles and
// app/index.html. Every marker is a comment, so no code changes. Deleted again in this PR.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './app-sources.mjs';

const MARKER = String.raw`(?:\/\* ksm:post-split-begin [\w-]+(?: was:(?:(?!\*\/)[^\n])*?)? \*\/|\/\* ksm:post-split-end \*\/|<!-- ksm:post-split-begin [\w-]+(?: was:(?:(?!-->)[^\n])*?)? -->|<!-- ksm:post-split-end -->)`;
const ALONE = new RegExp(`^[ \\t]*${MARKER}[ \\t]*\\n`, 'gm');
const ANY = new RegExp(MARKER, 'g');
const strip = text => text.replace(ALONE, '').replace(ANY, '');

const files = [];
for (const dir of ['app/js', 'app/styles']) for (const f of fs.readdirSync(path.join(ROOT, dir))) files.push(path.join(ROOT, dir, f));
files.push(path.join(ROOT, 'app/index.html'));
for (const f of files) {
  const before = fs.readFileSync(f, 'utf8');
  const after = strip(before);
  if (after !== before) fs.writeFileSync(f, after);
}
