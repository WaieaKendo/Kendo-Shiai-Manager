// Path URLs (app/modules/links/path-urls.js, step 4a of #136). This runs first in the entry, after the imports:
// the address rewrite and the explicit-spectator flag are taken before any other load-time code reads the address.
initPathUrls();
