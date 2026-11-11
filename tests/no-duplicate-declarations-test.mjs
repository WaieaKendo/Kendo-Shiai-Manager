// The entry (app/main.js) and the modules it imports (app/modules) are bundled into one ES module, which refuses to
// load when a name is declared twice. This test keeps it so: it fails, naming the files, if any top-level function is
// declared twice, if two modules declare the same name, or if a name a module declares is also declared in the entry.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import { ENTRY_FILE, moduleFiles, ROOT } from '../scripts/app-sources.mjs';

// Every top-level function declaration, as { name, file }, found in the concatenation (the same
// text the build ships) and mapped back to its file by offset.
function topLevelFunctions(files) {
  const parts = files.map(f => ({ file: f, text: fs.readFileSync(f, 'utf8') }));
  // import lines are blanked (same length, so offsets still map to files): a script cannot contain them
  const source = parts.map(p => p.text.replace(/^import \{[^}]*\} from '[^']+';?/gm, m => ' '.repeat(m.length))).join('');
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

const declared = topLevelFunctions([ENTRY_FILE]);
const dups = duplicates(declared);
for (const [name, files] of dups) console.log(`FAIL ${name}() is declared ${files.length} times: ${files.join(', ')}`);
if (dups.length) { console.log('An ES module refuses duplicates. Delete the dead copy.'); process.exit(1); }
console.log(`PASS no top-level function in app/main.js is declared twice (${declared.length} functions)`);

// --- modules (app/modules): every top-level declaration, against the entry's and against each other ---
const patternNames = (p, out = []) => {
  if (!p) return out;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach(q => patternNames(q.type === 'RestElement' ? q.argument : q.value, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach(e => patternNames(e, out));
  else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
  else if (p.type === 'RestElement') patternNames(p.argument, out);
  return out;
};
const declarations = s => {
  if (s.type === 'ExportNamedDeclaration' && s.declaration) s = s.declaration;
  if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') return [s.id.name];
  if (s.type === 'VariableDeclaration') return s.declarations.flatMap(d => patternNames(d.id));
  return [];
};
const entryNames = new Map(), moduleNames = [];
for (const f of [ENTRY_FILE]) {
  const body = parseAst(fs.readFileSync(f, 'utf8').replace(/^import \{[^}]*\} from '[^']+';?/gm, m => ' '.repeat(m.length)), { lang: 'js' }).body;
  body.flatMap(declarations).forEach(n => entryNames.set(n, path.basename(f)));
}
const bad = [];
const importedNames = new Set();
for (const f of [ENTRY_FILE]) for (const s of parseAst(fs.readFileSync(f, 'utf8'), { lang: 'js' }).body)
  if (s.type === 'ImportDeclaration') s.specifiers.forEach(sp => { if (sp.type === 'ImportNamespaceSpecifier' && sp.local.name === 'KSMEngine') return; importedNames.add(sp.local.name); if (entryNames.has(sp.local.name)) bad.push(`${sp.local.name} is imported and also declared in app/main.js`); });
for (const f of moduleFiles()) {
  for (const s of parseAst(fs.readFileSync(f, 'utf8'), { lang: 'js' }).body) for (const n of declarations(s)) moduleNames.push({ name: n, file: path.relative(ROOT, f) });
}
for (const [name, files] of duplicates(moduleNames)) bad.push(`${name} is declared in ${files.length} modules: ${files.join(', ')}`);
for (const { name, file } of moduleNames) if (entryNames.has(name)) bad.push(`${name} is declared in ${file} and in app/main.js`);
for (const b of bad) console.log(`FAIL ${b}`);
if (bad.length) process.exit(1);
console.log(`PASS no name is declared in both app/main.js and a module, or in two modules (${moduleNames.length} module declarations, ${importedNames.size} imported names)`);
