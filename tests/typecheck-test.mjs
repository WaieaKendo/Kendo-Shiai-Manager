// `npm run typecheck` (tsc --noEmit) must pass, so type errors fail `npm test`.
// Only files that start with `// @ts-check` are checked (tsconfig.json: checkJs off).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { APP_DIR, ROOT, scriptFiles } from '../scripts/app-sources.mjs';

const checked = scriptFiles().filter(f => fs.readFileSync(f, 'utf8').startsWith('// @ts-check'));
const tsc = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', ROOT], { cwd: ROOT, encoding: 'utf8' });
if (tsc.status !== 0) {
  console.log((tsc.stdout || '') + (tsc.stderr || ''));
  console.log('FAIL typecheck (npm run typecheck)');
  process.exit(1);
}
console.log(`PASS typecheck: ${checked.length} checked files (${checked.map(f => path.relative(APP_DIR, f)).join(', ')})`);
