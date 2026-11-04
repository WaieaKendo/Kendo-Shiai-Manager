// Registration's inputs, computed here from the legacy app (were ksmRegistrationData(),
// ksmTeamsData(), ksmExhibitionsData(), the status and tab inputs and the render sequences of
// ksmRenderRegistration(), ksmRenderTeams() and ksmRenderExhibitions() in
// app/js/43-react-registration.js). Same output as the legacy builders gave, which
// tests/golden/registration*/*.json (recorded from the legacy renderer) pin. Text is what esc()
// showed after the HTML parser read it (ksmHtmlText()). Legacy is read only through shared/legacy.ts.
//
// What stays classic: the actions (rows, teams, exhibitions, paste, CSV), the F17/F20 binding state
// they read synchronously (ksmBindRegistrationRow(), ksmBindRegistrationEntry(), the stale flags,
// ksmBlurRedrawn()) and ksmHtmlText() (21- and 44- call it). The rows are still bound through
// legacy, so the classic actions find their competitor, team or match.
import { legacy, legacyExhibitionTable, legacyInput, legacyRegTable, legacyStale, legacyTeamSlots } from '../../shared/legacy.ts';
import {
  PLAYERS_EVENT, STATUS_EVENT, type PlayersInput, type StatusInput,
} from './registration-model.ts';
import {
  EXHIBITIONS_EVENT, TAB_EVENT, TEAMS_EVENT, type ExhibitionsInput, type TabsInput, type TeamsInput,
} from './teams-model.ts';

/** What legacy asked for last (the signal stubs in app/js/43-react-registration.js record it). */
interface StatusRequest {
  valid: boolean;
  competitors: number;
  divisions: number;
  errors: number;
}

interface RegistrationPublishWindow {
  /** The inputs as last computed (the islands and the golden tests read them here). */
  ksmRegistrationPlayersInput?: PlayersInput;
  ksmRegistrationStatusInput?: StatusInput;
  ksmRegistrationTeamsInput?: TeamsInput;
  ksmRegistrationExhibitionsInput?: ExhibitionsInput;
  ksmRegistrationTabInput?: TabsInput;
  /** Set by the classic signal stubs: a request, possibly from before this module ran. */
  ksmRegistrationPlayersRequested?: true;
  ksmRegistrationStatusRequested?: StatusRequest;
  ksmRegistrationTeamsRequested?: true;
  ksmRegistrationExhibitionsRequested?: true;
  ksmRegistrationTabRequested?: { mode: string };
  /** Set by main.tsx once the part 1 islands are mounted. */
  ksmRegistrationMounted?: boolean;
}

const registrationWindow = (): RegistrationPublishWindow => window as unknown as RegistrationPublishWindow;

/** The status as the chip shows it ('Checked In', 'No Show', 'Registered'), for the filter. */
export function ksmStatusLabel(status: string): string {
  return status === 'Checked' ? 'Checked In' : status === 'NoShow' ? 'No Show' : 'Registered';
}

/**
 * renderReg() (03) as data: the filter as it read it, then a row per competitor it let through.
 * The filter also matches the status as shown ("checked in", "no show"; quirk pass), not only the
 * stored word ("NoShow").
 */
export function ksmRegistrationData(): PlayersInput {
  const state = legacy('ksmLegacyState')();
  const htmlText = legacy('ksmHtmlText');
  const bind = legacy('ksmBindRegistrationRow');
  const f = (legacyInput('regFilter')?.value || '').toLowerCase();
  const rows = state.competitors.map((c, i) => ({ ...c, i })).filter(c => !f || [c.name, c.dojo, c.division, c.status, ksmStatusLabel(c.status)].join(' ').toLowerCase().includes(f));
  return {
    divisions: state.divisions.map(htmlText),
    rows: rows.map(c => bind(state.competitors[c.i]!, {
      index: c.i,
      name: htmlText(c.name), dojo: htmlText(c.dojo), seed: htmlText(c.seed),
      // The class printed as `status ${c.status}` (not escaped; see F19) and the status as compared.
      status: String(c.status).replace(/\r\n?/g, '\n'),
      checked: c.status === 'Checked', noShow: c.status === 'NoShow',
      // The options printed `selected` (d===c.division), by position.
      selected: state.divisions.map((d, j) => d === c.division ? j : -1).filter(j => j >= 0),
      // Owner decision 15 (#29): a division that is no longer offered (switched off in Setup) is
      // shown as an extra, selected "<division> (not offered)" option (it showed the first one).
      ...(c.division && !state.divisions.includes(c.division) ? { notOffered: String(c.division) } : {}),
    })),
  };
}

/** renderTeams() (03) as data: the format line and positions of the Setup team format, then a card per team the filter lets through. */
export function ksmTeamsData(): TeamsInput {
  const state = legacy('ksmLegacyState')();
  const htmlText = legacy('ksmHtmlText');
  const bind = legacy('ksmBindRegistrationEntry');
  const teamSettings = legacy('ksmTeamSettings');
  const teamDivisions = legacy('ksmTeamDivisions');
  const f = (legacyInput('teamFilter')?.value || '').toLowerCase();
  const divisionFilter = legacyInput('teamDivisionFilter');
  const rows = state.teams.map((c, i) => ({ ...c, i })).filter(c => (!divisionFilter?.value || c.teamDivisionId === divisionFilter.value) && (!f || [c.team, teamSettings(c.teamDivisionId).teamFormat, c.senpo, c.jiho, c.chuken, c.fukusho, c.taisho].join(' ').toLowerCase().includes(f)));
  const fmt = teamSettings().teamFormat || '5-Person Team';
  const slots = fmt === '3-Person Team' || fmt === 'Kachinuki' ? ['senpo', 'chuken', 'taisho'] : ['senpo', 'jiho', 'chuken', 'fukusho', 'taisho'];
  return {
    divisions: teamDivisions().map(d => ({ id: d.id, name: d.name })),
    format: htmlText(fmt), tournamentFormat: htmlText(legacyInput('teamTournamentFormat')?.value || 'Single Elimination'), slots,
    cards: rows.map(c => bind(state.teams[c.i]!, {
      index: c.i, team: htmlText(c.team), teamDivisionId: c.teamDivisionId || teamDivisions()[0]?.id || '',
      slots: legacyTeamSlots(teamSettings(c.teamDivisionId).teamFormat), format: teamSettings(c.teamDivisionId).teamFormat,
      tournamentFormat: teamSettings(c.teamDivisionId).teamTournamentFormat,
      members: legacyTeamSlots(teamSettings(c.teamDivisionId).teamFormat).map(k => htmlText((c as unknown as Record<string, unknown>)[k])),
      // The class printed as `status ${esc(c.status)}` (F19) and the status as compared.
      status: htmlText(c.status), checked: c.status === 'Checked', noShow: c.status === 'NoShow',
    })),
  };
}

/** renderExhibitions() (03) as data: a row per exhibition match. */
export function ksmExhibitionsData(): ExhibitionsInput {
  const state = legacy('ksmLegacyState')();
  const htmlText = legacy('ksmHtmlText');
  const bind = legacy('ksmBindRegistrationEntry');
  const rows = state.exhibitions || [];
  return {
    rows: rows.map((x, i) => bind(x, {
      index: i, white: htmlText(x.white), red: htmlText(x.red),
      status: htmlText(x.status), checked: x.status === 'Checked', noShow: x.status === 'NoShow',
    })),
  };
}

/** renderTournamentStatus() (03) as data: the validation result and the counts (what legacy asked for) and the Setup courts text. */
export function ksmStatusInput(request: StatusRequest): StatusInput {
  return {
    valid: !!request.valid, competitors: request.competitors, divisions: request.divisions,
    courts: legacy('ksmHtmlText')(legacyInput('tCourts')?.value || '2'), errors: request.errors,
  };
}

/** regTab() (23) as data: the tab marked active, and whether the Exhibition tab shows (owner decision 19). */
export function ksmTabInput(request: { mode: string }): TabsInput {
  return { mode: String(request.mode), exhibitions: legacy('ksmExhibitionsEnabled')(), generated: legacy('ksmTournamentGenerated')() };
}

/**
 * ksmRenderRegistration() (43) as it ran: compute, blur the focused field, compute again if the
 * blur committed an edit, publish.
 * The legacy innerHTML replaced every row, so a field being edited in the table lost the focus: the
 * browser committed it (its change event, then blur and focusout) while the old row was removed,
 * after the new rows had been computed. React replaces the rows later (at its render), so the focus
 * leaves the table here, at the same moment, with the same events. F17 data-loss behaviour: do not
 * reorder.
 */
function refreshPlayers(): void {
  if (!registrationWindow().ksmRegistrationPlayersRequested) return;
  let input = ksmRegistrationData();
  const active = window.document.activeElement as HTMLElement | null;
  legacyStale.set('ksmRegistrationRowsStale', false);
  const regTable = legacyRegTable();
  if (registrationWindow().ksmRegistrationMounted && active && active !== window.document.body && regTable && regTable.contains(active)) active.blur();
  // F17: the blur committed an edit into a competitor of the new list (ksmUpdateCompetitor()).
  if (legacyStale.get('ksmRegistrationRowsStale')) { legacyStale.set('ksmRegistrationRowsStale', false); input = ksmRegistrationData(); }
  registrationWindow().ksmRegistrationPlayersInput = input;
}

function refreshStatus(): void {
  const request = registrationWindow().ksmRegistrationStatusRequested;
  if (request) registrationWindow().ksmRegistrationStatusInput = ksmStatusInput(request);
}

/** ksmRenderTeams() (43) as it ran (after classic rebuilt #teamDivisionFilter's options). F20: do not reorder. */
function refreshTeams(): void {
  if (!registrationWindow().ksmRegistrationTeamsRequested) return;
  let input = ksmTeamsData();
  legacyStale.set('ksmTeamsStale', false);
  legacy('ksmBlurRedrawn')(window.document.querySelector('#teamReg #teamTable'));
  // F20: the blur committed an edit into a team of the new list (ksmSetTeamField()).
  if (legacyStale.get('ksmTeamsStale')) { legacyStale.set('ksmTeamsStale', false); input = ksmTeamsData(); }
  registrationWindow().ksmRegistrationTeamsInput = input;
}

/** ksmRenderExhibitions() (43) as it ran (classic checked #exhibitionTable exists). F20: do not reorder. */
function refreshExhibitions(): void {
  if (!registrationWindow().ksmRegistrationExhibitionsRequested) return;
  let input = ksmExhibitionsData();
  legacyStale.set('ksmExhibitionsStale', false);
  legacy('ksmBlurRedrawn')(legacyExhibitionTable());
  // F20: the blur committed an edit into a match of the new list (ksmSetExhibitionField()).
  if (legacyStale.get('ksmExhibitionsStale')) { legacyStale.set('ksmExhibitionsStale', false); input = ksmExhibitionsData(); }
  registrationWindow().ksmRegistrationExhibitionsInput = input;
}

function refreshTab(): void {
  const request = registrationWindow().ksmRegistrationTabRequested;
  if (request) registrationWindow().ksmRegistrationTabInput = ksmTabInput(request);
}

/**
 * Pull: computes each input on its signal, and once now for each request legacy made before this
 * module ran (until then the islands draw the static markup). Call it before mounting, so it runs
 * ahead of the islands' own listeners (they redraw on the same event and read the input this
 * computed); it dispatches nothing, so there is no loop.
 */
export function startRegistrationInput(): void {
  const listeners: Array<[string, () => void]> = [
    [PLAYERS_EVENT, refreshPlayers], [STATUS_EVENT, refreshStatus], [TEAMS_EVENT, refreshTeams],
    [EXHIBITIONS_EVENT, refreshExhibitions], [TAB_EVENT, refreshTab],
  ];
  for (const [event, refresh] of listeners) {
    window.addEventListener(event, refresh);
    refresh();
  }
}
