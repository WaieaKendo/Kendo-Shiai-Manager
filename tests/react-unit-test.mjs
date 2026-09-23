// Unit tests for the pure logic in app/react/ (tests/react/*.test.mjs, node:test).
// Those files import the .ts sources directly, so Node runs them with type stripping.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../scripts/app-sources.mjs';

const dir = path.join(ROOT, 'tests', 'react');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort().map(f => path.join('tests', 'react', f));
const run = spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--test', '--test-reporter=spec', ...files], { cwd: ROOT, encoding: 'utf8' });
const out = (run.stdout || '') + (run.stderr || '');
if (run.status !== 0) { console.log(out); console.log('FAIL react unit tests'); process.exit(1); }
const summary = out.match(/ℹ tests (\d+)/);
console.log(`PASS react unit tests: ${summary ? summary[1] : '?'} tests in ${files.length} files`);
