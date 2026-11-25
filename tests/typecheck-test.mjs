// `npm run typecheck` (tsc --noEmit, both projects) must pass, so type errors fail `npm test`.
// Classic app/js: only files that start with `// @ts-check` are checked (tsconfig.json:
// checkJs off). app/react: strict TypeScript, all files (app/react/tsconfig.json).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { APP_DIR, ROOT, scriptFiles } from '../scripts/app-sources.mjs';

const checked = scriptFiles().filter(f => fs.readFileSync(f, 'utf8').startsWith('// @ts-check'));
for (const project of [ROOT, path.join(APP_DIR, 'react')]) {
  const tsc = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', project], { cwd: ROOT, encoding: 'utf8' });
  if (tsc.status !== 0) {
    console.log((tsc.stdout || '') + (tsc.stderr || ''));
    console.log(`FAIL typecheck ${path.relative(ROOT, project) || '.'} (npm run typecheck)`);
    process.exit(1);
  }
}
console.log(`PASS typecheck: app/react (strict) and ${checked.length} checked classic files (${checked.map(f => path.relative(APP_DIR, f)).join(', ')})`);
