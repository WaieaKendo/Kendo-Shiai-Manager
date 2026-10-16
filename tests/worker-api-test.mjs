// Backend API contract test.
//
// Exercises the real src-worker.js request handling end to end: tournament
// creation, staff auth, revision-checked saves (409), integrity validation (422),
// WebSocket snapshot/presence broadcasts, the tournament library, and deletion.
//
// Default: runs in-process against an in-memory stand-in for the Cloudflare
// runtime (Durable Objects, storage, WebSocketPair, static assets; tests/lib/worker-runtime.mjs). No network.
//
// Live mode: KSM_BASE_URL=http://localhost:8787 node tests/worker-api-test.mjs
// runs the same contract over real HTTP/WebSockets (e.g. against `npm run dev`,
// or a future non-Cloudflare backend). Live mode creates and deletes its own
// test tournaments and skips the in-process-only admin reset check.
import assert from 'node:assert/strict';
import { pkg } from './lib/ksm-source.mjs';
import { createInProcessApi, waitFor } from './lib/worker-runtime.mjs';

const BASE = (process.env.KSM_BASE_URL || '').replace(/\/$/, '');
const LIVE = Boolean(BASE);
const RESET_KEY = 'test-reset-key';

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
          send: message => ws.send(message),
          waitFor: pred => waitFor(messages, pred, fn => listeners.push(fn)),
          close: () => new Promise(r => { ws.addEventListener('close', r); ws.close(1000, 'test done'); setTimeout(r, 500); }),
        }));
        ws.addEventListener('error', () => resolve({ status: 403 }));
      });
    },
  };
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
const api = LIVE ? createLiveApi() : await createInProcessApi({ resetKey: RESET_KEY });
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

await test('staff flash messages broadcast with a timestamp; spectator and invalid messages are ignored', async () => {
  staffSocket.send(JSON.stringify({ type: 'flash', court: 'A', kind: 'encho', id: 'flash-1' }));
  for (const socket of [spectator, staffSocket]) {
    const flash = await socket.waitFor(m => m.type === 'flash' && m.id === 'flash-1');
    assert.deepEqual({ type: flash.type, court: flash.court, kind: flash.kind, id: flash.id }, { type: 'flash', court: 'A', kind: 'encho', id: 'flash-1' });
    assert.ok(Number.isFinite(Date.parse(flash.at)));
  }

  const invalid = [
    [spectator, JSON.stringify({ type: 'flash', court: 'A', kind: 'hikiwake', id: 'spectator-flash' }), 'spectator-flash'],
    [staffSocket, JSON.stringify({ type: 'flash', court: 'C', kind: 'encho', id: 'bad-court' }), 'bad-court'],
    [staffSocket, JSON.stringify({ type: 'flash', court: 'A', kind: 'other', id: 'bad-kind' }), 'bad-kind'],
    [staffSocket, '{invalid json', 'bad-json'],
  ];
  for (const [socket, message, marker] of invalid) {
    const counts = [spectator, staffSocket].map(s => s.messages.filter(m => m.type === 'flash').length);
    socket.send(message);
    const barrierIndex = socket.messages.length;
    socket.send('ping');
    await socket.waitFor(m => m.type === 'pong' && socket.messages.indexOf(m) >= barrierIndex);
    assert.deepEqual([spectator, staffSocket].map(s => s.messages.filter(m => m.type === 'flash').length), counts);
    assert.ok(!spectator.messages.some(m => m.type === 'flash' && m.id === marker));
    assert.ok(!staffSocket.messages.some(m => m.type === 'flash' && m.id === marker));
  }
});

await test('court clock messages are staff-only, validated and never stored', async () => {
  const before = await json(await api.call('GET', `/api/tournaments/${T}`));
  const stored = LIVE ? null : structuredClone([...api.storage(T).map]);
  for (const [court, state] of [['A', 'running'], ['A', 'stopped'], ['B', 'stopped'], ['B', 'off']]) {
    const start = [spectator, staffSocket].map(s => s.messages.length);
    staffSocket.send(JSON.stringify({ type: 'clock', court, source: 'device-1', state }));
    for (const [i, socket] of [spectator, staffSocket].entries()) {
      const clock = await socket.waitFor(m => m.type === 'clock' && socket.messages.indexOf(m) >= start[i]);
      assert.deepEqual(Object.keys(clock).sort(), ['at', 'court', 'source', 'state', 'type']);
      assert.equal(clock.court, court);
      assert.equal(clock.source, 'device-1');
      assert.equal(clock.state, state);
      assert.ok(Number.isFinite(Date.parse(clock.at)));
    }
  }
  const ok = { type: 'clock', court: 'A', source: 'device-1', state: 'stopped' };
  const invalid = [
    [spectator, ok],
    [staffSocket, { ...ok, court: 'C' }],
    [staffSocket, { ...ok, state: 'paused' }],
    [staffSocket, { ...ok, state: true }],
    [staffSocket, { ...ok, state: null }],
    [staffSocket, { ...ok, source: '' }],
    [staffSocket, { ...ok, source: 'x'.repeat(41) }],
    [staffSocket, { ...ok, source: 7 }],
    [staffSocket, { type: 'clock', court: 'A', state: 'stopped' }],
    [staffSocket, { type: 'clock', court: 'A', stopped: true }],
    [staffSocket, { ...ok, extra: true }],
    [staffSocket, { ...ok, type: 'other' }],
    [staffSocket, [ok]],
  ];
  for (const [socket, message] of invalid) {
    const counts = [spectator, staffSocket].map(s => s.messages.filter(m => m.type === 'clock').length);
    socket.send(JSON.stringify(message));
    const barrier = socket.messages.length;
    socket.send('ping');
    await socket.waitFor(m => m.type === 'pong' && socket.messages.indexOf(m) >= barrier);
    assert.deepEqual([spectator, staffSocket].map(s => s.messages.filter(m => m.type === 'clock').length), counts, JSON.stringify(message));
  }
  assert.deepEqual(await json(await api.call('GET', `/api/tournaments/${T}`)), before);
  if (!LIVE) assert.deepEqual([...api.storage(T).map], stored, 'Clock traffic wrote durable storage');
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
  assert.equal((await api.call('GET', `/api/tournaments/${T}`)).status, 410);
  const rows = await json(await api.call('GET', '/api/tournaments'));
  assert.ok(!rows.some(r => r.id === T));
});

await test('slugs: unique claims, reserved roots, rename aliases and tombstones', async () => {
  const stamp = crypto.randomUUID().slice(0,8);
  const slug = `links-${stamp}`;
  const a = await create({slug});
  assert.equal(a.res.status,200);
  assert.equal(a.body.slug,slug);
  const id = a.body.tournamentId;
  const lookup = async value => api.call('GET',`/api/slugs/${value}`);
  const rename = async (value, headers=staffHeaders()) => api.call('POST',`/api/tournaments/${id}/slug`,{headers,body:{slug:value}});
  assert.equal((await create({slug})).res.status,409);
  for (const value of ['api','t','privacy','overlay','assets','icons','index.html','service-worker.js','tv','UPPER','bad--slug','-bad','bad-', 'a'.repeat(81)]) {
    assert.equal((await create({slug:value})).res.status,400,value);
    assert.equal((await rename(value)).status,400,value);
  }
  assert.equal((await rename(`renamed-${stamp}`,{})).status,403);
  const newSlug = `renamed-${stamp}`;
  assert.equal((await rename(newSlug)).status,200);
  assert.deepEqual(await json(await lookup(slug)),{id,slug:newSlug});
  assert.deepEqual(await json(await lookup(newSlug)),{id,slug:newSlug});
  const alias=await api.call('GET',`/${slug}/tv/b?red=left`);
  assert.equal(alias.status,308);
  assert.equal(alias.headers.get('location'),`/${newSlug}/tv/b?red=left`);
  assert.equal((await create({slug})).res.status,409);
  // Snapshot replay cannot overwrite the server-owned name.
  const current = await json(await api.call('GET',`/api/tournaments/${id}`));
  const saved = await api.call('PUT',`/api/tournaments/${id}`,{headers:staffHeaders(),body:{...current,slug,payload:current.payload}});
  assert.equal((await json(saved)).slug,newSlug);
  assert.equal((await api.call('DELETE',`/api/tournaments/${id}`,{headers:staffHeaders()})).status,200);
  for (const value of [slug,newSlug]) {
    assert.equal((await lookup(value)).status,410);
    assert.equal((await api.call('GET',`/${value}/court/a`)).status,410);
    assert.equal((await create({slug:value})).res.status,409);
  }
  // Two creates racing for the same name have exactly one winner.
  const results=await Promise.all([create({slug:`race-${stamp}`}),create({slug:`race-${stamp}`})]);
  assert.deepEqual(results.map(r=>r.res.status).sort(),[200,409]);
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
