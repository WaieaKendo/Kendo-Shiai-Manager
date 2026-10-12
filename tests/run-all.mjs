#!/usr/bin/env node
// Runs every KSM regression test (Node *-test.mjs and Python/Playwright *-test.py)
// from the repository root and prints one summary.
//
//   node tests/run-all.mjs              all tests
//   node tests/run-all.mjs --node       Node tests only (no browser needed)
//   node tests/run-all.mjs --py         Python browser tests only
//   node tests/run-all.mjs tiebreak     only tests whose filename contains "tiebreak"
//   node tests/run-all.mjs -v           print each test's output, not just failures
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
const filters = args.filter(a => !a.startsWith('-'));
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
// wrangler), so run a few at a time: KSM_TEST_JOBS, or 6 on machines with 8+ cores, else 4.
const PY_JOBS = Number(process.env.KSM_TEST_JOBS) || (os.cpus().length >= 8 ? 6 : 4);
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
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} test files passed` + (failed.length ? `\nFailed:\n${failed.map(r => `  - ${r.file}`).join('\n')}` : ''));
if (!results.length) console.log('No tests matched.');
process.exit(failed.length ? 1 : 0);
