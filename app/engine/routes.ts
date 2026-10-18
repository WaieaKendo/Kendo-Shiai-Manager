// Path URLs (roadmap M.9): the one place that knows the URL scheme. Pure string logic (no DOM,
// no URL/URLSearchParams, so it fits the engine's tsconfig): the classic app reaches it as
// KSMEngine.* (app/js/00-path-urls.js), the overlay page imports it.
//
//   /                          Tournament Library (home)
//   /t/<id>                    a tournament link: Live Scores as a spectator, on the court this
//                              device chose before (old ?tournament=<id>, ?spectator=<id>)
//   /t/<id>/live               the same, named (Live Scores)
//   /t/<id>/court/a|b          a court device's link: as /t/<id>, assigned Court A/B
//                              (old ?tournament=<id>&court=A)
//   /t/<id>/tv/a|b             TV display for Court A/B (old ?role=spectator&tournament=<id>&court=A&view=tv)
//   /t/<id>/overlay/a|b        stream overlay, app/overlay.html (old /overlay?tournament=<id>&court=A);
//                              its options (red, pos, y, band, debug) stay query parameters
//
// Court letters are lowercase in paths. Any other query parameter (e.g. key=) is kept as it
// was. /t/<id>/tv and /t/<id>/overlay mean Court A (as the old links without &court= did),
// /t/<id>/court means /t/<id>; uppercase letters and a trailing slash are tidied. Any other
// /t/... path is invalid: the app shows the Tournament Library (as for an unknown tournament).

import { isValidSlug } from '../slug-rules.mjs';
export { isValidSlug, suggestSlug, RESERVED_SLUGS } from '../slug-rules.mjs';

export type RouteCourt = 'A' | 'B';
export type Route = (
  | { screen: 'home' }
  | { screen: 'tournament'; id: string }
  | { screen: 'live'; id: string }
  | { screen: 'overview' | 'results' | 'setup' | 'registration' | 'pools'; id: string }
  | { screen: 'court'; id: string; court: RouteCourt }
  | { screen: 'tv'; id: string; court: RouteCourt }
  | { screen: 'overlay'; id: string; court: RouteCourt }
  | { screen: 'invalid' }) & { slug?: string };

export interface ResolvedUrl {
  route: Route;
  /** Where the address bar should go instead (history.replaceState), or null when it is right. */
  redirect: string | null;
}

/** Old link parameters that a path now carries. */
const LINK_KEYS = ['tournament', 'spectator', 'court', 'view'];
const OVERLAY_KEYS = ['tournament', 'court'];

const courtLetter = (court: RouteCourt): string => court.toLowerCase();
/** The old links' court rule (normalizeCourt()): B, case-insensitive, is Court B; anything else Court A. */
const legacyCourt = (value: string | null): RouteCourt => (value || '').toUpperCase() === 'B' ? 'B' : 'A';

/** The path of a route, e.g. /t/abc/court/a. */
export function routePath(route: Route): string {
  if (route.screen === 'home' || route.screen === 'invalid') return '/';
  const base = route.slug && isValidSlug(route.slug) ? `/${route.slug}` : `/t/${encodeURIComponent(route.id)}`;
  switch (route.screen) {
    case 'tournament': return base;
    case 'live': case 'overview': case 'results': case 'setup': case 'registration': case 'pools': return `${base}/${route.screen}`;
    default: return `${base}/${route.screen}/${courtLetter(route.court)}`;
  }
}

/** routePath() with a query string (pairs whose value is null or empty are left out). */
export function routeUrl(route: Route, query: ReadonlyArray<readonly [string, string | null | undefined]> = []): string {
  const parts = query.filter(([, v]) => v != null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return routePath(route) + (parts.length ? `?${parts.join('&')}` : '');
}

function decode(part: string): string | null {
  try { return decodeURIComponent(part); } catch { return null; }
}
function decodeQuery(part: string): string {
  const plus = part.replace(/\+/g, ' ');
  try { return decodeURIComponent(plus); } catch { return plus; }
}

interface QueryPair { key: string; value: string; raw: string }
function queryPairs(search: string): QueryPair[] {
  return search.replace(/^\?/, '').split('&').filter(Boolean).map(raw => {
    const at = raw.indexOf('=');
    return at < 0 ? { key: decodeQuery(raw), value: '', raw } : { key: decodeQuery(raw.slice(0, at)), value: decodeQuery(raw.slice(at + 1)), raw };
  });
}
/** URLSearchParams.get(): the first value of `key`, or null. */
function queryGet(pairs: QueryPair[], key: string): string | null {
  return pairs.find(p => p.key === key)?.value ?? null;
}
/** The query without `keys`, other parameters exactly as they were ('' or '?a=1&b=2'). */
function queryWithout(pairs: QueryPair[], keys: readonly string[], drop: (p: QueryPair) => boolean = () => false): string {
  const rest = pairs.filter(p => !keys.includes(p.key) && !drop(p)).map(p => p.raw);
  return rest.length ? `?${rest.join('&')}` : '';
}

/**
 * A path under /t/: the route, or invalid. Not under /t/ (/, /index.html, /overlay, anything
 * else the host answers with a page): home.
 */
export function parseRoutePath(pathname: string): Route {
  if (pathname !== '/t' && !pathname.startsWith('/t/')) {
    const [slug, ...rest] = pathname.slice(1).replace(/\/$/, '').split('/');
    if (!slug || !isValidSlug(slug)) return { screen: 'home' };
    const route = parseRoutePath(`/t/${slug}${rest.length ? '/' + rest.join('/') : ''}`);
    return route.screen === 'home' || route.screen === 'invalid' ? route : {...route, slug};
  }
  const segments = pathname.slice(3).replace(/\/$/, '').split('/');
  const rawId = segments[0] ?? '';
  const id = rawId ? decode(rawId) : null;
  if (!id) return { screen: 'invalid' };
  const [, kind, letter, ...extra] = segments;
  if (extra.length) return { screen: 'invalid' };
  if (kind === undefined) return letter === undefined ? { screen: 'tournament', id } : { screen: 'invalid' };
  const lower = kind.toLowerCase();
  if (['live','overview','results','setup','registration','pools'].includes(lower)) return letter === undefined ? { screen: lower as 'live' | 'overview' | 'results' | 'setup' | 'registration' | 'pools', id } : { screen: 'invalid' };
  if (lower === 'court' && letter === undefined) return { screen: 'tournament', id };
  if (lower !== 'court' && lower !== 'tv' && lower !== 'overlay') return { screen: 'invalid' };
  const screen = lower as 'court' | 'tv' | 'overlay';
  const court = letter === undefined ? 'a' : letter.toLowerCase();
  if (court !== 'a' && court !== 'b') return { screen: 'invalid' };
  return { screen, id, court: court === 'b' ? 'B' : 'A' };
}

/** An old query link (?tournament=..., /overlay?tournament=...): its route and the query left over. */
export function parseLegacyLink(pathname: string, search: string): { route: Route; rest: string } | null {
  const pairs = queryPairs(search);
  if (pathname === '/overlay' || pathname === '/overlay.html') {
    const id = queryGet(pairs, 'tournament');
    if (!id) return null;
    return { route: { screen: 'overlay', id, court: legacyCourt(queryGet(pairs, 'court')) }, rest: queryWithout(pairs, OVERLAY_KEYS) };
  }
  // initializeCloudRoleFromUrl() (33-): ?tournament= or the older ?spectator=; any role opens as a
  // spectator, so role=spectator says nothing a path does not. Other parameters (key=) stay.
  const id = queryGet(pairs, 'tournament') || queryGet(pairs, 'spectator');
  if (!id) return null;
  const rest = queryWithout(pairs, LINK_KEYS, p => p.key === 'role' && p.value === 'spectator');
  const court = queryGet(pairs, 'court');
  if (queryGet(pairs, 'view') === 'tv') return { route: { screen: 'tv', id, court: legacyCourt(court) }, rest };
  if (court) return { route: { screen: 'court', id, court: legacyCourt(court) }, rest };
  return { route: { screen: 'tournament', id }, rest };
}

/**
 * What a page address means. A /t/ path wins; otherwise an old query link is turned into its
 * path (redirect). A path that is not written the canonical way is tidied (redirect); an
 * invalid one goes to / (its query dropped).
 */
export function resolveUrl(pathname: string, search: string): ResolvedUrl {
  const route = parseRoutePath(pathname);
  if (route.screen === 'invalid') return { route, redirect: '/' };
  if (route.screen !== 'home') {
    const canonical = routePath(route);
    return { route, redirect: canonical === pathname ? null : canonical + (search === '?' ? '' : search) };
  }
  const legacy = parseLegacyLink(pathname, search);
  if (legacy) return { route: legacy.route, redirect: routePath(legacy.route) + legacy.rest };
  return { route, redirect: null };
}

/**
 * The query the old links had for this route, for the classic app's code that still reads
 * link parameters by their old names (tournament, court, view): new URLSearchParams() of it
 * answers as the old address did. Other parameters of `search` come first, as they are.
 * Home and invalid routes return `search` unchanged (e.g. ?court=B on a local copy).
 */
export function legacyQuery(route: Route, search: string): string {
  if (route.screen === 'home' || route.screen === 'invalid') return search.replace(/^\?/, '');
  const keys = route.screen === 'overlay' ? OVERLAY_KEYS : LINK_KEYS;
  const parts = queryPairs(search).filter(p => !keys.includes(p.key)).map(p => p.raw);
  parts.push(`tournament=${encodeURIComponent(route.id)}`);
  if (route.screen === 'court' || route.screen === 'tv' || route.screen === 'overlay') parts.push(`court=${route.court}`);
  if (['tv','overview','results','setup','registration','pools'].includes(route.screen)) parts.push(`view=${route.screen}`);
  return parts.join('&');
}

/**
 * Whether the app (index.html) answers this path. The service worker serves its offline copy for
 * these navigations; the overlay (and every other page) is left to the network.
 */
export function servesAppShell(pathname: string): boolean {
  if (pathname === '/' || pathname === '/index.html') return true;
  const route = parseRoutePath(pathname);
  return route.screen !== 'overlay' && (pathname === '/t' || pathname.startsWith('/t/') || (route.screen !== 'home' && route.screen !== 'invalid'));
}

/** Whether the host answers this path with the overlay page (app/overlay.html). */
export function servesOverlay(pathname: string): boolean {
  return pathname === '/overlay' || parseRoutePath(pathname).screen === 'overlay';
}
