// app/engine/routes.ts: the path URL scheme (M.9). Paths <-> routes, old query links -> paths,
// the old link parameters the classic code reads, and which page a path gets.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  RESERVED_SLUGS, isValidSlug, suggestSlug, routePath, routeUrl, parseRoutePath, parseLegacyLink, resolveUrl, legacyQuery, servesAppShell, servesOverlay,
} from '../../app/engine/routes.ts';

const ID = '3f1c2a9e-0b7d-4c55-9e21-7a6b5c4d3e2f';

test('routePath: one path per screen, lowercase court letters, the ID encoded', () => {
  assert.equal(routePath({ screen: 'home' }), '/');
  assert.equal(routePath({ screen: 'invalid' }), '/');
  assert.equal(routePath({ screen: 'tournament', id: ID }), `/t/${ID}`);
  assert.equal(routePath({ screen: 'live', id: ID }), `/t/${ID}/live`);
  assert.equal(routePath({ screen: 'court', id: ID, court: 'A' }), `/t/${ID}/court/a`);
  assert.equal(routePath({ screen: 'court', id: ID, court: 'B' }), `/t/${ID}/court/b`);
  assert.equal(routePath({ screen: 'tv', id: ID, court: 'B' }), `/t/${ID}/tv/b`);
  assert.equal(routePath({ screen: 'overlay', id: ID, court: 'A' }), `/t/${ID}/overlay/a`);
  assert.equal(routePath({ screen: 'tournament', id: 'a b/c?' }), '/t/a%20b%2Fc%3F');
});

test('routeUrl: query pairs encoded, empty ones left out', () => {
  assert.equal(routeUrl({ screen: 'tv', id: ID, court: 'A' }), `/t/${ID}/tv/a`);
  assert.equal(routeUrl({ screen: 'tv', id: ID, court: 'A' }, [['key', 'k&1'], ['role', ''], ['x', null]]), `/t/${ID}/tv/a?key=k%261`);
});

test('parseRoutePath: every route round-trips through routePath', () => {
  const routes = [
    { screen: 'tournament', id: ID }, { screen: 'live', id: ID },
    ...['court', 'tv', 'overlay'].flatMap(screen => ['A', 'B'].map(court => ({ screen, id: ID, court }))),
    { screen: 'tournament', id: 'a b/c?' },
  ];
  for (const route of routes) assert.deepEqual(parseRoutePath(routePath(route)), route, routePath(route));
});

test('parseRoutePath: short forms, uppercase and a trailing slash are accepted', () => {
  assert.deepEqual(parseRoutePath(`/t/${ID}/`), { screen: 'tournament', id: ID });
  assert.deepEqual(parseRoutePath(`/t/${ID}/court`), { screen: 'tournament', id: ID });
  assert.deepEqual(parseRoutePath(`/t/${ID}/tv`), { screen: 'tv', id: ID, court: 'A' });
  assert.deepEqual(parseRoutePath(`/t/${ID}/overlay/`), { screen: 'overlay', id: ID, court: 'A' });
  assert.deepEqual(parseRoutePath(`/t/${ID}/TV/B`), { screen: 'tv', id: ID, court: 'B' });
  assert.deepEqual(parseRoutePath(`/t/${ID}/Court/A/`), { screen: 'court', id: ID, court: 'A' });
  assert.deepEqual(parseRoutePath(`/t/${ID}/LIVE`), { screen: 'live', id: ID });
});

test('parseRoutePath: anything else under /t/ is invalid; other paths are home', () => {
  for (const path of ['/t', '/t/', '/t//court/a', `/t/${ID}/court/c`, `/t/${ID}/tv/ab`, `/t/${ID}/results`,
    `/t/${ID}/live/a`, `/t/${ID}/court/a/b`, `/t/${ID}//`, '/t/%E0%A4%A', `/t/${ID}/overlay/b/x`]) {
    assert.deepEqual(parseRoutePath(path), { screen: 'invalid' }, path);
  }
  for (const path of ['/', '/index.html', '/overlay', '/tv/a', '/t.html']) assert.deepEqual(parseRoutePath(path), { screen: 'home' }, path);
});

// Every old link form the app generated or accepted, with its new path.
const OLD_LINKS = [
  ['/', `?tournament=${ID}`, `/t/${ID}`],                                                    // Tournament Access, Copy Link, QR
  ['/', `?spectator=${ID}`, `/t/${ID}`],                                                     // the older spectator link
  ['/', `?tournament=${ID}&court=A`, `/t/${ID}/court/a`],                                   // a court device's link
  ['/', `?tournament=${ID}&court=b`, `/t/${ID}/court/b`],
  ['/', `?role=spectator&tournament=${ID}&court=A&view=tv`, `/t/${ID}/tv/a`],               // the TV menu
  ['/', `?role=spectator&tournament=${ID}&court=B&view=tv`, `/t/${ID}/tv/b`],
  ['/', `?tournament=${ID}&view=tv`, `/t/${ID}/tv/a`],                                      // no court: Court A
  ['/', `?role=spectator&tournament=${ID}&key=s3cret&court=B&view=tv`, `/t/${ID}/tv/b?key=s3cret`], // a key stays a query parameter
  ['/', `?role=director&tournament=${ID}&key=k`, `/t/${ID}?role=director&key=k`],         // roleLink(): role and key kept as they were
  ['/index.html', `?tournament=${ID}`, `/t/${ID}`],
  ['/', `?tournament=${ID}&court=x`, `/t/${ID}/court/a`],                                   // normalizeCourt(): not B is A
  ['/overlay', `?tournament=${ID}&court=A`, `/t/${ID}/overlay/a`],                          // the stream overlay
  ['/overlay', `?tournament=${ID}&court=B&red=left&pos=top&y=50&band=1&debug=1`, `/t/${ID}/overlay/b?red=left&pos=top&y=50&band=1&debug=1`],
  ['/overlay', `?tournament=${ID}`, `/t/${ID}/overlay/a`],
  ['/overlay.html', `?court=b&tournament=${ID}`, `/t/${ID}/overlay/b`],
];

test('resolveUrl: every old query link redirects to its path, other parameters kept as they were', () => {
  for (const [pathname, search, path] of OLD_LINKS) {
    const resolved = resolveUrl(pathname, search);
    assert.equal(resolved.redirect, path, pathname + search);
    const [newPath, newSearch = ''] = path.split('?');
    // The new address resolves to the same route, with nothing more to redirect.
    assert.deepEqual(resolveUrl(newPath, newSearch ? `?${newSearch}` : ''), { route: resolved.route, redirect: null }, path);
  }
});

test('resolveUrl: the old link parameters seen through legacyQuery() are what the old link said', () => {
  // What the classic code read from the old address (initializeCloudRoleFromUrl() of 33-,
  // KSM_TV_ASSIGNED_COURT, isTvSession(), pinnedCourt(), restoreAutoSaveIfWanted()).
  const read = (q, fixedCourt) => ({
    id: q.get('tournament') || q.get('spectator') || '',
    view: q.get('view') || '',
    // The court a link assigns ('' = the device's stored choice). A TV or overlay link always
    // assigns one: without &court= the old code used Court A, which .../tv/a, .../overlay/a now say.
    court: q.get('court') ? ((q.get('court') || '').toUpperCase() === 'B' ? 'B' : 'A') : fixedCourt || q.get('view') === 'tv' ? 'A' : '',
    tvCourt: (q.get('court') || 'A').toUpperCase() === 'B' ? 'B' : 'A',
    key: q.get('key'),
    red: q.get('red'),
  });
  for (const [pathname, search, path] of OLD_LINKS) {
    const [newPath, newSearch = ''] = path.split('?');
    const { route } = resolveUrl(newPath, newSearch ? `?${newSearch}` : '');
    const fixedCourt = pathname.startsWith('/overlay');
    assert.deepEqual(read(new URLSearchParams(legacyQuery(route, newSearch)), fixedCourt), read(new URLSearchParams(search), fixedCourt), path);
  }
});

test('resolveUrl: canonical paths stay; others are tidied, their query kept; invalid ones go home', () => {
  assert.deepEqual(resolveUrl(`/t/${ID}/court/a`, ''), { route: { screen: 'court', id: ID, court: 'A' }, redirect: null });
  assert.deepEqual(resolveUrl(`/t/${ID}/tv/b`, '?key=k'), { route: { screen: 'tv', id: ID, court: 'B' }, redirect: null });
  assert.equal(resolveUrl(`/t/${ID}/TV/B`, '?key=k').redirect, `/t/${ID}/tv/b?key=k`);
  assert.equal(resolveUrl(`/t/${ID}/tv`, '').redirect, `/t/${ID}/tv/a`);
  assert.equal(resolveUrl(`/t/${ID}/`, '?').redirect, `/t/${ID}`);
  assert.equal(resolveUrl(`/t/${ID}/court`, '').redirect, `/t/${ID}`);
  // A path wins over an old query that disagrees with it.
  assert.deepEqual(resolveUrl(`/t/${ID}/court/b`, '?tournament=other&court=A'), { route: { screen: 'court', id: ID, court: 'B' }, redirect: null });
  assert.equal(legacyQuery({ screen: 'court', id: ID, court: 'B' }, '?tournament=other&court=A'), `tournament=${ID}&court=B`);
  for (const path of ['/t', '/t/', `/t/${ID}/court/c`, `/t/${ID}/results`]) assert.deepEqual(resolveUrl(path, '?tournament=x'), { route: { screen: 'invalid' }, redirect: '/' }, path);
  // No tournament in the query: nothing to redirect (a local copy's ?court=B stays for the TV's court).
  for (const [pathname, search] of [['/', ''], ['/', '?court=B'], ['/', '?director=x'], ['/overlay', ''], ['/overlay', '?court=B']]) {
    assert.deepEqual(resolveUrl(pathname, search), { route: { screen: 'home' }, redirect: null }, pathname + search);
  }
  assert.equal(legacyQuery({ screen: 'home' }, '?court=B'), 'court=B');
});

test('legacyQuery: the old parameter names for each route', () => {
  assert.equal(legacyQuery({ screen: 'tournament', id: ID }, ''), `tournament=${ID}`);
  assert.equal(legacyQuery({ screen: 'live', id: ID }, ''), `tournament=${ID}`);
  assert.equal(legacyQuery({ screen: 'court', id: ID, court: 'B' }, ''), `tournament=${ID}&court=B`);
  assert.equal(legacyQuery({ screen: 'tv', id: ID, court: 'A' }, '?key=k'), `key=k&tournament=${ID}&court=A&view=tv`);
  assert.equal(legacyQuery({ screen: 'overlay', id: ID, court: 'B' }, '?red=left'), `red=left&tournament=${ID}&court=B`);
  assert.equal(new URLSearchParams(legacyQuery({ screen: 'tournament', id: 'a b&c' }, '')).get('tournament'), 'a b&c');
});

test('parseLegacyLink: null without a tournament', () => {
  assert.equal(parseLegacyLink('/', ''), null);
  assert.equal(parseLegacyLink('/', '?court=B&view=tv'), null);
  assert.equal(parseLegacyLink('/overlay', '?court=B'), null);
  assert.equal(parseLegacyLink('/', '?tournament='), null);
});

test('servesAppShell / servesOverlay: which page each path gets', () => {
  const app = ['/', '/index.html', `/t/${ID}`, `/t/${ID}/live`, `/t/${ID}/court/a`, `/t/${ID}/tv/b`, `/t/${ID}/tv`, `/t`, `/t/${ID}/nonsense`, `/t/${ID}/overlay/c`];
  const overlay = ['/overlay', `/t/${ID}/overlay/a`, `/t/${ID}/overlay/b`, `/t/${ID}/overlay`, `/t/${ID}/OVERLAY/B`];
  const neither = ['/overlay.html', '/app.js', '/assets/x.svg', '/api/tournaments', '/manifest.webmanifest', '/tv'];
  for (const p of app) assert.deepEqual([servesAppShell(p), servesOverlay(p)], [true, false], p);
  for (const p of overlay) assert.deepEqual([servesAppShell(p), servesOverlay(p)], [false, true], p);
  for (const p of neither) assert.deepEqual([servesAppShell(p), servesOverlay(p)], [false, false], p);
});

// The Worker and the service worker are plain scripts with their own copy of the rule; they must
// agree with routes.ts for every path.
const PATHS = ['/', '/index.html', '/overlay', '/overlay.html', '/app.js', '/api/tournaments', '/tv', '/t', '/t/', `/t/${ID}`, `/t/${ID}/`,
  `/t/${ID}/live`, `/t/${ID}/court/a`, `/t/${ID}/court/B`, `/t/${ID}/court`, `/t/${ID}/tv/b`, `/t/${ID}/tv`, `/t/${ID}/results`,
  `/t/${ID}/overlay/a`, `/t/${ID}/overlay/b/`, `/t/${ID}/overlay`, `/t/${ID}/Overlay/A`, `/t/${ID}/overlay/c`, `/t/${ID}/overlay/a/b`,
  '/lokt-2027','/lokt-2027/live','/lokt-2027/live/a','/lokt-2027/court/a','/lokt-2027/tv/b','/lokt-2027/overlay/a', '/api/court/a', '/privacy/live', '/t/%E0%A4%A/overlay/a', '/t//overlay/a', '/t/a%20b/overlay/b'];
const rule = (file, from, to) => {
  const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
  const code = source.slice(source.indexOf(from), source.indexOf(to));
  assert.ok(code.includes('function isOverlayPath'), `${file}: the overlay path rule`);
  const ctx = vm.createContext({});
  vm.runInContext(`${code}\nthis.isOverlayPath = isOverlayPath; this.servesAppShell = typeof servesAppShell === 'function' ? servesAppShell : null;`, ctx);
  return ctx;
};

test('src-worker.js serves the overlay page exactly for servesOverlay() paths under /t/', () => {
  const { isOverlayPath } = rule('src-worker.js', 'const OVERLAY_PATH', 'function safeRole');
  for (const p of PATHS) assert.equal(isOverlayPath(p), p.startsWith('/t') && servesOverlay(p), p);
});

test('app/service-worker.js serves the offline app exactly for servesAppShell() paths', () => {
  const { servesAppShell: sw } = rule('app/service-worker.js', 'const OVERLAY_PATH', "self.addEventListener('install'");
  for (const p of PATHS) assert.equal(sw(p), servesAppShell(p), p);
});

test('wrangler.jsonc sends /t/* to the Worker first (overlay paths), /api/* as before', () => {
  const wrangler = fs.readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(wrangler, /"run_worker_first": true/);
  assert.match(wrangler, /"not_found_handling": "single-page-application"/);
});

test('friendly routes use a slug without confusing IDs or reserved roots', () => {
  for (const suffix of ['', '/live', '/court/a', '/court/b', '/tv/a', '/tv/b', '/overlay/a', '/overlay/b']) {
    const route = parseRoutePath('/lokt-2027'+suffix);
    assert.equal(route.slug,'lokt-2027');
    assert.equal(routePath({...route,id:ID}),'/lokt-2027'+suffix);
    assert.equal(parseRoutePath('/t/lokt-2027'+suffix).slug,undefined);
  }
  for (const slug of ['api','privacy','overlay','assets','icons','index.html','service-worker.js','court','tv','live']) {
    assert.equal(parseRoutePath('/'+slug).screen,'home');
    assert.equal(servesAppShell('/'+slug),slug==='index.html');
  }
  for (const value of ['/foo--bar','/-foo','/foo-','/LOKT-2027','/a_b']) assert.equal(parseRoutePath(value).screen,'home');
  assert.equal(parseRoutePath('/lokt-2027/live/a').screen,'invalid');
  assert.equal(parseRoutePath('/lokt-2027/court/c').screen,'invalid');
});


test('slug suggestions preserve a named year, normalize names and avoid reserved roots', () => {
  assert.equal(suggestSlug('LOKT 2027','2026'),'lokt-2027');
  assert.equal(suggestSlug('Hawaiʻi Kendō Cup','2027'),'hawai-i-kendo-cup-2027');
  assert.equal(suggestSlug('LOKT','2027'),'lokt-2027');
  for (const name of RESERVED_SLUGS) assert.equal(isValidSlug(name),false,name);
  const {servesAppShell:sw}=rule('app/service-worker.js','const OVERLAY_PATH',"self.addEventListener('install'");
  for (const name of RESERVED_SLUGS) assert.equal(sw('/'+name),servesAppShell('/'+name),name);
});
