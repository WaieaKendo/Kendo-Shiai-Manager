#!/usr/bin/env node
// Runs every KSM regression test (Node *-test.mjs and Python/Playwright *-test.py)
// from the repository root and prints one summary.
//
//   node tests/run-all.mjs              all tests
//   node tests/run-all.mjs --node       Node tests only (no browser needed)
//   node tests/run-all.mjs --py         Python browser tests only
//   node tests/run-all.mjs tiebreak     only tests whose filename contains "tiebreak"
//   node tests/run-all.mjs -v           print each test's output, not just failures
//   node tests/run-all.mjs --shard 2/4  only the 2nd of 4 shards (or KSM_TEST_SHARD=2/4); shards
//                                       are balanced by tests/test-durations.json (CI runs 4)
//   KSM_WRITE_DURATIONS=file.json       after a run, write each file's seconds there (to refresh
//                                       tests/test-durations.json)
//
// Python tests use .venv/bin/python when present, otherwise KSM_PYTHON or python3.
// The app is built into dist/ first (`npm run build`); browser tests load the built app.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = path.join(root, 'tests');
const args = process.argv.slice(2);
const verbose = args.includes('-v') || args.includes('--verbose');
const onlyNode = args.includes('--node');
const onlyPy = args.includes('--py');
const shardIdx = args.indexOf('--shard');
const shardSpec = shardIdx >= 0 ? args[shardIdx + 1] : process.env.KSM_TEST_SHARD;
const filters = args.filter((a, i) => !a.startsWith('-') && !(shardIdx >= 0 && i === shardIdx + 1));
// A test is killed after 180 s (catches a hang quickly). The golden-* snapshot tests play whole
// tournaments step by step on several screens and run next to the other browser tests, so under
// load they need longer: 420 s. KSM_TEST_TIMEOUT_MS / KSM_GOLDEN_TIMEOUT_MS override either.
const TIMEOUT_MS = Number(process.env.KSM_TEST_TIMEOUT_MS || 180000);
const GOLDEN_TIMEOUT_MS = Number(process.env.KSM_GOLDEN_TIMEOUT_MS || 420000);
const timeoutFor = file => (file.startsWith('golden-') ? GOLDEN_TIMEOUT_MS : TIMEOUT_MS);

const venvPython = path.join(root, '.venv', 'bin', 'python');
const python = process.env.KSM_PYTHON || (fs.existsSync(venvPython) ? venvPython : 'python3');

const files = fs.readdirSync(testsDir)
  .filter(f => /-test\.(mjs|py)$/.test(f))
  .filter(f => !(onlyNode && f.endsWith('.py')) && !(onlyPy && f.endsWith('.mjs')))
  .filter(f => !filters.length || filters.some(q => f.includes(q)))
  .sort();

// Sharding: longest-first greedy packing of every file (recorded seconds; unknown files count as
// the median) into n shards, so the shards finish together. Deterministic: the same files always
// land in the same shard, and every file lands in exactly one.
if (shardSpec) {
  const m = /^(\d+)\/(\d+)$/.exec(shardSpec);
  if (!m || +m[1] < 1 || +m[1] > +m[2]) { console.log(`FAIL  bad shard "${shardSpec}" (expected i/n, e.g. 2/4)`); process.exit(1); }
  const [index, count] = [+m[1], +m[2]];
  let recorded = {};
  try { recorded = JSON.parse(fs.readFileSync(path.join(testsDir, 'test-durations.json'), 'utf8')); } catch { /* unbalanced fallback */ }
  const known = Object.values(recorded).sort((a, b) => a - b);
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 1;
  const secs = f => recorded[f] ?? fallback;
  const load = Array(count).fill(0);
  const mine = [];
  for (const f of [...files].sort((a, b) => secs(b) - secs(a) || a.localeCompare(b))) {
    const k = load.indexOf(Math.min(...load));
    load[k] += secs(f);
    if (k === index - 1) mine.push(f);
  }
  files.length = 0;
  files.push(...mine.sort());
  console.log(`shard ${index}/${count}: ${files.length} files, ~${load[index - 1]} s recorded`);
}

if (files.length) {
  try {
    execFileSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'error'], { cwd: root, stdio: 'inherit' });
  } catch {
    console.log('FAIL  build (npm run build)');
    process.exit(1);
  }
}

function run(file) {
  const cmd = file.endsWith('.py') ? python : process.execPath;
  const started = Date.now();
  return new Promise(resolve => {
    const child = spawn(cmd, [path.join('tests', file)], { cwd: root, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    let output = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });
    const limit = timeoutFor(file);
    const timer = setTimeout(() => { output += `\n[run-all] timed out after ${limit} ms`; child.kill('SIGKILL'); }, limit);
    child.on('error', err => { output += `\n[run-all] failed to start: ${err.message}`; });
    child.on('close', code => { clearTimeout(timer); resolve({ file, ok: code === 0, code, output, ms: Date.now() - started }); });
  });
}

// Node tests are fast and independent; Python tests each launch a browser (and some a local
// wrangler). Each browser owns several renderer processes: budget two cores per job
// instead of oversubscribing eight-core desktops with six browsers plus their Workers.
// Keep KSM_TEST_JOBS as the explicit override for dedicated test machines.
const PY_JOBS = Number(process.env.KSM_TEST_JOBS) || Math.max(2, Math.min(6, Math.floor(os.availableParallelism() / 2)));
async function runPool(list, concurrency) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const file = list[next++];
      const result = await run(file);
      console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${file}  (${(result.ms / 1000).toFixed(1)}s)`);
      if (verbose || !result.ok) console.log(result.output.trimEnd().split('\n').map(l => `      ${l}`).join('\n'));
      results.push(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return results;
}

const nodeFiles = files.filter(f => f.endsWith('.mjs'));
// Start the slowest browser tests first so they overlap with the many short ones.
const SLOW = ['golden-engine', 'golden-court', 'edit-conflicts', 'court-actions', 'e2e-full', 'sync-saving', 'tv-display', 'sync-remote', 'e2e-two', 'reload-restore', 'roles-access'];
const slowRank = f => { const i = SLOW.findIndex(s => f.startsWith(s)); return i < 0 ? SLOW.length : i; };
const pyFiles = files.filter(f => f.endsWith('.py')).sort((a, b) => slowRank(a) - slowRank(b));
const results = [...await runPool(nodeFiles, 8), ...await runPool(pyFiles, PY_JOBS)];
if (process.env.KSM_WRITE_DURATIONS) {
  fs.writeFileSync(process.env.KSM_WRITE_DURATIONS, JSON.stringify(Object.fromEntries(results.map(r => [r.file, Math.round(r.ms / 1000)]).sort()), null, 1) + '\n');
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} test files passed` + (failed.length ? `\nFailed:\n${failed.map(r => `  - ${r.file}`).join('\n')}` : ''));
if (!results.length) console.log('No tests matched.');
process.exit(failed.length ? 1 : 0);
