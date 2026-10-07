// Registration part 1's islands: the individual players table (#regTable) and the contents of the
// tournament status card (#tournamentStatusCard), with the same elements, classes and test IDs as
// the legacy renderReg() / renderTournamentStatus() drew, so the Registration CSS and every test
// apply unchanged; tests/golden/registration pins them. renderReg() and renderTournamentStatus()
// (app/js) publish what to show (ksm:registration-players, ksm:registration-status).
//
// The rows' controls run the inline handlers' code on the same native event: a field's change
// event (a native listener: React's onChange runs on every key for a text field) calls
// ksmUpdateCompetitor(row, key, value): updateComp(index, key, value) for the competitor the row
// showed, also when the list was replaced while the field was edited (F17); the status chip's click cycleCompetitorStatus(index) (a role="button" with a tab stop: Enter and Space click it, quirk pass); ×'s click
// ksmRemoveCompetitor(index) (state.competitors.splice(index, 1); renderReg();
// renderTournamentStatus(): `state` is not a window property).
//
// Typing: the fields are uncontrolled (their value attribute is the published text, as the
// template printed it), so nothing React does touches what is being typed; only a new publish
// (a legacy redraw) draws new rows (keyed by the publish), as the legacy innerHTML did. The
// legacy redraw committed the field being edited and dropped the focus; ksmRenderRegistration()
// (43-) blurs it at the moment the innerHTML did, so the same change/blur/focusout events run
// before React replaces the rows, and a staff device's live-update deferral (it waits while a
// field has the focus) sees the same focus as before.
// No colors or images of its own: the Registration CSS and theme tokens.
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import {
  EMPTY_PLAYERS, EMPTY_STATUS, PLAYER_HEADERS, REMOVE_TEXT, STATUS_TITLE,
  statusClass, statusText, statusView,
  type PlayerRowInput, type PlayersInput, type StatusInput,
} from './registration-model.ts';
import { pressOnKey } from '../keyboard.ts';

export const PLAYERS_EVENT = 'ksm:registration-players';
export const STATUS_EVENT = 'ksm:registration-status';

type Field = 'name' | 'dojo' | 'seed' | 'division';

interface RegistrationWindow {
  /** The players table as renderReg() last published it. */
  ksmRegistrationPlayersInput?: PlayersInput;
  /** The status card as renderTournamentStatus() last published it. */
  ksmRegistrationStatusInput?: StatusInput;
  /** updateComp(index, key, value) for the competitor the row belongs to (F17). */
  ksmUpdateCompetitor?: (row: PlayerRowInput, key: Field, value: string) => unknown;
  cycleCompetitorStatus?: (index: number) => unknown;
  ksmRemoveCompetitor?: (index: number) => unknown;
}

const regWindow = (): RegistrationWindow => window as unknown as RegistrationWindow;

const subscribeTo = (event: string) => (onChange: () => void): (() => void) => {
  window.addEventListener(event, onChange);
  return () => window.removeEventListener(event, onChange);
};
const subscribePlayers = subscribeTo(PLAYERS_EVENT);
const subscribeStatus = subscribeTo(STATUS_EVENT);
const playersSnapshot = (): PlayersInput => regWindow().ksmRegistrationPlayersInput ?? EMPTY_PLAYERS;
const statusSnapshot = (): StatusInput | null => regWindow().ksmRegistrationStatusInput ?? EMPTY_STATUS;

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

/** A native change listener on the element (what an inline onchange did). It stays attached
 * until after React removed the element (a passive effect's cleanup), as the inline handler did. */
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

/** A text field of a row: <input value="..."> (the value attribute as printed). */
function TextField({ row, field, value }: { row: PlayerRowInput; field: Exclude<Field, 'division'>; value: string }) {
  const ref = useChange<HTMLInputElement>(el => regWindow().ksmUpdateCompetitor?.(row, field, el.value));
  return <input ref={ref} defaultValue={value} data-testid={`reg-${field}`} />;
}

/** The division select. Its options have no value attribute (the value is the text) and the ones
 * equal to the competitor's division are printed `selected`, set here on the elements as the
 * parser set them (the last one wins; none selects the first option). */
function DivisionField({ row, divisions }: { row: PlayerRowInput; divisions: string[] }) {
  const ref = useChange<HTMLSelectElement>(el => regWindow().ksmUpdateCompetitor?.(row, 'division', el.value));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    for (const i of row.selected) {
      const option = el.options[i];
      if (option) option.defaultSelected = true;
    }
  }, [ref, row]);
  return (
    <select ref={ref} className="division-select" data-testid="reg-division">
      {divisions.map((d, i) => <option key={i}>{d}</option>)}
    </select>
  );
}

/** One row of renderReg(). */
function PlayerRow({ row, divisions }: { row: PlayerRowInput; divisions: string[] }) {
  return (
    <tr data-testid="reg-row">
      <td><TextField row={row} field="name" value={row.name} /></td>
      <td><TextField row={row} field="dojo" value={row.dojo} /></td>
      <td><DivisionField row={row} divisions={divisions} /></td>
      <td><TextField row={row} field="seed" value={row.seed} /></td>
      <td><span className={statusClass(row)} role="button" tabIndex={0} onClick={() => regWindow().cycleCompetitorStatus?.(row.index)} onKeyDown={pressOnKey} data-testid="reg-status">{statusText(row)}</span></td>
      <td><button onClick={() => regWindow().ksmRemoveCompetitor?.(row.index)} data-testid="reg-remove">{REMOVE_TEXT}</button></td>
    </tr>
  );
}

/** The contents of #regTable (renderReg()). */
export function PlayersTable() {
  const input = useSyncExternalStore(subscribePlayers, playersSnapshot, () => EMPTY_PLAYERS);
  const key = keyOf(input);
  return (
    <>
      <thead><tr>{PLAYER_HEADERS.map((h, i) => <th key={i}>{h || null}</th>)}</tr></thead>
      <tbody>{input.rows.map((row, i) => <PlayerRow key={`${key}:${i}`} row={row} divisions={input.divisions} />)}</tbody>
    </>
  );
}

/** The second line's div: style="margin-top:8px" as the template printed it (React's style prop
 * would write "margin-top: 8px;"). */
function MessageLine({ text }: { text: string }) {
  return <div className="small" ref={el => { if (el && el.getAttribute('style') !== 'margin-top:8px') el.setAttribute('style', 'margin-top:8px'); }}>{text}</div>;
}

/** The contents of #tournamentStatusCard (renderTournamentStatus(); its class stays legacy). */
export function TournamentStatus() {
  const input = useSyncExternalStore(subscribeStatus, statusSnapshot, () => EMPTY_STATUS);
  if (!input) return null;
  const view = statusView(input);
  return (
    <>
      <div className="tournament-status-head">
        <div><h2>{STATUS_TITLE}</h2><div><b>{view.verdict}</b></div></div>
        <div className="small">{view.counts}</div>
      </div>
      <MessageLine text={view.message} />
    </>
  );
}
