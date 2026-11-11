// The store in app.js (#15, docs/STORE.md section 5): storeBundle() in scripts/app-sources.mjs bundles app/store/index.ts
// and its packages on their own, tree-shaken and minified with NODE_ENV "production", and appBundle() puts that script
// into app.js as it is. A package upgrade or a new import that breaks this, brings back the development-only checks or
// makes it much bigger must fail here, by name.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { ROOT, STORE_ENTRY, STORE_GLOBAL, appBundle, storeBundle } from '../scripts/app-sources.mjs';

const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); };
const rel = f => path.relative(ROOT, f);

// --- package.json: Redux Toolkit pinned, one Immer (app/store/legacy.ts switches the auto-freeze of RTK's Immer) ---
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check(/^\d+\.\d+\.\d+$/.test(pkg.dependencies?.['@reduxjs/toolkit'] || ''), '@reduxjs/toolkit must be pinned to an exact version in package.json');
check(Boolean(pkg.dependencies?.immer), 'immer must be a dependency (app/store/legacy.ts imports setAutoFreeze)');
check(!fs.existsSync(path.join(ROOT, 'node_modules/@reduxjs/toolkit/node_modules/immer')), 'Redux Toolkit has its own copy of immer: setAutoFreeze() would switch the wrong one (align the immer range in package.json)');

// --- the store bundle: self-contained, production, small ---
const store = await storeBundle();
const gzip = zlib.gzipSync(store).length;
const GZIP_BUDGET = 9000; // 7.9 kB with Redux Toolkit 2.13 (2026-11-11); raise it only on purpose, old TVs pay for it
check(gzip <= GZIP_BUDGET, `the store bundle is ${gzip} bytes gzip, over the ${GZIP_BUDGET} budget`);
check(!/process\.env/.test(store), 'the store bundle still reads process.env (NODE_ENV was not defined)');
check(!/state mutation/i.test(store), 'the store bundle has Redux Toolkit\'s immutability check (a development build)');
check(!/sortComparer|selectId/.test(store), 'the store bundle has the entity adapter (tree-shaking failed)');

// Run it as app.js does: in production mode (not strict, Immer's auto-freeze off), every export of index.ts present.
const context = vm.createContext({ console });
vm.runInContext(`${store}\n;globalThis.out=${STORE_GLOBAL};`, context);
const mod = context.out;
const indexSource = fs.readFileSync(STORE_ENTRY, 'utf8');
const exported = [...indexSource.matchAll(/^export\s*\{([^}]*)\}\s*from/gm)].flatMap(m => m[1].split(',')).map(n => n.trim()).filter(Boolean);
check(exported.length > 10, `could not read the exports of ${rel(STORE_ENTRY)}`);
for (const name of exported) check(name in mod, `the store bundle does not export ${name}`);
if (!problems.length) {
  check(mod.PRODUCTION_BUILD === true, 'the store bundle is not the production build (PRODUCTION_BUILD)');
  check(mod.storeIsStrict() === false, 'the production store must not be strict');
  const s = mod.createKsmStore();
  s.dispatch(mod.legacyStateAssigned({ writes: [{ path: ['device', 'probe'], value: { n: 1 } }] }));
  check(s.getState().device.probe?.n === 1, 'a legacy write does not reach the store in the bundle');
  check(!Object.isFrozen(s.getState().device), 'production must not freeze store state (docs/STORE.md point 8)');
  mod.setStoreStrict(true);
  s.dispatch(mod.legacyStateAssigned({ writes: [{ path: ['device', 'probe'], value: { n: 2 } }] }));
  check(Object.isFrozen(s.getState().device), 'setStoreStrict(true) does not turn the freeze on in the bundle');
}

// --- app.js: the store script once, as it is; app code imports only app/store/index.ts ---
const app = await appBundle();
check(app.includes(store.trim()), 'app.js does not hold the store bundle as it is (re-printed or changed)');
check(app.split(`var ${STORE_GLOBAL}=`).length === 2, `app.js must define ${STORE_GLOBAL} once`);
check(!app.includes('"ksm:store"'), 'app.js still imports the store module');
const appFiles = [path.join(ROOT, 'app/main.js'), ...fs.readdirSync(path.join(ROOT, 'app/modules'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join(ROOT, 'app/modules', f))];
for (const file of appFiles) {
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/from\s*'([^']+)'/g)) {
    const target = path.resolve(path.dirname(file), m[1]);
    if (target.startsWith(path.join(ROOT, 'app/store') + path.sep) && target !== STORE_ENTRY) problems.push(`${rel(file)} imports ${m[1]}: app code imports only app/store/index.ts`);
    if (/^(@reduxjs|redux|immer|reselect)\b/.test(m[1])) problems.push(`${rel(file)} imports ${m[1]}: only app/store may`);
  }
}

if (problems.length) { console.log(`FAIL store bundle:\n  ${problems.join('\n  ')}`); process.exit(1); }
console.log(`PASS store bundle: ${store.length} bytes, ${gzip} gzip, inlined in app.js (${app.length} bytes)`);
