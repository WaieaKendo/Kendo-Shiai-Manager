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
// No colors or images of its own: the Setup CSS and theme tokens.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  COURT_OPTIONS, CUSTOM_TEXT, EMPTY_SETUP_DIVISIONS, EMPTY_SETUP_HEADER, FORMAT_OPTIONS, REMOVE_TEXT,
  setupDivisionRowView, setupHeaderText,
  type SetupDivisionRowView, type SetupDivisionsInput, type SetupHeaderInput,
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

/** divisionSetupRow(d, enabled, custom). The `checked` and `selected` attributes are printed as
 * the template printed them (defaultChecked, the select's defaultValue). */
function DivisionRow({ row }: { row: SetupDivisionRowView }) {
  const use = useChange<HTMLInputElement>(el => setupWindow().toggleDivision?.(row.division, el.checked));
  const format = useChange<HTMLSelectElement>(el => setupWindow().setDivisionFormat?.(row.division, el.value));
  const court = useChange<HTMLSelectElement>(el => setupWindow().setDivisionCourt?.(row.division, el.value));
  return (
    <tr data-testid="setup-division-row">
      <td><input ref={use} type="checkbox" defaultChecked={row.enabled} data-testid="setup-division-enabled" /></td>
      <td><b data-testid="setup-division-name">{row.name}</b>{row.custom && <>{' '}<span className="small">{CUSTOM_TEXT}</span></>}</td>
      <td>
        <select ref={format} disabled={!row.enabled} defaultValue={row.formatSelected ?? undefined} data-testid="setup-division-format">
          {FORMAT_OPTIONS.map(f => <option key={f}>{f}</option>)}
        </select>
      </td>
      <td>
        <select ref={court} disabled={!row.enabled} defaultValue={row.courtSelected ?? undefined} data-testid="setup-division-court">
          {COURT_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {row.custom && <>{' '}<button onClick={() => setupWindow().ksmRemoveSetupDivision?.(row.division)}>{REMOVE_TEXT}</button></>}
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
