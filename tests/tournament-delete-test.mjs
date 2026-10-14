// Tournament delete is final (issue #26 step 1, branch feat/delete-tournament).
//
// Runs the real src-worker.js in-process (tests/lib/worker-runtime.mjs). A staff-authorized DELETE
// leaves a tombstone (`deletedAt`) in the tournament's Durable Object: from then on every route
// answers 410 {error:'Tournament deleted', code:'tournament-deleted', deletedAt}, a stale device's
// save or bootstrap cannot recreate the tournament, the library never lists it again, and no
// WebSocket is accepted. Deleting twice is 410 as well (the second delete is refused, nothing else).
import assert from 'node:assert/strict';
import { createInProcessApi } from './lib/worker-runtime.mjs';

const api = await createInProcessApi();
const PASSWORD = 'delete-pass';
let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); passed++; }
  catch (err) { console.log(`FAIL ${name}\n     ${err.stack?.split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
}
const body = async res => { const text = await res.text(); try { return JSON.parse(text); } catch { return text; } };
const payload = (name = 'Delete Cup') => ({ schemaVersion: '1.1', engineVersion: '3.12.9', setup: { tName: name },
  state: { allMatches: { Open: [{ division: 'Open', pool: 'A', type: 'individual', white: 'Aoki', red: 'Baba', wp: [], rp: [], done: false }] } } });
async function create(name) {
  const res = await api.call('POST', '/api/tournaments', { body: { staffPassword: PASSWORD, engineVersion: '3.12.9', payload: payload(name) } });
  assert.equal(res.status, 200);
  return { id: (await body(res)).tournamentId, token: res.headers.get('x-ksm-session-token') };
}
const staff = key => ({ 'x-ksm-role': 'staff', 'x-ksm-session-key': key, 'x-ksm-client-id': 'delete-test' });
const del = (id, key) => api.call('DELETE', `/api/tournaments/${id}`, { headers: key ? staff(key) : {} });
const library = async () => body(await api.call('GET', '/api/tournaments'));
async function assertGone(res, label) {
  assert.equal(res.status, 410, `${label}: status`);
  const info = await body(res);
  assert.equal(info.error, 'Tournament deleted', `${label}: error`);
  assert.equal(info.code, 'tournament-deleted', `${label}: code`);
  assert.ok(!Number.isNaN(Date.parse(info.deletedAt)), `${label}: deletedAt is an ISO time`);
  return info;
}
async function deleted(name) {
  const { id, token } = await create(name);
  const res = await del(id, token);
  assert.ok(res.ok, `delete ${res.status}`);
  return { id, token };
}

await test('delete: staff delete succeeds, removes the record and the library entry', async () => {
  const { id, token } = await create('Gone Cup');
  assert.ok((await library()).some(row => row.id === id));
  const res = await del(id, token);
  assert.equal(res.status, 200);
  assert.equal((await body(res)).ok, true);
  assert.ok(!(await library()).some(row => row.id === id), 'library entry removed');
  assert.equal(await api.storage(id).get('record'), undefined, 'record removed');
  assert.ok(await api.storage(id).get('deletedAt'), 'tombstone stored');
});

await test('delete: the password also works as the key (rollout fallback), as for other staff actions', async () => {
  const { id } = await create();
  assert.equal((await del(id, PASSWORD)).status, 200);
});

await test('delete: spectator, missing key and wrong key cannot delete (403) and nothing changes', async () => {
  const { id, token } = await create('Safe Cup');
  assert.equal((await del(id)).status, 403, 'no key');
  assert.equal((await api.call('DELETE', `/api/tournaments/${id}`, { headers: { 'x-ksm-role': 'spectator' } })).status, 403, 'spectator');
  assert.equal((await del(id, 'wrong-password')).status, 403, 'wrong key');
  assert.equal(await api.storage(id).get('deletedAt'), undefined, 'no tombstone');
  assert.equal((await api.call('GET', `/api/tournaments/${id}`)).status, 200, 'still readable');
  assert.ok((await library()).some(row => row.id === id), 'still in the library');
  assert.equal((await del(id, token)).status, 200);
});

await test('after delete: GET snapshot is 410 with the tombstone body', async () => {
  const { id } = await deleted();
  await assertGone(await api.call('GET', `/api/tournaments/${id}`), 'GET');
});

await test('after delete: a stale device PUT is 410 and stores nothing (no record, no library entry)', async () => {
  const { id, token } = await deleted('Stale Cup');
  for (const key of [token, PASSWORD]) {
    const res = await api.call('PUT', `/api/tournaments/${id}`, { headers: staff(key), body: { tournamentId: id, revision: 3, payload: payload('Zombie') } });
    await assertGone(res, `PUT with ${key === token ? 'token' : 'password'}`);
  }
  assert.equal(await api.storage(id).get('record'), undefined, 'nothing stored');
  assert.ok(!(await library()).some(row => row.id === id), 'not re-listed');
  await assertGone(await api.call('GET', `/api/tournaments/${id}`), 'GET after the PUT');
});

await test('after delete: PUT without any key is 410 too (the tombstone answers before authorization)', async () => {
  const { id } = await deleted();
  await assertGone(await api.call('PUT', `/api/tournaments/${id}`, { headers: { 'x-ksm-role': 'staff' }, body: { tournamentId: id, revision: 0, payload: payload() } }), 'PUT without key');
});

await test('after delete: bootstrap for that id is 410 and stores nothing', async () => {
  const { id } = await deleted();
  const res = await api.durableObject(id).fetch(new Request('https://durable-object/bootstrap', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ staffPassword: 'new-pass-1', tournamentId: id, revision: 0, payload: payload('Reborn') }) }));
  await assertGone(res, 'bootstrap');
  assert.equal(await api.storage(id).get('record'), undefined);
  assert.equal(await api.storage(id).get('staffPasswordHash'), undefined, 'no new password stored');
});

await test('after delete: /status reports deleted (410, exists false)', async () => {
  const { id } = await deleted();
  const res = await api.call('GET', `/api/tournaments/${id}/status`);
  const info = await assertGone(res, 'status');
  assert.equal(info.exists, false);
  assert.equal(info.deleted, true);
});

await test('after delete: login (POST /auth) is 410', async () => {
  const { id } = await deleted();
  await assertGone(await api.call('POST', `/api/tournaments/${id}/auth`, { body: { password: PASSWORD } }), 'auth');
});

await test('after delete: staff and spectator WebSockets are refused before the upgrade (410)', async () => {
  const { id, token } = await deleted();
  const staffSocket = await api.openSocket(id, { role: 'staff', key: token });
  assert.equal(staffSocket.status, 410, 'staff');
  const spectatorSocket = await api.openSocket(id, { role: 'spectator' });
  assert.equal(spectatorSocket.status, 410, 'spectator');
  const raw = await api.call('GET', `/api/tournaments/${id}/live?role=spectator`, { headers: { Upgrade: 'websocket' } });
  await assertGone(raw, 'live body');
});

await test('delete: open staff and spectator sockets get a deleted message and are closed with "Tournament deleted"', async () => {
  const { id, token } = await create('Live Cup');
  const open = async params => {
    const response = await api.call('GET', `/api/tournaments/${id}/live?${new URLSearchParams(params)}`, { headers: { Upgrade: 'websocket' } });
    assert.equal(response.status, 101);
    return response.webSocket;
  };
  const sockets = [await open({ role: 'spectator' }), await open({ role: 'staff', key: token })];
  assert.equal((await del(id, token)).status, 200);
  for (const client of sockets) {
    assert.ok(client.messages.some(message => message.type === 'deleted'), 'deleted message');
    assert.deepEqual(client.closed, { code: 1000, reason: 'Tournament deleted' });
  }
});

await test('after delete: discover does not re-add it to the library', async () => {
  const { id } = await deleted('Discover Cup');
  const res = await api.call('POST', '/api/tournaments/discover', { body: { ids: [id] } });
  assert.equal(res.status, 200);
  assert.ok(!(await res.json()).some(row => row.id === id));
  assert.ok(!(await library()).some(row => row.id === id));
});

await test('after delete: a second delete is refused with 410 (not a new success), the tombstone time is unchanged', async () => {
  const { id, token } = await deleted();
  const first = await api.storage(id).get('deletedAt');
  await assertGone(await del(id, token), 'second delete with the old token');
  await assertGone(await del(id, PASSWORD), 'second delete with the password');
  await assertGone(await del(id), 'second delete without a key');
  assert.equal(await api.storage(id).get('deletedAt'), first);
});

await test('after delete: staff secrets are gone (no password hash, no sessions) and other tournaments are untouched', async () => {
  const other = await create('Other Cup');
  const { id } = await deleted();
  assert.equal(await api.storage(id).get('staffPasswordHash'), undefined);
  assert.equal(await api.storage(id).get('staffSessions'), undefined);
  assert.equal((await api.call('GET', `/api/tournaments/${other.id}`)).status, 200);
  assert.ok((await library()).some(row => row.id === other.id));
});

await test('admin reset still clears a tombstone along with the rest (test-data reset)', async () => {
  const { id } = await deleted('Reset Cup');
  const res = await api.call('DELETE', '/api/admin/reset', { headers: { 'x-ksm-reset-key': 'test-reset-key' } });
  assert.equal(res.status, 200);
  // The deleted tournament is no longer in the library, so the reset does not reach it: its tombstone stays.
  assert.ok(await api.storage(id).get('deletedAt'), 'tombstone survives an admin reset that cannot list it');
});

console.log(`\n${passed} passed`);
