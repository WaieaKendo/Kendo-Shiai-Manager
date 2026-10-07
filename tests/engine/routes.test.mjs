// app/engine/routes.ts: the path URL scheme (M.9). Paths <-> routes, old query links -> paths,
// the old link parameters the classic code reads, and which page a path gets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  routePath, routeUrl, parseRoutePath, parseLegacyLink, resolveUrl, legacyQuery, servesAppShell, servesOverlay,
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
  for (const path of ['/', '/index.html', '/overlay', '/tournament', '/tv/a', '/t.html']) assert.deepEqual(parseRoutePath(path), { screen: 'home' }, path);
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
  for (const [pathname, search] of [['/', ''], ['/', '?court=B'], ['/', '?director=x'], ['/overlay', ''], ['/overlay', '?court=B'], ['/somewhere', '']]) {
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
