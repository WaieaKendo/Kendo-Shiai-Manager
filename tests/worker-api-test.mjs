// Backend API contract test.
//
// Exercises the real src-worker.js request handling end to end: tournament
// creation, staff auth, revision-checked saves (409), integrity validation (422),
// WebSocket snapshot/presence broadcasts, the tournament library, and deletion.
//
// Default: runs in-process against an in-memory stand-in for the Cloudflare
// runtime (Durable Objects, storage, WebSocketPair, static assets). No network.
//
// Live mode: KSM_BASE_URL=http://localhost:8787 node tests/worker-api-test.mjs
// runs the same contract over real HTTP/WebSockets (e.g. against `npm run dev`,
// or a future non-Cloudflare backend). Live mode creates and deletes its own
// test tournaments and skips the in-process-only admin reset check.
import assert from 'node:assert/strict';
import { pkg } from './lib/ksm-source.mjs';

const BASE = (process.env.KSM_BASE_URL || '').replace(/\/$/, '');
const LIVE = Boolean(BASE);
const RESET_KEY = 'test-reset-key';

// ---------------------------------------------------------------------------
// In-memory Cloudflare runtime
// ---------------------------------------------------------------------------
function installCloudflareShims() {
  // Workers allow `new Response(null,{status:101,webSocket})`; undici rejects status 101.
  const NativeResponse = globalThis.Response;
  globalThis.Response = class extends NativeResponse {
    constructor(body, init = {}) {
      if (init.status === 101) {
        super(null, { status: 200 });
        Object.defineProperty(this, 'status', { value: 101 });
        this.webSocket = init.webSocket;
      } else super(body, init);
    }
  };
  // Workers accept a ReadableStream body without `duplex`; undici requires it.
  const NativeRequest = globalThis.Request;
  globalThis.Request = class extends NativeRequest {
    constructor(input, init) {
      if (init?.body && typeof init.body.getReader === 'function' && !init.duplex) init = { ...init, duplex: 'half' };
      super(input, init);
    }
  };
  globalThis.WebSocketPair = function WebSocketPair() {
    const client = { messages: [], closed: null, listeners: [] };
    const server = {
      attachment: null,
      serializeAttachment(value) { this.attachment = structuredClone(value); },
      deserializeAttachment() { return this.attachment; },
      send(message) { if (client.closed) throw new Error('socket closed'); client.messages.push(JSON.parse(message)); client.listeners.forEach(fn => fn()); },
      close(code, reason) { client.closed = { code, reason }; },
    };
    client.peer = server;
    return { 0: client, 1: server };
  };
}

class MemoryStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined; }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { return this.map.delete(key); }
  async deleteAll() { this.map.clear(); }
}

async function createInProcessApi() {
  installCloudflareShims();
  const { default: workerEntry, TournamentState } = await import('../src-worker.js');
  const objects = new Map();
  // A Durable Object handles one request at a time here. (Real DOs use input
  // gates; see the concurrent-save check, which should also be run in live mode.)
  const queues = new Map();
  const namespace = {
    idFromName: name => name,
    get(id) {
      if (!objects.has(id)) {
        const sockets = new Set();
        const state = {
          storage: new MemoryStorage(),
          acceptWebSocket: ws => sockets.add(ws),
          getWebSockets: () => [...sockets].filter(ws => !ws.closedByTest),
        };
        objects.set(id, { instance: new TournamentState(state, env), sockets });
      }
      const { instance } = objects.get(id);
      return {
        fetch(input, init) {
          const request = input instanceof Request ? input : new Request(input, init);
          const run = () => instance.fetch(request);
          const prev = queues.get(id) || Promise.resolve();
          const next = prev.then(run, run);
          queues.set(id, next.catch(() => {}));
          return next;
        },
      };
    },
  };
  const env = {
    TOURNAMENTS: namespace,
    ASSETS: { fetch: async () => new Response('static asset', { status: 200 }) },
    KSM_RESET_KEY: RESET_KEY,
  };
  const call = async (method, path, { headers = {}, body } = {}) => {
    const init = { method, headers: { ...headers } };
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
    return workerEntry.fetch(new Request(`http://ksm.test${path}`, init), env);
  };
  return {
    call,
    async openSocket(id, params = {}) {
      const qs = new URLSearchParams(params).toString();
      const response = await call('GET', `/api/tournaments/${id}/live?${qs}`, { headers: { Upgrade: 'websocket' } });
      if (response.status !== 101) return { status: response.status };
      const client = response.webSocket;
      return {
        status: 101,
        messages: client.messages,
        waitFor: pred => waitFor(client.messages, pred, fn => client.listeners.push(fn)),
        async close() {
          client.peer.closedByTest = true;
          const obj = objects.get(id);
          await obj.instance.webSocketClose(client.peer, 1000, 'test done');
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Live HTTP/WebSocket client
// ---------------------------------------------------------------------------
function createLiveApi() {
  return {
    call(method, path, { headers = {}, body } = {}) {
      const init = { method, headers: { ...headers } };
      if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
      return fetch(`${BASE}${path}`, init);
    },
    openSocket(id, params = {}) {
      const qs = new URLSearchParams(params).toString();
      const url = `${BASE.replace(/^http/, 'ws')}/api/tournaments/${id}/live?${qs}`;
      return new Promise(resolve => {
        const ws = new WebSocket(url);
        const messages = [], listeners = [];
        ws.addEventListener('message', ev => { messages.push(JSON.parse(ev.data)); listeners.forEach(fn => fn()); });
        ws.addEventListener('open', () => resolve({
          status: 101, messages,
          waitFor: pred => waitFor(messages, pred, fn => listeners.push(fn)),
          close: () => new Promise(r => { ws.addEventListener('close', r); ws.close(1000, 'test done'); setTimeout(r, 500); }),
        }));
        ws.addEventListener('error', () => resolve({ status: 403 }));
      });
    },
  };
}

function waitFor(messages, pred, subscribe, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const hit = () => messages.find(pred);
    if (hit()) return resolve(hit());
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket message')), timeoutMs);
    subscribe(() => { const m = hit(); if (m) { clearTimeout(timer); resolve(m); } });
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PASSWORD = 'staff-pass-1234';
const staffHeaders = (key = PASSWORD) => ({ 'x-ksm-role': 'staff', 'x-ksm-session-key': key, 'x-ksm-client-id': 'test-client', 'x-ksm-client-name': 'Contract Test', 'x-ksm-court': 'A' });

function payload({ name = 'Contract Test Cup', matches } = {}) {
  return {
    schemaVersion: '1.1', engineVersion: '3.12.9',
    setup: { tName: name, tournamentLogo: 'data:image/png;base64,AAAA' },
    state: { allMatches: { 'Open': matches || [
      { division: 'Open', pool: 'A', type: 'individual', white: 'Aoki', red: 'Baba', wp: [], rp: [], done: false },
      { division: 'Open', type: 'individual', championship: true, position: 'Final', white: 'Aoki', red: 'Chiba', wp: [], rp: [], done: false },
    ] } },
  };
}
const final = patch => ({ division: 'Open', type: 'individual', championship: true, position: 'Final', white: 'Aoki', red: 'Chiba', wp: ['M'], rp: [], done: true, ...patch });

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------
const api = LIVE ? createLiveApi() : await createInProcessApi();
let passed = 0;
const created = [];
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); passed++; }
  catch (err) { console.log(`FAIL ${name}\n     ${err.stack?.split('\n').slice(0, 3).join('\n     ')}`); process.exitCode = 1; }
}
const json = async res => { const text = await res.text(); try { return JSON.parse(text); } catch { return text; } };
async function create(overrides = {}) {
  const res = await api.call('POST', '/api/tournaments', { body: { staffPassword: PASSWORD, engineVersion: '3.12.9', payload: payload(), ...overrides } });
  const body = await json(res);
  if (res.ok) created.push(body.tournamentId);
  return { res, body };
}
const put = (id, revision, body, headers = staffHeaders()) =>
  api.call('PUT', `/api/tournaments/${id}`, { headers, body: { tournamentId: id, revision, engineVersion: '3.12.9', payload: body } });

console.log(`Worker API contract — ${LIVE ? `live: ${BASE}` : 'in-process'}`);

await test('health reports service, realtime and package version', async () => {
  const res = await api.call('GET', '/api/health');
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.ok, true);
  assert.equal(body.realtime, true);
  assert.equal(body.version, pkg.version);
});

let T; // main tournament id used by the following tests
await test('create requires a staff password of at least 4 characters', async () => {
  assert.equal((await create({ staffPassword: undefined })).res.status, 400);
  assert.equal((await create({ staffPassword: 'abc' })).res.status, 400);
});

await test('create rejects structurally invalid tournament state (422)', async () => {
  const { res, body } = await create({ payload: payload({ matches: [null] }) });
  assert.equal(res.status, 422);
  assert.match(body.integrityError.reason, /invalid\/null match/);
});

await test('create returns revision 1, a UUID, and never echoes secrets', async () => {
  const { res, body } = await create();
  assert.equal(res.status, 200);
  T = body.tournamentId;
  assert.match(T, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(body.revision, 1);
  assert.equal(body.staffPassword, undefined);
  assert.equal(body.credentials, undefined);
  assert.ok(!JSON.stringify(body).includes(PASSWORD));
});

await test('stored snapshots strip the tournament logo', async () => {
  const body = await json(await api.call('GET', `/api/tournaments/${T}`));
  assert.equal(body.payload.setup.tName, 'Contract Test Cup');
  assert.equal(body.payload.setup.tournamentLogo, undefined);
});

await test('anyone can read a snapshot (spectator access); unknown IDs are 404', async () => {
  const res = await api.call('GET', `/api/tournaments/${T}`);
  assert.equal(res.status, 200);
  assert.equal((await json(res)).revision, 1);
  assert.equal((await api.call('GET', '/api/tournaments/00000000-0000-0000-0000-000000000000')).status, 404);
});

await test('status reports revision and connections', async () => {
  const body = await json(await api.call('GET', `/api/tournaments/${T}/status`));
  assert.equal(body.exists, true);
  assert.equal(body.revision, 1);
  assert.ok(Array.isArray(body.connections));
});

await test('tournament library lists the new tournament by name', async () => {
  const rows = await json(await api.call('GET', '/api/tournaments'));
  const row = rows.find(r => r.id === T);
  assert.ok(row, 'tournament missing from library');
  assert.equal(row.name, 'Contract Test Cup');
});

await test('discover ignores malformed IDs', async () => {
  const res = await api.call('POST', '/api/tournaments/discover', { body: { ids: [T, '../../etc', 'not-hex!'] } });
  assert.equal(res.status, 200);
  assert.ok((await json(res)).some(r => r.id === T));
});

await test('staff password check: wrong 403, right 200', async () => {
  assert.equal((await api.call('POST', `/api/tournaments/${T}/auth`, { body: { password: 'nope' } })).status, 403);
  assert.equal((await api.call('POST', `/api/tournaments/${T}/auth`, { body: { password: PASSWORD } })).status, 200);
});

await test('saves require the staff role and the correct password', async () => {
  assert.equal((await put(T, 1, payload(), {})).status, 403, 'no credentials');
  assert.equal((await put(T, 1, payload(), staffHeaders('wrong'))).status, 403, 'wrong password');
  assert.equal((await put(T, 1, payload(), { ...staffHeaders(), 'x-ksm-role': 'spectator' })).status, 403, 'spectator role');
  assert.equal((await put(T, 1, payload(), { ...staffHeaders(), 'x-ksm-role': 'director' })).status, 403, 'legacy role name');
  assert.equal((await json(await api.call('GET', `/api/tournaments/${T}`))).revision, 1, 'rejected writes must not change the revision');
});

let spectator, staffSocket;
await test('spectator WebSocket connects without a password and receives the record', async () => {
  spectator = await api.openSocket(T, { role: 'spectator', clientId: 'spec-1', name: 'TV A', court: 'A' });
  assert.equal(spectator.status, 101);
  const hello = await spectator.waitFor(m => m.type === 'connected');
  assert.equal(hello.record.revision, 1);
  assert.equal(hello.record.credentials, undefined);
});

await test('staff WebSocket requires the password', async () => {
  const bad = await api.openSocket(T, { role: 'staff', key: 'wrong', clientId: 'bad' });
  assert.notEqual(bad.status, 101);
  staffSocket = await api.openSocket(T, { role: 'staff', key: PASSWORD, clientId: 'court-a', name: 'Court A', court: 'A' });
  assert.equal(staffSocket.status, 101);
});

await test('presence broadcasts list connected devices with role and court', async () => {
  const msg = await spectator.waitFor(m => m.type === 'presence' && m.clients.some(c => c.clientId === 'court-a'));
  const courtA = msg.clients.find(c => c.clientId === 'court-a');
  assert.equal(courtA.role, 'staff');
  assert.equal(courtA.court, 'A');
  assert.ok(msg.clients.some(c => c.clientId === 'spec-1' && c.role === 'spectator'));
});

await test('an accepted save increments the revision and is broadcast to every socket', async () => {
  const next = payload(); next.state.allMatches.Open[0].wp = ['M'];
  const res = await put(T, 1, next);
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.revision, 2);
  assert.equal(body.updatedBy.role, 'staff');
  assert.equal(body.updatedBy.court, 'A');
  for (const socket of [spectator, staffSocket]) {
    const msg = await socket.waitFor(m => m.type === 'snapshot' && m.record.revision === 2);
    assert.deepEqual(msg.record.payload.state.allMatches.Open[0].wp, ['M']);
  }
});

await test('a save based on a stale revision is rejected with 409 and the current record', async () => {
  const res = await put(T, 1, payload({ name: 'Should not win' }));
  assert.equal(res.status, 409);
  const body = await json(res);
  assert.equal(body.record.revision, 2);
  assert.deepEqual(body.record.payload.state.allMatches.Open[0].wp, ['M']);
  assert.equal((await json(await api.call('GET', `/api/tournaments/${T}`))).payload.setup.tName, 'Contract Test Cup');
});

await test('two simultaneous saves from the same revision: exactly one wins', async () => {
  const a = payload(); a.state.allMatches.Open[0].rp = ['K'];
  const b = payload(); b.state.allMatches.Open[0].rp = ['D'];
  const results = await Promise.all([put(T, 2, a), put(T, 2, b)]);
  const statuses = results.map(r => r.status).sort();
  assert.deepEqual(statuses, [200, 409], `got ${statuses}`);
  const now = await json(await api.call('GET', `/api/tournaments/${T}`));
  assert.equal(now.revision, 3);
});

await test('a body tournamentId that does not match the URL is rejected', async () => {
  const res = await api.call('PUT', `/api/tournaments/${T}`, { headers: staffHeaders(), body: { tournamentId: '11111111-1111-1111-1111-111111111111', revision: 3, payload: payload() } });
  assert.equal(res.status, 409);
});

await test('integrity: a completed winner-required match cannot be Hikiwake', async () => {
  const res = await put(T, 3, payload({ matches: [final({ wp: [], rp: [], completedResult: { winner: 'Hikiwake', wp: [], rp: [] } })] }));
  assert.equal(res.status, 422);
});

await test('integrity: completedResult winner must agree with the score', async () => {
  const res = await put(T, 3, payload({ matches: [final({ completedResult: { winner: 'Chiba', wp: ['M'], rp: [] } })] }));
  assert.equal(res.status, 422);
  assert.match((await json(res)).integrityError.reason, /mismatch/);
});

await test('integrity: a completed elimination tie with no winner is rejected', async () => {
  const res = await put(T, 3, payload({ matches: [final({ wp: ['M'], rp: ['K'] })] }));
  assert.equal(res.status, 422);
});

await test('integrity: a valid completed final is accepted', async () => {
  const res = await put(T, 3, payload({ matches: [final({ completedResult: { winner: 'Aoki', wp: ['M'], rp: [] } })] }));
  assert.equal(res.status, 200);
  assert.equal((await json(res)).revision, 4);
});

await test('pool matches may legitimately end in Hikiwake', async () => {
  const res = await put(T, 4, payload({ matches: [{ division: 'Open', pool: 'A', type: 'individual', white: 'Aoki', red: 'Baba', wp: [], rp: [], done: true, completedResult: { winner: 'Hikiwake', wp: [], rp: [] } }] }));
  assert.equal(res.status, 200);
});

await test('deleting requires the staff password', async () => {
  assert.equal((await api.call('DELETE', `/api/tournaments/${T}`, { headers: { 'x-ksm-session-key': 'wrong' } })).status, 403);
  assert.equal((await api.call('GET', `/api/tournaments/${T}`)).status, 200);
});

await test('delete notifies sockets, removes the snapshot and the library entry', async () => {
  const res = await api.call('DELETE', `/api/tournaments/${T}`, { headers: { 'x-ksm-session-key': PASSWORD } });
  assert.equal(res.status, 200);
  created.splice(created.indexOf(T), 1);
  await spectator.waitFor(m => m.type === 'deleted');
  assert.equal((await api.call('GET', `/api/tournaments/${T}`)).status, 404);
  const rows = await json(await api.call('GET', '/api/tournaments'));
  assert.ok(!rows.some(r => r.id === T));
});

if (!LIVE) {
  await test('admin reset requires KSM_RESET_KEY and wipes every tournament', async () => {
    const { body } = await create();
    assert.equal((await api.call('DELETE', '/api/admin/reset', { headers: { 'x-ksm-reset-key': 'wrong' } })).status, 403);
    const res = await api.call('DELETE', '/api/admin/reset', { headers: { 'x-ksm-reset-key': RESET_KEY } });
    assert.equal(res.status, 200);
    assert.equal((await api.call('GET', `/api/tournaments/${body.tournamentId}`)).status, 404);
    assert.deepEqual(await json(await api.call('GET', '/api/tournaments')), []);
    created.length = 0;
  });
}

for (const socket of [spectator, staffSocket]) await socket?.close?.();
for (const id of created) await api.call('DELETE', `/api/tournaments/${id}`, { headers: { 'x-ksm-session-key': PASSWORD } });
console.log(`${passed} contract checks passed`);
