// Staff password hardening (issue #9, branch fix/staff-password-hardening).
//
// Runs the real src-worker.js in-process (tests/lib/worker-runtime.mjs) with a controllable clock:
// - attempt limit: 5 wrong staff passwords (login, staff live connection, staff saves) lock the
//   tournament's password checks with HTTP 429 + Retry-After, growing (30 s, doubling, 15 min cap);
//   a correct password resets the count; spectators are unaffected.
import assert from 'node:assert/strict';
import { createInProcessApi } from './lib/worker-runtime.mjs';

const api = await createInProcessApi();
const PASSWORD = 'hardening-pass';
let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); passed++; }
  catch (err) { console.log(`FAIL ${name}\n     ${err.stack?.split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
}
const body = async res => { const text = await res.text(); try { return JSON.parse(text); } catch { return text; } };
const payload = (name = 'Hardening Cup') => ({ schemaVersion: '1.1', engineVersion: '3.12.9', setup: { tName: name },
  state: { allMatches: { Open: [{ division: 'Open', pool: 'A', type: 'individual', white: 'Aoki', red: 'Baba', wp: [], rp: [], done: false }] } } });
async function create(password = PASSWORD) {
  const res = await api.call('POST', '/api/tournaments', { body: { staffPassword: password, engineVersion: '3.12.9', payload: payload() } });
  assert.equal(res.status, 200);
  return { id: (await body(res)).tournamentId, res };
}
// The Durable Object's clock: tests move it forward instead of waiting.
function clock(id) {
  const object = api.durableObject(id);
  let now = Date.now();
  object.now = () => now;
  return { advance(ms) { now += ms; }, get now() { return now; } };
}
const login = (id, password) => api.call('POST', `/api/tournaments/${id}/auth`, { body: { password } });
const staffHeaders = key => ({ 'x-ksm-role': 'staff', 'x-ksm-session-key': key, 'x-ksm-client-id': 'hardening' });
const save = async (id, key) => {
  const revision = (await body(await api.call('GET', `/api/tournaments/${id}`))).revision;
  return api.call('PUT', `/api/tournaments/${id}`, { headers: staffHeaders(key), body: { tournamentId: id, revision, payload: payload() } });
};

// ---------------------------------------------------------------------------------- attempt limit
await test('attempt limit: 4 wrong passwords are 403, the 5th locks with 429, Retry-After and a clear message', async () => {
  const { id } = await create();
  clock(id);
  for (let i = 1; i <= 4; i++) assert.equal((await login(id, `wrong-${i}`)).status, 403, `attempt ${i}`);
  const res = await login(id, 'wrong-5');
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '30');
  const info = await body(res);
  assert.equal(info.retryAfter, 30);
  assert.equal(info.code, 'staff-locked');
  assert.match(info.error, /Too many incorrect Staff passwords\. Try again in 30 seconds\./);
});

await test('attempt limit: while locked even the right password is refused; afterwards it works and resets the count', async () => {
  const { id } = await create();
  const time = clock(id);
  for (let i = 1; i <= 5; i++) await login(id, `wrong-${i}`);
  const locked = await login(id, PASSWORD);
  assert.equal(locked.status, 429, 'right password during the lockout');
  time.advance(10 * 1000);
  assert.equal((await login(id, PASSWORD)).headers.get('retry-after'), '20', 'the wait counts down');
  time.advance(20 * 1000);
  assert.equal((await login(id, PASSWORD)).status, 200, 'right password after the lockout');
  // The count starts again from zero: four more wrong ones are plain 403s.
  for (let i = 1; i <= 4; i++) assert.equal((await login(id, `again-${i}`)).status, 403, `attempt ${i} after a success`);
  assert.equal((await login(id, PASSWORD)).status, 200);
});

await test('attempt limit: the lockout doubles with each further wrong password, up to 15 minutes', async () => {
  const { id } = await create();
  const time = clock(id);
  for (let i = 1; i <= 4; i++) await login(id, `wrong-${i}`);
  const waits = [];
  for (let i = 0; i < 7; i++) {
    const res = await login(id, `more-${i}`);
    assert.equal(res.status, 429);
    const wait = Number(res.headers.get('retry-after'));
    waits.push(wait);
    time.advance(wait * 1000);
  }
  assert.deepEqual(waits, [30, 60, 120, 240, 480, 900, 900]);
  assert.match((await body(await login(id, 'x'))).error, /Try again in 15 minutes/);
});

await test('attempt limit: staff saves, deletes and staff live connections count; spectators are unaffected', async () => {
  const { id } = await create();
  clock(id);
  assert.equal((await save(id, 'wrong-a')).status, 403);
  assert.equal((await api.openSocket(id, { role: 'staff', key: 'wrong-b' })).status, 403);
  assert.equal((await api.call('DELETE', `/api/tournaments/${id}`, { headers: { 'x-ksm-session-key': 'wrong-c' } })).status, 403);
  assert.equal((await login(id, 'wrong-d')).status, 403);
  const fifth = await save(id, 'wrong-e');
  assert.equal(fifth.status, 429);
  assert.ok(Number(fifth.headers.get('retry-after')) > 0);
  assert.equal((await save(id, PASSWORD)).status, 429, 'staff save with the right password during the lockout');
  assert.equal((await api.openSocket(id, { role: 'staff', key: PASSWORD })).status, 429, 'staff live connection during the lockout');
  // Spectators: read and connect as before.
  assert.equal((await api.call('GET', `/api/tournaments/${id}`)).status, 200);
  assert.equal((await api.call('GET', `/api/tournaments/${id}/status`)).status, 200);
  const spectator = await api.openSocket(id, { role: 'spectator', clientId: 'tv' });
  assert.equal(spectator.status, 101);
  await spectator.waitFor(m => m.type === 'connected');
  await spectator.close();
  assert.equal((await api.call('GET', `/api/tournaments/${id}`)).status, 200);
});

await test('attempt limit: empty keys and spectator saves are not password attempts', async () => {
  const { id } = await create();
  clock(id);
  for (let i = 0; i < 6; i++) {
    assert.equal((await save(id, '')).status, 403);
    assert.equal((await login(id, '')).status, 403);
    assert.equal((await api.call('PUT', `/api/tournaments/${id}`, { headers: { ...staffHeaders('wrong'), 'x-ksm-role': 'spectator' }, body: { tournamentId: id, revision: 1, payload: payload() } })).status, 403);
  }
  assert.equal((await login(id, PASSWORD)).status, 200);
});

await test('attempt limit: parallel guesses are checked one at a time (a burst cannot get past the limit)', async () => {
  const { id } = await create();
  clock(id);
  const object = api.durableObject(id);
  const guess = i => object.fetch(new Request('https://durable-object/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: `burst-${i}` }) }));
  const statuses = (await Promise.all(Array.from({ length: 20 }, (_, i) => guess(i)))).map(r => r.status);
  assert.equal(statuses.filter(s => s === 403).length, 4, `statuses: ${statuses}`);
  assert.equal(statuses.filter(s => s === 429).length, 16);
  assert.equal((await api.storage(id).get('staffAuthFailures')).count, 5, 'refused attempts during the lockout are not evaluated');
});

await test('attempt limit: tournaments count separately', async () => {
  const a = await create(), b = await create();
  clock(a.id); clock(b.id);
  for (let i = 1; i <= 5; i++) await login(a.id, `wrong-${i}`);
  assert.equal((await login(a.id, PASSWORD)).status, 429);
  assert.equal((await login(b.id, PASSWORD)).status, 200);
});

console.log(`${passed} staff password hardening checks passed`);
