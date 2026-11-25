import { useSyncExternalStore } from 'react';
import { isTied, type ScoreboardInput } from '../../shared/ui/scoreboard-model.ts';

type Kind = 'encho' | 'hikiwake';
interface Flash { court: string; kind: Kind; id: string; at: string }
interface FlashWindow {
  ksmTieFlashConnected?: () => boolean;
  ksmSendTieFlash?: () => void;
  ksmCourtHeaderInput?: { requiresWinner?: boolean };
}
const bridge = () => window as unknown as FlashWindow;
const active = new Map<string, Flash>();
const seen = new Map<string, number>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());
// One shared receiver for TV and Live Scores. Only five-second display state is retained.
window.addEventListener('ksm:tie-flash', event => {
  const flash = (event as CustomEvent<Flash>).detail;
  if (!flash || !['A', 'B'].includes(flash.court) || !['encho', 'hikiwake'].includes(flash.kind)
      || typeof flash.id !== 'string' || !flash.id.length || flash.id.length > 40 || typeof flash.at !== 'string') return;
  const at = Date.parse(flash.at), now = Date.now();
  if (!Number.isFinite(at) || now - at > 30000 || at - now > 30000) return;
  for (const [id, expiry] of seen) if (expiry < now) seen.delete(id);
  if (seen.has(flash.id)) return;
  seen.set(flash.id, at + 30000);
  active.set(flash.court, flash);
  notify();
  window.setTimeout(() => {
    if (active.get(flash.court) !== flash) return;
    active.delete(flash.court);
    notify();
  }, 5000);
});
// Court clock state for the TV border. Every reporting device is its own source; the border shows only while
// at least one source is stopped and none is running, so one extra device can never override the scorer.
// A source not refreshed within 15 seconds (device gone) drops out; the scorekeeper repeats it every 5 s.
type ClockState = 'running' | 'stopped';
const clocks = new Map<string, Map<string, { state: ClockState; timer: number }>>();
window.addEventListener('ksm:court-clock', event => {
  const clock = (event as CustomEvent<{ court: string; source: string; state: string }>).detail;
  if (!clock || !['A', 'B'].includes(clock.court) || typeof clock.source !== 'string' || !clock.source.length
      || clock.source.length > 40 || !['running', 'stopped', 'off'].includes(clock.state)) return;
  const sources = clocks.get(clock.court) ?? new Map();
  clocks.set(clock.court, sources);
  window.clearTimeout(sources.get(clock.source)?.timer);
  if (clock.state === 'off') sources.delete(clock.source);
  else {
    const timer = window.setTimeout(() => { sources.delete(clock.source); notify(); }, 15000);
    sources.set(clock.source, { state: clock.state as ClockState, timer });
  }
  notify();
});
export function useCourtClockStopped(court: string) {
  return useSyncExternalStore(subscribe, () => {
    const states = [...(clocks.get(court)?.values() ?? [])].map(entry => entry.state);
    return states.includes('stopped') && !states.includes('running');
  });
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function subscribeConnection(listener: () => void) {
  window.addEventListener('ksm:tie-flash-connection', listener);
  window.addEventListener('ksm:court-header', listener);
  return () => {
    window.removeEventListener('ksm:tie-flash-connection', listener);
    window.removeEventListener('ksm:court-header', listener);
  };
}
export function TieFlashButton({ input }: { input: ScoreboardInput }) {
  const connected = useSyncExternalStore(subscribeConnection, () => bridge().ksmTieFlashConnected?.() ?? false);
  const winner = useSyncExternalStore(subscribeConnection, () => bridge().ksmCourtHeaderInput?.requiresWinner ?? false);
  if (!input.match || !isTied(input.score)) return null;
  return <button className="action-btn tie-flash-action" data-testid="tie-flash-button" disabled={!connected}
    title={!connected ? 'TV not connected' : undefined} onClick={() => bridge().ksmSendTieFlash?.()}>
    <span>Show {winner ? 'Encho' : 'Hikiwake'} on TV</span>
    {!connected && <small>TV not connected</small>}
  </button>;
}
export function TieFlashIcon({ kind }: { kind: Kind }) {
  return <svg viewBox="0 0 100 100" aria-hidden="true" data-testid={`tie-flash-icon-${kind}`}>
    {kind === 'hikiwake' ? <>
      {/* Crossed flags: poles in an X with ball tops, a white (outlined) flag flying left and a solid flag flying right. */}
      <path d="M37 16L63 90M63 16L37 90" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <circle cx="36" cy="12" r="5" fill="currentColor" /><circle cx="64" cy="12" r="5" fill="currentColor" />
      <path d="M36 20C26 18 20 28 6 30L15 58C28 55 36 48 47 44Z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <path d="M64 20C74 18 80 28 94 30L85 58C72 55 64 48 53 44Z" fill="currentColor" />
    </> : <>
      <path d="M30 88V14" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <path d="M33 15H82L68 34L82 53H33Z" fill="currentColor" />
    </>}
  </svg>;
}
export function TieFlashBanner({ court }: { court: string }) {
  const flash = useSyncExternalStore(subscribe, () => active.get(court));
  if (!flash) return null;
  return <div className={`tie-flash tie-flash--${flash.kind}`} data-testid="tie-flash-banner" data-flash-id={flash.id} role="status">
    <TieFlashIcon kind={flash.kind} /><strong>{flash.kind.toUpperCase()}</strong>
  </div>;
}
