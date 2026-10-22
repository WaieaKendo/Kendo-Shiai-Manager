import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_LIVE_STATE, isNewerRecord, liveUrls, parseLiveMessage, reconnectDelay, reduceLive } from '../../app/react/features/live/live-record.ts';

const rec = (revision, tournamentId = 't1') => ({ tournamentId, revision, payload: { state: {} } });

test('liveUrls: snapshot + spectator socket, ws/wss by protocol', () => {
  assert.deepEqual(liveUrls('https://ksm.example', 'abc-1'), {
    snapshot: 'https://ksm.example/api/tournaments/abc-1',
    socket: 'wss://ksm.example/api/tournaments/abc-1/live?role=spectator',
  });
  assert.equal(liveUrls('http://127.0.0.1:8787', 'x').socket, 'ws://127.0.0.1:8787/api/tournaments/x/live?role=spectator');
});

test('reconnectDelay: exponential, capped, jittered up to 20%', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 50].map(a => reconnectDelay(a)), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.equal(reconnectDelay(0, 1), 1200);
  assert.equal(reconnectDelay(0, 5), 1200);
});

test('parseLiveMessage', () => {
  assert.deepEqual(parseLiveMessage(JSON.stringify({ type: 'snapshot', record: rec(3) })), { type: 'snapshot', record: rec(3) });
  assert.deepEqual(parseLiveMessage(JSON.stringify({ type: 'connected', record: null })), { type: 'connected', record: null });
  assert.deepEqual(parseLiveMessage(JSON.stringify({ type: 'connected', record: { revision: 'x' } })), { type: 'connected', record: null });
  assert.deepEqual(parseLiveMessage('{"type":"presence","clients":[]}'), { type: 'presence' });
  assert.deepEqual(parseLiveMessage('{"type":"deleted"}'), { type: 'deleted' });
  for (const bad of ['nope', '"str"', 'null', '{"type":"other"}', 42]) assert.deepEqual(parseLiveMessage(bad), { type: 'unknown' });
});

test('isNewerRecord ignores older and equal revisions', () => {
  assert.equal(isNewerRecord(null, rec(1)), true);
  assert.equal(isNewerRecord(rec(5), rec(6)), true);
  assert.equal(isNewerRecord(rec(5), rec(5)), false);
  assert.equal(isNewerRecord(rec(5), rec(4)), false);
  assert.equal(isNewerRecord(rec(5), null), false);
  assert.equal(isNewerRecord(rec(5, 'a'), rec(1, 'b')), true);
});

test('reduceLive: GET then WebSocket, stale GET ignored', () => {
  let s = reduceLive(INITIAL_LIVE_STATE, { type: 'fetched', record: rec(2) });
  assert.deepEqual(s, { record: rec(2), status: 'connecting' });
  s = reduceLive(s, { type: 'message', message: { type: 'connected', record: rec(3) } });
  assert.deepEqual(s, { record: rec(3), status: 'live' });
  const same = reduceLive(s, { type: 'fetched', record: rec(2) });
  assert.equal(same, s, 'older GET answer is ignored without a new object');
  assert.equal(reduceLive(s, { type: 'message', message: { type: 'presence' } }), s);
  s = reduceLive(s, { type: 'message', message: { type: 'snapshot', record: rec(4) } });
  assert.equal(s.record.revision, 4);
});

test('reduceLive: reconnecting keeps the record; reconnect restores live', () => {
  let s = { record: rec(4), status: 'live' };
  s = reduceLive(s, { type: 'socket-closed' });
  assert.deepEqual(s, { record: rec(4), status: 'reconnecting' });
  assert.equal(reduceLive(s, { type: 'socket-closed' }), s);
  assert.deepEqual(reduceLive(s, { type: 'fetched', record: rec(5) }), { record: rec(5), status: 'reconnecting' });
  assert.deepEqual(reduceLive(s, { type: 'message', message: { type: 'connected', record: rec(4) } }), { record: rec(4), status: 'live' });
});

test('reduceLive: not found and deleted', () => {
  assert.deepEqual(reduceLive(INITIAL_LIVE_STATE, { type: 'fetched', record: null }), { record: null, status: 'not-found' });
  assert.deepEqual(reduceLive(INITIAL_LIVE_STATE, { type: 'message', message: { type: 'connected', record: null } }), { record: null, status: 'not-found' });
  const deleted = reduceLive({ record: rec(4), status: 'live' }, { type: 'message', message: { type: 'deleted' } });
  assert.deepEqual(deleted, { record: null, status: 'deleted' });
  assert.equal(reduceLive(deleted, { type: 'socket-closed' }), deleted);
  assert.equal(reduceLive(deleted, { type: 'fetched', record: null }), deleted);
});
