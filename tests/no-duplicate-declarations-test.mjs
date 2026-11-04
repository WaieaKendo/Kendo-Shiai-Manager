// app/js/*.js is concatenated, in file-name order, into one script. In a classic script a later
// top-level function declaration with the same name silently replaces an earlier one; an ES module
// refuses to load at all. #136 step 3a removed the last such duplicates, and this test keeps it so:
// it fails, naming the files, if any top-level function is declared twice.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import { scriptFiles } from '../scripts/app-sources.mjs';

// Every top-level function declaration, as { name, file }, found in the concatenation (the same
// text the build ships) and mapped back to its file by offset.
function topLevelFunctions(files) {
  const parts = files.map(f => ({ file: f, text: fs.readFileSync(f, 'utf8') }));
  const source = parts.map(p => p.text).join('');
  const program = parseAst(source, { lang: 'js', sourceType: 'script' });
  const starts = []; let at = 0;
  for (const p of parts) { starts.push(at); at += p.text.length; }
  const fileAt = pos => { let i = starts.length - 1; while (starts[i] > pos) i--; return path.basename(parts[i].file); };
  return program.body.filter(s => s.type === 'FunctionDeclaration' && s.id)
    .map(s => ({ name: s.id.name, file: fileAt(s.start) }));
}

function duplicates(declared) {
  const byName = new Map();
  for (const { name, file } of declared) byName.set(name, [...(byName.get(name) || []), file]);
  return [...byName].filter(([, files]) => files.length > 1);
}

// Self-check of the detector.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ksm-dup-'));
  try {
    fs.writeFileSync(path.join(tmp, '01-a.js'), 'function same(){}\nfunction once(){}\n');
    fs.writeFileSync(path.join(tmp, '02-b.js'), 'async function same(){}\nfunction inner(){function once(){}}\n');
    const found = duplicates(topLevelFunctions([path.join(tmp, '01-a.js'), path.join(tmp, '02-b.js')]));
    if (found.length !== 1 || found[0][0] !== 'same' || found[0][1].join() !== '01-a.js,02-b.js') throw new Error('The duplicate detector must report same() in both files and ignore nested functions');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

const declared = topLevelFunctions(scriptFiles());
const dups = duplicates(declared);
for (const [name, files] of dups) console.log(`FAIL ${name}() is declared ${files.length} times: ${files.join(', ')}`);
if (dups.length) { console.log('A later declaration silently replaces an earlier one in a classic script, and an ES module refuses duplicates. Delete the dead copy.'); process.exit(1); }
console.log(`PASS no top-level function in app/js is declared twice (${declared.length} functions)`);
