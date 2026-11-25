// Pure logic behind useTournamentRecord(): URLs, reconnect backoff, and how a GET
// response or a spectator WebSocket message changes what the page shows. No React, no
// DOM, so Node runs its unit tests directly (tests/react/live-record.test.mjs).
//
// Server side (src-worker.js): GET /api/tournaments/:id returns the CloudRecord (404
// when there is none); /api/tournaments/:id/live is a WebSocket that needs no key for
// spectators and sends JSON messages: 'connected' {record} once, 'snapshot' {record}
// after every save, 'presence' (ignored here) and 'deleted'.

export type LiveStatus =
  | 'connecting'    // first load, nothing received yet
  | 'live'          // WebSocket open, record is current
  | 'reconnecting'  // WebSocket lost; showing the last record while retrying
  | 'not-found'     // the server has no such tournament
  | 'deleted';      // the tournament was deleted while we watched

export interface LiveState {
  record: CloudRecord | null;
  status: LiveStatus;
}

export type LiveMessage =
  | { type: 'connected'; record: CloudRecord | null }
  | { type: 'snapshot'; record: CloudRecord | null }
  | { type: 'deleted' }
  | { type: 'presence' }
  | { type: 'unknown' };

export type LiveEvent =
  | { type: 'fetched'; record: CloudRecord | null }  // GET result; null = 404
  | { type: 'message'; message: LiveMessage }
  | { type: 'socket-closed' };

export const INITIAL_LIVE_STATE: LiveState = { record: null, status: 'connecting' };

export function liveUrls(origin: string, tournamentId: string): { snapshot: string; socket: string } {
  const base = new URL(origin);
  const id = encodeURIComponent(tournamentId);
  const snapshot = new URL(`/api/tournaments/${id}`, base).toString();
  const socket = new URL(`/api/tournaments/${id}/live`, base);
  socket.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  socket.searchParams.set('role', 'spectator');
  return { snapshot, socket: socket.toString() };
}

/** Delay before reconnect attempt `attempt` (0-based): 1 s, 2 s, 4 s ... capped at 30 s,
 *  with up to 20% jitter (random in [0, 1)) so many overlays do not retry in lockstep. */
export function reconnectDelay(attempt: number, random = 0): number {
  const base = Math.min(30_000, 1_000 * 2 ** Math.max(0, Math.min(attempt, 10)));
  return Math.round(base * (1 + 0.2 * Math.min(Math.max(random, 0), 1)));
}

const isRecord = (value: unknown): value is CloudRecord =>
  typeof value === 'object' && value !== null &&
  typeof (value as CloudRecord).revision === 'number' &&
  typeof (value as CloudRecord).payload === 'object' && (value as CloudRecord).payload !== null;

/** A WebSocket message (string data) as a LiveMessage; anything unexpected is 'unknown'. */
export function parseLiveMessage(data: unknown): LiveMessage {
  if (typeof data !== 'string') return { type: 'unknown' };
  let msg: unknown;
  try { msg = JSON.parse(data); } catch { return { type: 'unknown' }; }
  if (typeof msg !== 'object' || msg === null) return { type: 'unknown' };
  const { type, record } = msg as { type?: unknown; record?: unknown };
  if (type === 'connected' || type === 'snapshot') return { type, record: isRecord(record) ? record : null };
  if (type === 'deleted' || type === 'presence') return { type };
  return { type: 'unknown' };
}

/** True when `incoming` should replace `current`: a newer revision (older and equal
 *  revisions are ignored, e.g. a GET that answers after a newer WebSocket snapshot). */
export function isNewerRecord(current: CloudRecord | null, incoming: CloudRecord | null): incoming is CloudRecord {
  if (!incoming) return false;
  if (!current) return true;
  if (incoming.tournamentId !== current.tournamentId) return true;
  return incoming.revision > current.revision;
}

const withRecord = (state: LiveState, incoming: CloudRecord | null, status: LiveStatus): LiveState => {
  const record = isNewerRecord(state.record, incoming) ? incoming : state.record;
  return record === state.record && status === state.status ? state : { record, status };
};

/** The next LiveState; returns `state` itself when nothing changed (no re-render). */
export function reduceLive(state: LiveState, event: LiveEvent): LiveState {
  if (event.type === 'socket-closed') {
    if (state.status === 'deleted' || state.status === 'not-found') return state;
    return state.status === 'reconnecting' ? state : { ...state, status: 'reconnecting' };
  }
  if (event.type === 'fetched') {
    if (!event.record) return state.record || state.status === 'deleted' ? state : { record: null, status: 'not-found' };
    // A GET does not prove the WebSocket is up: keep the connection status.
    const status = state.status === 'not-found' ? 'connecting' : state.status;
    return withRecord(state, event.record, status);
  }
  const { message } = event;
  switch (message.type) {
    case 'connected':
      return message.record ? withRecord(state, message.record, 'live') : { record: null, status: 'not-found' };
    case 'snapshot':
      // Both arrive over an open WebSocket, so the page is live again.
      return withRecord(state, message.record, 'live');
    case 'deleted':
      return { record: null, status: 'deleted' };
    default:
      return state;
  }
}
