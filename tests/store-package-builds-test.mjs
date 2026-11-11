// The production builds app.js bundles for the store's packages (STORE_PACKAGE_BUILDS in scripts/app-sources.mjs,
// #15): exact files inside node_modules. A package upgrade that moves or renames one must fail here, by name, not as
// an unresolved import deep in the build.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, STORE_PACKAGE_BUILDS } from '../scripts/app-sources.mjs';

const problems = [];
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
for (const [name, file] of Object.entries(STORE_PACKAGE_BUILDS)) {
  if (!fs.existsSync(file)) problems.push(`${name}: ${path.relative(ROOT, file)} is missing (check the path in scripts/app-sources.mjs after an upgrade)`);
  else if (/process\.env\.NODE_ENV/.test(fs.readFileSync(file, 'utf8'))) problems.push(`${name}: ${path.relative(ROOT, file)} is not a production build (it reads process.env.NODE_ENV)`);
}
if (!/^\d+\.\d+\.\d+$/.test(pkg.dependencies?.['@reduxjs/toolkit'] || '')) problems.push('@reduxjs/toolkit must be pinned to an exact version in package.json (the aliased paths depend on it)');
if (problems.length) { console.log(`FAIL store package builds:\n  ${problems.join('\n  ')}`); process.exit(1); }
console.log(`PASS store package builds: ${Object.keys(STORE_PACKAGE_BUILDS).length} production files present`);
