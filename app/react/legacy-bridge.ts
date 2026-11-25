// Lets React islands inside the legacy app re-render when the legacy `state` changes.
//
// The classic bundle (app/js/00-react-bridge.js) dispatches a 'ksm:state-changed'
// window event after court actions and full renders (including live-sync updates),
// at most once per task, and exposes the state and a change counter as window
// functions. React never writes to `state`.
import { useMemo, useSyncExternalStore } from 'react';

export const LEGACY_STATE_EVENT = 'ksm:state-changed';

export interface LegacyStateChangeDetail {
  version: number;
  reasons: string[];
}

interface LegacyWindow {
  ksmLegacyState?: () => TournamentState;
  ksmLegacyStateVersion?: () => number;
}

const legacy = (): LegacyWindow => (typeof window === 'undefined' ? {} : (window as unknown as LegacyWindow));

/** The legacy app's `state`, or undefined when this page has no legacy app. */
export function legacyState(): TournamentState | undefined {
  return legacy().ksmLegacyState?.();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(LEGACY_STATE_EVENT, onChange);
  return () => window.removeEventListener(LEGACY_STATE_EVENT, onChange);
}

const version = (): number => legacy().ksmLegacyStateVersion?.() ?? 0;

/** Re-renders on every legacy state change; returns the change counter. */
export function useLegacyStateVersion(): number {
  return useSyncExternalStore(subscribe, version, () => 0);
}

/**
 * Reads the legacy `state` through `select`, recomputed after each change.
 * Treat the result as read-only (it may share objects with the legacy app).
 */
export function useLegacyState<T>(select: (state: TournamentState) => T): T | undefined {
  const v = useLegacyStateVersion();
  return useMemo(() => {
    const s = legacyState();
    return s ? select(s) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- v is the change signal
  }, [v, select]);
}
