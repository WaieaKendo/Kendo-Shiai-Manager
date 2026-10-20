// Setup's Grand Champion section (#86): the rows table and its Add button, drawn in
// #grandChampionSetup from what ksmRenderGrandChampionSetup() (app/js/01-grand-champion.js)
// publishes (ksm:setup-grand-champions). Every control calls the legacy action
// (ksmAddGrandChampion, ksmUpdateGrandChampion, ksmToggleGrandChampionSource,
// ksmMoveGrandChampion, ksmRemoveGrandChampion, ksmOpenGrandChampionWithdraw,
// ksmDecideGrandChampion), which saves and publishes again. Rows are keyed by their id, so a
// redraw keeps a name being typed; a refused change is shown in the row (role="alert").
// No colors of its own: the Setup table CSS, app/styles/20-grand-champion.css and theme tokens.
import { Fragment, useState, useSyncExternalStore } from 'react';
import {
  EMPTY_GRAND_CHAMPION_SETUP, GC_AWARD_OPTIONS, GC_COURT_OPTIONS, GC_FORMAT_OPTIONS, GC_HEADINGS, GC_TEXTS,
  gcMoveLabel, gcRemoveLabel, grandChampionControls, grandChampionSourceOptions, grandChampionStatus,
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

function Row({ input, row }: { input: GrandChampionSetupInput; row: GrandChampionRowInput }) {
  const [error, setError] = useState<string | null>(null);
  const can = grandChampionControls(input, row), status = grandChampionStatus(row), w = gcWindow();
  const run = (result: string | null | undefined) => setError(result || null);
  const select = (field: 'format' | 'court' | 'awardMode', label: string, options: readonly (readonly [string, string])[], enabled: boolean) => (
    <td>
      <select value={row[field]} disabled={!enabled} aria-label={`${label} — ${row.name}`} data-testid={`grand-champion-${field}`}
        onChange={e => run(w.ksmUpdateGrandChampion?.(row.id, { [field]: e.target.value }))}>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </td>
  );
  return (
    <>
      <tr data-testid="grand-champion-row" data-grand-champion-id={row.id}>
        <td>
          <input key={`${row.id}:${row.name}`} defaultValue={row.name} disabled={!can.name} aria-label={GC_TEXTS.nameLabel} data-testid="grand-champion-name"
            onBlur={e => { if (e.target.value !== row.name) run(w.ksmUpdateGrandChampion?.(row.id, { name: e.target.value })); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </td>
        <td>
          <div className="setup-gc-sources" role="group" aria-label={`Divisions — ${row.name}`}>
            {grandChampionSourceOptions(input, row).map(o => (
              <label key={o.key} className={o.missing ? 'setup-gc-missing' : undefined}>
                <input type="checkbox" checked={o.checked} disabled={!can.sources} data-testid="grand-champion-source" data-division={o.key}
                  onChange={e => run(w.ksmToggleGrandChampionSource?.(row.id, o.key, e.target.checked))} />
                {o.name}{o.missing ? ` ${GC_TEXTS.missing}` : ''}
              </label>
            ))}
          </div>
        </td>
        {select('format', 'Format', GC_FORMAT_OPTIONS, can.format)}
        {select('court', 'Court', GC_COURT_OPTIONS, can.court)}
        {select('awardMode', 'Awards', GC_AWARD_OPTIONS, can.awards)}
        <td>
          <span className="setup-division-moves">
            <button type="button" className="setup-move-btn" disabled={input.readOnly || !row.move.up} aria-label={gcMoveLabel(row.name, 'up')} title={gcMoveLabel(row.name, 'up')}
              onClick={() => w.ksmMoveGrandChampion?.(row.id, 'up')} data-testid="grand-champion-up">↑</button>
            <button type="button" className="setup-move-btn" disabled={input.readOnly || !row.move.down} aria-label={gcMoveLabel(row.name, 'down')} title={gcMoveLabel(row.name, 'down')}
              onClick={() => w.ksmMoveGrandChampion?.(row.id, 'down')} data-testid="grand-champion-down">↓</button>
            <button type="button" className="setup-move-btn" disabled={!can.remove} aria-label={gcRemoveLabel(row.name)} title={gcRemoveLabel(row.name)}
              onClick={() => w.ksmRemoveGrandChampion?.(row.id)} data-testid="grand-champion-remove">{GC_TEXTS.remove}</button>
          </span>
        </td>
      </tr>
      <tr className="setup-gc-status" data-testid="grand-champion-status-row">
        <td colSpan={GC_HEADINGS.length}>
          <span className={`setup-gc-status-text${status.tone === 'warn' ? ' setup-gc-warn' : status.tone === 'done' ? ' setup-gc-done' : ''}`} data-testid="grand-champion-status">{status.text}</span>
          {!input.readOnly && row.decide && <button type="button" className="primary" onClick={() => w.ksmDecideGrandChampion?.(row.id)} data-testid="grand-champion-decide">{GC_TEXTS.decide}</button>}
          {!input.readOnly && row.canWithdraw && <button type="button" className="secondary" onClick={() => w.ksmOpenGrandChampionWithdraw?.(row.id)} data-testid="grand-champion-withdraw">{GC_TEXTS.withdraw}</button>}
          {error && <div role="alert" className="setup-rename-error" data-testid="grand-champion-error">{error}</div>}
        </td>
      </tr>
    </>
  );
}

/** The contents of #grandChampionSetup. */
export function GrandChampionSetup() {
  const input = useSyncExternalStore(subscribe, snapshot, () => EMPTY_GRAND_CHAMPION_SETUP);
  return (
    <>
      <p className="setup-helper">{GC_TEXTS.help}</p>
      {input.rows.length > 0 && (
        <div className="setup-division-table-wrap">
          <table className="setup-division-table setup-grand-champion-table">
            <thead><tr>{GC_HEADINGS.map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{input.rows.map(row => <Fragment key={row.id}><Row input={input} row={row} /></Fragment>)}</tbody>
          </table>
        </div>
      )}
      <button type="button" className="primary" disabled={input.readOnly} onClick={() => gcWindow().ksmAddGrandChampion?.()} data-testid="grand-champion-add">{GC_TEXTS.add}</button>
      {input.locked && <p className="small setup-gc-note" role="status" data-testid="grand-champion-note">{GC_TEXTS.locked}</p>}
    </>
  );
}
