// The Overview screen (#director, nav "Overview"): the tournament name, the overall progress
// (count, bar, remaining) and a card per court (its division and round, the division's progress
// on that court, the Current / On Deck / Following matches).
//
// The legacy app decides what is shown and computes it: renderDirector()
// (app/js/30-setup-header-and-director.js) publishes an OverviewInput (ksm:overview) with
// tournamentSummary() and courtSummaryFor('A'/'B') (app/js/39-react-overview.js), the progress
// rules of the legacy Overview (pool bouts + championship, direct-elimination nodes, team
// pairings × roster size, kachinuki without a fixed total). The legacy renderer (renderDirector(),
// directorMatchRow()) is mirrored here: its texts, classes and the progress bars' width, which
// tests/golden/overview (recorded from it) pins.

// ------------------------------------------------------------------------------ input

/** directorDivisionProgress() / tournamentSummary(): total and remaining are null for kachinuki. */
export interface OverviewProgressInput {
  completed: number;
  total: number | null;
  remaining: number | null;
  /** A kachinuki division: no fixed total. */
  variable: boolean;
}

/** A match of a court card (the names as esc() showed them, '—' for a missing name). */
export interface OverviewMatchInput {
  white: string;
  red: string;
}

/** courtSummaryFor(court) as data. */
export interface OverviewCourtInput extends OverviewProgressInput {
  /** 'A' or 'B'. */
  court: string;
  /** The court's division, or 'No active division'. */
  division: string;
  /** directorMatchLabel() of the current match ('' without one). */
  round: string;
  current: OverviewMatchInput | null;
  onDeck: OverviewMatchInput | null;
  following: OverviewMatchInput | null;
}

export type OverviewInput =
  /** Nothing published yet: the static markup. */
  | { kind: 'empty' }
  | {
    kind: 'overview';
    /** The Setup name, or 'Kendo Tournament'. */
    tournamentName: string;
    overall: OverviewProgressInput;
    courts: OverviewCourtInput[];
  };

// ------------------------------------------------------------------------------- view

export const EMPTY_OVERVIEW: OverviewInput = { kind: 'empty' };

/** The static texts of the markup the island replaces (app/index.html) and of the legacy templates. */
export const OVERVIEW_KICKER = 'Tournament Overview';
export const OVERALL_PROGRESS_LABEL = 'Overall Progress';
export const DIVISION_PROGRESS_LABEL = 'Division Progress';
export const DEFAULT_TOURNAMENT_NAME = 'Kendo Tournament';
export const NO_MATCH_TEXT = 'No match scheduled';

export interface OverviewMatchRowView {
  label: 'Current' | 'On Deck' | 'Following';
  match: OverviewMatchInput | null;
}

export interface OverviewCourtView {
  /** 'Court A'. */
  title: string;
  division: string;
  round: string;
  progress: string;
  remaining: string;
  /**
   * The division bar's style attribute as the legacy template printed it ('width:50%'), or
   * null for a kachinuki division (no bar).
   */
  barStyle: string | null;
  rows: OverviewMatchRowView[];
}

export interface OverviewView {
  tournamentName: string;
  count: string;
  remaining: string;
  /** The overall bar's width (set as style.width), or null before anything was drawn (no style). */
  barWidth: string | null;
  courts: OverviewCourtView[];
}

const percent = (completed: number, total: number | null): number => (total ? Math.round((completed / total) * 100) : 0);

export function overviewCourtView(x: OverviewCourtInput): OverviewCourtView {
  return {
    title: `Court ${x.court}`,
    division: x.division,
    round: x.round,
    progress: x.variable ? `${x.completed} ${x.completed === 1 ? 'Match' : 'Matches'} Completed` : `${x.completed} / ${x.total} Matches`,
    remaining: x.variable ? 'Total varies by wins and ties' : `${x.remaining} Remaining`,
    barStyle: x.variable ? null : `width:${percent(x.completed, x.total)}%`,
    rows: [
      { label: 'Current', match: x.current },
      { label: 'On Deck', match: x.onDeck },
      { label: 'Following', match: x.following },
    ],
  };
}

export function overviewView(input: OverviewInput): OverviewView {
  if (input.kind === 'empty') {
    return { tournamentName: DEFAULT_TOURNAMENT_NAME, count: '0 / 0 Matches', remaining: '0 Remaining', barWidth: null, courts: [] };
  }
  const t = input.overall;
  return {
    tournamentName: input.tournamentName,
    // F15: with kachinuki the total holds the kachinuki bouts known so far (tournamentSummary(), 30-).
    count: t.variable ? `${t.completed} / ${t.total} Matches so far` : `${t.completed} / ${t.total} Matches`,
    remaining: t.variable ? 'Kachinuki totals vary by result' : `${t.remaining} Remaining`,
    barWidth: `${percent(t.completed, t.total)}%`,
    courts: input.courts.map(overviewCourtView),
  };
}
