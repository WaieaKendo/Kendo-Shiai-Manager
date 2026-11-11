// Shared helpers for tests that inspect or execute pieces of the app's source.
//
// `html` is the app's source as ONE plain text (appSourceText() in scripts/app-sources.mjs): app/index.html,
// app/styles/*.css, app/modules/**/*.js and app/main.js exactly as they are on disk, no transform. The
// name is historic (it was index.html with everything inlined). Grep-style checks read it directly;
// extractFunction cuts one function declaration out of it (names are unique, see
// tests/no-duplicate-declarations-test.mjs) and withDependencies adds what that code calls, for tests
// that run the function in a vm with their own stubs (module-internal calls cannot be stubbed on an import).
//
// `engine` is app/engine as a classic IIFE, for those vm tests (see engineIife below). It is not part of `html`.
import fs from 'node:fs';
import path from 'node:path';
import { rolldown } from 'rolldown';
import { appSourceText, serviceWorker, ENGINE_DIR } from '../../scripts/app-sources.mjs';

export const readRepoFile = rel => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
export const html = appSourceText();

// The engine as a classic IIFE (`var KSMEngine = ...`) for the few tests that run code in a vm next to the
// engine (the pre-move parity tests in tests/engine and withDependencies below): a vm context cannot import,
// and handing it the engine namespace instead would mix realms (arrays/objects of two contexts in deepEqual).
// Only tests use it; the app imports the engine and the build bundles it.
async function engineIife() {
  const bundle = await rolldown({ input: path.join(ENGINE_DIR, 'index.ts'), logLevel: 'silent' });
  try {
    const { output } = await bundle.generate({ format: 'iife', name: 'KSMEngine', minify: false });
    return output[0].code;
  } finally { await bundle.close(); }
}
export const engine = await engineIife();
export const worker = readRepoFile('src-worker.js');
export const sw = serviceWorker();
export const pkg = JSON.parse(readRepoFile('package.json'));

// Characters/keywords after which a `/` starts a regex literal rather than division.
const REGEX_PREFIX = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\breturn|\btypeof|\bcase|\bin|\bof|\bvoid|\bdelete|\bnew|\bthrow|\belse|\bdo)\s*$/;

// Returns the index just past the construct that starts at `i` (string, template,
// comment, regex) or i+1 for any other character. Template literals recurse into
// `${ ... }` so braces inside them do not affect the caller's depth.
function skip(src, i) {
  const ch = src[i], next = src[i + 1];
  if (ch === '/' && next === '/') { const end = src.indexOf('\n', i); return end < 0 ? src.length : end; }
  if (ch === '/' && next === '*') { const end = src.indexOf('*/', i + 2); return end < 0 ? src.length : end + 2; }
  if (ch === '"' || ch === "'") {
    for (let j = i + 1; j < src.length; j++) {
      if (src[j] === '\\') { j++; continue; }
      if (src[j] === ch || src[j] === '\n') return j + 1;
    }
    return src.length;
  }
  if (ch === '`') {
    for (let j = i + 1; j < src.length; j++) {
      if (src[j] === '\\') { j++; continue; }
      if (src[j] === '`') return j + 1;
      if (src[j] === '$' && src[j + 1] === '{') j = matchBrace(src, j + 1) - 1;
    }
    return src.length;
  }
  if (ch === '/' && REGEX_PREFIX.test(src.slice(Math.max(0, i - 12), i))) {
    let inClass = false;
    for (let j = i + 1; j < src.length; j++) {
      const c = src[j];
      if (c === '\\') { j++; continue; }
      if (c === '\n') return i + 1; // not a regex after all
      if (c === '[') inClass = true; else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { j++; while (/[a-z]/i.test(src[j] || '')) j++; return j; }
    }
  }
  return i + 1;
}

// `open` is the index of a `{`; returns the index just past its matching `}`.
function matchBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length;) {
    const ch = src[i];
    if (ch === '{') { depth++; i++; continue; }
    if (ch === '}') { depth--; i++; if (depth === 0) return i; continue; }
    i = skip(src, i);
  }
  throw new Error('Unbalanced braces');
}

let cachedComments=null;
function definitionStarts(source, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g');
  if(cachedComments?.source!==source){
    const spans=[];
    for(let i=0;i<source.length;){
      const end=skip(source,i);
      if(source.startsWith('/*',i)||source.startsWith('//',i))spans.push([i,end]);
      i=end;
    }
    cachedComments={source,spans};
  }
  return [...source.matchAll(re)].filter(m=>!cachedComments.spans.some(([a,b])=>m.index>=a&&m.index<b)).map(m=>m.index);
}

// Extracts a named function declaration's source. The app redefines many
// functions later in the file to override earlier versions; the browser runs the
// LAST definition, so that is the default. Pass { occurrence: 'first' } for the original.
// A replaceable function (step 4d of #136, app/modules/replaceable.js) keeps its code in `function NAMEImpl(...)`
// and exports `const NAME = replaceable('NAME', NAMEImpl)`: when `function NAME(` is not found, the Impl is cut out
// and renamed to NAME, so a test runs the real code under the name it always used.
export function extractFunction(source, name, { occurrence = 'last' } = {}) {
  let starts = definitionStarts(source, name);
  if (!starts.length && definitionStarts(source, `${name}Impl`).length)
    return extractFunction(source, `${name}Impl`, { occurrence }).replace(`function ${name}Impl(`, `function ${name}(`);
  if (!starts.length) throw new Error(`Missing function ${name}`);
  const start = occurrence === 'first' ? starts[0] : starts[starts.length - 1];
  // Skip the parameter list (it may contain default values with braces/strings).
  let i = source.indexOf('(', start), depth = 0;
  for (; i < source.length;) {
    const ch = source[i];
    if (ch === '(') { depth++; i++; continue; }
    if (ch === ')') { depth--; i++; if (depth === 0) break; continue; }
    if (ch === '{') { i = matchBrace(source, i); continue; }
    i = skip(source, i);
  }
  const brace = source.indexOf('{', i);
  try {
    return source.slice(start, matchBrace(source, brace));
  } catch {
    throw new Error(`Unbalanced function ${name}`);
  }
}

export function countDefinitions(source, name) { return definitionStarts(source, name).length; }

// ---------------------------------------------------------------------------
// Dependency resolution for vm-based behaviour tests.
//
// withDependencies(html, code, { exclude }) returns `code` followed by the
// definitions of every app function / top-level UPPER_CASE constant it
// references (transitively) that `code` does not define itself. Names in
// `exclude` (e.g. functions the test stubs on its vm context) are never pulled in.
// A reference to KSMEngine pulls in the engine script (`engine`, above).

function topLevelConstants(source) {
  const map = new Map();
  for (const m of source.matchAll(/(?:^|[;\n}])\s*(?:export\s+)?(const|let)\s+([A-Z][A-Z0-9_]+)\s*=/g)) {
    const start = m.index + m[0].indexOf(m[1]);
    let i = start + m[0].length - m[0].indexOf(m[1]), depth = 0;
    for (; i < source.length;) {
      const ch = source[i];
      if ('([{'.includes(ch)) { depth++; i++; continue; }
      if (')]}'.includes(ch)) { depth--; i++; continue; }
      if (depth === 0 && (ch === ';' || ch === '\n')) break;
      i = skip(source, i);
    }
    if (!map.has(m[2])) map.set(m[2], source.slice(start, i) + ';');
  }
  return map;
}

let cachedIndex = null;
function definitionIndex(source) {
  if (cachedIndex?.source === source) return cachedIndex;
  const functions = new Set([...source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
  cachedIndex = { source, functions, constants: topLevelConstants(source) };
  return cachedIndex;
}

function definedIn(code) {
  const names = new Set();
  for (const m of code.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
  return names;
}

export function withDependencies(source, code, { exclude = [] } = {}) {
  const { functions, constants } = definitionIndex(source);
  const skipNames = new Set([...exclude, ...definedIn(code)]);
  const added = [];
  const queue = [code];
  while (queue.length) {
    const text = queue.shift();
    for (const [, name] of text.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\b/g)) {
      if (skipNames.has(name)) continue;
      let def = null;
      if (name === 'KSMEngine') def = engine;
      else if (functions.has(name)) def = extractFunction(source, name);
      else if (constants.has(name)) def = constants.get(name);
      if (!def) continue;
      skipNames.add(name);
      added.push(def);
      // The engine is self-contained; its own function names are not app dependencies.
      if (def !== engine) queue.push(def);
    }
  }
  return [code, ...added].join('\n');
}
