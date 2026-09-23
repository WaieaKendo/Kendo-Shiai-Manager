// useTournamentRecord(tournamentId): the tournament's CloudRecord, kept live.
//
//   const { record, status } = useTournamentRecord(id);
//
// Loads GET /api/tournaments/:id for a quick first paint and opens the spectator
// WebSocket (no key). On a lost connection it keeps showing the last record, reports
// 'reconnecting' and retries with backoff (live-record.ts: reconnectDelay), re-fetching
// the snapshot on every attempt so the page still updates if WebSockets are blocked.
// Records older than the one shown are ignored. Read-only: never PUT/POST/DELETE.
import { useEffect, useReducer } from 'react';
import { INITIAL_LIVE_STATE, liveUrls, parseLiveMessage, reconnectDelay, reduceLive, type LiveState } from './live-record.ts';

export type { LiveState, LiveStatus } from './live-record.ts';

export function useTournamentRecord(tournamentId: string | null | undefined, origin: string = location.origin): LiveState {
  const [state, dispatch] = useReducer(reduceLive, INITIAL_LIVE_STATE);

  useEffect(() => {
    if (!tournamentId) {
      dispatch({ type: 'fetched', record: null });
      return;
    }
    const urls = liveUrls(origin, tournamentId);
    let stopped = false;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const fetchSnapshot = async (): Promise<void> => {
      try {
        const response = await fetch(urls.snapshot, { cache: 'no-store' });
        if (stopped) return;
        if (response.status === 404) dispatch({ type: 'fetched', record: null });
        else if (response.ok) dispatch({ type: 'fetched', record: (await response.json()) as CloudRecord });
      } catch {
        // Offline: the WebSocket retry loop keeps trying.
      }
    };

    const scheduleReconnect = (): void => {
      if (stopped || timer !== undefined) return;
      timer = setTimeout(() => { timer = undefined; connect(); }, reconnectDelay(attempt++, Math.random()));
    };

    function connect(): void {
      if (stopped) return;
      void fetchSnapshot();
      let ws: WebSocket;
      try {
        ws = new WebSocket(urls.socket);
      } catch {
        scheduleReconnect();
        return;
      }
      socket = ws;
      ws.onmessage = event => {
        const message = parseLiveMessage(event.data);
        if (message.type === 'connected') attempt = 0;
        dispatch({ type: 'message', message });
      };
      ws.onclose = () => {
        if (socket !== ws) return;
        socket = null;
        dispatch({ type: 'socket-closed' });
        scheduleReconnect();
      };
      ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
    }

    // Back online, or the page shown again: retry now instead of waiting out the backoff.
    const retryNow = (): void => {
      if (stopped || socket) return;
      clearTimeout(timer);
      timer = undefined;
      attempt = 0;
      connect();
    };
    const onVisible = (): void => { if (document.visibilityState === 'visible') retryNow(); };
    window.addEventListener('online', retryNow);
    document.addEventListener('visibilitychange', onVisible);

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('online', retryNow);
      document.removeEventListener('visibilitychange', onVisible);
      const ws = socket;
      socket = null;
      if (ws) { ws.onclose = null; ws.onmessage = null; ws.close(); }
    };
  }, [tournamentId, origin]);

  return state;
}
