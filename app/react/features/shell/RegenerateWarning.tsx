import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Warning = { total: number; divisions: string[]; confirm: () => Promise<void> };

/** The Delete tournament form's typed-confirmation pattern and shared modal/button styles. */
export function RegenerateWarning() {
  const [warning, setWarning] = useState<Warning | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const open = (event: Event) => {
      previousFocus.current = document.activeElement as HTMLElement;
      setTyped(''); setError(''); setBusy(false);
      setWarning((event as CustomEvent<Warning>).detail);
    };
    window.addEventListener('ksm:regenerate-warning', open);
    return () => window.removeEventListener('ksm:regenerate-warning', open);
  }, []);
  useEffect(() => { if (warning) dialog.current?.showModal(); }, [warning]);
  const close = () => { setWarning(null); previousFocus.current?.focus(); };
  if (!warning) return null;
  const enabled = !busy && typed.trim().toUpperCase() === 'REGENERATE';
  return createPortal(
    <dialog ref={dialog} className="cloud-modal regenerate-warning" aria-labelledby="regenerate-warning-title"
      onCancel={event => { event.preventDefault(); if (!busy) close(); }} data-testid="regenerate-warning">
      <h2 id="regenerate-warning-title">Regenerate Tournament</h2>
      <p>To change one division, use Regenerate Single Division. To change a court, no redraw is needed.</p>
      <p>Regenerate Tournament will erase <b>{warning.total} finished matches</b> in <b>{warning.divisions.length} divisions</b> ({warning.divisions.join(', ')}) and redraw everything. Every device will see it.</p>
      <p>A tournament file will download before results are erased.</p>
      <form onSubmit={async event => {
        event.preventDefault();
        if (!enabled) return;
        setBusy(true); setError('');
        try { await warning.confirm(); close(); }
        catch (err) { setError(`Unable to save tournament file: ${err instanceof Error ? err.message : String(err)}`); setBusy(false); }
      }}>
        <label className="small" htmlFor="regenerate-confirmation">Type REGENERATE to confirm</label>
        <input id="regenerate-confirmation" autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false}
          value={typed} onChange={event => setTyped(event.target.value)} disabled={busy} data-testid="regenerate-warning-input" />
        {error && <p role="alert">{error}</p>}
        <div className="row regenerate-warning-actions">
          <button type="button" className="secondary" onClick={close} disabled={busy} data-testid="regenerate-warning-cancel">Cancel</button>
          <button type="submit" className="secondary danger" disabled={!enabled} data-testid="regenerate-warning-confirm">Erase results and redraw</button>
        </div>
      </form>
    </dialog>, document.body);
}
