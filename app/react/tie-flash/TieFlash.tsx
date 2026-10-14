import { useSyncExternalStore } from 'react';
import { isTied, type ScoreboardInput } from '../court/scoreboard-model.ts';

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
      <path d="M22 16L80 86M78 16L20 86" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <path d="M24 18L52 12L48 39L41 40ZM76 18L48 12L52 39L59 40Z" fill="currentColor" />
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
