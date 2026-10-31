// The Results screen's input, computed here from the legacy app (was app/js/38-react-results.js).
// Same output as the legacy builders gave, which tests/golden/results/*.json (recorded from the
// legacy renderer) pin; text is what esc() showed (ksmText(), String(x||'')); the brackets are
// the court screen's data (ksmBracket(), ksmTeamResults(), app/js/35-react-court.js). Legacy is
// read only through shared/legacy.ts.
import { legacy, legacyTournamentNameInput } from '../../shared/legacy.ts';
import {
  RESULTS_BRACKET_EVENT, RESULTS_EVENT,
  type ResultCardInput, type ResultDetailInput, type ResultsBracketInput, type ResultsInput,
} from './results-model.ts';

interface ResultsWindow {
  /** The Results screen as last computed (the golden test reads it here). */
  ksmResultsInput?: ResultsInput;
  /** The bracket modal as last computed. */
  ksmResultsBracketInput?: ResultsBracketInput;
  /** Set by legacy ksmRenderResults(): a signal came, possibly before this module ran. */
  ksmResultsRequested?: boolean;
  /** Set by legacy ksmRenderResultsBracket(div): the division asked for, possibly before this module ran. */
  ksmResultsBracketRequested?: { div: string | null | undefined };
}

const resultsWindow = (): ResultsWindow => window as unknown as ResultsWindow;

const state = (): TournamentState => legacy('ksmLegacyState')();

/** resultCardHtml(div) as data: placements null for the in-progress card (none yet). */
export function ksmResultCard(div: string): ResultCardInput {
  const placements = legacy('resultPlacements')(div);
  const roundRobin = legacy('isTeamRoundRobinDivision')(div);
  const text = legacy('ksmText');
  const name = legacy('ksmDivisionName')(div);
  if (!placements.length) {
    const progress = roundRobin ? legacy('teamRoundRobinProgress')(div) : null;
    return { division: text(div), name, roundRobin: !!roundRobin, placements: null, progress: progress ? { complete: progress.complete, total: progress.total } : null };
  }
  // The tier is printed into the class as it is (no esc()).
  return {
    division: text(div), name, roundRobin: !!roundRobin, progress: null,
    placements: placements.map(p => ({ place: text(p.place), name: text(p.name), tier: String(p.tier) })),
  };
}

/**
 * renderResultsDashboard() (27-) as data: the tournament name, the Completed and In Progress
 * cards, and awardsEditorHtml()'s awards.
 * Owner request: once the tournament is generated, every division of the event has a card, in
 * Setup's running order (divisions, team divisions, grand champions): one not drawn yet shows "Not
 * drawn yet", a grand champion whose source divisions are still running "Waiting for: <sources>".
 */
export function ksmResultPlaceholder(div: string): ResultCardInput {
  const text = legacy('ksmText');
  const gc = legacy('ksmGrandChampion')(div);
  const waiting = gc ? (gc.sources || []).filter(s => !legacy('divisionComplete')(s)).map(s => text(legacy('ksmDivisionName')(s))) : [];
  return {
    division: text(div), name: legacy('ksmDivisionName')(div), roundRobin: false, placements: null, progress: null,
    ...(waiting.length ? { waitingFor: waiting } : { notDrawn: true }),
  };
}

export function ksmResultsDashboardInput(): ResultsInput {
  const s = state();
  const text = legacy('ksmText');
  const divisionComplete = legacy('divisionComplete');
  const teamDivisions = legacy('ksmTeamDivisions');
  const drawn = (div: string): boolean => (s.allMatches?.[div] || []).length > 0;
  // Only divisions with entrants: an enabled division nobody registered for (such as the default
  // team division) gets no card.
  const entered = (div: string): boolean =>
    (teamDivisions().some(d => d.id === div) ? legacy('eligibleTeams')(div) : legacy('eligibleIndividuals')(div)).length > 0;
  const event: string[] = s.generated ? [
    ...(s.divisions || []).filter(entered),
    ...(legacy('tournamentSettings')().teamEnabled !== 'Disabled' ? teamDivisions().map(d => d.id).filter(entered) : []),
    ...legacy('ksmGrandChampions')().map(g => g.id),
  ] : [];
  const divisions = [
    ...new Set([
      ...event,
      ...(s.divisions || []),
      ...teamDivisions().filter(d => s.allMatches?.[d.id]).map(d => d.id),
      ...Object.keys(s.allMatches || {}),
    ]),
  ].filter(div => drawn(div) || event.includes(div));
  const completed = divisions.filter(div => drawn(div) && divisionComplete(div));
  const pending = divisions.filter(div => !drawn(div) || !divisionComplete(div));
  // window.tName is the Setup name input (a DOM element reached by its id), read through
  // legacyTournamentNameInput(): the same value as the legacy `window.tName&&tName.value`.
  const nameInput = legacyTournamentNameInput();
  return {
    kind: 'results',
    tournamentName: nameInput && nameInput.value ? nameInput.value : 'Kendo Tournament',
    completed: completed.map(ksmResultCard),
    pending: pending.map(div => (drawn(div) ? ksmResultCard(div) : ksmResultPlaceholder(div))),
    noDivisions: !divisions.some(drawn),
    awards: (s.awards || []).map(a => ({ award: text(a.award || ''), name: text(a.name || ''), dojo: text(a.dojo || '') })),
    // Owner decision 8 (#29): spectators see the awards read-only.
    readOnly: legacy('isReadOnlySession')(),
  };
}

/** completedResultDetailHtml(div) (27-) as data. */
export function ksmResultDetail(div: string): ResultDetailInput {
  // teamResultsBracketHtml() (the last declaration, 28-)
  if (legacy('isTeamDivision')(div)) return { kind: 'bracket', bracket: legacy('ksmTeamResults')(div) };
  const pools = state().pools?.[div] || [];
  if (pools.length) {
    // Standings printed as they are (no esc()) apart from names and dojos.
    const poolData = pools.map(pool => {
      const { rows, note } = legacy('ksmPoolStandingRows')(div, pool.label);
      return { label: legacy('ksmText')(pool.label), tiebreakNote: note, standings: rows };
    });
    return { kind: 'pools', pools: poolData, bracket: legacy('ksmBracket')(div) };
  }
  return { kind: 'bracket', bracket: legacy('ksmBracket')(div) };
}

/** openResultsBracket(div) (27-): the title is the division as textContent showed it. */
export function ksmResultsBracketInputData(div: string | null | undefined): ResultsBracketInput {
  return { kind: 'bracket', title: div == null ? '' : legacy('ksmDivisionName')(String(div)), detail: ksmResultDetail(div as string) };
}

function refreshResults(): void {
  resultsWindow().ksmResultsInput = ksmResultsDashboardInput();
}

function refreshBracket(): void {
  const requested = resultsWindow().ksmResultsBracketRequested;
  if (requested) resultsWindow().ksmResultsBracketInput = ksmResultsBracketInputData(requested.div);
}

/**
 * Pull: computes the input on every ksm:results / ksm:results-bracket event, and once now for a
 * signal legacy sent before this module ran (until then the islands draw the static markup).
 * Call it before mounting, so it runs ahead of the islands' own listeners (they redraw on the
 * same events and read the input this computed); it dispatches nothing, so there is no loop.
 */
export function startResultsInput(): void {
  window.addEventListener(RESULTS_EVENT, refreshResults);
  window.addEventListener(RESULTS_BRACKET_EVENT, refreshBracket);
  if (resultsWindow().ksmResultsRequested) refreshResults();
  if (resultsWindow().ksmResultsBracketRequested) refreshBracket();
}
