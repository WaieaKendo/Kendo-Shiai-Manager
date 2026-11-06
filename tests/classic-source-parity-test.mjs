// Step 3d of #136: tests that read or run the app's code (singleFileSource(), tests/ksm_source.py app_source())
// see the entry (app/js) plus the modules it imports (app/modules) as ONE classic script, built by a text
// transform (modules first in import order, `import` lines removed, `export ` dropped). This test keeps the
// two implementations (Node and Python) identical, checks the result is a valid classic script with every
// function of the modules findable by text, and that no module keeps `import`/`export` syntax in it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import { ROOT, classicAppScript, moduleFiles, singleFileSource } from '../scripts/app-sources.mjs';
import { extractFunction } from './lib/ksm-source.mjs';

const problems = [];
const classic = classicAppScript();

const py = spawnSync('python3', ['-c', "import sys; sys.path.insert(0, 'tests'); from ksm_source import classic_app_script; sys.stdout.buffer.write(classic_app_script().encode('utf-8'))"], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
if (py.status !== 0) problems.push(`python classic_app_script() failed: ${py.stderr.trim().split('\n').pop()}`);
else if (py.stdout !== classic) problems.push('tests/ksm_source.py classic_app_script() differs from classicAppScript() in scripts/app-sources.mjs');

try { parseAst(classic, { lang: 'js', sourceType: 'script' }); } catch (e) { problems.push(`the classic script does not parse as a script: ${e.message}`); }
if (/^\s*(?:import|export)\s*[\w{*'"]/m.test(classic)) problems.push('the classic script still contains an import/export statement');
if (!singleFileSource().includes(classic)) problems.push('singleFileSource() does not inline classicAppScript()');

let functions = 0;
for (const file of moduleFiles()) {
  const body = parseAst(fs.readFileSync(file, 'utf8'), { lang: 'js' }).body;
  for (const s of body) {
    const d = s.type === 'ExportNamedDeclaration' ? s.declaration : s;
    if (d?.type !== 'FunctionDeclaration') continue;
    functions++;
    try { extractFunction(classic, d.id.name); } catch { problems.push(`${d.id.name} (${path.relative(ROOT, file)}) is not found by extractFunction in the classic script`); }
  }
}

if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; }
else console.log(`PASS classic source: Node and Python agree (${classic.length} chars), it parses as a script, ${functions} module functions found by text`);
