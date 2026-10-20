// Setup's Grand Champion section (#86): an Enabled/Disabled switch (one grand champion for now,
// GC_MULTIPLE) and, per match, a card with its fields in one row (Name, Format, Court, Awards) and its
// divisions as chips. Drawn in #grandChampionSetup from what ksmRenderGrandChampionSetup()
// (app/js/01-grand-champion.js) publishes (ksm:setup-grand-champions). Every control calls the legacy
// action (ksmAddGrandChampion, ksmUpdateGrandChampion, ksmToggleGrandChampionSource,
// ksmMoveGrandChampion, ksmRemoveGrandChampion, ksmOpenGrandChampionWithdraw, ksmDecideGrandChampion),
// which saves and publishes again. Cards are keyed by their id, so a redraw keeps a name being typed; a
// refused change is shown in the card (role="alert"). A disabled control says why (title).
// No colors of its own: the Setup CSS, app/styles/20-grand-champion.css and theme tokens.
import { Fragment, useState, useSyncExternalStore } from 'react';
import {
  EMPTY_GRAND_CHAMPION_SETUP, GC_AWARD_OPTIONS, GC_COURT_OPTIONS, GC_FORMAT_OPTIONS, GC_MULTIPLE, GC_TEXTS,
  gcMoveLabel, gcRemoveLabel, gcSourceRemoveLabel, grandChampionControls, grandChampionSourceOptions, grandChampionStatus,
  type GrandChampionRowInput, type GrandChampionSetupInput,
} from './grand-champion-model.ts';

export const SETUP_GRAND_CHAMPIONS_EVENT = 'ksm:setup-grand-champions';

interface GrandChampionWindow {
  ksmGrandChampionSetupInput?: GrandChampionSetupInput;
  ksmAddGrandChampion?: () => unknown;
  /** Why the change was refused (nothing changed), or null. */
  ksmUpdateGrandChampion?: (id: string, patch: Record<string, string>) => string | null;
  ksmToggleGrandChampionSource?: (id: string, division: string, on: boolean) => string | null;
  ksmMoveGrandChampion?: (id: string, direction: 'up' | 'down') => unknown;
  ksmRemoveGrandChampion?: (id: string) => unknown;
  ksmOpenGrandChampionWithdraw?: (id: string) => unknown;
  ksmDecideGrandChampion?: (id: string) => unknown;
}
const gcWindow = (): GrandChampionWindow => window as unknown as GrandChampionWindow;
const subscribe = (onChange: () => void) => {
  window.addEventListener(SETUP_GRAND_CHAMPIONS_EVENT, onChange);
  return () => window.removeEventListener(SETUP_GRAND_CHAMPIONS_EVENT, onChange);
};
const snapshot = () => gcWindow().ksmGrandChampionSetupInput ?? EMPTY_GRAND_CHAMPION_SETUP;

function Card({ input, row }: { input: GrandChampionSetupInput; row: GrandChampionRowInput }) {
  const [error, setError] = useState<string | null>(null);
  const can = grandChampionControls(input, row), status = grandChampionStatus(row), w = gcWindow();
  const run = (result: string | null | undefined) => setError(result || null);
  const drawnTip = row.drawn && !input.readOnly ? GC_TEXTS.drawnTip : undefined;
  const select = (field: 'format' | 'court' | 'awardMode', label: string, options: readonly (readonly [string, string])[], enabled: boolean, tip?: string) => (
    <div className="field">
      <label>{label}</label>
      <select value={row[field]} disabled={!enabled} title={!enabled ? tip : undefined} aria-label={`${label} — ${row.name}`} data-testid={`grand-champion-${field}`}
        onChange={e => run(w.ksmUpdateGrandChampion?.(row.id, { [field]: e.target.value }))}>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </div>
  );
  const options = grandChampionSourceOptions(input, row);
  const chosen = options.filter(o => o.checked), open = options.filter(o => !o.checked);
  return (
    <div className="setup-gc-card" data-testid="grand-champion-row" data-grand-champion-id={row.id}>
      <div className="setup-gc-fields">
        <div className="field">
          <label>Name</label>
          <input key={`${row.id}:${row.name}`} defaultValue={row.name} disabled={!can.name} aria-label={GC_TEXTS.nameLabel} data-testid="grand-champion-name"
            onBlur={e => { if (e.target.value !== row.name) run(w.ksmUpdateGrandChampion?.(row.id, { name: e.target.value })); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </div>
        {select('format', 'Format', GC_FORMAT_OPTIONS, can.format, drawnTip || (row.sources.length <= 2 ? GC_TEXTS.formatTwoTip : undefined))}
        {select('court', 'Court', GC_COURT_OPTIONS, can.court, drawnTip)}
        {select('awardMode', 'Awards', GC_AWARD_OPTIONS, can.awards)}
      </div>
      <div className="field">
        <label>{GC_TEXTS.sourcesLabel}</label>
        <div className="setup-gc-chips" role="group" aria-label={`${GC_TEXTS.sourcesLabel} — ${row.name}`}>
          {chosen.map(o => (
            <span key={o.key} className={`setup-gc-chip${o.missing ? ' setup-gc-missing' : ''}`} data-testid="grand-champion-chip" data-division={o.key}>
              {o.name}{o.missing ? ` ${GC_TEXTS.missing}` : ''}
              <button type="button" disabled={!can.sources} title={!can.sources ? drawnTip : undefined} aria-label={gcSourceRemoveLabel(o.name, row.name)}
                onClick={() => run(w.ksmToggleGrandChampionSource?.(row.id, o.key, false))} data-testid="grand-champion-source-remove">×</button>
            </span>
          ))}
          {open.length > 0 && (
            <select value="" disabled={!can.sources} title={!can.sources ? drawnTip : undefined} aria-label={`${GC_TEXTS.sourceAdd} — ${row.name}`} data-testid="grand-champion-source-add"
              onChange={e => { if (e.target.value) run(w.ksmToggleGrandChampionSource?.(row.id, e.target.value, true)); }}>
              <option value="">{GC_TEXTS.sourceAdd}</option>
              {open.map(o => <option key={o.key} value={o.key}>{o.name}</option>)}
            </select>
          )}
        </div>
      </div>
      {GC_MULTIPLE && (
        <span className="setup-division-moves">
          <button type="button" className="setup-move-btn" disabled={input.readOnly || !row.move.up} aria-label={gcMoveLabel(row.name, 'up')} title={gcMoveLabel(row.name, 'up')}
            onClick={() => w.ksmMoveGrandChampion?.(row.id, 'up')} data-testid="grand-champion-up">↑</button>
          <button type="button" className="setup-move-btn" disabled={input.readOnly || !row.move.down} aria-label={gcMoveLabel(row.name, 'down')} title={gcMoveLabel(row.name, 'down')}
            onClick={() => w.ksmMoveGrandChampion?.(row.id, 'down')} data-testid="grand-champion-down">↓</button>
          <button type="button" className="setup-move-btn" disabled={!can.remove} aria-label={gcRemoveLabel(row.name)} title={!can.remove ? drawnTip : gcRemoveLabel(row.name)}
            onClick={() => w.ksmRemoveGrandChampion?.(row.id)} data-testid="grand-champion-remove">{GC_TEXTS.remove}</button>
        </span>
      )}
      <div className="setup-gc-status" data-testid="grand-champion-status-row">
        <span className={`setup-gc-status-text${status.tone === 'warn' ? ' setup-gc-warn' : status.tone === 'done' ? ' setup-gc-done' : ''}`} data-testid="grand-champion-status">{status.text}</span>
        {!input.readOnly && row.decide && <button type="button" className="primary" onClick={() => w.ksmDecideGrandChampion?.(row.id)} data-testid="grand-champion-decide">{GC_TEXTS.decide}</button>}
        {!input.readOnly && row.canWithdraw && <button type="button" className="secondary" onClick={() => w.ksmOpenGrandChampionWithdraw?.(row.id)} data-testid="grand-champion-withdraw">{GC_TEXTS.withdraw}</button>}
        {error && <div role="alert" className="setup-rename-error" data-testid="grand-champion-error">{error}</div>}
      </div>
    </div>
  );
}

/** One grand champion (GC_MULTIPLE false): Enabled adds the match, Disabled removes it (not once drawn). */
function EnabledSwitch({ input }: { input: GrandChampionSetupInput }) {
  const w = gcWindow(), on = input.rows.length > 0, drawn = input.rows.some(r => r.drawn);
  const change = (value: string) => {
    if (value === GC_TEXTS.enabled && !on) w.ksmAddGrandChampion?.();
    if (value === GC_TEXTS.disabled) input.rows.forEach(r => w.ksmRemoveGrandChampion?.(r.id));
  };
  return (
    <div className="field">
      <label>{GC_TEXTS.enabledLabel}</label>
      <select value={on ? GC_TEXTS.enabled : GC_TEXTS.disabled} disabled={input.readOnly || drawn} title={drawn && !input.readOnly ? GC_TEXTS.enabledDrawnTip : undefined}
        onChange={e => change(e.target.value)} data-testid="grand-champion-enabled">
        <option>{GC_TEXTS.enabled}</option>
        <option>{GC_TEXTS.disabled}</option>
      </select>
    </div>
  );
}

/** The contents of #grandChampionSetup. */
export function GrandChampionSetup() {
  const input = useSyncExternalStore(subscribe, snapshot, () => EMPTY_GRAND_CHAMPION_SETUP);
  return (
    <>
      <p className="setup-helper">{GC_TEXTS.help}</p>
      {!GC_MULTIPLE && <EnabledSwitch input={input} />}
      {input.rows.map(row => <Fragment key={row.id}><Card input={input} row={row} /></Fragment>)}
      {GC_MULTIPLE && <button type="button" className="primary" disabled={input.readOnly} onClick={() => gcWindow().ksmAddGrandChampion?.()} data-testid="grand-champion-add">{GC_TEXTS.add}</button>}
      {input.locked && <p className="small setup-gc-note" role="status" data-testid="grand-champion-note">{GC_TEXTS.locked}</p>}
    </>
  );
}
