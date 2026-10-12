// Registration part 2's islands: the team cards (#teamTable), the exhibition table
// (#exhibitionTable) and the tab bar (the first row of the Registration toolbar card), with the
// same elements, classes, ids and test IDs as the legacy renderTeams() / renderExhibitions() and
// the static tab bar drew, so the Registration CSS and every test apply unchanged;
// tests/golden/registration-teams pins them. renderTeams(), renderExhibitions() and regTab()
// (app/js) publish what to show (ksm:registration-teams, ksm:registration-exhibitions,
// ksm:registration-tab).
//
// The controls run the inline handlers' code on the same native event: a text field's change
// event (a native listener: React's onChange runs on every key) calls, for the team or match the
// card or row showed (F20), ksmSetTeamField(card,
// key, value) / ksmSetExhibitionField(row, key, value), the status chips cycleTeamStatus(index) /
// ksmCycleExhibitionStatus(index), × ksmRemoveTeam(index) / ksmRemoveExhibition(index)
// (app/js/43-react-registration.js: what the inline handlers ran; `state` is not a window
// property). The tabs call regTab(mode), Generate requestTournamentGeneration() and Regenerate
// Single Division openRegenerateDivisionDialog(), as their inline handlers did.
//
// Typing: the fields are uncontrolled (their value attribute is the published text, as the
// template printed it), so nothing React does touches what is being typed; only a new publish (a
// legacy redraw) draws new cards and rows (keyed by the publish), as the legacy outerHTML /
// innerHTML did. The legacy redraw committed the field being edited and dropped the focus; the
// publishers (43-) blur it at the moment the legacy redraw did, so the same change/blur/focusout
// events run before React replaces the elements, and a staff device's live-update deferral (it
// waits while a field has the focus) sees the same focus as before.
// No colors or images of its own: the Registration CSS and theme tokens.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { statusClass, statusText, REMOVE_TEXT } from './registration-model.ts';
import {
  EMPTY_EXHIBITIONS, EMPTY_TABS, EMPTY_TEAMS, EXHIBITION_HEADERS, TAB_BUTTONS, TEAM_NAME_LABEL,
  tabButtonClass, teamFormatLine,
  type ExhibitionRowInput, type ExhibitionsInput, type TabsInput, type TeamCardInput, type TeamsInput,
} from './teams-model.ts';

export const TEAMS_EVENT = 'ksm:registration-teams';
export const EXHIBITIONS_EVENT = 'ksm:registration-exhibitions';
export const TAB_EVENT = 'ksm:registration-tab';

interface TeamsWindow {
  ksmRegistrationTeamsInput?: TeamsInput | null;
  ksmRegistrationExhibitionsInput?: ExhibitionsInput | null;
  ksmRegistrationTabInput?: TabsInput;
  /** The inline onchange of a team field (state.teams[index][key] = value) for the card's team. */
  ksmSetTeamField?: (card: TeamCardInput, key: string, value: string) => unknown;
  cycleTeamStatus?: (index: number) => unknown;
  ksmRemoveTeam?: (index: number) => unknown;
  /** The inline onchange of a player field (state.exhibitions[index][key] = value) for the row's match. */
  ksmSetExhibitionField?: (row: ExhibitionRowInput, key: 'white' | 'red', value: string) => unknown;
  ksmCycleExhibitionStatus?: (index: number) => unknown;
  ksmRemoveExhibition?: (index: number) => unknown;
  regTab?: (mode: string) => unknown;
  requestTournamentGeneration?: () => unknown;
  openRegenerateDivisionDialog?: () => unknown;
}

const teamsWindow = (): TeamsWindow => window as unknown as TeamsWindow;

const subscribeTo = (event: string) => (onChange: () => void): (() => void) => {
  window.addEventListener(event, onChange);
  return () => window.removeEventListener(event, onChange);
};
const subscribeTeams = subscribeTo(TEAMS_EVENT);
const subscribeExhibitions = subscribeTo(EXHIBITIONS_EVENT);
const subscribeTab = subscribeTo(TAB_EVENT);
const teamsSnapshot = (): TeamsInput | null => teamsWindow().ksmRegistrationTeamsInput ?? EMPTY_TEAMS;
const exhibitionsSnapshot = (): ExhibitionsInput | null => teamsWindow().ksmRegistrationExhibitionsInput ?? EMPTY_EXHIBITIONS;
const tabSnapshot = (): TabsInput => teamsWindow().ksmRegistrationTabInput ?? EMPTY_TABS;

// One key per publish: a new publish draws new cards and rows.
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

/** A native change listener on the field (what an inline onchange did). It stays attached until
 * after React removed the element (a passive effect's cleanup), as the inline handler did. */
function useChange(handler: (el: HTMLInputElement) => void) {
  const ref = useRef<HTMLInputElement>(null);
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

/** A style attribute written as the template printed it (React's style prop would write
 * "justify-content: space-between;"). */
const rawStyle = (style: string) => (el: HTMLElement | null) => {
  if (el && el.getAttribute('style') !== style) el.setAttribute('style', style);
};

function TeamField({ card, field, value, testId }: { card: TeamCardInput; field: string; value: string; testId: string }) {
  const ref = useChange(el => teamsWindow().ksmSetTeamField?.(card, field, el.value));
  return <input ref={ref} defaultValue={value} data-testid={testId} />;
}

/** One card of renderTeams(). */
function TeamCard({ card, input }: { card: TeamCardInput; input: TeamsInput }) {
  return (
    <div className="team-card" data-testid="team-card">
      <div className="row" ref={rawStyle('justify-content:space-between')}>
        <div className="field" ref={rawStyle('flex:1')}>
          <label>{TEAM_NAME_LABEL}</label>
          <TeamField card={card} field="team" value={card.team} testId="team-name" />
        </div>
        <button onClick={() => teamsWindow().ksmRemoveTeam?.(card.index)} data-testid="team-remove">{REMOVE_TEXT}</button>
      </div>
      <div className="small">{teamFormatLine(input)}</div>
      {input.slots.map((slot, i) => (
        <div className="slot" key={i}>
          <label>{slot}</label>
          <TeamField card={card} field={slot} value={card.members[i] ?? ''} testId={`team-member-${slot}`} />
        </div>
      ))}
      <div ref={rawStyle('margin-top:10px')}>
        <span className={statusClass(card)} onClick={() => teamsWindow().cycleTeamStatus?.(card.index)} data-testid="team-status">{statusText(card)}</span>
      </div>
    </div>
  );
}

/** The contents of Team Registration's table wrapper (renderTeams()): #teamTable with a card per
 * team the filter lets through; before the first publish the static markup's empty table. */
export function TeamCards() {
  const input = useSyncExternalStore(subscribeTeams, teamsSnapshot, () => EMPTY_TEAMS);
  if (!input) return <table id="teamTable" />;
  const key = keyOf(input);
  return (
    <div id="teamTable" className="team-cards">
      {input.cards.map((card, i) => <TeamCard key={`${key}:${i}`} card={card} input={input} />)}
    </div>
  );
}

function ExhibitionField({ row, field, value }: { row: ExhibitionRowInput; field: 'white' | 'red'; value: string }) {
  const ref = useChange(el => teamsWindow().ksmSetExhibitionField?.(row, field, el.value));
  return <input ref={ref} defaultValue={value} data-testid={`exhibition-${field}`} />;
}

/** One row of renderExhibitions(). */
function ExhibitionRow({ row }: { row: ExhibitionRowInput }) {
  return (
    <tr data-testid="exhibition-row">
      <td><ExhibitionField row={row} field="white" value={row.white} /></td>
      <td><ExhibitionField row={row} field="red" value={row.red} /></td>
      <td><span className={statusClass(row)} onClick={() => teamsWindow().ksmCycleExhibitionStatus?.(row.index)} data-testid="exhibition-status">{statusText(row)}</span></td>
      <td><button onClick={() => teamsWindow().ksmRemoveExhibition?.(row.index)} data-testid="exhibition-remove">{REMOVE_TEXT}</button></td>
    </tr>
  );
}

/** The contents of #exhibitionTable (renderExhibitions()); empty before the first publish. */
export function ExhibitionTable() {
  const input = useSyncExternalStore(subscribeExhibitions, exhibitionsSnapshot, () => EMPTY_EXHIBITIONS);
  if (!input) return null;
  const key = keyOf(input);
  return (
    <>
      <thead><tr>{EXHIBITION_HEADERS.map((h, i) => <th key={i}>{h || null}</th>)}</tr></thead>
      <tbody>{input.rows.map((row, i) => <ExhibitionRow key={`${key}:${i}`} row={row} />)}</tbody>
    </>
  );
}

/** The first row of the Registration toolbar card: the tabs (the current one marked "active", as
 * regTab() toggled it), Generate Tournament and Regenerate Single Division. */
export function RegistrationTabs() {
  const { mode } = useSyncExternalStore(subscribeTab, tabSnapshot, () => EMPTY_TABS);
  return (
    <>
      {TAB_BUTTONS.map(b => (
        <button
          key={b.id}
          id={b.id}
          className={tabButtonClass(b, mode)}
          data-testid={b.testId}
          onClick={() => {
            const w = teamsWindow();
            if (b.mode) w.regTab?.(b.mode);
            else if (b.id === 'generateBtn') w.requestTournamentGeneration?.();
            else w.openRegenerateDivisionDialog?.();
          }}
        >{b.label}</button>
      ))}
    </>
  );
}
