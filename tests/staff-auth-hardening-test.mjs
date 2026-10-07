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

// ------------------------------------------------------------------------------ salted slow hash
const PBKDF2_FORMAT = /^pbkdf2-sha256\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/;
const sha256Hex = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(v => v.toString(16).padStart(2, '0')).join('');
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return Buffer.from(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)).toString('base64');
}
const storedHash = id => api.storage(id).get('staffPasswordHash');

await test('salted hash: a new tournament stores PBKDF2-SHA256, 100,000 iterations, its own 16-byte salt', async () => {
  const a = await create(), b = await create();
  const [ha, hb] = [await storedHash(a.id), await storedHash(b.id)];
  for (const stored of [ha, hb]) {
    const [, iterations, salt, hash] = stored.match(PBKDF2_FORMAT) || assert.fail(`not the PBKDF2 format: ${stored}`);
    assert.equal(Number(iterations), 100000);
    assert.equal(Buffer.from(salt, 'base64').length, 16);
    assert.equal(hash, await pbkdf2(PASSWORD, Buffer.from(salt, 'base64'), 100000), 'an independent PBKDF2 of the password gives the stored hash');
  }
  assert.notEqual(ha.split('$')[2], hb.split('$')[2], 'each tournament has its own salt');
  assert.notEqual(ha, hb, 'the same password hashes differently in two tournaments');
  assert.ok(!ha.includes(await sha256Hex(PASSWORD)), 'no unsalted SHA-256 stored');
  assert.equal((await login(a.id, PASSWORD)).status, 200);
  assert.equal((await login(a.id, 'wrong')).status, 403);
});

await test('salted hash: an old SHA-256 tournament logs in, is upgraded to PBKDF2, then still logs in', async () => {
  const { id } = await create();
  clock(id);
  const legacy = await sha256Hex(PASSWORD);
  await api.storage(id).put('staffPasswordHash', legacy); // as stored before this change (production)
  assert.equal((await login(id, 'wrong')).status, 403);
  assert.equal(await storedHash(id), legacy, 'a wrong password does not touch the old hash');
  assert.equal((await login(id, PASSWORD)).status, 200, 'the old hash still accepts the password');
  const upgraded = await storedHash(id);
  assert.match(upgraded, PBKDF2_FORMAT, 'upgraded at the correct password');
  assert.equal((await login(id, PASSWORD)).status, 200, 'logs in after the upgrade');
  assert.equal((await login(id, 'wrong')).status, 403);
  assert.equal(await storedHash(id), upgraded, 'not re-hashed at every login');
});

await test('salted hash: an old tournament is also upgraded by a staff save or live connection with the password', async () => {
  for (const use of ['save', 'socket']) {
    const { id } = await create();
    await api.storage(id).put('staffPasswordHash', await sha256Hex(PASSWORD));
    if (use === 'save') assert.equal((await save(id, PASSWORD)).status, 200);
    else { const socket = await api.openSocket(id, { role: 'staff', key: PASSWORD }); assert.equal(socket.status, 101); await socket.close(); }
    assert.match(await storedHash(id), PBKDF2_FORMAT, use);
    assert.equal((await login(id, PASSWORD)).status, 200, use);
  }
});

await test('salted hash: fewer iterations than today are upgraded at the next correct password', async () => {
  const { id } = await create();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await api.storage(id).put('staffPasswordHash', `pbkdf2-sha256$1000$${Buffer.from(salt).toString('base64')}$${await pbkdf2(PASSWORD, salt, 1000)}`);
  assert.equal((await login(id, PASSWORD)).status, 200);
  assert.equal((await storedHash(id)).match(PBKDF2_FORMAT)[1], '100000');
});

await test('salted hash: a missing or malformed hash behaves as before (403, never an error, no upgrade)', async () => {
  const { id } = await create();
  clock(id);
  const cases = [undefined, '', 'not-a-hash', 'pbkdf2-sha256$', 'pbkdf2-sha256$abc$AAAA$AAAA', 'pbkdf2-sha256$100000$!!!$@@@',
    'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAA', 'pbkdf2-sha256$999999999$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(43) + '=', 'pbkdf2-sha256$1$a$b$c', 42];
  for (const stored of cases) {
    if (stored === undefined) await api.storage(id).delete('staffPasswordHash');
    else await api.storage(id).put('staffPasswordHash', stored);
    await api.storage(id).delete('staffAuthFailures');
    assert.equal((await login(id, PASSWORD)).status, 403, `stored ${JSON.stringify(stored)}`);
    assert.equal((await save(id, PASSWORD)).status, 403, `save, stored ${JSON.stringify(stored)}`);
    assert.equal(await storedHash(id), stored, `left as it was: ${JSON.stringify(stored)}`);
  }
});

console.log(`${passed} staff password hardening checks passed`);
