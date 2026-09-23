// Shared helpers for tests that inspect or execute pieces of the app's source.
//
// `html` is the app as ONE text, as public/index.html was before the Vite split:
// app/index.html with app/styles/*.css and app/js/*.js inlined in file-name order
// (scripts/app-sources.mjs). The code is the same text, in the same order, so grep
// checks, extractFunction (last declaration wins) and withDependencies still apply.
import fs from 'node:fs';
import { singleFileSource, serviceWorker } from '../../scripts/app-sources.mjs';

export const readRepoFile = rel => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
export const html = singleFileSource();
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

function definitionStarts(source, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g');
  return [...source.matchAll(re)].map(m => m.index);
}

// Extracts a named function declaration's source. The app redefines many
// functions later in the file to override earlier versions; the browser runs the
// LAST definition, so that is the default. Pass { occurrence: 'first' } for the original.
export function extractFunction(source, name, { occurrence = 'last' } = {}) {
  const starts = definitionStarts(source, name);
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

function topLevelConstants(source) {
  const map = new Map();
  for (const m of source.matchAll(/(?:^|[;\n}])\s*(const|let)\s+([A-Z][A-Z0-9_]+)\s*=/g)) {
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
      if (functions.has(name)) def = extractFunction(source, name);
      else if (constants.has(name)) def = constants.get(name);
      if (!def) continue;
      skipNames.add(name);
      added.push(def);
      queue.push(def);
    }
  }
  return [code, ...added].join('\n');
}
