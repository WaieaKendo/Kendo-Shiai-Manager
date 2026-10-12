// The Results screen (#results, nav "Results"): a card per generated division (Completed with
// its placements, In Progress), the Special Awards editor and the bracket modal
// (#resultsBracketModal).
//
// The legacy app decides what is shown and computes it: renderResultsDashboard()
// (app/js/27-results-screen.js) publishes a ResultsInput (ksm:results) with the cards'
// placements from resultPlacements() (the engine's rule), and openResultsBracket() publishes the
// modal's ResultsBracketInput (ksm:results-bracket) with the court screen's bracket data
// (ksmBracket(), ksmTeamResults() in app/js/35-react-court.js). The legacy Results renderer
// (resultCardHtml(), awardsEditorHtml(), completedResultDetailHtml()) is mirrored here: its
// texts, classes and test IDs (result-card, result-card-title, placement-row, placement-place,
// placement-name), which tests/golden/results (recorded from it) pin.
import { bracketView, type BracketInput, type BracketView } from '../court/context-model.ts';

// ------------------------------------------------------------------------------ input

/** One placement as resultPlacements() gives it (text as esc() showed it). */
export interface ResultPlacementInput {
  /** '1st', '2nd', '3rd', ... */
  place: string;
  name: string;
  /** The ribbon class ('gold', 'silver', 'bronze'), printed into the class as it is. */
  tier: string;
}

/** resultCardHtml(div) as data. */
export interface ResultCardInput {
  division: string;
  /** A team round robin (View Standings, the pairing count while in progress). */
  roundRobin: boolean;
  /** The placements, or null while there are none (the in-progress card). */
  placements: ResultPlacementInput[] | null;
  /** teamRoundRobinProgress() of an in-progress team round robin, else null. */
  progress: { complete: number; total: number } | null;
}

/** One award of state.awards (text as esc() showed it). */
export interface AwardInput {
  award: string;
  name: string;
  dojo: string;
}

export type ResultsInput =
  /** Nothing published yet: the static markup (an empty #resultsBody). */
  | { kind: 'empty' }
  | {
    kind: 'results';
    /** #resultsTournamentName: the Setup name, or 'Kendo Tournament'. */
    tournamentName: string;
    completed: ResultCardInput[];
    pending: ResultCardInput[];
    /** No generated division at all. */
    noDivisions: boolean;
    awards: AwardInput[];
  };

/** One pool of the modal's "Pool Results" (poolStandings(), in order). */
export interface ResultPoolInput {
  label: string;
  standings: Array<{ name: string; dojo: string; wins: string; pts: string }>;
}

/** completedResultDetailHtml(div) as data. */
export type ResultDetailInput =
  /** Pools and the championship bracket side by side. */
  | { kind: 'pools'; pools: ResultPoolInput[]; bracket: BracketInput }
  /** The bracket alone (single elimination) or a team division's results (bracket or standings). */
  | { kind: 'bracket'; bracket: BracketInput };

export type ResultsBracketInput =
  /** Never opened: the static markup. */
  | { kind: 'empty' }
  | { kind: 'bracket'; title: string; detail: ResultDetailInput };

// ------------------------------------------------------------------------------- view

export const EMPTY_RESULTS: ResultsInput = { kind: 'empty' };
export const EMPTY_RESULTS_BRACKET: ResultsBracketInput = { kind: 'empty' };

/** The static texts of the markup the islands replace (app/index.html). */
export const DEFAULT_TOURNAMENT_NAME = 'Kendo Tournament';
export const DEFAULT_BRACKET_TITLE = 'Completed Bracket';

export const NO_DIVISIONS_TEXT = 'Generate tournament matches to display results.';
export const NO_AWARDS_TEXT = 'No special awards entered yet.';
export const DEFAULT_AWARD = 'Fighting Spirit';

export interface PlacementRowView {
  /** 'placement-row champion' for the first row, 'placement-row ' (trailing space) after it. */
  className: string;
  ribbonClass: string;
  place: string;
  name: string;
}

export type ResultCardView =
  | {
    kind: 'progress';
    division: string;
    message: string;
    /** 'View Standings →' for a team round robin, else no button. */
    button: string | null;
  }
  | { kind: 'award'; division: string; rows: PlacementRowView[]; button: string };

export interface ResultsSectionView {
  heading: 'Completed' | 'In Progress';
  cards: ResultCardView[];
}

export type ResultsView =
  | { kind: 'empty' }
  | { kind: 'results'; tournamentName: string; sections: ResultsSectionView[]; noDivisions: boolean; awards: AwardInput[] };

export function resultCardView(card: ResultCardInput): ResultCardView {
  if (!card.placements || !card.placements.length) {
    const p = card.progress;
    return {
      kind: 'progress',
      division: card.division,
      message: card.roundRobin ? `Round robin in progress • ${p?.complete}/${p?.total} pairings complete` : 'Tournament in progress',
      button: card.roundRobin ? 'View Standings →' : null,
    };
  }
  return {
    kind: 'award',
    division: card.division,
    rows: card.placements.map((p, i) => ({
      className: `placement-row ${i === 0 ? 'champion' : ''}`,
      ribbonClass: `placement-ribbon ${p.tier}`,
      place: p.place,
      name: p.name,
    })),
    button: `${card.roundRobin ? 'View Standings' : 'View Bracket'} →`,
  };
}

export function resultsView(input: ResultsInput): ResultsView {
  if (input.kind === 'empty') return input;
  const sections: ResultsSectionView[] = [];
  if (input.completed.length) sections.push({ heading: 'Completed', cards: input.completed.map(resultCardView) });
  if (input.pending.length) sections.push({ heading: 'In Progress', cards: input.pending.map(resultCardView) });
  return { kind: 'results', tournamentName: input.tournamentName, sections, noDivisions: input.noDivisions, awards: input.awards };
}

export function tournamentNameText(input: ResultsInput): string {
  return input.kind === 'empty' ? DEFAULT_TOURNAMENT_NAME : input.tournamentName;
}

export interface ResultPoolView {
  title: string;
  standings: Array<{ rank: string; name: string; dojo: string; wins: string; pts: string }>;
}

export type ResultDetailView =
  | { kind: 'pools'; pools: ResultPoolView[]; bracket: BracketView }
  | { kind: 'bracket'; bracket: BracketView };

export type ResultsBracketView = { kind: 'empty'; title: string } | { kind: 'bracket'; title: string; detail: ResultDetailView };

export function resultDetailView(detail: ResultDetailInput): ResultDetailView {
  if (detail.kind === 'bracket') return { kind: 'bracket', bracket: bracketView(detail.bracket) };
  return {
    kind: 'pools',
    pools: detail.pools.map(pool => ({
      title: `Pool ${pool.label}`,
      standings: pool.standings.map((row, i) => ({ rank: String(i + 1), ...row })),
    })),
    bracket: bracketView(detail.bracket),
  };
}

export function resultsBracketView(input: ResultsBracketInput): ResultsBracketView {
  if (input.kind === 'empty') return { kind: 'empty', title: DEFAULT_BRACKET_TITLE };
  return { kind: 'bracket', title: input.title, detail: resultDetailView(input.detail) };
}
