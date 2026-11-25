// #129 part 3: Undo regenerate, the server restore point (src-worker.js TournamentState).
//
// Runs the real src-worker.js in-process (tests/lib/worker-runtime.mjs) with a controllable clock:
// - a save marked restorePoint: 'regenerate' keeps the record it replaces (storage 'restorePoint',
//   with the record, in one write) for 24 h and sets an alarm; an unmarked save keeps nothing; a
//   newer regenerate replaces it; the same regenerate sent again (same restorePointId) does not;
// - GET /status shows { takenAt, expiresAt, finishedMatches } to callers with write access only
//   (staff session, Auth0 director/admin), never to spectators or the read-only;
// - POST /restore-point needs that access and the current revision (409 with the record), writes
//   the stored copy as revision + 1 (updatedBy = the restorer, `restored` named in it and in every
//   later record), deletes the point, broadcasts the snapshot; expired -> 410 (and deleted);
// - the alarm deletes an expired point; Delete tournament and the admin reset leave nothing;
// - the worker's finished-match count agrees with the app's (KSMEngine.finishedMatchSummary).
// The app side (warning line, Danger zone button, court devices, offline outbox) is
// undo-regenerate-test.py.
// Run it with `node --experimental-strip-types tests/restore-point-test.mjs` (tests/run-all.mjs does): it imports the engine's .ts.
import assert from 'node:assert/strict';
import { createInProcessApi } from './lib/worker-runtime.mjs';
import { mockAuth0 } from './lib/mock-auth0.mjs';
import { finishedMatchSummary } from '../app/engine/finished-matches.ts';

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = 'restore-pass';
let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); passed++; }
  catch (err) { console.log(`FAIL ${name}\n     ${err.stack?.split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
}
const body = async res => { const text = await res.text(); try { return JSON.parse(text); } catch { return text; } };
const bout = (white, red, done) => ({ division: 'Open', pool: 'A', type: 'individual', white, red, wp: done ? ['M'] : [], rp: [], done });
const payload = (name, matches) => ({ schemaVersion: '1.1', engineVersion: '3.12.9', setup: { tName: name }, state: { generated: true, allMatches: { Open: matches } } });
const before = payload('Before', [bout('Aoki', 'Baba', true), bout('Chiba', 'Doi', true), bout('Aoki', 'Chiba', false)]);
const redrawn = payload('Redrawn', [bout('Aoki', 'Doi', false), bout('Baba', 'Chiba', false)]);
const clock = object => { let now = Date.now(); object.now = () => now; return { advance(ms) { now += ms; }, get now() { return now; } }; };

// ---------------------------------------------------------------------------
// Staff-key mode (no Auth0)
// ---------------------------------------------------------------------------
{
  const api = await createInProcessApi();
  const staff = (key, extra = {}) => ({ 'x-ksm-role': 'staff', 'x-ksm-session-key': key, 'x-ksm-client-id': 'director-tab', 'x-ksm-client-name': 'Director', ...extra });
  async function create() {
    const res = await api.call('POST', '/api/tournaments', { body: { staffPassword: PASSWORD, engineVersion: '3.12.9', payload: before } });
    assert.equal(res.status, 200);
    return { id: (await body(res)).tournamentId, token: res.headers.get('x-ksm-session-token') };
  }
  const put = (t, revision, data, extra = {}, headers = staff(t.token)) => api.call('PUT', `/api/tournaments/${t.id}`, { headers, body: { tournamentId: t.id, revision, engineVersion: '3.12.9', payload: data, ...extra } });
  const status = (t, headers = staff(t.token)) => api.call('GET', `/api/tournaments/${t.id}/status`, { headers }).then(body);
  // As the app: the id of the point the director confirmed (from /status; here read from storage).
  const pointIdOf = async t => (await api.storage(t.id).get('restorePoint'))?.id ?? 'none';
  const restore = async (t, revision, headers = staff(t.token), restorePointId) => api.call('POST', `/api/tournaments/${t.id}/restore-point`, { headers, body: { revision, restorePointId: restorePointId === undefined ? await pointIdOf(t) : restorePointId } });
  const mark = (id = 'regen-1') => ({ restorePoint: 'regenerate', restorePointId: id });

  await test('an unmarked save keeps no restore point; a marked one keeps the replaced record with the new one in one write', async () => {
    const t = await create();
    assert.equal((await put(t, 1, before)).status, 200);
    assert.equal(await api.storage(t.id).get('restorePoint'), undefined);
    assert.equal((await status(t)).restorePoint, null);
    const storage = api.storage(t.id), writes = [], original = storage.put.bind(storage);
    storage.put = (key, value) => { writes.push(typeof key === 'object' ? Object.keys(key).sort() : [key]); return original(key, value); };
    const clk = clock(api.durableObject(t.id));
    assert.equal((await put(t, 2, redrawn, mark())).status, 200);
    storage.put = original;
    assert.deepEqual(writes, [['record', 'restorePoint']], 'record and restore point were not written together');
    const point = await storage.get('restorePoint');
    assert.equal(point.record.revision, 2);
    assert.deepEqual(point.record.payload, before);
    assert.equal(point.takenAt, clk.now);
    assert.equal(point.expiresAt, clk.now + DAY);
    assert.equal(point.takenBy.name, 'Director');
    assert.equal(await storage.getAlarm(), clk.now + DAY);
    const s = await status(t);
    assert.deepEqual(s.restorePoint, { id: 'regen-1', takenAt: new Date(clk.now).toISOString(), expiresAt: new Date(clk.now + DAY).toISOString(), finishedMatches: 2, revision: 2 });
    console.log(`     restore point copy: ${JSON.stringify(point).length} bytes for a ${JSON.stringify((await storage.get('record'))).length}-byte record`);
  });

  await test('a newer regenerate replaces the point; the same regenerate sent again keeps the first', async () => {
    const t = await create();
    const clk = clock(api.durableObject(t.id));
    assert.equal((await put(t, 1, redrawn, mark('first'))).status, 200);
    clk.advance(60_000);
    // A retry of the same regenerate (its first answer was lost) must not replace the pre-regenerate copy.
    assert.equal((await put(t, 2, redrawn, mark('first'))).status, 200);
    let point = await api.storage(t.id).get('restorePoint');
    assert.equal(point.record.revision, 1);
    assert.deepEqual(point.record.payload, before);
    assert.equal((await put(t, 3, before)).status, 200);
    clk.advance(60_000);
    assert.equal((await put(t, 4, redrawn, mark('second'))).status, 200);
    point = await api.storage(t.id).get('restorePoint');
    assert.equal(point.record.revision, 4);
    assert.equal(point.takenAt, clk.now);
    assert.equal(await api.storage(t.id).getAlarm(), clk.now + DAY);
  });

  await test('/status shows the point only to staff, never to spectators, the read-only or a wrong key', async () => {
    const t = await create();
    await put(t, 1, redrawn, mark());
    assert.equal((await status(t)).restorePoint.finishedMatches, 2);
    for (const headers of [{}, { 'x-ksm-role': 'spectator' }, { 'x-ksm-role': 'spectator', 'x-ksm-session-key': t.token }, staff('ksmst_not-a-session'), staff('')]) {
      const s = await status(t, headers);
      assert.equal(s.exists, true);
      assert.equal('restorePoint' in s, false, JSON.stringify(headers));
    }
  });

  await test('restore writes the stored copy as revision + 1, clears the point and broadcasts it', async () => {
    const t = await create();
    await put(t, 1, redrawn, mark());
    await put(t, 2, payload('Played after redraw', [bout('Aoki', 'Doi', true), bout('Baba', 'Chiba', false)]));
    const court = await api.openSocket(t.id, { role: 'spectator', clientId: 'court-a' });
    const res = await restore(t, 3, staff(t.token, { 'x-ksm-client-id': 'admin-phone', 'x-ksm-client-name': 'Admin phone' }));
    assert.equal(res.status, 200);
    const record = await body(res);
    assert.equal(record.revision, 4);
    assert.deepEqual(record.payload, before);
    assert.equal(record.updatedBy.name, 'Admin phone');
    assert.equal(record.updatedBy.clientId, 'admin-phone');
    assert.equal(record.restored.revision, 4);
    assert.equal(record.restored.fromRevision, 1);
    assert.equal(await api.storage(t.id).get('restorePoint'), undefined);
    assert.equal(await api.storage(t.id).getAlarm(), null);
    assert.equal((await status(t)).restorePoint, null);
    const message = await court.waitFor(m => m.type === 'snapshot' && m.record.revision === 4);
    assert.deepEqual(message.record.payload, before);
    await court.close();
    // Later saves keep naming the restore (a device's work from before it is not replayed on it).
    const next = await body(await put(t, 4, before));
    assert.deepEqual(next.restored, record.restored);
    // Nothing left to undo.
    const again = await restore(t, 5);
    assert.equal(again.status, 404);
    assert.equal((await body(again)).code, 'no-restore-point');
  });

  await test('restore with a stale revision is 409 with the current record and keeps the point', async () => {
    const t = await create();
    await put(t, 1, redrawn, mark());
    await put(t, 2, redrawn);
    for (const revision of [2, undefined]) {
      const res = await restore(t, revision);
      assert.equal(res.status, 409);
      assert.equal((await body(res)).record.revision, 3);
    }
    assert.ok(await api.storage(t.id).get('restorePoint'));
  });

  await test('an expired point counts as none: /status null, restore 410 and the point deleted', async () => {
    const t = await create();
    const clk = clock(api.durableObject(t.id));
    await put(t, 1, redrawn, mark());
    clk.advance(DAY - 1000);
    assert.ok((await status(t)).restorePoint);
    clk.advance(1000);
    assert.equal((await status(t)).restorePoint, null);
    assert.equal(await api.storage(t.id).get('restorePoint'), undefined, 'reading an expired point deletes it');
    await put(t, 2, redrawn, mark('later'));
    clk.advance(DAY + 1);
    // (The staff session token expired with it: the password is the key here.)
    const res = await restore(t, 3, staff(PASSWORD));
    assert.equal(res.status, 410);
    assert.equal((await body(res)).code, 'restore-point-expired');
    assert.equal(await api.storage(t.id).get('restorePoint'), undefined);
    assert.equal((await body(await api.call('GET', `/api/tournaments/${t.id}`))).revision, 3, 'an expired restore wrote a revision');
  });

  await test('the alarm deletes an expired point and sets itself again for a live one', async () => {
    const t = await create();
    const object = api.durableObject(t.id), clk = clock(object), storage = api.storage(t.id);
    await put(t, 1, redrawn, mark());
    clk.advance(DAY / 2);
    await object.alarm();
    assert.ok(await storage.get('restorePoint'), 'an early alarm deleted a live point');
    assert.equal(await storage.getAlarm(), (await storage.get('restorePoint')).expiresAt);
    clk.advance(DAY / 2);
    await object.alarm();
    assert.equal(await storage.get('restorePoint'), undefined);
    assert.equal((await body(await api.call('GET', `/api/tournaments/${t.id}`))).revision, 2, 'the alarm changed the record');
    await object.alarm();  // nothing left: a no-op
  });

  await test('restore needs staff write access: spectators and the read-only get 403', async () => {
    const t = await create();
    await put(t, 1, redrawn, mark());
    for (const headers of [{}, { 'x-ksm-role': 'spectator' }, { 'x-ksm-role': 'spectator', 'x-ksm-session-key': t.token }, staff('')]) {
      assert.equal((await restore(t, 2, headers)).status, 403, JSON.stringify(headers));
    }
    assert.equal((await restore(t, 2, staff('ksmst_expired'))).status, 401);
    assert.ok(await api.storage(t.id).get('restorePoint'));
    // An app older than the saved format is refused like a save.
    assert.equal((await restore(t, 2, staff(t.token, { 'x-ksm-client-schema': undefined }))).status, 426);
    // The legacy password itself (the rollout fallback) is staff access, as for a save.
    assert.equal((await restore(t, 2, staff(PASSWORD))).status, 200);
  });

  await test('a restore point holding an invalid tournament is refused (422) and kept', async () => {
    const t = await create();
    await put(t, 1, redrawn, mark());
    const storage = api.storage(t.id), point = await storage.get('restorePoint');
    point.record.payload.state.allMatches.Open = [null];
    await storage.put('restorePoint', point);
    assert.equal((await restore(t, 2)).status, 422);
    assert.equal((await body(await api.call('GET', `/api/tournaments/${t.id}`))).revision, 2);
  });

  await test('Delete tournament and the admin reset remove the point and its alarm', async () => {
    const t = await create();
    await put(t, 1, redrawn, mark());
    assert.equal((await api.call('DELETE', `/api/tournaments/${t.id}`, { headers: staff(t.token) })).status, 200);
    assert.deepEqual([...api.storage(t.id).map.keys()], ['deletedAt']);
    assert.equal(await api.storage(t.id).getAlarm(), null);
    assert.equal((await restore(t, 2)).status, 410);
    const u = await create();
    await put(u, 1, redrawn, mark());
    assert.equal((await api.call('DELETE', '/api/admin/reset', { headers: { 'x-ksm-reset-key': 'test-reset-key' } })).status, 200);
    assert.deepEqual([...api.storage(u.id).map.keys()], []);
    assert.equal(await api.storage(u.id).getAlarm(), null);
  });

  await test('restore names the point it confirmed: a newer regenerate since then is 409 restore-point-changed; no id is 400', async () => {
    const t = await create();
    await put(t, 1, redrawn, mark('confirmed'));
    const shown = (await status(t)).restorePoint;
    assert.equal(shown.id, 'confirmed');
    // Another regenerate lands after the director confirmed the undo of the first one.
    await put(t, 2, before);
    await put(t, 3, redrawn, mark('newer'));
    const res = await restore(t, 4, staff(t.token), shown.id);
    assert.equal(res.status, 409);
    assert.equal((await body(res)).code, 'restore-point-changed');
    assert.equal((await api.storage(t.id).get('restorePoint')).id, 'newer', 'the newer point was used or dropped');
    assert.equal((await body(await api.call('GET', `/api/tournaments/${t.id}`))).revision, 4, 'a refused undo wrote a revision');
    for (const missing of [null, '']) {
      const r = await restore(t, 4, staff(t.token), missing);
      assert.equal(r.status, 400);
      assert.equal((await body(r)).code, 'restore-point-id-required');
    }
    // A regenerate saved without an id still gets one (so it can be named and undone).
    const u = await create();
    await put(u, 1, redrawn, { restorePoint: 'regenerate' });
    const id = (await status(u)).restorePoint.id;
    assert.ok(id && id === (await api.storage(u.id).get('restorePoint')).id, id);
    assert.equal((await restore(u, 2, staff(u.token), id)).status, 200);
  });

  await test('a point stored before points had ids (id empty) is still undone, with no id or an empty one', async () => {
    for (const restorePointId of [null, '']) {
      const t = await create();
      await put(t, 1, redrawn, mark());
      const storage = api.storage(t.id), point = await storage.get('restorePoint');
      delete point.id;  // as stored by the app before this fix
      await storage.put('restorePoint', point);
      assert.equal((await status(t)).restorePoint.id, '');
      // A named id does not match it: refused like a newer point.
      assert.equal((await body(await restore(t, 2, staff(t.token), 'some-id'))).code, 'restore-point-changed');
      const res = await restore(t, 2, staff(t.token), restorePointId);
      assert.equal(res.status, 200, JSON.stringify(restorePointId));
      assert.deepEqual((await body(res)).payload, before);
    }
  });

  await test('a restore that commits during a save\'s access check makes that save 409 (the save reads the record after it)', async () => {
    const t = await create();
    await put(t, 1, redrawn, mark());
    const object = api.durableObject(t.id), original = object.writeAccess;
    let interleaved = null;
    // The access check can call the access Durable Object (the input gate opens): the restore runs then.
    object.writeAccess = async function (...args) {
      const result = await original.apply(this, args);
      if (!interleaved) {
        object.writeAccess = original;
        interleaved = await object.fetch(new Request('https://durable-object/restore-point', { method: 'POST', headers: { ...staff(t.token), 'content-type': 'application/json' }, body: JSON.stringify({ revision: 2, restorePointId: 'regen-1' }) }));
      }
      return result;
    };
    const res = await put(t, 2, payload('Court point on the redraw', [bout('Aoki', 'Doi', true), bout('Baba', 'Chiba', false)]));
    object.writeAccess = original;
    assert.equal(interleaved?.status, 200, 'the restore did not run during the save');
    assert.equal(res.status, 409, 'the save passed the revision check against the record read before the restore');
    const conflict = await body(res);
    assert.equal(conflict.record.revision, 3);
    assert.equal(conflict.record.restored.revision, 3);
    const stored = await api.storage(t.id).get('record');
    assert.equal(stored.revision, 3);
    assert.deepEqual(stored.payload, before, 'the save overwrote the restored tournament');
    assert.equal(stored.restored.revision, 3);
  });

  await test("the worker's finished-match count agrees with the app's warning (KSMEngine.finishedMatchSummary)", async () => {
    const samples = [
      {},
      { Open: [{ done: false }, { done: false }] },
      { Kids: [{ done: true }, { done: true, championship: true }], Empty: [], Open: [{ done: true }] },
      { Teams: [{ done: true, type: 'teamPosition', teamPair: 'a' }, { done: true, type: 'teamPosition', teamPair: 'a' }, { done: false, type: 'teamPosition' }, { done: true, type: 'kachinuki', lineupW: ['A', 'B'] }] },
    ];
    for (const allMatches of samples) {
      const t = await create();
      assert.equal((await put(t, 1, { setup: { tName: 'Count' }, state: { allMatches } })).status, 200);
      assert.equal((await put(t, 2, redrawn, mark())).status, 200);
      assert.equal((await status(t)).restorePoint.finishedMatches, finishedMatchSummary(allMatches).total, JSON.stringify(allMatches));
    }
  });
}

// ---------------------------------------------------------------------------
// Auth0 accounts: a director or admin of the tournament restores; others do not see it
// ---------------------------------------------------------------------------
{
  const mock = await mockAuth0();
  const api = await createInProcessApi({ auth0: { AUTH0_DOMAIN: mock.issuer, AUTH0_AUDIENCE: mock.audience, AUTH0_CLIENT_ID: mock.clientId, ADMIN_EMAILS: 'admin@example.com' } });
  const jwt = {};
  for (const email of ['admin@example.com', 'director@example.com', 'outsider@example.com']) jwt[email.split('@')[0]] = await mock.token(email);
  const headers = token => ({ authorization: `Bearer ${token}`, 'x-ksm-role': 'staff' });
  try {
    const created = await api.call('POST', '/api/tournaments', { headers: headers(jwt.admin), body: { payload: before, revision: 0 } });
    assert.equal(created.status, 200);
    const id = (await body(created)).tournamentId;
    assert.equal((await api.call('PUT', `/api/tournaments/${id}/visibility`, { headers: headers(jwt.admin), body: { isPublic: true } })).status, 200);
    assert.equal((await api.call('POST', `/api/tournaments/${id}/directors`, { headers: headers(jwt.admin), body: { email: 'director@example.com' } })).status, 200);
    const status = token => api.call('GET', `/api/tournaments/${id}/status`, { headers: token ? headers(token) : {} }).then(body);
    const restore = async (token, revision) => api.call('POST', `/api/tournaments/${id}/restore-point`, { headers: token ? headers(token) : {}, body: { revision, restorePointId: (await api.storage(id).get('restorePoint'))?.id } });

    await test('Auth0: a director sees and restores the point; an outsider and a spectator do not', async () => {
      assert.equal((await api.call('PUT', `/api/tournaments/${id}`, { headers: headers(jwt.director), body: { revision: 1, payload: redrawn, restorePoint: 'regenerate', restorePointId: 'a' } })).status, 200);
      assert.equal((await status(jwt.director)).restorePoint.finishedMatches, 2);
      assert.equal((await status(jwt.admin)).restorePoint.finishedMatches, 2);
      for (const token of [jwt.outsider, '']) assert.equal('restorePoint' in await status(token), false);
      assert.equal((await restore(jwt.outsider, 2)).status, 403);
      assert.equal((await restore('', 2)).status, 403);
      const res = await restore(jwt.director, 2);
      assert.equal(res.status, 200);
      assert.deepEqual((await body(res)).payload, before);
    });

    await test('Auth0: an admin restores too', async () => {
      assert.equal((await api.call('PUT', `/api/tournaments/${id}`, { headers: headers(jwt.admin), body: { revision: 3, payload: redrawn, restorePoint: 'regenerate', restorePointId: 'b' } })).status, 200);
      assert.equal((await restore(jwt.admin, 4)).status, 200);
    });
  } finally { await mock.close?.(); }
}

console.log(`\nRestore point (#129 Undo regenerate): ${passed} passed`);
if (process.exitCode) process.exit(process.exitCode);
process.exit(0);
