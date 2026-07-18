const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const VALID_ROLES = new Set(['spectator', 'staff']);

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}
async function passwordHash(value) { const data = new TextEncoder().encode(String(value || '')); const digest = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join(''); }
function safeRole(value) { return VALID_ROLES.has(value) ? value : 'spectator'; }
function publicRecord(record) {
  if (!record) return null;
  const { credentials, ...safe } = record;
  return safe;
}

export class TournamentState {
  constructor(state, env) { this.state = state; this.env = env; }

  async staffPasswordHash() { return (await this.state.storage.get('staffPasswordHash')) || ''; }
  async authorize(role, suppliedKey) { if (role === 'spectator') return true; const stored = await this.staffPasswordHash(); return Boolean(suppliedKey && stored && await passwordHash(suppliedKey) === stored); }
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

    if (request.method === 'GET' && url.pathname === '/live') {
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return json({ error: 'WebSocket upgrade required' }, 426);
      const role = safeRole(url.searchParams.get('role') || 'spectator');
      const key = url.searchParams.get('key') || '';
      if (!(await this.authorize(role, key))) return json({ error: 'Session authorization required' }, 403);
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
      if (role !== 'staff' || !(await this.authorize(role, suppliedKey))) return json({ error: 'Write authorization required' }, 403);
      const expectedRevision = Number(incoming.revision || 0);
      const currentRevision = Number(existing?.revision || 0);
      if (existing && expectedRevision !== currentRevision) return json({ error: 'Revision conflict', record: publicRecord(existing) }, 409);
      if (!incoming.payload || typeof incoming.payload !== 'object') return json({ error: 'Tournament payload required' }, 400);

      const now = new Date().toISOString();
      const record = {
        schemaVersion: '1.2', tournamentId: incoming.tournamentId,
        engineVersion: incoming.engineVersion || incoming.payload?.engineVersion || 'unknown',
        revision: currentRevision + 1, createdAt: existing?.createdAt || now, updatedAt: now,
        updatedBy: { role, clientId: request.headers.get('x-ksm-client-id') || '', name: (request.headers.get('x-ksm-client-name') || '').slice(0, 80), court: (request.headers.get('x-ksm-court') || '').slice(0, 8) },
        payload: incoming.payload
      };
      await this.state.storage.put('record', record);
      const safe = publicRecord(record);
      this.broadcast({ type: 'snapshot', record: safe });
      return json(safe);
    }

    if (request.method === 'POST' && url.pathname === '/bootstrap') {
      if (await this.state.storage.get('record')) return json({ error: 'Tournament already exists' }, 409);
      const incoming = await request.json();
      if (!incoming.staffPassword || String(incoming.staffPassword).length < 4) return json({ error: 'Staff password required' }, 400);
      await this.state.storage.put('staffPasswordHash', await passwordHash(incoming.staffPassword));
      const now = new Date().toISOString();
      const record = { schemaVersion: '1.2', tournamentId: incoming.tournamentId, engineVersion: incoming.engineVersion || 'unknown', revision: 1, createdAt: now, updatedAt: now, updatedBy: { role: 'staff', clientId: '', name: 'Tournament creator', court: '' }, payload: incoming.payload };
      await this.state.storage.put('record', record);
      return json(publicRecord(record));
    }

    if (request.method === 'POST' && url.pathname === '/auth') {
      const body = await request.json();
      return (await this.authorize('staff', body.password || '')) ? json({ ok: true }) : json({ error: 'Incorrect password' }, 403);
    }

    if (request.method === 'DELETE' && url.pathname === '/snapshot') {
      const suppliedKey = request.headers.get('x-ksm-session-key') || '';
      if (!(await this.authorize('staff', suppliedKey))) return json({ error: 'Staff authorization required' }, 403);
      await this.state.storage.deleteAll();
      this.broadcast({ type: 'deleted' });
      for (const socket of this.state.getWebSockets()) try { socket.close(1000, 'Tournament deleted'); } catch (_) {}
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  }

  webSocketMessage(socket, message) {
    if (message === 'ping') socket.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }));
  }
  webSocketClose(socket, code, reason) { try { socket.close(code, reason); } catch (_) {} this.broadcastPresence(); }
  webSocketError(socket) { try { socket.close(1011, 'WebSocket error'); } catch (_) {} this.broadcastPresence(); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'ksm-cloud', version: '3.16.1', realtime: true, roles: ['spectator', 'staff'], offlineOutbox: true });

    if (url.pathname === '/api/tournaments' && request.method === 'POST') {
      const id = crypto.randomUUID();
      const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id));
      const body = await request.json();
      const response = await stub.fetch(new Request('https://durable-object/bootstrap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, tournamentId: id, revision: 0 }) }));
      return new Response(response.body, response);
    }

    const route = url.pathname.match(/^\/api\/tournaments\/([0-9a-f-]+)(?:\/(live|status|auth))?$/i);
    if (route) {
      const [, id, action] = route;
      const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id));
      if (action === 'live') {
        const target = new URL('https://durable-object/live'); target.search = url.search;
        return stub.fetch(new Request(target, { method: 'GET', headers: request.headers }));
      }
      if (action === 'status' && request.method === 'GET') return stub.fetch('https://durable-object/status');
      if (action === 'auth' && request.method === 'POST') return stub.fetch(new Request('https://durable-object/auth', { method: 'POST', headers: request.headers, body: request.body }));
      if (!action && request.method === 'GET') return stub.fetch('https://durable-object/snapshot');
      if (!action && request.method === 'PUT') {
        const body = await request.json();
        if (body.tournamentId && body.tournamentId !== id) return json({ error: 'Tournament ID mismatch' }, 409);
        return stub.fetch(new Request('https://durable-object/snapshot', { method: 'PUT', headers: request.headers, body: JSON.stringify({ ...body, tournamentId: id }) }));
      }
      if (!action && request.method === 'DELETE') return stub.fetch(new Request('https://durable-object/snapshot', { method: 'DELETE', headers: request.headers }));
      return json({ error: 'Method not allowed' }, 405);
    }
    return env.ASSETS.fetch(request);
  }
};
