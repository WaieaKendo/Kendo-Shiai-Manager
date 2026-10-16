import { useEffect, useRef, useState } from 'react';

interface TimerInput {
  tournamentId: string; court: string; matchKey: string;
  sound: string; enabled: boolean; durationMs: number; enchoMs: number; tied: boolean; scored: boolean; requiresWinner: boolean;
}
interface TimerState {
  matchKey: string;
  phase: 'regulation' | 'encho';
  /** Zero denotes unlimited encho. */
  durationMs: number;
  elapsedBeforeMs: number;
  runningSince: number | null;
  hasStarted: boolean;
}
interface TimerWindow {
  ksmMatchTimerInput?: () => TimerInput | null;
  ksmSendTieFlash?: () => void;
  ksmTieFlashConnected?: () => boolean;
  ksmSendCourtClock?: (court: string, state: 'running' | 'stopped' | 'off') => void;
}
const legacy = window as unknown as TimerWindow;
const elapsed = (s: TimerState, now = Date.now()) => s.elapsedBeforeMs +
  (s.runningSince === null ? 0 : Math.max(0, now - s.runningSince));
const unlimited = (s: TimerState) => s.phase === 'encho' && s.durationMs === 0;
const expired = (s: TimerState) => !unlimited(s) && elapsed(s) >= s.durationMs;
const fresh = (input: TimerInput): TimerState => ({matchKey: input.matchKey,
  phase: 'regulation', durationMs: input.durationMs, elapsedBeforeMs: 0, runningSince: null, hasStarted: false});
const storageKey = (i: TimerInput) => `ksm:match-timer:${JSON.stringify([i.tournamentId, i.court, i.matchKey])}`;
function restore(input: TimerInput): TimerState {
  try {
    const s = JSON.parse(localStorage.getItem(storageKey(input)) || 'null');
    if (s && s.matchKey === input.matchKey && ['regulation', 'encho'].includes(s.phase) &&
        Number.isFinite(s.durationMs) && s.durationMs >= 0 && (s.durationMs > 0 || s.phase === 'encho') &&
        Number.isFinite(s.elapsedBeforeMs) && (s.runningSince === null ||
          (Number.isFinite(s.runningSince) && s.runningSince >= 0))) return {...s, hasStarted: s.hasStarted ?? (s.runningSince !== null || s.elapsedBeforeMs !== 0)};
  } catch { /* Missing or corrupt device storage starts a fresh timer. */ }
  return fresh(input);
}

let audio: AudioContext | undefined;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch { /* Audio may be unavailable on this device. */ }
}
const soundFiles = new Map<string, Promise<ArrayBuffer>>();
function soundFile(sound: string) {
  const name = sound === 'whistle02' ? 'whistle02' : 'whistle01';
  let file = soundFiles.get(name);
  if (!file) {
    file = fetch(`/assets/sounds/${name}.mp3`).then(response => {
      if (!response.ok) throw new Error('Time-up sound unavailable');
      return response.arrayBuffer();
    });
    soundFiles.set(name, file);
    void file.catch(() => soundFiles.delete(name));
  }
  return file;
}
async function buzzer(sound: string) {
  try {
    unlockAudio();
    const context = audio;
    if (!context) return;
    const buffer = await context.decodeAudioData((await soundFile(sound)).slice(0));
    const source = context.createBufferSource();
    source.buffer = buffer; source.connect(context.destination);
    source.onended = () => source.disconnect();
    source.start();
  } catch { /* The flashing TIME display remains available if sound cannot play. */ }
}

function CourtTimer({input}: {input: TimerInput}) {
  const [timer, setTimer] = useState(() => restore(input));
  const [now, setNow] = useState(Date.now);
  const [storageError, setStorageError] = useState(false);
  const [flashUntil, setFlashUntil] = useState(0);
  const current = useRef(timer);
  const latest = useRef(input);
  latest.current = input;
  const key = storageKey(input);
  useEffect(() => { void soundFile(input.sound).catch(() => {}); }, [input.sound]);
  function commit(next: TimerState) {
    current.current = next;
    try { localStorage.setItem(key, JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
    setTimer(next); setNow(Date.now());
  }
  // The court-specific TV banner lasts five seconds; the manual button stays disabled while it shows.
  function sendFlash() { legacy.ksmSendTieFlash?.(); setFlashUntil(Date.now() + 5000); }
  function finish(s: TimerState) {
    commit({...s, elapsedBeforeMs: s.durationMs, runningSince: null});
    void buzzer(latest.current.sound);
    // Broadcast the court-specific tied-score banner without saving tournament state.
    const live = legacy.ksmMatchTimerInput?.();
    if (live && storageKey(live) === key && live.tied) sendFlash();
  }
  useEffect(() => {
    const refresh = () => {
      const s = current.current;
      if (s.runningSince !== null && expired(s)) finish(s);
      else setNow(Date.now());
    };
    const point = () => {
      const s = current.current;
      if (s.runningSince !== null) {
        if (expired(s)) finish(s);
        else commit({...s, elapsedBeforeMs: elapsed(s), runningSince: null});
      }
    };
    // These callbacks redraw from the epoch clock; they never accumulate timer ticks.
    const interval = window.setInterval(refresh, 100);
    window.addEventListener('ksm:timer-point', point);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('pointerdown', unlockAudio);
    refresh();
    return () => {
      clearInterval(interval);
      window.removeEventListener('ksm:timer-point', point);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('pointerdown', unlockAudio);
    };
  }, [key]);
  // Length edits apply to an untouched regulation clock, never to a running bout.
  useEffect(() => {
    const s = current.current;
    if (s.phase === 'regulation' && s.runningSince === null && s.elapsedBeforeMs === 0 && s.durationMs !== input.durationMs)
      commit({...s, durationMs: input.durationMs});
  }, [input.durationMs]);
  const running = timer.runningSince !== null;
  useEffect(() => {
    if (!running || !navigator.wakeLock) return;
    let active = true, pending = false, lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      if (!active || pending || (lock && !lock.released) || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (!active) await next.release();
        else lock = next;
      } catch { /* Unsupported or denied wake locks must not prevent timekeeping. */ }
      finally { pending = false; }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => { active = false; document.removeEventListener('visibilitychange', acquire); void lock?.release().catch(() => {}); };
  }, [running]);
  const tvConnected = legacy.ksmTieFlashConnected?.() ?? false, showingOnTv = now < flashUntil;
  function startEncho() {
    unlockAudio();
    commit({matchKey: input.matchKey, phase: 'encho', durationMs: input.enchoMs, elapsedBeforeMs: 0, runningSince: Date.now(), hasStarted: true});
  }
  const used = elapsed(timer, now), countUp = unlimited(timer);
  const timeUp = !countUp && used >= timer.durationMs;
  const seconds = Math.max(0, countUp ? Math.floor(used / 1000) : Math.ceil((timer.durationMs - used) / 1000));
  const display = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  // Tell the court's TV whether the clock is stopped (yellow border). Repeated so a late TV catches up.
  const clockStopped = !running;  // also at 0:00: the border sits at the screen edge, the banner in the middle
  // Each device that is actually showing this court's clock reports it as its own source; the TV shows the border
  // only when no source is running. A hidden timer (a director on Setup, a background tab) stays silent.
  const sectionRef = useRef<HTMLElement>(null);
  const sent = useRef(false);
  const controlling = () => document.visibilityState === 'visible' && !!sectionRef.current?.checkVisibility?.();
  useEffect(() => {
    let was = false;
    const send = () => {
      if (!controlling()) return;
      sent.current = true;
      legacy.ksmSendCourtClock?.(latest.current.court, clockStopped ? 'stopped' : 'running');
    };
    send();
    const id = window.setInterval(send, 5000);
    // Report at once when this device starts showing the court (Setup -> court screen, tab brought forward).
    const watch = window.setInterval(() => { const now = controlling(); if (now && !was) send(); was = now; }, 500);
    document.addEventListener('visibilitychange', send);
    return () => { window.clearInterval(id); window.clearInterval(watch); document.removeEventListener('visibilitychange', send); };
  }, [clockStopped, tvConnected, key]);
  // Leaving: withdraw this device's report, but only if it made one.
  useEffect(() => () => { if (sent.current) legacy.ksmSendCourtClock?.(latest.current.court, 'off'); }, [key]);
  const tvKind = input.requiresWinner ? 'Encho' : 'Hikiwake';
  const tvLabel = `Show ${tvKind} on TV`;
  const tvWhy = !input.tied ? 'the score is not tied' : running ? 'stop the clock first' : !tvConnected ? 'TV not connected'
    : showingOnTv ? 'already showing on TV' : '';
  const tvDisabled = tvWhy !== '', tvTitle = tvWhy ? `${tvLabel} (unavailable: ${tvWhy})` : tvLabel;
  const enchoNext = timeUp && input.tied && input.requiresWinner;
  function toggle() {
    unlockAudio();
    const s = current.current;
    if (expired(s)) { if (s.runningSince !== null) finish(s); return; }
    commit({...s, hasStarted: true, elapsedBeforeMs: elapsed(s), runningSince: s.runningSince === null ? Date.now() : null});
  }
  function adjust(delta: number) {
    const s = current.current;
    const used = elapsed(s) + (unlimited(s) ? delta : -delta) * 1000;
    const next = {...s, elapsedBeforeMs: unlimited(s) ? Math.max(0, used) : used,
      runningSince: s.runningSince === null ? null : Date.now()};
    if (expired(next)) finish(next); else commit(next);
  }
  const adjustment = (n: number) => <button key={n} className="match-timer-adjust" data-testid={`timer-adjust-${n}`}
    aria-label={`${n < 0 ? 'Subtract' : 'Add'} ${Math.abs(n)} second${Math.abs(n) === 1 ? '' : 's'}`}
    title={`${n < 0 ? '−' : '+'}${Math.abs(n)} s`} onClick={() => adjust(n)}>
    <span aria-hidden="true">{n < 0 ? '−' : '+'}{Math.abs(n)}</span>
  </button>;
  return <section ref={sectionRef} className={`match-timer${timeUp ? ' match-timer--time' : ''}${running ? ' match-timer--running' : timer.hasStarted ? ' match-timer--paused' : ''}${timer.phase === 'encho' ? ' match-timer--encho' : ''}`} data-testid="match-timer" aria-label="Match timer">
    {input.requiresWinner && !(input.tied && input.scored) && <div className="match-timer-rule" data-testid="court-rule-tag">Encho — winner needed</div>}
    <div className="match-timer-meta">
      <span className="match-timer-phase">{timer.phase === 'encho' ? `Encho${countUp ? ' · No limit' : ''}` : 'Regulation'}</span>
      <span role="status" data-testid="timer-status">{timeUp ? 'TIME' : running ? 'Running' : 'Stopped'}</span>
    </div>
    <output data-testid="timer-display" aria-label="Match time">{display}</output>
    <div className="match-timer-transport">
      {adjustment(-10)}{adjustment(-1)}
      <button className="match-timer-toggle" data-testid={enchoNext ? 'timer-encho' : 'timer-toggle'} disabled={timeUp && !enchoNext}
        onClick={enchoNext ? startEncho : toggle}
        aria-label={enchoNext ? 'Start encho' : running ? 'Stop · Yame' : 'Start · Hajime'} title={enchoNext ? 'Start encho' : running ? 'Stop · Yame' : 'Start · Hajime'}>
        <svg viewBox="0 0 32 32" aria-hidden="true">{running
          ? <><rect x="8" y="6" width="6" height="20" rx="1" /><rect x="19" y="6" width="6" height="20" rx="1" /></>
          : <path d="M10 5a1 1 0 0 1 1.5-.9l17 11a1 1 0 0 1 0 1.8l-17 11A1 1 0 0 1 10 27Z" />}</svg>
        {enchoNext && <span className="match-timer-encho-label">Encho</span>}
      </button>
      {adjustment(1)}{adjustment(10)}
    </div>
    <div className="match-timer-replay-row">
      <button data-testid="timer-replay" disabled={!timeUp} aria-label="Replay time-up whistle"
        title={timeUp ? 'Replay time-up whistle' : 'Time-up whistle (available at 0:00)'} onClick={() => { void buzzer(input.sound); }}>
        <svg viewBox="0 0 32 32" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M14 12h13v7h-7a8 8 0 1 1-6-7Z" /><circle cx="12" cy="20" r="3" />
          <path d="M22 12v4M24 7l2-3M28 10l3-1" strokeLinecap="round" />
        </svg>
      </button>
      <button data-testid="timer-show-tv" disabled={tvDisabled} aria-label={tvLabel} title={tvTitle} onClick={sendFlash}>
        <svg viewBox="0 0 32 32" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
          <rect x="4" y="9" width="24" height="16" rx="2" /><path d="M11 4l5 5 5-5M11 28h10" />
        </svg>
      </button>
      <button className="match-timer-reset" data-testid="timer-reset" aria-label="Reset timer" title="Reset timer"
        onClick={() => { if (window.confirm('Reset this match timer?')) commit(fresh(latest.current)); }}>
        <svg viewBox="0 0 32 32" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 16a10 10 0 1 0 3-7.1M6 5v5h5" />
        </svg>
      </button>
    </div>
    {storageError && <p role="alert">Timer could not be saved on this device. Keep this page open.</p>}
  </section>;

}

// Timer switched Off for this court: no clock, just the rule badge, the whistle and Show-on-TV.
function CourtTimerOff({input}: {input: TimerInput}) {
  const [flashUntil, setFlashUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const tvConnected = legacy.ksmTieFlashConnected?.() ?? false, showingOnTv = now < flashUntil;
  const tvLabel = `Show ${input.requiresWinner ? 'Encho' : 'Hikiwake'} on TV`;
  const tvWhy = !input.tied ? 'the score is not tied' : !tvConnected ? 'TV not connected' : showingOnTv ? 'already showing on TV' : '';
  function sendFlash() { legacy.ksmSendTieFlash?.(); setFlashUntil(Date.now() + 5000); }
  const whistleLabel = `Play whistle (also shows ${input.requiresWinner ? 'Encho' : 'Hikiwake'} on TV when tied)`;
  return <section className="match-timer match-timer--off" data-testid="match-timer" aria-label="Match timer (off)">
    {input.requiresWinner && !(input.tied && input.scored) && <div className="match-timer-rule" data-testid="court-rule-tag">Encho — winner needed</div>}
    <div className="match-timer-replay-row">
      <button data-testid="timer-replay" aria-label={whistleLabel} title={whistleLabel} onClick={() => {
        unlockAudio(); void buzzer(input.sound);
        if (tvWhy === '') sendFlash();  // no clock: the whistle is the time-up moment, so a tied bout shows on the TV too
      }}>
        <svg viewBox="0 0 32 32" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M14 12h13v7h-7a8 8 0 1 1-6-7Z" /><circle cx="12" cy="20" r="3" />
          <path d="M22 12v4M24 7l2-3M28 10l3-1" strokeLinecap="round" />
        </svg>
      </button>
      <button data-testid="timer-show-tv" disabled={tvWhy !== ''} aria-label={tvLabel}
        title={tvWhy ? `${tvLabel} (unavailable: ${tvWhy})` : tvLabel}
        onClick={sendFlash}>
        <svg viewBox="0 0 32 32" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
          <rect x="4" y="9" width="24" height="16" rx="2" /><path d="M11 4l5 5 5-5M11 28h10" />
        </svg>
      </button>
    </div>
  </section>;
}

export function MatchTimer() {
  const [, render] = useState(0);
  useEffect(() => {
    const update = () => render(n => n + 1);
    const events = ['ksm:court-scoreboard', 'ksm:court-header', 'ksm:state-changed', 'ksm:tie-flash-connection'];
    events.forEach(e => window.addEventListener(e, update));
    // Backstop: re-read the court input shortly after any event ordering slip, so tied/untied never stays stale.
    const id = window.setInterval(update, 250);
    return () => { events.forEach(e => window.removeEventListener(e, update)); clearInterval(id); };
  }, []);
  const input = legacy.ksmMatchTimerInput?.();
  if (!input) return null;
  return input.enabled ? <CourtTimer key={storageKey(input)} input={input} /> : <CourtTimerOff key={`off:${input.court}`} input={input} />;
}
