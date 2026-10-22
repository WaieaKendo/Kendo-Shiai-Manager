import { AccessStore, accessCall, resolveAccess } from './access-store.mjs';
import { auth0Enabled, auth0Config, identityVerifier, bearerToken, isAdmin } from './auth0-worker.mjs';
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
// #86: 3 = grand champion rows and their derived draws (an app of #95's era would show a draw as
// "gc:…", offer to regenerate it and never refill it).
const MIN_CLIENT_SCHEMA = 3;
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
  constructor(state, env) { this.state = state; this.env = env; this.verifyIdentity = identityVerifier(env); }

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
  async ensureAccessMigrated() {
    if (!auth0Enabled(this.env)) return;
    const record = await this.state.storage.get('record');
    if (!record || await this.state.storage.get('accessMigrationVersion') === 2) return;
    await accessCall(this.env, 'migrateTournament', {id:record.tournamentId, directors:await this.directors()});
    const index = await this.state.storage.transaction(async tx => {
      const intent = await tx.get('visibilityIndex');
      return {record:await tx.get('record'), isPublic:intent?.isPublic ?? ((await tx.get('isPublic')) !== false), version:intent?.version || 0};
    });
    if (!index.record) return;
    await this.indexAccess(index.record, index.isPublic, index.version);
    await this.state.storage.put('accessMigrationVersion', 2);
  }
  async indexAccess(record, isPublic, visibilityVersion = 0) {
    const response = await this.library().fetch(new Request('https://durable-object/library', {method:'PUT',body:JSON.stringify({id:record.tournamentId, name:record.payload?.setup?.tName, updatedAt:record.updatedAt, isPublic, visibilityVersion, accessIndexed:true})}));
    if (!response.ok) throw new Error('Library access index unavailable');
  }
  async setVisibility(isPublic) {
    // Serialize changes on this object while awaiting registry writes. The
    // version also stops a slower first-use migration from restoring old metadata.
    const previous = this.visibilityUpdates || Promise.resolve();
    const update = previous.catch(() => {}).then(async () => {
      const record = await this.state.storage.get('record');
      if (!record || await this.state.storage.get('deletedAt')) throw new Error('Tournament deleted');
      const version = ((await this.state.storage.get('visibilityIndex'))?.version || 0) + 1;
      await this.state.storage.put('visibilityIndex', {version,isPublic});
      if (!isPublic) await this.indexAccess(record, false, version);
      await this.state.storage.put('isPublic', isPublic);
      if (isPublic) await this.indexAccess(record, true, version);
      for (const socket of this.state.getWebSockets()) try { socket.close(1000, 'Visibility changed'); } catch (_) {}
    });
    this.visibilityUpdates = update;
    return update;
  }
  async accountAccess(request, { adminOnly = false, create = false, token = '' } = {}) {
    if (!auth0Enabled(this.env)) return null;
    await this.ensureAccessMigrated();
    const supplied = token || bearerToken(request);
    if (supplied || request.headers.has('authorization')) {
      let identity;
      try { identity = await this.verifyIdentity(supplied); }
      catch (_) { return { ok: false, status: 401, body: { error: 'Sign in again.', code: 'auth0-invalid' } }; }
      const resolved = await resolveAccess(this.env, identity);
      const id = (await this.state.storage.get('record'))?.tournamentId;
      const role = resolved.role === 'admin' ? 'admin' : resolved.tournamentRoles[id] || 'spectator';
      const ok = create ? ['admin','creator'].includes(resolved.role) : adminOnly ? role === 'admin' : ['admin','owner','director'].includes(role);
      return {ok, status:403, body:{error:create ? 'Admin or creator authorization required' : adminOnly ? 'Admin authorization required' : 'Tournament access required'}, role, globalRole:resolved.role, userId:resolved.userId, identity};
    }
    return { ok: false, status: 403, body: { error: 'Sign-in required' } };
  }
  async isPublic() { return !auth0Enabled(this.env) || (await this.state.storage.get('isPublic')) !== false; }
  async readAccess(request, token = '') {
    await this.ensureAccessMigrated();
    if (await this.isPublic()) return null;
    const access = await this.accountAccess(request, { token });
    return access?.ok ? null : json({ error: 'Tournament not viewable', code: 'tournament-private', message: 'This tournament is private. Sign in with an account that can manage it.' }, 403);
  }
  async directors() { return (await this.state.storage.get('directors')) || []; }
  async writeAccess(request, options = {}) {
    const account = await this.accountAccess(request, options);
    return account || this.staffAccess(options.key ?? request.headers.get('x-ksm-session-key') ?? '', 'Staff authorization required');
  }
  async socketAccess(identity) {
    if (!identity || identity.expiresAt <= Date.now()) return false;
    await this.ensureAccessMigrated();
    // Only lookup here: an older socket must not restore an old canonical email
    // or consume invites after a later verified sign-in changed the profile.
    const resolved = await accessCall(this.env, 'lookup', {sub:identity.sub});
    const id = (await this.state.storage.get('record'))?.tournamentId;
    return isAdmin(this.env, resolved.email) || resolved.roles.includes('admin') || ['owner','director'].includes(resolved.tournamentRoles[id]);
  }
  async socketMayWrite(socket) {
    const info = socket.deserializeAttachment() || {};
    if (info.role !== 'staff') return false;
    if (!auth0Enabled(this.env)) return true;
    const allowed = await this.socketAccess(info.identity);
    if (!allowed) try { socket.close(1000, 'Access changed'); } catch (_) {}
    return allowed;
  }
  presence() {
    const rows = [];
    for (const socket of this.state.getWebSockets()) {
      const info = socket.deserializeAttachment() || {};
      rows.push({ clientId: info.clientId || 'unknown', role: safeRole(info.role), name: info.name || '', court: info.court || '', connectedAt: info.connectedAt || '' });
    }
    return rows;
  }
  async broadcast(message) {
    const privateTournament = auth0Enabled(this.env) && !(await this.isPublic());
    const sockets = this.state.getWebSockets();
    let users = {}, id;
    if (privateTournament) {
      await this.ensureAccessMigrated();
      id = (await this.state.storage.get('record'))?.tournamentId;
      users = await accessCall(this.env, 'lookupMany', {subs:sockets.map(socket=>socket.deserializeAttachment()?.identity?.sub).filter(Boolean)});
    }
    const serialized = JSON.stringify(message);
    for (const socket of sockets) {
      const identity = socket.deserializeAttachment()?.identity;
      const user = users[identity?.sub];
      const allowed = identity && identity.expiresAt > Date.now() && user && (isAdmin(this.env,user.email) || user.roles.includes('admin') || ['owner','director'].includes(user.tournamentRoles[id]));
      if (privateTournament && !allowed) { try { socket.close(1000, 'Access changed'); } catch (_) {} continue; }
      try { socket.send(serialized); } catch (_) { try { socket.close(1011, 'Broadcast failed'); } catch (_) {} }
    }
  }
  async broadcastPresence() { await this.broadcast({ type: 'presence', clients: this.presence() }); }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/internal/access/')) {
      const operation = url.pathname.slice('/internal/access/'.length);
      if (request.method !== 'POST' || !['resolve','grant','revoke','listPeople','listTournament','removeTournament','lookup','lookupMany','migrateTournament','changeTournament'].includes(operation)) return json({error:'Not found'},404);
      this.accessStore ||= new AccessStore(this.state.storage, this.env);
      return json(this.accessStore[operation](await request.json()));
    }

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
      const token = url.searchParams.get('access_token') || '';
      let access = await this.accountAccess(request, { token });
      if (!(await this.isPublic()) && !access?.ok) return json({ error: 'Tournament not viewable', code: 'tournament-private', message: 'This tournament is private. Sign in with an account that can manage it.' }, 403);
      if (role === 'staff') {
        access = access || await this.staffAccess(url.searchParams.get('key') || '');
        if (!access.ok) return denied(access);
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const attachment = {
        clientId: url.searchParams.get('clientId') || crypto.randomUUID(),
        role,
        ...(access?.identity ? { identity: access.identity } : {}),
        name: (url.searchParams.get('name') || '').slice(0, 80),
        court: (url.searchParams.get('court') || '').slice(0, 8),
        connectedAt: new Date().toISOString()
      };
      server.serializeAttachment(attachment);
      this.state.acceptWebSocket(server);
      const record = publicRecord(await this.state.storage.get('record'));
      server.send(JSON.stringify({ type: 'connected', record, presence: this.presence() }));
      await this.broadcastPresence();
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'GET' && url.pathname === '/snapshot') {
      const privateDenied = await this.readAccess(request);
      if (privateDenied) return privateDenied;
      const record = publicRecord(await this.state.storage.get('record'));
      return record ? json({ ...record, ...(auth0Enabled(this.env) ? { isPublic: await this.isPublic() } : {}) }) : json({ error: 'Tournament not found' }, 404);
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      const privateDenied = await this.readAccess(request);
      if (privateDenied) return privateDenied;
      const record = publicRecord(await this.state.storage.get('record'));
      return json({ exists: Boolean(record), revision: record?.revision || 0, updatedAt: record?.updatedAt || null, connections: this.presence() });
    }

    if (request.method === 'PUT' && url.pathname === '/snapshot') {
      const incoming = await request.json();
      const existing = await this.state.storage.get('record');
      const role = safeRole(request.headers.get('x-ksm-role') || 'director');
      const suppliedKey = request.headers.get('x-ksm-session-key') || request.headers.get('x-ksm-director-key') || '';
      if (role !== 'staff' && !(auth0Enabled(this.env) && bearerToken(request))) return json({ error: 'Write authorization required' }, 403);
      const access = await this.writeAccess(request, { key: suppliedKey });
      if (!access.ok) return denied(access);
      if (auth0Enabled(this.env) && !existing) return json({ error: 'Tournament not found' }, 404);
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
        updatedBy: { role: access.role || role, clientId: request.headers.get('x-ksm-client-id') || '', name: (request.headers.get('x-ksm-client-name') || '').slice(0, 80), court: (request.headers.get('x-ksm-court') || '').slice(0, 8) },
        payload: sanitizePayload(incoming.payload)
      };
      await this.state.storage.put('record', record);
      const safe = publicRecord(record);
      await this.broadcast({ type: 'snapshot', record: safe });
      return json(safe);
    }

    if (request.method === 'POST' && url.pathname === '/slug') {
      const access = await this.writeAccess(request);
      if (!access.ok) return denied(access);
      const record = await this.state.storage.get('record');
      if (!record) return json({error:'Tournament not found'},404);
      const body = await request.json();
      return this.claimSlug(record.tournamentId, body.slug);
    }

    if (request.method === 'POST' && url.pathname === '/bootstrap') {
      if (await this.state.storage.get('record')) return json({ error: 'Tournament already exists' }, 409);
      const access = await this.accountAccess(request, { create: true });
      if (access && !access.ok) return denied(access);
      const incoming = await request.json();
      if (!auth0Enabled(this.env) && (!incoming.staffPassword || String(incoming.staffPassword).length < 4)) return json({ error: 'Staff password required' }, 400);
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
        if (auth0Enabled(this.env)) await accessCall(this.env, 'grant', {userId:access.userId, scope:incoming.tournamentId, role:'owner', grantedBy:access.userId});
        // Record and credentials either commit together or leave no partial tournament.
        session = await this.state.storage.transaction(async tx => {
          if (!auth0Enabled(this.env)) await this.setStaffPassword(incoming.staffPassword, tx);
          await tx.put('record', record);
          if (auth0Enabled(this.env)) await tx.put('isPublic', false);
          return auth0Enabled(this.env) ? null : this.issueStaffSession(tx);
        });
      } catch (error) {
        const cleanup = async (stage, action) => {
          try { const result = await action(); if (result instanceof Response && !result.ok) throw new Error(`Cleanup rejected: ${result.status}`); }
          catch (cleanupError) { console.error('Bootstrap cleanup failed', {stage,error:cleanupError}); }
        };
        if (auth0Enabled(this.env)) {
          await cleanup('record', () => this.state.storage.deleteAll());
          await cleanup('tombstone', () => this.state.storage.put('deletedAt', new Date().toISOString()));
          await cleanup('access', () => accessCall(this.env, 'removeTournament', {id:incoming.tournamentId}));
        }
        await cleanup('slug', () => this.library().fetch(new Request('https://durable-object/library/slug', {
          method:'DELETE', headers:{'content-type':'application/json'}, body:JSON.stringify({id:incoming.tournamentId,slug})
        })));
        if (auth0Enabled(this.env)) await cleanup('library', () => this.library().fetch(new Request(`https://durable-object/library/${encodeURIComponent(incoming.tournamentId)}`, {method:'DELETE'})));
        throw error;
      }
      if (auth0Enabled(this.env)) {
        await this.ensureAccessMigrated();
      }
      // The creator token is sent only in a header, never in the record.
      return json(publicRecord(record), 200, session ? { 'x-ksm-session-token': session.token, 'x-ksm-session-expires': session.expiresAt } : {});
    }

    if (url.pathname === '/internal/access-index' && request.method === 'POST') {
      await this.ensureAccessMigrated();
      const record = await this.state.storage.get('record');
      return record ? json({ok:true}) : json({error:'Tournament not found'},404);
    }
    if (url.pathname === '/listing' && request.method === 'GET') {
      const privateDenied = await this.readAccess(request);
      if (privateDenied) return privateDenied;
      const access = await this.accountAccess(request);
      return json({ isPublic: await this.isPublic(), canManage: !!access?.ok });
    }
    if (url.pathname === '/visibility' && ['GET', 'PUT'].includes(request.method)) {
      if (!auth0Enabled(this.env)) return json({ error: 'Auth0 disabled' }, 404);
      const access = await this.accountAccess(request);
      if (!access?.ok) return access ? denied(access) : json({ error: 'Sign-in required' }, 403);
      if (!(await this.state.storage.get('record'))) return json({ error: 'Tournament not found' }, 404);
      if (request.method === 'PUT') {
        const body = await request.json().catch(() => ({}));
        if (typeof body.isPublic !== 'boolean') return json({ error: 'Public listing must be true or false' }, 400);
        await this.setVisibility(body.isPublic);
      }
      return json({ isPublic: await this.isPublic() });
    }
    if (['/access','/directors'].includes(url.pathname) && ['GET','POST','DELETE'].includes(request.method)) {
      const alias = url.pathname === '/directors';
      if (!auth0Enabled(this.env)) return alias || request.method !== 'GET' ? json({error:'Auth0 disabled'},404) : json({enabled:false});
      const access = await this.accountAccess(request);
      if (access?.status === 401) return denied(access);
      const manager = ['admin','owner'].includes(access?.role);
      // Keep refresh's existing self-role contract. Only managers receive the
      // account list; the alias retains its older manager-only GET contract.
      if (request.method === 'GET' && !alias && !manager) return json({enabled:true,role:access?.role || 'spectator',passwordFallback:false});
      if (!manager) return json({error:'Owner or admin authorization required'},403);
      const record = await this.state.storage.get('record');
      if (!record) return json({error:'Tournament not found'},404);
      if (request.method !== 'GET') {
        const body = await request.json().catch(() => ({}));
        const role = alias ? 'director' : body.role;
        if (!['owner','director'].includes(role)) return json({error:'Owner or director role required'},400);
        const result = await accessCall(this.env, 'changeTournament', {actor:access.identity, id:record.tournamentId, action:request.method === 'POST' ? 'grant' : 'revoke', email:body.email, userId:body.userId, role});
        if (!result.ok) return json({error:result.error},result.status);
        if (request.method === 'DELETE' && result.removed && result.userId) {
          for (const socket of this.state.getWebSockets()) {
            const identity = socket.deserializeAttachment()?.identity;
            if (!identity) continue;
            const current = await accessCall(this.env, 'lookup', {sub:identity.sub});
            if (current.userId === result.userId) try { socket.close(1000, 'Access changed'); } catch (_) {}
          }
        }
      }
      const list = await accessCall(this.env, 'listTournament', {id:record.tournamentId});
      if (alias) return json({directors:[...new Set([...list.grants,...list.invites].filter(item=>item.role === 'director').map(item=>item.email))].sort()});
      return json({enabled:true,role:access.role,passwordFallback:false,...list});
    }
    if (request.method === 'POST' && url.pathname === '/auth') {
      if (auth0Enabled(this.env)) return json({ error: 'Use Auth0 sign-in for this tournament' }, 403);
      const body = await request.json().catch(() => ({}));
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!password) return json({ error: 'Incorrect password' }, 403);
      const result = await this.checkStaffPassword(password);
      if (!result.ok) return denied(result);
      return json({ ok: true, ...(await this.issueStaffSession()) });
    }

    if (request.method === 'DELETE' && url.pathname === '/snapshot') {
      const access = await this.writeAccess(request, { adminOnly: true });
      if (!access.ok) return denied(access);
      const id = (await this.state.storage.get('record'))?.tournamentId;
      // deleteAll clears the staff password hash and sessions with the record; the tombstone is
      // written after it, so it is the only thing left in storage.
      await this.state.storage.deleteAll();
      this.verifiedPassword = null;
      await this.state.storage.put('deletedAt', new Date().toISOString());
      if (auth0Enabled(this.env) && id) await accessCall(this.env, 'removeTournament', {id});
      await this.broadcast({ type: 'deleted' });
      for (const socket of this.state.getWebSockets()) try { socket.close(1000, 'Tournament deleted'); } catch (_) {}
      return json({ ok: true });
    }

    if (request.method === 'DELETE' && url.pathname === '/reset-all') {
      const id = (await this.state.storage.get('record'))?.tournamentId;
      await this.state.storage.deleteAll();
      if (auth0Enabled(this.env) && id) await accessCall(this.env, 'removeTournament', {id});
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
      rows[item.id] = { ...rows[item.id], ...(typeof item.isPublic === 'boolean' && (item.visibilityVersion || 0) >= (rows[item.id]?.visibilityVersion || 0) ? {isPublic:item.isPublic,visibilityVersion:item.visibilityVersion || 0,accessIndexed:true} : {}), id:item.id, name:String(item.name||'Kendo Tournament').slice(0,160), updatedAt:item.updatedAt||new Date().toISOString() };
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

  async webSocketMessage(socket, message) {
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
      if (!(await this.socketMayWrite(socket))) return;
      await this.broadcast({ type: 'clock', court: flash.court, source: flash.source, state: flash.state, at: new Date().toISOString() });
      return;
    }
    if (keys.length !== 4 || keys.join(',') !== 'court,id,kind,type') return;
    if (flash.type !== 'flash' || !['A', 'B'].includes(flash.court) || !['encho', 'hikiwake'].includes(flash.kind)) return;
    if (typeof flash.id !== 'string' || !flash.id.length || flash.id.length > 40) return;
    if (!(await this.socketMayWrite(socket))) return;
    await this.broadcast({ type: 'flash', court: flash.court, kind: flash.kind, id: flash.id, at: new Date().toISOString() });
  }
  async webSocketClose(socket, code, reason) { try { socket.close(code, reason); } catch (_) {} await this.broadcastPresence(); }
  async webSocketError(socket) { try { socket.close(1011, 'WebSocket error'); } catch (_) {} await this.broadcastPresence(); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
    if (url.pathname === '/api/auth/config') {
      try { const config = auth0Config(env); return json(config ? { enabled: true, domain: config.domain, audience: config.audience, clientId: config.clientId } : { enabled: false }); }
      catch (_) { return json({ error: 'Incomplete Auth0 configuration' }, 503); }
    }
    if (url.pathname === '/api/auth/me') {
      if (!auth0Enabled(env)) return json({ enabled: false });
      try { const identity = await identityVerifier(env)(bearerToken(request)); const {role, roles} = await resolveAccess(env, identity); return json({ email: identity.email, role, roles }); }
      catch (_) { return json({ error: 'Sign-in required' }, 401); }
    }
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
    const visibleLibrary = async () => {
      const response = await libraryStub().fetch('https://durable-object/library');
      if (!auth0Enabled(env) || !response.ok) return response;
      let rows = await response.json();
      // Pre-indexed tournaments need no fan-out. Older #128 cards are backfilled
      // once, including director migration, before they participate in filtering.
      const pending = rows.filter(row => !row.accessIndexed);
      for (const row of pending) {
        const result = await env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(row.id)).fetch(new Request('https://durable-object/internal/access-index', {method:'POST'}));
        if (!result.ok && result.status !== 404 && result.status !== 410) throw new Error('Access migration unavailable');
      }
      if (pending.length) rows = await (await libraryStub().fetch('https://durable-object/library')).json();
      let resolved = {role:'spectator',tournamentRoles:{}}, invalid = false;
      if (bearerToken(request)) {
        let identity;
        try { identity = await identityVerifier(env)(bearerToken(request)); }
        catch (_) { invalid = true; }
        // One central access lookup for the whole library, irrespective of size.
        if (identity) resolved = await resolveAccess(env, identity);
      }
      const listed = rows.flatMap(row => {
        const canManage = resolved.role === 'admin' || ['owner','director'].includes(resolved.tournamentRoles[row.id]);
        return canManage || row.isPublic === true ? [{...row,isPublic:row.isPublic === true,canManage}] : [];
      });
      listed.sort((a,b) => Number(b.canManage)-Number(a.canManage));
      return json(listed,200,invalid ? {'x-ksm-auth':'invalid'} : {});
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
      return visibleLibrary();
    }
    if (url.pathname === '/api/tournaments/discover' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const ids = Array.isArray(body.ids) ? body.ids.filter(id => /^[0-9a-f-]+$/i.test(id)).slice(0,100) : [];
      await Promise.all(ids.map(async id => {
        const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id));
        const response = await stub.fetch(new Request('https://durable-object/snapshot', { headers: request.headers }));
        if (response.ok) await updateLibrary(await response.json());
      }));
      return visibleLibrary();
    }
    if (url.pathname === '/api/tournaments' && request.method === 'POST') {
      const outdated = outdatedClient(request);
      if (outdated) return outdated;
      const id = crypto.randomUUID();
      const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id));
      const body = await request.json();
      const response = await stub.fetch(new Request('https://durable-object/bootstrap', { method: 'POST', headers: request.headers, body: JSON.stringify({ ...body, tournamentId: id, revision: 0 }) }));
      if (response.ok) await updateLibrary(await response.clone().json());
      return withSlug(response);
    }

    const route = url.pathname.match(/^\/api\/tournaments\/([0-9a-f-]+)(?:\/(live|status|auth|slug|access|directors|visibility))?$/i);
    if (route) {
      const [, id, action] = route;
      const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id));
      if (action === 'access' || action === 'directors' || action === 'visibility') return stub.fetch(new Request(`https://durable-object/${action}`, { method: request.method, headers: request.headers, ...(request.body ? { body: request.body } : {}) }));
      if (action === 'live') {
        const target = new URL('https://durable-object/live'); target.search = url.search;
        return stub.fetch(new Request(target, { method: 'GET', headers: request.headers }));
      }
      if (action === 'status' && request.method === 'GET') return stub.fetch(new Request('https://durable-object/status', { headers: request.headers }));
      if (action === 'slug' && request.method === 'POST') return stub.fetch(new Request('https://durable-object/slug', {method:'POST',headers:request.headers,body:request.body}));
      if (action === 'auth' && request.method === 'POST') return stub.fetch(new Request('https://durable-object/auth', { method: 'POST', headers: request.headers, body: request.body }));
      if (!action && request.method === 'GET') return withSlug(await stub.fetch(new Request('https://durable-object/snapshot', { headers: request.headers })));
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
        if ((response.ok || response.status === 410) && auth0Enabled(env)) await accessCall(env, 'removeTournament', {id});
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
      if (!status.ok && status.status !== 403) return status;
      if (pageRoute.slug !== info.slug) return new Response(null,{status:308,headers:{location:`/${info.slug}${friendly[2]||''}`+url.search,'cache-control':'no-store'}});
      return env.ASSETS.fetch(new Request(new URL(pageRoute.screen === 'overlay' && status.status !== 403?'/overlay':'/',url),request));
    }
    if (/^\/t\/[^/]+\/(?:overview|results|setup|registration|pools)\/?$/i.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL('/',url),request));
    if (isOverlayPath(url.pathname)) {
      if (auth0Enabled(env)) {
        const id = decodeURIComponent(OVERLAY_PATH.exec(url.pathname)[1]);
        const status = await env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id)).fetch(new Request('https://durable-object/status', { headers:request.headers }));
        if (status.status === 403) return env.ASSETS.fetch(new Request(new URL('/', url), request));
      }
      return env.ASSETS.fetch(new Request(new URL('/overlay', url), request));
    }
    return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('KSM Worker request failed', { path:url.pathname, method:request.method, error });
      return json({ error:'Worker operation failed', stage:'request', message:String(error?.message||error) }, 500);
    }
  }
};
