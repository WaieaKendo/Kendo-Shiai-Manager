import { printDocumentPage } from './app/print-documents.mjs';
// The release version is written only in package.json; wrangler (esbuild) bundles it in at deploy
// time, Node reads it directly in the tests. Only .version is used (/api/health).
import packageJson from './package.json' with { type: 'json' };
import { isValidSlug, suggestSlug } from './app/slug-rules.mjs';
const APP_VERSION = packageJson.version;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const VALID_ROLES = new Set(['spectator', 'staff']);

// #95: tournament saves need a client that understands the saved format (team divisions). Every save
// sends x-ksm-client-schema; an older app (no header, or a lower number) is refused with 426, so a tablet
// left open on an old build cannot rewrite a newer tournament. Its unsaved work stays queued on the
// device and is sent after the page is reloaded. Raise both numbers together when the format changes.
const MIN_CLIENT_SCHEMA = 2;
function outdatedClient(request) {
  if (Number(request.headers.get('x-ksm-client-schema') || 0) >= MIN_CLIENT_SCHEMA) return null;
  return json({ error: 'This device runs an older version of Kendo Shiai Manager. Reload the page to update it, then save again.', code: 'client-outdated' }, 426);
}
function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}
async function sha256Hex(value) { const data = new TextEncoder().encode(String(value || '')); const digest = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join(''); }
// Staff password hash (issue #9): PBKDF2-SHA256 with a random 16-byte salt per tournament, stored
// as "pbkdf2-sha256$<iterations>$<salt base64>$<hash base64>". 20,000 iterations (about 2 ms) keep a
// login well inside the Workers Free plan's 10 ms CPU budget; 100,000 is the most Workers' WebCrypto
// allows (it refuses more) and is still accepted from storage. Cost: docs/DEPLOYMENT.md.
// Tournaments created before this stored an unsalted SHA-256 hex digest: it is still accepted
// and replaced by the PBKDF2 format at the next correct password.
const PBKDF2_PREFIX = 'pbkdf2-sha256';
const PBKDF2_ITERATIONS = 20000;
const PBKDF2_MAX_ITERATIONS = 100000;
function toBase64(bytes) { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text); }
function fromBase64(text) { const raw = atob(text); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
function sameBytes(a, b) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; return diff === 0; }
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
async function hashStaffPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(await pbkdf2(String(password), salt, PBKDF2_ITERATIONS))}`;
}
// Checks a password against the stored hash. { ok, rehash }: rehash when the stored format is the
// old SHA-256 one (or fewer iterations than today's). A missing or malformed hash never matches.
async function checkStaffPasswordHash(password, stored) {
  if (!password || !stored || typeof stored !== 'string') return { ok: false };
  if (!stored.startsWith(`${PBKDF2_PREFIX}$`)) return { ok: await sha256Hex(password) === stored, rehash: true };
  const [, count, saltText, hashText, extra] = stored.split('$');
  const iterations = Number(count);
  if (extra !== undefined || !Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_MAX_ITERATIONS) return { ok: false };
  let salt, expected;
  try { salt = fromBase64(saltText || ''); expected = fromBase64(hashText || ''); } catch (_) { return { ok: false }; }
  if (!salt.length || expected.length !== 32) return { ok: false };
  return { ok: sameBytes(await pbkdf2(password, salt, iterations), expected), rehash: iterations < PBKDF2_ITERATIONS };
}
// Path URLs (M.9, the scheme in app/engine/routes.ts): /t/<id>/overlay[/a|b] is the stream overlay
// page (app/overlay.html, which the assets serve at /overlay); every other /t/... path is the app
// (the assets' single-page fallback: index.html). wrangler.jsonc sends /t/* here first.
// tests/engine/routes.test.mjs checks this rule against routes.ts servesOverlay().
const OVERLAY_PATH = /^\/t\/([^/]+)\/overlay(?:\/[ab])?\/?$/i;
function isOverlayPath(pathname) {
  const match = OVERLAY_PATH.exec(pathname);
  if (!match) return false;
  try { return Boolean(decodeURIComponent(match[1])); } catch (_) { return false; }
}
// Staff password attempt limit (issue #9): wrong staff passwords count per tournament; from the
// 5th in a row the tournament refuses password attempts for 30 s, doubling with every further
// wrong one up to 15 min (HTTP 429 with Retry-After). A correct password resets the count.
// Spectators never send a password and are not affected.
const STAFF_LOCKOUT_THRESHOLD = 5;
const STAFF_LOCKOUT_BASE_MS = 30 * 1000;
const STAFF_LOCKOUT_MAX_MS = 15 * 60 * 1000;
function staffLockoutMs(failures) {
  if (failures < STAFF_LOCKOUT_THRESHOLD) return 0;
  return Math.min(STAFF_LOCKOUT_BASE_MS * 2 ** Math.min(failures - STAFF_LOCKOUT_THRESHOLD, 20), STAFF_LOCKOUT_MAX_MS);
}
function waitText(seconds) {
  if (seconds < 90) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minutes`;
}
function lockedOut(retryAfterMs) {
  const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return { ok: false, status: 429, headers: { 'retry-after': String(retryAfter) },
    body: { error: `Too many incorrect Staff passwords. Try again in ${waitText(retryAfter)}.`, code: 'staff-locked', retryAfter } };
}
// Staff session tokens (issue #9): a correct Staff Login (POST /auth) or creating a tournament
// returns a random token; devices send it instead of the password (x-ksm-session-key, the live
// connection's key). Only its SHA-256 is stored, with an expiry 24 h after its last use (sliding;
// refreshed at most every 10 min); at most 50 are kept per tournament (the least recently used
// goes first). Setting the password revokes them all. A token-shaped key that is unknown or
// expired gets 401 session-expired and is not a password attempt.
const STAFF_TOKEN_PREFIX = 'ksmst_';
const STAFF_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const STAFF_SESSION_REFRESH_MS = 10 * 60 * 1000;
const STAFF_SESSION_MAX = 50;
function newStaffToken() {
  return STAFF_TOKEN_PREFIX + toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function denied(result) { return json(result.body, result.status, result.headers || {}); }
function safeRole(value) { return VALID_ROLES.has(value) ? value : 'spectator'; }
function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const clean = structuredClone(payload);
  if (clean.setup && typeof clean.setup === 'object') delete clean.setup.tournamentLogo;
  return clean;
}
function workerMatchRequiresWinner(match) {
  return Boolean(match && ((match.championship && match.type === 'individual') || match.type === 'teamPlayoff' || match.type === 'exhibition' || match.requiresWinner === true));
}
function validateTournamentPayload(payload) {
  const allMatches = payload?.state?.allMatches;
  if (!allMatches || typeof allMatches !== 'object') return null;
  for (const [division, matches] of Object.entries(allMatches)) {
    if (!Array.isArray(matches)) return { division, reason: 'allMatches division is not an array' };
    const invalidIndex = matches.findIndex(match => !match || typeof match !== 'object' || Array.isArray(match));
    if (invalidIndex >= 0) return { division, index: invalidIndex, reason: 'invalid/null match entry' };
    for (let index = 0; index < matches.length; index++) {
      const match = matches[index];
      if (!match.done || !workerMatchRequiresWinner(match)) continue;
      const recorded = match.completedResult?.winner;
      const snapshotWp = Array.isArray(match.completedResult?.wp) ? match.completedResult.wp.length : null;
      const snapshotRp = Array.isArray(match.completedResult?.rp) ? match.completedResult.rp.length : null;
      if (recorded === 'Hikiwake') return { division, index, reason: 'completed winner-required match cannot be Hikiwake' };
      if (recorded === match.white || recorded === match.red) {
        if (snapshotWp !== null && snapshotRp !== null) {
          const consistent = recorded === match.white ? snapshotWp > snapshotRp : snapshotRp > snapshotWp;
          if (!consistent) return { division, index, reason: 'completedResult winner/score mismatch' };
        }
        continue;
      }
      const wp = Array.isArray(match.wp) ? match.wp.length : 0;
      const rp = Array.isArray(match.rp) ? match.rp.length : 0;
      if (wp === rp) return { division, index, reason: 'completed winner-required match has no identifiable winner' };
    }
  }
  return null;
}
function tournamentGone(deletedAt, extra = {}) {
  return json({ error: 'Tournament deleted', code: 'tournament-deleted', deletedAt, ...extra }, 410);
}
function publicRecord(record) {
  if (!record) return null;
  const { credentials, ...safe } = record;
  return safe;
}

export class TournamentState {
  constructor(state, env) { this.state = state; this.env = env; }

  library() { return this.env.TOURNAMENTS.get(this.env.TOURNAMENTS.idFromName('__ksm_library__')); }
  async claimSlug(id, slug, automatic = false) {
    return this.library().fetch(new Request('https://durable-object/library/slug', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({id, slug, automatic})
    }));
  }

  async staffPasswordHash() { return (await this.state.storage.get('staffPasswordHash')) || ''; }
  now() { return Date.now(); }
  async verifyStaffPassword(password) {
    const stored = await this.staffPasswordHash();
    // Devices on the previous app send the password with every save (the rollout fallback): the
    // last correct one is remembered in memory (a digest bound to the stored hash), so those saves
    // do not each pay the slow hash.
    if (password && stored && this.verifiedPassword === await sha256Hex(`${stored}\n${password}`)) return true;
    const result = await checkStaffPasswordHash(password, stored);
    if (!result.ok) return false;
    let current = stored;
    // The transparent upgrade: an old SHA-256 hash is replaced by a PBKDF2 one of the same password.
    if (result.rehash) { current = await hashStaffPassword(password); await this.state.storage.put('staffPasswordHash', current); }
    this.verifiedPassword = await sha256Hex(`${current}\n${password}`);
    return true;
  }
  // Sets the staff password (tournament creation; any future password change): revokes every
  // staff session token.
  async setStaffPassword(password, storage = this.state.storage) {
    this.verifiedPassword = null;
    await storage.put('staffPasswordHash', await hashStaffPassword(password));
    await storage.delete('staffSessions');
  }
  async issueStaffSession(storage = this.state.storage) {
    const token = newStaffToken();
    const id = await sha256Hex(token);
    const now = this.now();
    const sessions = (await storage.get('staffSessions')) || {};
    const kept = Object.entries(sessions)
      .filter(([, entry]) => entry && entry.expiresAt > now)
      .sort((a, b) => b[1].lastUsedAt - a[1].lastUsedAt)
      .slice(0, STAFF_SESSION_MAX - 1);
    const next = Object.fromEntries(kept);
    next[id] = { createdAt: now, lastUsedAt: now, expiresAt: now + STAFF_SESSION_TTL_MS };
    await storage.put('staffSessions', next);
    return { token, expiresAt: new Date(now + STAFF_SESSION_TTL_MS).toISOString() };
  }
  async checkStaffSession(token) {
    const id = await sha256Hex(token);
    const now = this.now();
    const sessions = (await this.state.storage.get('staffSessions')) || {};
    const entry = sessions[id];
    if (!entry || !(entry.expiresAt > now)) {
      // An expired token is dropped, with every other expired one.
      if (entry) await this.state.storage.put('staffSessions', Object.fromEntries(Object.entries(sessions).filter(([, other]) => other && other.expiresAt > now)));
      return false;
    }
    if (now - entry.lastUsedAt >= STAFF_SESSION_REFRESH_MS) {
      sessions[id] = { ...entry, lastUsedAt: now, expiresAt: now + STAFF_SESSION_TTL_MS };
      await this.state.storage.put('staffSessions', sessions);
    }
    return true;
  }
  // One staff password attempt, counted against the attempt limit. Attempts run one at a time
  // (this.staffAttempts chains them): checks of the slow hash would otherwise overlap and all read
  // the same count, so a burst of parallel guesses would get past the limit.
  checkStaffPassword(password) {
    const attempt = async () => {
      const failures = (await this.state.storage.get('staffAuthFailures')) || { count: 0, lockedUntil: 0 };
      const now = this.now();
      if (failures.lockedUntil > now) return lockedOut(failures.lockedUntil - now);
      if (await this.verifyStaffPassword(password)) {
        if (failures.count || failures.lockedUntil) await this.state.storage.delete('staffAuthFailures');
        return { ok: true };
      }
      const count = Number(failures.count || 0) + 1;
      const lockMs = staffLockoutMs(count);
      await this.state.storage.put('staffAuthFailures', { count, lockedUntil: lockMs ? now + lockMs : 0 });
      return lockMs ? lockedOut(lockMs) : { ok: false, status: 403, body: { error: 'Incorrect password' } };
    };
    const result = (this.staffAttempts || Promise.resolve()).then(attempt, attempt);
    this.staffAttempts = result.catch(() => {});
    return result;
  }
  // Staff access for a save, a delete or the staff live connection. An empty key is no attempt.
  // The key is a staff session token or, during the rollout (devices still on the previous app),
  // the password itself: that fallback is removed one release after 4.0.0 (docs/DEPLOYMENT.md).
  async staffAccess(suppliedKey, error = 'Session authorization required') {
    if (!suppliedKey) return { ok: false, status: 403, body: { error } };
    if (suppliedKey.startsWith(STAFF_TOKEN_PREFIX)) {
      if (await this.checkStaffSession(suppliedKey)) return { ok: true };
      return { ok: false, status: 401, body: { error: 'Staff session expired. Use Staff Login again.', code: 'session-expired' } };
    }
    const result = await this.checkStaffPassword(suppliedKey);
    return result.ok || result.status === 429 ? result : { ok: false, status: 403, body: { error } };
  }
  presence() {
    const rows = [];
    for (const socket of this.state.getWebSockets()) {
      const info = socket.deserializeAttachment() || {};
      rows.push({ clientId: info.clientId || 'unknown', role: safeRole(info.role), name: info.name || '', court: info.court || '', connectedAt: info.connectedAt || '' });
    }
    return rows;
  }
  broadcast(message) {
    const serialized = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      try { socket.send(serialized); } catch (_) { try { socket.close(1011, 'Broadcast failed'); } catch (_) {} }
    }
  }
  broadcastPresence() { this.broadcast({ type: 'presence', clients: this.presence() }); }

  async fetch(request) {
    const url = new URL(request.url);

    // Delete is final: a deleted tournament leaves a tombstone (`deletedAt`) and every route of its
    // object answers 410, before any authorization, so a stale device cannot recreate or reopen it.
    // The library object and the admin reset never carry a tombstone and are not checked.
    if (!url.pathname.startsWith('/library') && url.pathname !== '/reset-all') {
      const deletedAt = await this.state.storage.get('deletedAt');
      if (deletedAt) return tournamentGone(deletedAt, url.pathname === '/status' ? { exists: false, deleted: true } : {});
    }

    if (request.method === 'GET' && url.pathname === '/live') {
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return json({ error: 'WebSocket upgrade required' }, 426);
      const role = safeRole(url.searchParams.get('role') || 'spectator');
      if (role === 'staff') {
        const access = await this.staffAccess(url.searchParams.get('key') || '');
        if (!access.ok) return denied(access);
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const attachment = {
        clientId: url.searchParams.get('clientId') || crypto.randomUUID(),
        role,
        name: (url.searchParams.get('name') || '').slice(0, 80),
        court: (url.searchParams.get('court') || '').slice(0, 8),
        connectedAt: new Date().toISOString()
      };
      server.serializeAttachment(attachment);
      this.state.acceptWebSocket(server);
      const record = publicRecord(await this.state.storage.get('record'));
      server.send(JSON.stringify({ type: 'connected', record, presence: this.presence() }));
      this.broadcastPresence();
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'GET' && url.pathname === '/snapshot') {
      const record = publicRecord(await this.state.storage.get('record'));
      return record ? json(record) : json({ error: 'Tournament not found' }, 404);
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      const record = publicRecord(await this.state.storage.get('record'));
      return json({ exists: Boolean(record), revision: record?.revision || 0, updatedAt: record?.updatedAt || null, connections: this.presence() });
    }

    if (request.method === 'PUT' && url.pathname === '/snapshot') {
      const incoming = await request.json();
      const existing = await this.state.storage.get('record');
      const role = safeRole(request.headers.get('x-ksm-role') || 'director');
      const suppliedKey = request.headers.get('x-ksm-session-key') || request.headers.get('x-ksm-director-key') || '';
      if (role !== 'staff') return json({ error: 'Write authorization required' }, 403);
      const access = await this.staffAccess(suppliedKey, 'Write authorization required');
      if (!access.ok) return denied(access);
      const expectedRevision = Number(incoming.revision || 0);
      const currentRevision = Number(existing?.revision || 0);
      if (existing && expectedRevision !== currentRevision) return json({ error: 'Revision conflict', record: publicRecord(existing) }, 409);
      if (!incoming.payload || typeof incoming.payload !== 'object') return json({ error: 'Tournament payload required' }, 400);
      const integrityError = validateTournamentPayload(incoming.payload);
      if (integrityError) return json({ error: 'Invalid tournament state', integrityError }, 422);

      const now = new Date().toISOString();
      const record = {
        schemaVersion: '1.2', tournamentId: incoming.tournamentId,
        engineVersion: incoming.engineVersion || incoming.payload?.engineVersion || 'unknown',
        revision: currentRevision + 1, createdAt: existing?.createdAt || now, updatedAt: now,
        updatedBy: { role, clientId: request.headers.get('x-ksm-client-id') || '', name: (request.headers.get('x-ksm-client-name') || '').slice(0, 80), court: (request.headers.get('x-ksm-court') || '').slice(0, 8) },
        payload: sanitizePayload(incoming.payload)
      };
      await this.state.storage.put('record', record);
      const safe = publicRecord(record);
      this.broadcast({ type: 'snapshot', record: safe });
      return json(safe);
    }

    if (request.method === 'POST' && url.pathname === '/slug') {
      const access = await this.staffAccess(request.headers.get('x-ksm-session-key') || '', 'Staff authorization required');
      if (!access.ok) return denied(access);
      const record = await this.state.storage.get('record');
      if (!record) return json({error:'Tournament not found'},404);
      const body = await request.json();
      return this.claimSlug(record.tournamentId, body.slug);
    }

    if (request.method === 'POST' && url.pathname === '/bootstrap') {
      if (await this.state.storage.get('record')) return json({ error: 'Tournament already exists' }, 409);
      const incoming = await request.json();
      if (!incoming.staffPassword || String(incoming.staffPassword).length < 4) return json({ error: 'Staff password required' }, 400);
      const integrityError = validateTournamentPayload(incoming.payload);
      if (integrityError) return json({ error: 'Invalid tournament state', integrityError }, 422);
      const suggested = suggestSlug(String(incoming.payload?.setup?.tName || 'Tournament'), String(incoming.payload?.setup?.tDate || new Date().getFullYear()).slice(0,4));
      const now = new Date().toISOString();
      const record = { schemaVersion: '1.2', tournamentId: incoming.tournamentId, engineVersion: incoming.engineVersion || 'unknown', revision: 1, createdAt: now, updatedAt: now, updatedBy: { role: 'staff', clientId: '', name: 'Tournament creator', court: '' }, payload: sanitizePayload(incoming.payload) };
      const claim = await this.claimSlug(incoming.tournamentId, incoming.slug ?? suggested, incoming.slug === undefined);
      if (!claim.ok) return claim;
      const {slug} = await claim.json();
      let session;
      try {
        // Record and credentials either commit together or leave no partial tournament.
        session = await this.state.storage.transaction(async tx => {
          await this.setStaffPassword(incoming.staffPassword, tx);
          await tx.put('record', record);
          return this.issueStaffSession(tx);
        });
      } catch (error) {
        await this.library().fetch(new Request('https://durable-object/library/slug', {
          method:'DELETE', headers:{'content-type':'application/json'}, body:JSON.stringify({id:incoming.tournamentId,slug})
        }));
        throw error;
      }
      // The creator token is sent only in a header, never in the record.
      return json(publicRecord(record), 200, { 'x-ksm-session-token': session.token, 'x-ksm-session-expires': session.expiresAt });
    }

    if (request.method === 'POST' && url.pathname === '/auth') {
      const body = await request.json().catch(() => ({}));
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!password) return json({ error: 'Incorrect password' }, 403);
      const result = await this.checkStaffPassword(password);
      if (!result.ok) return denied(result);
      return json({ ok: true, ...(await this.issueStaffSession()) });
    }

    if (request.method === 'DELETE' && url.pathname === '/snapshot') {
      const access = await this.staffAccess(request.headers.get('x-ksm-session-key') || '', 'Staff authorization required');
      if (!access.ok) return denied(access);
      // deleteAll clears the staff password hash and sessions with the record; the tombstone is
      // written after it, so it is the only thing left in storage.
      await this.state.storage.deleteAll();
      this.verifiedPassword = null;
      await this.state.storage.put('deletedAt', new Date().toISOString());
      this.broadcast({ type: 'deleted' });
      for (const socket of this.state.getWebSockets()) try { socket.close(1000, 'Tournament deleted'); } catch (_) {}
      return json({ ok: true });
    }

    if (request.method === 'DELETE' && url.pathname === '/reset-all') {
      await this.state.storage.deleteAll();
      for (const socket of this.state.getWebSockets()) try { socket.close(1000, 'Cloud test data reset'); } catch (_) {}
      return json({ ok: true });
    }

    // Registry metadata is authoritative outside snapshots. One transaction owns claims,
    // aliases and tombstones; a stale tournament snapshot can never rename or release a slug.
    if (request.method === 'POST' && url.pathname === '/library/slug') {
      const {id, slug, automatic} = await request.json();
      if (!id || typeof slug !== 'string' || !isValidSlug(slug)) return json({error:'Use lowercase letters, digits and single dashes; this short name may be reserved.',code:'invalid-slug'},400);
      return this.state.storage.transaction(async tx => {
        const registry = (await tx.get('slugRegistry')) || {owners:{}, current:{}, deleted:{}};
        if (registry.deleted[id]) return tournamentGone(registry.deleted[id]);
        let chosen = slug;
        if (automatic) {
          let suffix = 2;
          while (Object.hasOwn(registry.owners,chosen) && registry.owners[chosen] !== id) chosen = `${slug.slice(0,70)}-${suffix++}`;
        }
        if (Object.hasOwn(registry.owners,chosen) && registry.owners[chosen] !== id) return json({error:'That short name is already reserved.',code:'slug-taken'},409);
        if (!Object.hasOwn(registry.owners,chosen) && Object.values(registry.owners).filter(owner=>owner===id).length >= 5) {
          return json({error:'This tournament already has five reserved short names. Choose one of its existing names.',code:'slug-limit'},409);
        }
        registry.owners[chosen] = id;
        registry.current[id] = chosen;
        await tx.put('slugRegistry',registry);
        return json({id,slug:chosen});
      });
    }
    // Internal compensation for a failed bootstrap only. Public routing never exposes
    // this operation; renamed aliases and tombstones cannot be released here.
    if (request.method === 'DELETE' && url.pathname === '/library/slug') {
      const {id,slug} = await request.json();
      return this.state.storage.transaction(async tx => {
        const registry = await tx.get('slugRegistry');
        if (registry && !registry.deleted[id] && registry.current[id]===slug && registry.owners[slug]===id && Object.values(registry.owners).filter(owner=>owner===id).length===1) {
          delete registry.owners[slug];delete registry.current[id];
          await tx.put('slugRegistry',registry);
        }
        return json({ok:true});
      });
    }
    if (request.method === 'GET' && url.pathname.startsWith('/library/resolve/')) {
      const slug = decodeURIComponent(url.pathname.slice('/library/resolve/'.length));
      const registry = await this.state.storage.get('slugRegistry');
      const id = Object.hasOwn(registry?.owners||{},slug) ? registry.owners[slug] : null;
      if (!id) return json({error:'Tournament not found'},404);
      if (registry.deleted[id]) return tournamentGone(registry.deleted[id]);
      return json({id,slug:registry.current[id]});
    }
    if (request.method === 'GET' && url.pathname.startsWith('/library/identity/')) {
      const id = decodeURIComponent(url.pathname.slice('/library/identity/'.length));
      const registry = await this.state.storage.get('slugRegistry');
      if (registry?.deleted?.[id]) return tournamentGone(registry.deleted[id]);
      return json({id,slug:registry?.current?.[id] || null});
    }
    // The singleton __ksm_library__ Durable Object also stores card metadata.
    if (request.method === 'GET' && url.pathname === '/library') {
      const rows = (await this.state.storage.get('library')) || {};
      const registry = await this.state.storage.get('slugRegistry');
      return json(Object.values(rows).map(row=>({...row,slug:registry?.current?.[row.id]||null})).sort((a,b) => String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))));
    }
    if (request.method === 'PUT' && url.pathname === '/library') {
      const item = await request.json();
      if (!item?.id) return json({ error: 'Tournament ID required' }, 400);
      const registry = await this.state.storage.get('slugRegistry');
      if (registry?.deleted?.[item.id]) return tournamentGone(registry.deleted[item.id]);
      const rows = (await this.state.storage.get('library')) || {};
      rows[item.id] = { id:item.id, name:String(item.name||'Kendo Tournament').slice(0,160), updatedAt:item.updatedAt||new Date().toISOString() };
      await this.state.storage.put('library', rows);
      return json(rows[item.id]);
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/library/')) {
      const id = decodeURIComponent(url.pathname.slice('/library/'.length));
      const rows = (await this.state.storage.get('library')) || {};
      delete rows[id];
      await this.state.storage.transaction(async tx => {
        const registry = (await tx.get('slugRegistry')) || {owners:{},current:{},deleted:{}};
        registry.deleted[id] = new Date().toISOString();
        await tx.put('slugRegistry',registry);
        await tx.put('library',rows);
      });
      return json({ ok:true });
    }
    return json({ error: 'Not found' }, 404);
  }

  webSocketMessage(socket, message) {
    if (message === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }));
      return;
    }
    let flash;
    if (typeof message !== 'string') return;
    try { flash = JSON.parse(message); } catch (_) { return; }
    if (!flash || typeof flash !== 'object' || Array.isArray(flash)) return;
    const keys = Object.keys(flash).sort();
    if (keys.join(',') === 'court,source,state,type') {
      // Ephemeral court clock state for the TV border; never stored. Each reporting device names itself
      // (`source`); the TV combines the sources, so a second device can never overwrite the scorer's clock.
      if (flash.type !== 'clock' || !['A', 'B'].includes(flash.court) || !['running', 'stopped', 'off'].includes(flash.state)) return;
      if (typeof flash.source !== 'string' || !flash.source.length || flash.source.length > 40) return;
      if (socket.deserializeAttachment()?.role !== 'staff') return;
      this.broadcast({ type: 'clock', court: flash.court, source: flash.source, state: flash.state, at: new Date().toISOString() });
      return;
    }
    if (keys.length !== 4 || keys.join(',') !== 'court,id,kind,type') return;
    if (flash.type !== 'flash' || !['A', 'B'].includes(flash.court) || !['encho', 'hikiwake'].includes(flash.kind)) return;
    if (typeof flash.id !== 'string' || !flash.id.length || flash.id.length > 40) return;
    if (socket.deserializeAttachment()?.role !== 'staff') return;
    this.broadcast({ type: 'flash', court: flash.court, kind: flash.kind, id: flash.id, at: new Date().toISOString() });
  }
  webSocketClose(socket, code, reason) { try { socket.close(code, reason); } catch (_) {} this.broadcastPresence(); }
  webSocketError(socket) { try { socket.close(1011, 'WebSocket error'); } catch (_) {} this.broadcastPresence(); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
    if (url.pathname === '/api/health') return json({ ok: true, service: 'ksm-cloud', version: APP_VERSION, realtime: true, roles: ['spectator', 'staff'], offlineOutbox: true });

    const libraryStub = () => env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName('__ksm_library__'));
    const withSlug = async response => {
      if (!response.ok) return response;
      const record = await response.clone().json();
      if (!record?.tournamentId) return response;
      try {
        const identity = await libraryStub().fetch(`https://durable-object/library/identity/${encodeURIComponent(record.tournamentId)}`);
        if (!identity.ok) return identity.status === 410 ? identity : response;
        const {slug} = await identity.json();
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        headers.delete('content-encoding');
        return json({...record,slug},response.status,Object.fromEntries(headers));
      } catch (_) { return response; }
    };
    const updateLibrary = async (record) => {
      if (!record?.tournamentId) return;
      const setup = record.payload?.setup || {};
      try {
        const response = await libraryStub().fetch(new Request('https://durable-object/library', { method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify({ id:record.tournamentId, name:setup.tName||'Kendo Tournament', updatedAt:record.updatedAt }) }));
        if (!response.ok) console.error('Tournament library update rejected', response.status, await response.text());
      } catch (error) {
        console.error('Tournament library update failed', error);
      }
    };

    if (url.pathname === '/api/admin/reset' && request.method === 'DELETE') {
      const supplied = request.headers.get('x-ksm-reset-key') || '';
      if (!env.KSM_RESET_KEY || supplied !== env.KSM_RESET_KEY) return json({ error: 'Reset authorization required' }, 403);
      const libraryResponse = await libraryStub().fetch('https://durable-object/library');
      const rows = libraryResponse.ok ? await libraryResponse.json() : [];
      const ids = Array.isArray(rows) ? rows.map(row => row?.id).filter(Boolean) : [];
      const results = [];
      for (const id of ids) {
        try {
          const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id));
          const response = await stub.fetch(new Request('https://durable-object/reset-all', { method:'DELETE' }));
          results.push({ id, ok: response.ok, status: response.status });
        } catch (error) {
          results.push({ id, ok:false, error:String(error?.message||error) });
        }
      }
      await libraryStub().fetch(new Request('https://durable-object/reset-all', { method:'DELETE' }));
      return json({ ok:true, deleted:results.filter(item=>item.ok).length, attempted:ids.length, results });
    }

    const slugLookup = url.pathname.match(/^\/api\/slugs\/([a-z0-9-]+)$/);
    if (slugLookup && request.method === 'GET') return libraryStub().fetch(`https://durable-object/library/resolve/${slugLookup[1]}`);
    if (url.pathname === '/api/tournaments' && request.method === 'GET') {
      return libraryStub().fetch('https://durable-object/library');
    }
    if (url.pathname === '/api/tournaments/discover' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const ids = Array.isArray(body.ids) ? body.ids.filter(id => /^[0-9a-f-]+$/i.test(id)).slice(0,100) : [];
      for (const id of ids) {
        const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id));
        const response = await stub.fetch('https://durable-object/snapshot');
        if (response.ok) await updateLibrary(await response.json());
      }
      return libraryStub().fetch('https://durable-object/library');
    }
    if (url.pathname === '/api/tournaments' && request.method === 'POST') {
      const outdated = outdatedClient(request);
      if (outdated) return outdated;
      const id = crypto.randomUUID();
      const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id));
      const body = await request.json();
      const response = await stub.fetch(new Request('https://durable-object/bootstrap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, tournamentId: id, revision: 0 }) }));
      if (response.ok) await updateLibrary(await response.clone().json());
      return withSlug(response);
    }

    const route = url.pathname.match(/^\/api\/tournaments\/([0-9a-f-]+)(?:\/(live|status|auth|slug))?$/i);
    if (route) {
      const [, id, action] = route;
      const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id));
      if (action === 'live') {
        const target = new URL('https://durable-object/live'); target.search = url.search;
        return stub.fetch(new Request(target, { method: 'GET', headers: request.headers }));
      }
      if (action === 'status' && request.method === 'GET') return stub.fetch('https://durable-object/status');
      if (action === 'slug' && request.method === 'POST') return stub.fetch(new Request('https://durable-object/slug', {method:'POST',headers:request.headers,body:request.body}));
      if (action === 'auth' && request.method === 'POST') return stub.fetch(new Request('https://durable-object/auth', { method: 'POST', headers: request.headers, body: request.body }));
      if (!action && request.method === 'GET') return withSlug(await stub.fetch('https://durable-object/snapshot'));
      if (!action && request.method === 'PUT') {
        const outdated = outdatedClient(request);
        if (outdated) return outdated;
        const body = await request.json();
        if (body.tournamentId && body.tournamentId !== id) return json({ error: 'Tournament ID mismatch' }, 409);
        const response = await stub.fetch(new Request('https://durable-object/snapshot', { method: 'PUT', headers: request.headers, body: JSON.stringify({ ...body, tournamentId: id }) }));
        if (response.ok) await updateLibrary(await response.clone().json());
        return withSlug(response);
      }
      if (!action && request.method === 'DELETE') {
        const response = await stub.fetch(new Request('https://durable-object/snapshot', { method: 'DELETE', headers: request.headers }));
        // A 410 (already deleted) also clears the library entry, in case an earlier delete was cut short.
        if (response.ok || response.status === 410) await libraryStub().fetch(new Request(`https://durable-object/library/${encodeURIComponent(id)}`, { method:'DELETE' }));
        return withSlug(response);
      }
      return json({ error: 'Method not allowed' }, 405);
    }
    const printPage = printDocumentPage(url.pathname);
    if (printPage) {
      const assetUrl = new URL(url);
      assetUrl.pathname = '/' + printPage.replace(/\.html$/, '');
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }
    const friendly = url.pathname.match(/^\/([a-z0-9-]+)(\/(?:live|overview|results|setup|registration|pools|court(?:\/[ab])?|tv(?:\/[ab])?|overlay(?:\/[ab])?))?\/?$/i);
    if (friendly && isValidSlug(friendly[1])) {
      const pageRoute={slug:friendly[1],screen:(friendly[2]||'').split('/')[1]?.toLowerCase()};
      const identity = await libraryStub().fetch(`https://durable-object/library/resolve/${pageRoute.slug}`);
      if (!identity.ok) return identity;
      const info = await identity.json();
      // Also check the tournament tombstone: a delete interrupted before the library update
      // must never serve a stale alias as if it were still an active tournament.
      const status = await env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(info.id)).fetch('https://durable-object/status');
      if (!status.ok) return status;
      if (pageRoute.slug !== info.slug) return new Response(null,{status:308,headers:{location:`/${info.slug}${friendly[2]||''}`+url.search,'cache-control':'no-store'}});
      return env.ASSETS.fetch(new Request(new URL(pageRoute.screen === 'overlay'?'/overlay':'/',url),request));
    }
    if (/^\/t\/[^/]+\/(?:overview|results|setup|registration|pools)\/?$/i.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL('/',url),request));
    if (isOverlayPath(url.pathname)) return env.ASSETS.fetch(new Request(new URL('/overlay', url), request));
    return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('KSM Worker request failed', { path:url.pathname, method:request.method, error });
      return json({ error:'Worker operation failed', stage:'request', message:String(error?.message||error) }, 500);
    }
  }
};
