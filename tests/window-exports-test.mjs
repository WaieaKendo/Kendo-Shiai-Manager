// Guard for the window exports at the end of app/main.js (issue #136, steps 3c and 4d).
//
// /app.js is ONE ES module, so a top-level name of app/main.js is no longer on `window`. Whatever is
// reached from OUTSIDE the module must be exported there, or it is silently `undefined`:
//   - inline on*="..." handlers in app/index.html and in HTML strings built by app/modules and app/react
//   - window.NAME in app/main.js and app/modules
//   - what app/react reads off `window`: LegacyGlobals and the other *Window interfaces, `w.NAME`,
//     and the names passed as strings ('chooseCourt', legacy('ksmText'), ...)
//   - every name tests/lib/ksm-test-api.js (KSMTest) uses
// A name that is assigned after its declaration (a `let`/`var`, or a function wrapped later), or that
// a test or React writes through `window.NAME =` / a setter, must be exported as a live accessor
// (Object.defineProperties), or window.NAME would keep the first value.
// Every exported name must be an import or top-level declaration of app/main.js. Functions that tests replace
// (replaceable(), app/modules/replaceable.js) define their own live accessor on window: each must be a module
// `export const NAME = replaceable('NAME', ...)`, and everything a test replaces or wraps must be one of those or
// exported live. Fails with the names missing/wrong.
import fs from 'node:fs';
import path from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import { ROOT, ENTRY_FILE, appScript, indexHtml } from '../scripts/app-sources.mjs';

const rel = f => path.relative(ROOT, f);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const walkFiles = (d, exts) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walkFiles(path.join(d, e.name), exts) : exts.some(x => e.name.endsWith(x)) ? [path.join(d, e.name)] : []);
const ENTRY = path.relative(ROOT, ENTRY_FILE); // app/main.js: its last section is the export list
const EXPORTS_FILE = ENTRY;
const problems = [];

// --- app/main.js as a module: strict-mode syntax errors (what `node --check` finds in a .mjs) ---
try { parseAst(appScript(), { sourceType: 'module', lang: 'js' }); }
catch (e) { problems.push(`app.js does not parse as an ES module: ${e.message}`); }

// --- top-level declarations of app/main.js (name -> kind) ---
const patternNames = (p, out = []) => {
  if (!p) return out;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach(q => patternNames(q.type === 'RestElement' ? q.argument : q.value, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach(e => patternNames(e, out));
  else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
  else if (p.type === 'RestElement') patternNames(p.argument, out);
  return out;
};
const topLevel = new Map();
for (const file of [ENTRY_FILE]) {
  for (const s of parseAst(fs.readFileSync(file, 'utf8'), { lang: 'js' }).body) {
    if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') topLevel.set(s.id.name, s.type === 'FunctionDeclaration' ? 'function' : 'class');
    else if (s.type === 'VariableDeclaration') s.declarations.forEach(d => patternNames(d.id).forEach(n => topLevel.set(n, s.kind)));
    else if (s.type === 'ImportDeclaration') s.specifiers.forEach(sp => topLevel.set(sp.local.name, 'import'));
  }
}
// Handler code: the names it calls, not the text of its string arguments ('W', 'setup').
const handlerTokens = text => tokens(text.replace(/'[^']*'|"[^"]*"/g, "''"));
const tokens = text => (text.match(/[A-Za-z_$][\w$]*/g) || []).filter(t => topLevel.has(t));

// --- the export list ---
const exportsPath = path.join(ROOT, EXPORTS_FILE);
const plain = new Set(), live = new Set();
if (!fs.existsSync(exportsPath)) problems.push(`${EXPORTS_FILE} is missing`);
else {
  const keysOf = obj => obj.properties.map(p => p.key.name ?? p.key.value);
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'Object' && n.arguments[0]?.name === 'window' && n.arguments[1]?.type === 'ObjectExpression') {
      const into = n.callee.property.name === 'assign' ? plain : n.callee.property.name === 'defineProperties' ? live : null;
      if (into) keysOf(n.arguments[1]).forEach(k => into.add(k));
    }
    for (const k in n) if (k !== 'type') walk(n[k]);
  };
  walk(parseAst(read(EXPORTS_FILE), { lang: 'js' }).body);
}
const exported = new Set([...plain, ...live]);
for (const n of plain) if (live.has(n)) problems.push(`${n} is exported twice (Object.assign and defineProperties)`);
for (const n of exported) if (!topLevel.has(n)) problems.push(`${EXPORTS_FILE} exports ${n}, which is not a top-level declaration or import in app/main.js`);

// --- replaceable(): `export const NAME = replaceable('NAME', ...)` in a module (app/modules/replaceable.js) ---
// It defines window.NAME itself (a live accessor), so it is exported without being listed above.
const replaceableNames = new Map(); // name -> file
for (const f of walkFiles('app/modules', ['.js'])) {
  if (f === 'app/modules/replaceable.js') continue;
  for (const st of parseAst(read(f), { lang: 'js' }).body) {
    const d = st.type === 'ExportNamedDeclaration' && st.declaration?.type === 'VariableDeclaration' ? st.declaration.declarations[0] : null;
    if (!d || d.init?.type !== 'CallExpression' || d.init.callee.name !== 'replaceable') continue;
    const [arg] = d.init.arguments;
    if (d.id.name !== arg?.value) problems.push(`${f}: \`${d.id.name} = replaceable(${JSON.stringify(arg?.value)}, ...)\`: the window name must equal the const's name`);
    if (replaceableNames.has(d.id.name)) problems.push(`${d.id.name} is made replaceable twice: ${replaceableNames.get(d.id.name)}, ${f}`);
    replaceableNames.set(d.id.name, f);
  }
}
for (const n of replaceableNames.keys()) if (exported.has(n)) problems.push(`${EXPORTS_FILE} exports ${n}, which is replaceable() and defines window.${n} itself; delete it from the list`);

// --- what must be exported, and why ---
const need = new Map();
const needed = (name, why) => { if (topLevel.has(name) && !replaceableNames.has(name)) (need.get(name) || need.set(name, new Set()).get(name)).add(why); };

// inline handlers in index.html
for (const m of indexHtml().matchAll(/\bon[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) handlerTokens(m[1] ?? m[2]).forEach(t => needed(t, 'index.html handler'));

// strings (HTML built by app/modules and app/react) holding on*="..." handlers; string literals in app/react
const stringsOf = (file, lang) => {
  const out = [];
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'Literal' && typeof n.value === 'string') out.push(n.value);
    else if (n.type === 'TemplateLiteral') out.push(n.quasis.map(q => q.value.cooked ?? q.value.raw).join('\u0000'));
    for (const k in n) if (k !== 'type') walk(n[k]);
  };
  walk(parseAst(read(file), { lang }).body);
  return out;
};
const handlerRe = /\bon[a-z]+\s*=\s*(["'])([\s\S]*?)(?:\1|$)/g;
const reactFiles = walkFiles('app/react', ['.ts', '.tsx']);
for (const f of [...[ENTRY], ...walkFiles('app/modules', ['.js']), ...reactFiles]) {
  const lang = f.endsWith('.tsx') ? 'tsx' : f.endsWith('.ts') ? 'ts' : 'js';
  const strings = stringsOf(f, lang);
  for (const s of strings) for (const m of s.matchAll(handlerRe)) handlerTokens(m[2]).forEach(t => needed(t, `handler in a string, ${path.basename(f)}`));
  if (f.startsWith('app/react')) for (const s of strings) if (s.length > 1 && topLevel.has(s)) needed(s, `named in app/react, ${path.basename(f)}`);
}

// window.NAME in app/main.js and app/modules
for (const f of [...[ENTRY], ...walkFiles('app/modules', ['.js'])])
  for (const m of read(f).matchAll(/\b(?:window|globalThis)\.([A-Za-z_$][\w$]*)/g)) needed(m[1], `window.${m[1]} in ${path.basename(f)}`);

// what app/react types or reads off window: *Window / *Globals interfaces, `window as unknown as {...}`, w.NAME
for (const f of reactFiles) {
  const text = read(f);
  for (const m of text.matchAll(/(?:interface|type)\s+\w*(?:Window|Globals|Bridge|Requests|Inputs)\w*\b[^{=]*=?\s*\{([\s\S]*?)\n\}/g))
    for (const mm of m[1].matchAll(/^\s+(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*[:(<]/gm)) needed(mm[1], `window type in ${path.basename(f)}`);
  for (const m of text.matchAll(/window as unknown as \{([^}]*)\}/g))
    for (const mm of m[1].replace(/\{[^{}]*\}/g, '').matchAll(/([A-Za-z_$][\w$]*)\??\s*:/g)) needed(mm[1], `window cast in ${path.basename(f)}`);
  for (const m of text.matchAll(/\b(?:w|window)\.([A-Za-z_$][\w$]*)/g)) needed(m[1], `window.${m[1]} in ${path.basename(f)}`);
}

// KSMTest (tests/lib/ksm-test-api.js) reaches the app by bare names
const testApi = read('tests/lib/ksm-test-api.js');
{
  // Identifiers used as variables (not property names or object keys) in the test API.
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'Identifier') needed(n.name, 'KSMTest');
    if (n.type === 'MemberExpression') { walk(n.object); if (n.computed) walk(n.property); return; }
    if (n.type === 'Property' || n.type === 'MethodDefinition' || n.type === 'PropertyDefinition') { if (n.computed) walk(n.key); walk(n.value); return; }
    for (const k in n) if (k !== 'type') walk(n[k]);
  };
  walk(parseAst(testApi, { lang: 'js' }).body);
}

// Tests that wrap app functions by a name held in a string: window[f] = wrapped(window[f])
// (scheduleAutoSave, criticalAutoSave: tests/lib/ksm-test-api.js, the golden tests). The wrapper must
// reach the module's own calls, so these must be replaceable() or exported live.
const wrapped = new Set();
for (const f of ['tests/lib/ksm-test-api.js', ...fs.readdirSync(path.join(ROOT, 'tests')).filter(f => f.endsWith('.py')).map(f => `tests/${f}`)]) {
  const text = read(f);
  if (!text.includes('window[')) continue;
  for (const m of text.matchAll(/\[((?:\s*'\w+'\s*,?)+)\s*\]\s*\.forEach/g))
    for (const mm of m[1].matchAll(/'(\w+)'/g)) { needed(mm[1], `wrapped through window[...] in ${f}`); wrapped.add(mm[1]); }
}
// Bare names that tests/*.py scripts still use (ones tests/test-api-boundary-test.py does not catch).
needed('ksmQueuedSaveRetryTimer', 'clearTimeout(...) in tests/auth0-browser-test.py');

// --- which of them must be live accessors ---
const accessor = new Map();
const mustBeLive = (name, why) => { if (topLevel.has(name) && !replaceableNames.has(name)) (accessor.get(name) || accessor.set(name, new Set()).get(name)).add(why); };
// assigned after its declaration (shadowing local variables of the same name are over-counted, harmlessly)
{
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'AssignmentExpression') {
      const targets = [];
      const collect = p => { if (!p) return; if (p.type === 'Identifier') targets.push(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => collect(q.type === 'RestElement' ? q.argument : q.value)); else if (p.type === 'ArrayPattern') p.elements.forEach(collect); else if (p.type === 'AssignmentPattern') collect(p.left); else if (p.type === 'RestElement') collect(p.argument); };
      collect(n.left); targets.forEach(t => mustBeLive(t, 'assigned in app/main.js'));
    } else if (n.type === 'UpdateExpression' && n.argument.type === 'Identifier') mustBeLive(n.argument.name, 'assigned in app/main.js');
    for (const k in n) if (k !== 'type') walk(n[k]);
  };
  walk(parseAst(read(ENTRY), { lang: 'js' }).body.filter(st => !(st.type === 'ExpressionStatement' && st.expression.type === 'CallExpression' && st.expression.callee.object?.name === 'Object')));
}
for (const n of wrapped) mustBeLive(n, 'wrapped through window[...] in tests');
// Whatever a test wraps or replaces must be reachable AND swappable: replaceable(), or exported live.
for (const n of [...wrapped, ...[...testApi.matchAll(/\bset\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1])])
  if (!replaceableNames.has(n) && !live.has(n)) problems.push(`${n} is replaced or wrapped by a test but is neither replaceable() nor a live window export`);
for (const m of testApi.matchAll(/\bset\s+([A-Za-z_$][\w$]*)\s*\(/g)) mustBeLive(m[1], 'KSMTest setter');
for (const f of fs.readdirSync(path.join(ROOT, 'tests')).filter(f => f.endsWith('.py') || f.endsWith('.js') || f.endsWith('.mjs')))
  for (const m of read(path.join('tests', f)).matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) mustBeLive(m[1], `window.${m[1]} = in tests/${f}`);
for (const f of reactFiles) for (const m of read(f).matchAll(/\b(?:w|window|\w+Window\(\))\.([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) mustBeLive(m[1], `window.${m[1]} = in ${path.basename(f)}`);
// legacyStale.set('NAME', value) (app/react/shared/legacy.ts) assigns window.NAME.
for (const f of reactFiles) for (const m of read(f).matchAll(/\blegacyStale\.set\('([A-Za-z_$][\w$]*)'/g)) mustBeLive(m[1], `legacyStale.set('${m[1]}') in ${path.basename(f)}`);
// A const cannot be assigned: nothing to keep live.
for (const [n] of accessor) if (topLevel.get(n) === 'const' || topLevel.get(n) === 'class') accessor.delete(n);
// A module's `let` (the sync state, step 3d of #136) changes inside its module: exported to window, it is a live
// accessor (a value export would keep the first value). The entry cannot assign an imported binding, so when it is
// written from outside (a test, React) the accessor's setter calls the module's setter, `export function setNAME(value)`.
const moduleLets = new Map(); // name -> its setter's name, or null
for (const f of walkFiles('app/modules', ['.js'])) {
  const body = parseAst(read(f), { lang: 'js' }).body;
  const fns = new Set(body.filter(s => s.type === 'ExportNamedDeclaration' && s.declaration?.type === 'FunctionDeclaration').map(s => s.declaration.id.name));
  for (const s of body) if (s.type === 'ExportNamedDeclaration' && s.declaration?.type === 'VariableDeclaration' && s.declaration.kind === 'let')
    s.declaration.declarations.forEach(d => patternNames(d.id).forEach(n => { const set = 'set' + n[0].toUpperCase() + n.slice(1); moduleLets.set(n, fns.has(set) ? set : null); }));
}
const liveSetter = new Map(); // live accessor name -> the setter's code
{
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'defineProperties' && n.arguments[1]?.type === 'ObjectExpression')
      n.arguments[1].properties.forEach(p => { const set = p.value?.arguments?.[1]; liveSetter.set(p.key.name ?? p.key.value, set ? read(EXPORTS_FILE).slice(set.start, set.end) : null); });
    for (const k in n) if (k !== 'type') walk(n[k]);
  };
  walk(parseAst(read(EXPORTS_FILE), { lang: 'js' }).body);
}
for (const n of exported) if (topLevel.get(n) === 'import' && moduleLets.has(n)) mustBeLive(n, 'a module `let`, assigned inside its module');
// An imported name cannot be assigned from the entry (or through window): a test or React that replaces it
// (window.NAME = ..., a KSMTest setter) would never be seen by the module's own calls. Keep such a function
// made replaceable() (app/modules/replaceable.js) or exported live. A module `let` is written through its setter.
for (const [n, why] of accessor) {
  if (topLevel.get(n) !== 'import') continue;
  if (!moduleLets.has(n)) { problems.push(`${n} is imported from a module but is replaced from outside (${[...why][0]}); make it replaceable() (app/modules/replaceable.js) instead`); accessor.delete(n); continue; }
  const outside = [...why].filter(w => !w.startsWith('a module'));
  const set = moduleLets.get(n), code = liveSetter.get(n);
  if (outside.length && !set) problems.push(`${n} (a module \`let\`) is written from outside (${outside[0]}) but its module exports no set${n[0].toUpperCase() + n.slice(1)}(value)`);
  else if (outside.length && live.has(n) && !(code && new RegExp(`^v => \\{ ${set}\\(v\\); \\}$`).test(code))) problems.push(`${EXPORTS_FILE}: the live accessor of ${n} must write it through ${set}(v)`);
  else if (!outside.length && code) problems.push(`${EXPORTS_FILE}: ${n} is written only inside its module; its live accessor needs no setter`);
}

const missing = [...need.keys()].filter(n => !exported.has(n)).sort();
if (missing.length) problems.push(`not exported but reached from outside app.js (${missing.length}); add to ${EXPORTS_FILE}:\n    ` + missing.map(n => `${n}  <- ${[...need.get(n)][0]}`).join('\n    '));
const notLive = [...accessor.keys()].filter(n => exported.has(n) && !live.has(n)).sort();
if (notLive.length) problems.push(`exported by value but assigned after declaration or written from outside; export with a live accessor (${notLive.length}):\n    ` + notLive.map(n => `${n}  <- ${[...accessor.get(n)][0]}`).join('\n    '));
const needlessLive = [...live].filter(n => !accessor.has(n) && topLevel.get(n) !== undefined).sort();
if (needlessLive.length) problems.push(`live accessor for a name that is never assigned (export it by value): ${needlessLive.join(' ')}`);
// Unused exports are allowed (step 3d shrinks the list) but each must be a real declaration (checked above).

if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; }
else console.log(`window-exports: ${exported.size} names exported (${live.size} live), ${need.size} reached from outside the module, ${replaceableNames.size} replaceable() functions`);
