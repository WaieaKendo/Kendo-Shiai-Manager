// App pages, static roots and device routes cannot be claimed as tournament names.
export const RESERVED_SLUGS = ['api', 't', 'privacy', 'overlay', 'assets', 'icons', 'index.html',
  'index', 'app', 'app.js', 'app.css', 'engine.js', 'service-worker.js', 'manifest.webmanifest',
  'favicon.ico', 'robots.txt', 'court', 'tv', 'live', 'overview', 'results', 'setup', 'registration', 'pools', 'react', 'styles', 'js', 'public', '.well-known'];
export function isValidSlug(value) {
  return value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && !RESERVED_SLUGS.includes(value);
}
export function suggestSlug(name, year) {
  const stem = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = /^\d{4}$/.test(year) && !/(?:^|-)(?:19|20)\d{2}(?:-|$)/.test(stem) ? `-${year}` : '';
  const result = (stem.slice(0, 70).replace(/-$/, '') || 'tournament') + suffix;
  return isValidSlug(result) ? result : `tournament-${result}`.slice(0, 80);
}

