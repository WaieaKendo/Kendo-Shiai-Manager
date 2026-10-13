// The Setup screen's islands: the rows of the Individual Divisions table (#divisionSetupRows)
// and the tournament name in the hero (#setupTournamentName), with the same elements, classes
// and test IDs as the legacy divisionSetupRow() / syncSetupHeader() drew, so the Setup CSS and
// every test apply unchanged; tests/golden/setup pins them. renderDivisionSetup() and
// syncSetupHeader() (app/js) publish what to show (ksm:setup-divisions, ksm:setup-header).
//
// The rows' controls run the inline handlers' code on the same native event: Use's and the
// selects' change event (not React's onChange, which for a checkbox runs on click, before the
// document's input/change listeners and before the browser fires change) calls
// toggleDivision(d, checked), setDivisionFormat(d, value), setDivisionCourt(d, value); × calls
// ksmRemoveSetupDivision(d) (removeDivision(state.divisions.indexOf(d))). Every publish draws
// fresh rows (keyed by the publish), as the legacy innerHTML did: a row's control loses the focus
// when the table is redrawn, which keeps a staff device's live-update deferral (it waits while a
// field has the focus) as it was. The table has no text fields; the Setup fields being typed in
// are legacy markup and are never redrawn.
// Issue #25: every row has Rename, which turns the name into a text field (Save / Enter, Cancel /
// Escape); ksmRenameSetupDivision() (42-) renames or says why not, and the reason is shown in the
// row (role="alert"). The open rename lives outside the rows (renameEdit below), so a redraw keeps
// the typed text and, while the field has the focus, gives it back.
// No colors or images of its own: the Setup CSS and theme tokens.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  COURT_OPTIONS, CUSTOM_TEXT, EMPTY_SETUP_DIVISIONS, EMPTY_SETUP_HEADER, FORMAT_OPTIONS, MOVE_TEXTS, REMOVE_TEXT, RENAME_TEXTS,
  moveLabel, renameEditReducer, renameFieldLabel, renameLabel, setupDivisionRowView, setupHeaderText,
  type RenameAction, type RenameEdit, type SetupDivisionRowView, type SetupDivisionsInput, type SetupHeaderInput,
} from './setup-model.ts';

export const SETUP_DIVISIONS_EVENT = 'ksm:setup-divisions';
export const SETUP_HEADER_EVENT = 'ksm:setup-header';

interface SetupWindow {
  /** The divisions table as renderDivisionSetup() last published it. */
  ksmSetupDivisionsInput?: SetupDivisionsInput;
  /** The hero's name as syncSetupHeader() last published it. */
  ksmSetupHeaderInput?: SetupHeaderInput;
  toggleDivision?: (division: string, on: boolean) => unknown;
  setDivisionFormat?: (division: string, value: string) => unknown;
  setDivisionCourt?: (division: string, value: string) => unknown;
  ksmRemoveSetupDivision?: (division: string) => unknown;
  ksmMoveSetupDivision?: (division: string, direction: 'up' | 'down') => unknown;
  /** Issue #25: renames the division; why not (nothing changed), or null. */
  ksmRenameSetupDivision?: (division: string, name: string) => string | null;
  /** Issue #25: why the division cannot be renamed at all (after the draw), or null. */
  ksmDivisionRenameBlocked?: (division: string) => string | null;
}

const setupWindow = (): SetupWindow => window as unknown as SetupWindow;

const subscribeTo = (event: string) => (onChange: () => void): (() => void) => {
  window.addEventListener(event, onChange);
  return () => window.removeEventListener(event, onChange);
};
const subscribeDivisions = subscribeTo(SETUP_DIVISIONS_EVENT);
const subscribeHeader = subscribeTo(SETUP_HEADER_EVENT);
const divisionsSnapshot = (): SetupDivisionsInput => setupWindow().ksmSetupDivisionsInput ?? EMPTY_SETUP_DIVISIONS;
const headerSnapshot = (): SetupHeaderInput => setupWindow().ksmSetupHeaderInput ?? EMPTY_SETUP_HEADER;

// One key per publish: a new publish draws new rows.
const publishKeys = new WeakMap<object, number>();
let lastKey = 0;
function keyOf(input: object): number {
  let key = publishKeys.get(input);
  if (key === undefined) {
    key = ++lastKey;
    publishKeys.set(input, key);
  }
  return key;
}

/** A native change listener on the element (what an inline onchange did). */
function useChange<T extends HTMLInputElement | HTMLSelectElement>(handler: (el: T) => void) {
  const ref = useRef<T>(null);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const change = () => latest.current(el);
    el.addEventListener('change', change);
    return () => el.removeEventListener('change', change);
  }, []);
  return ref;
}

// Issue #31: a move redraws every row (a new publish); the focus goes back to the moved division's
// button (the other one when it is now disabled), so the keyboard keeps its place.
let focusAfterMove: { division: string; direction: 'up' | 'down' } | null = null;

function MoveButtons({ row }: { row: SetupDivisionRowView }) {
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const wanted = focusAfterMove;
    if (!wanted || wanted.division !== row.division) return;
    focusAfterMove = null;
    const first = wanted.direction === 'up' ? up.current : down.current;
    const other = wanted.direction === 'up' ? down.current : up.current;
    (first && !first.disabled ? first : other)?.focus();
  }, [row.division]);
  if (!row.move) return null;
  const move = (direction: 'up' | 'down') => {
    focusAfterMove = { division: row.division, direction };
    setupWindow().ksmMoveSetupDivision?.(row.division, direction);
  };
  return (
    <span className="setup-division-move">
      <button ref={up} type="button" className="setup-move-btn" disabled={!row.move.up} aria-label={moveLabel(row.division, 'up')}
        title={moveLabel(row.division, 'up')} onClick={() => move('up')} data-testid="setup-division-up">{MOVE_TEXTS.up}</button>
      <button ref={down} type="button" className="setup-move-btn" disabled={!row.move.down} aria-label={moveLabel(row.division, 'down')}
        title={moveLabel(row.division, 'down')} onClick={() => move('down')} data-testid="setup-division-down">{MOVE_TEXTS.down}</button>
    </span>
  );
}

// Issue #25: the open rename (one row at a time), kept outside the rows: every publish draws new
// rows, and the typed text must survive it.
let renameEdit: RenameEdit | null = null;
// The rename field had the focus when it was last drawn (a redraw gives it back).
let renameFocused = false;
// After Save or Cancel, the focus goes to this division's Rename button.
let focusAfterRename: string | null = null;
const renameListeners = new Set<() => void>();
function dispatchRename(action: RenameAction) {
  renameEdit = renameEditReducer(renameEdit, action);
  renameListeners.forEach(l => l());
}
const subscribeRename = (onChange: () => void): (() => void) => {
  renameListeners.add(onChange);
  return () => { renameListeners.delete(onChange); };
};
const renameSnapshot = (): RenameEdit | null => renameEdit;

function saveRename(division: string) {
  const draft = renameEdit?.division === division ? renameEdit.draft : division;
  const error = setupWindow().ksmRenameSetupDivision?.(division, draft) ?? null;
  if (!error) focusAfterRename = draft.trim() || division;
  dispatchRename({ type: 'saved', error });
}
function cancelRename(division: string) {
  focusAfterRename = division;
  dispatchRename({ type: 'cancel' });
}

function RenameField({ row, edit }: { row: SetupDivisionRowView; edit: RenameEdit }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = input.current;
    if (!el || !renameFocused) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  // A refused Save gives the focus back to the field, so the name can be corrected at once.
  useEffect(() => { if (edit.error) input.current?.focus(); }, [edit.error]);
  return (
    <span className="setup-rename">
      <input ref={input} type="text" className="setup-rename-input" value={edit.draft} aria-label={renameFieldLabel(row.division)}
        aria-invalid={edit.error ? true : undefined} aria-describedby={edit.error ? 'setupRenameError' : undefined}
        onChange={e => dispatchRename({ type: 'draft', draft: e.target.value })}
        onFocus={() => { renameFocused = true; }}
        onBlur={e => { if (e.currentTarget.isConnected) renameFocused = false; }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); saveRename(row.division); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelRename(row.division); }
        }}
        data-testid="setup-division-rename-input" />
      {' '}<button type="button" className="setup-rename-btn" onClick={() => saveRename(row.division)} data-testid="setup-division-rename-save">{RENAME_TEXTS.save}</button>
      {' '}<button type="button" className="setup-rename-btn" onClick={() => cancelRename(row.division)} data-testid="setup-division-rename-cancel">{RENAME_TEXTS.cancel}</button>
    </span>
  );
}

/** A row's name cell after the move buttons (#31): the name, "custom" and Rename (#25), or the rename field; a refusal below. */
function DivisionName({ row }: { row: SetupDivisionRowView }) {
  const edit = useSyncExternalStore(subscribeRename, renameSnapshot, () => null);
  const button = useRef<HTMLButtonElement>(null);
  const mine = edit && edit.division === row.division ? edit : null;
  useEffect(() => {
    if (focusAfterRename !== row.division || !button.current) return;
    focusAfterRename = null;
    button.current.focus();
  }, [row.division, mine]);
  const open = () => {
    renameFocused = true;
    dispatchRename({ type: 'open', division: row.division, blocked: setupWindow().ksmDivisionRenameBlocked?.(row.division) ?? null });
  };
  return (
    <>
      {mine?.open ? <RenameField row={row} edit={mine} /> : (
        <span className="setup-division-label">
          <b data-testid="setup-division-name">{row.name}</b>{row.custom && <>{' '}<span className="small">{CUSTOM_TEXT}</span></>}
          {' '}<button ref={button} type="button" className="setup-rename-btn" aria-label={renameLabel(row.division)} title={renameLabel(row.division)}
            onClick={open} data-testid="setup-division-rename">{RENAME_TEXTS.rename}</button>
        </span>
      )}
      {mine?.error && <div id="setupRenameError" role="alert" className="setup-rename-error" data-testid="setup-division-rename-error">{mine.error}</div>}
    </>
  );
}

/** divisionSetupRow(d, enabled, custom). The `checked` and `selected` attributes are printed as
 * the template printed them (defaultChecked, the select's defaultValue). Enabled rows have move
 * up / down buttons before the name (#31); every row has Rename after it (#25). */
function DivisionRow({ row }: { row: SetupDivisionRowView }) {
  const use = useChange<HTMLInputElement>(el => setupWindow().toggleDivision?.(row.division, el.checked));
  const format = useChange<HTMLSelectElement>(el => setupWindow().setDivisionFormat?.(row.division, el.value));
  const court = useChange<HTMLSelectElement>(el => setupWindow().setDivisionCourt?.(row.division, el.value));
  return (
    <tr data-testid="setup-division-row">
      <td><input ref={use} type="checkbox" defaultChecked={row.enabled} data-testid="setup-division-enabled" /></td>
      <td><MoveButtons row={row} /><DivisionName row={row} /></td>
      <td>
        <select ref={format} disabled={!row.enabled} defaultValue={row.formatSelected ?? undefined} data-testid="setup-division-format">
          {FORMAT_OPTIONS.map(f => <option key={f}>{f}</option>)}
        </select>
      </td>
      <td>
        <select ref={court} disabled={!row.enabled} defaultValue={row.courtSelected ?? undefined} data-testid="setup-division-court">
          {COURT_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {row.custom && <>{' '}<button onClick={() => setupWindow().ksmRemoveSetupDivision?.(row.division)} data-testid="setup-division-remove">{REMOVE_TEXT}</button></>}
      </td>
    </tr>
  );
}

/** The contents of #divisionSetupRows (renderDivisionSetup()). */
export function SetupDivisionRows() {
  const input = useSyncExternalStore(subscribeDivisions, divisionsSnapshot, () => EMPTY_SETUP_DIVISIONS);
  const key = keyOf(input);
  return <>{input.rows.map((row, i) => <DivisionRow key={`${key}:${i}`} row={setupDivisionRowView(row)} />)}</>;
}

/** The contents of #setupTournamentName (syncSetupHeader()). */
export function SetupHeader() {
  const input = useSyncExternalStore(subscribeHeader, headerSnapshot, () => EMPTY_SETUP_HEADER);
  return <>{setupHeaderText(input)}</>;
}
