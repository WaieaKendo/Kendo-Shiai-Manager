#!/usr/bin/env node
// After a deploy: waits until <base URL>/api/health answers ok with the expected version.
//
//   node scripts/health-check.mjs <base URL> [--version <v>] [--attempts <n>] [--delay <ms>]
//
// The expected version defaults to package.json "version" (the one the deploy just built).
// A Worker deploy can take a few seconds to reach every location, so it retries (default 12
// attempts, 10 s apart) before failing with exit code 1. Used by .github/workflows/deploy.yml.
import fs from 'node:fs';

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const expected = flag('--version') || JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const attempts = Number(flag('--attempts') || 12), delay = Number(flag('--delay') || 10000);
const base = args.find(a => !a.startsWith('-'))?.replace(/\/+$/, '');
if (!base) { console.error('usage: node scripts/health-check.mjs <base URL> [--version <v>] [--attempts <n>] [--delay <ms>]'); process.exit(1); }

for (let attempt = 1; attempt <= attempts; attempt++) {
  let seen;
  try {
    const response = await fetch(`${base}/api/health`, { headers: { 'cache-control': 'no-cache' } });
    const body = await response.json().catch(() => null);
    seen = `HTTP ${response.status}, version ${body?.version ?? '?'}`;
    if (response.ok && body?.ok === true && body.version === expected) {
      console.log(`healthy: ${base} is version ${expected}`);
      process.exit(0);
    }
  } catch (error) { seen = error.message; }
  console.log(`attempt ${attempt}/${attempts}: ${seen} (want ${expected})`);
  if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, delay));
}
console.error(`not healthy: ${base}/api/health never reported version ${expected}`);
process.exit(1);
