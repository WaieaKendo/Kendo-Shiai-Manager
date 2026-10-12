// The court screen's context panel (#courtContext, data-testid court-context): the division
// around the match on the court: the pools and the championship bracket preview, a
// single-elimination bracket, the team match's bout sheet, a kachinuki sheet, team standings
// or the team bracket.
//
// The legacy app still decides what is shown and computes it: the legacy context renderer (the
// split-court renderContext() wrapper in app/js/32- around the last declaration in 31-, removed
// in M.8 step 5) is mirrored by ksmContextPanelInput() in app/js/35-react-court.js, which gets standings, pairing summaries
// and bracket labels from the legacy engine bridges (app/engine) and publishes a
// CourtContextInput (ksm:court-context) instead of writing #courtContext. The legacy
// setCourtSupportMode() keeps toggling the panels' layout classes outside the island.
// courtContextView() adds what the legacy HTML helpers derived: classes, labels and texts.
import {
  alignedRowView,
  type AlignedRowInput, type AlignedRowView, type BracketCardInput, type BracketMatchInput,
} from './rows-model.ts';

// ------------------------------------------------------------------------------ input

/** One competitor line of a pool card (poolResultCardHtml(), 31-spectator-refinements.js). */
export interface PoolStandingInput {
  name: string;
  dojo: string;
  wins: string;
  pts: string;
}

export interface PoolCardInput {
  label: string;
  /** The pool of the match on the court (only pools in progress). */
  active: boolean;
  /** Every pool match done (the completed section passes it as such). */
  complete: boolean;
  standings: PoolStandingInput[];
  matches: AlignedRowInput[];
}

export interface TeamStandingInput {
  rank: string;
  name: string;
  nameFallback: boolean;
  /** "<wins>-<losses>" */
  record: string;
  matchWins: string;
  pts: string;
}

/** teamRoundRobinStandingsHtml() (28-aligned-results-and-brackets.js). */
export interface TeamStandingsInput {
  complete: boolean;
  progress: { complete: number; total: number };
  compact: boolean;
  rows: TeamStandingInput[];
  /** The team pair results (includePairResults), or null. */
  pairs: Array<{ title: string; row: AlignedRowInput }> | null;
}

/** What bracketHtml() and teamResultsBracketHtml() (removed in M.13) draw. */
export type BracketInput =
  /** Round cards (individual championship or single elimination); may be none. */
  | { kind: 'cards'; cards: BracketCardInput[] }
  /** A .muted-card message. */
  | { kind: 'message'; text: string }
  /** A .results-empty message (team standings or bracket missing). */
  | { kind: 'results-empty'; text: string }
  | { kind: 'team-standings'; standings: TeamStandingsInput }
  /** teamResultsBracketHtml(): each round's head (Wins/Points) and its pairings. */
  | { kind: 'team-bracket'; rounds: Array<{ round: string; rows: AlignedRowInput[] }> };

/** kachinukiSheetHtml(m) (28-, removed in M.13). */
export interface KachinukiSheetInput {
  teamWhite: string;
  teamRed: string;
  current: AlignedRowInput;
  white: { lineup: string[]; index: number | null };
  red: { lineup: string[]; index: number | null };
}

/** teamSheetHtml(div, pair, current) (28-, removed in M.13). */
export interface TeamSheetInput {
  teamWhite: string;
  teamRed: string;
  rows: AlignedRowInput[];
  /** teamPairSummary(): wins and points per side, as the legacy template printed them. */
  totals: { wWins: string; wPts: string; rWins: string; rPts: string };
}

export type CourtContextInput =
  /** Nothing: the static markup, before anything was published. */
  | { kind: 'empty' }
  /** A .muted-card message ('No active match.', 'No division selected.', 'Single-elimination bracket will appear after generation.'). */
  | { kind: 'message'; text: string }
  | { kind: 'kachinuki'; sheet: KachinukiSheetInput }
  | { kind: 'team-sheet'; sheet: TeamSheetInput }
  /** The single-elimination context (24-): earlier and later rounds by bracket size. */
  | { kind: 'single-elim'; left: BracketCardInput[]; right: BracketCardInput[] }
  /** A split single elimination (32-, splitTemplateContextHtml()): every round in one column. */
  | { kind: 'split-single-elim'; cards: BracketCardInput[] }
  /** orderedPoolContextHtml() (31-): pools in progress, the bracket preview, completed pools. */
  | { kind: 'pools'; inProgress: PoolCardInput[]; bracket: BracketInput; completed: PoolCardInput[] }
  /** No match on the court: the division's bracket or team results, without a wrapper. */
  | { kind: 'bracket'; bracket: BracketInput };

// ------------------------------------------------------------------------------- view

export interface PoolCardView {
  className: string;
  title: string;
  complete: boolean;
  standings: Array<PoolStandingInput & { rank: string }>;
  matches: AlignedRowView[];
}

export interface TeamStandingsView {
  status: string;
  tableClass: string;
  rows: TeamStandingInput[];
  /** The note under the table when a tie was ordered by name. */
  nameFallbackNote: boolean;
  pairs: Array<{ title: string; row: AlignedRowView }> | null;
}

export type BracketRowView = ({ kind: 'aligned' } & AlignedRowView) | BracketMatchInput;
export interface BracketCardView { round: string; rows: BracketRowView[] }

export type BracketView =
  | { kind: 'cards'; cards: BracketCardView[] }
  | { kind: 'message'; text: string }
  | { kind: 'results-empty'; text: string }
  | { kind: 'team-standings'; standings: TeamStandingsView }
  | { kind: 'team-bracket'; rounds: Array<{ round: string; rows: AlignedRowView[] }> };

export interface KachinukiLineView {
  name: string;
  className: string;
  state: 'eliminated' | 'active' | 'waiting';
}

/** kachinukiSheetHtml(m) as drawn (also on Live Scores). */
export interface KachinukiSheetView { teamWhite: string; teamRed: string; current: AlignedRowView; white: KachinukiLineView[]; red: KachinukiLineView[] }
/** teamSheetHtml(div, pair, current) as drawn (also on Live Scores). */
export interface TeamSheetView { teamWhite: string; teamRed: string; rows: AlignedRowView[]; totals: TeamSheetInput['totals'] }

export type CourtContextView =
  | { kind: 'empty' }
  | { kind: 'message'; text: string }
  | ({ kind: 'kachinuki' } & KachinukiSheetView)
  | ({ kind: 'team-sheet' } & TeamSheetView)
  | { kind: 'single-elim'; left: BracketCardView[]; right: BracketCardView[] }
  | { kind: 'split-single-elim'; cards: BracketCardView[] }
  | { kind: 'pools'; inProgress: PoolCardView[]; bracket: BracketView; completed: PoolCardView[] }
  | { kind: 'bracket'; bracket: BracketView };

/** The static markup (app/index.html): an empty #courtContext. */
export const EMPTY_CONTEXT: CourtContextInput = { kind: 'empty' };

export function bracketCardView(card: BracketCardInput): BracketCardView {
  return { round: card.round, rows: card.rows.map(r => (r.kind === 'aligned' ? { kind: 'aligned', ...alignedRowView(r) } : r)) };
}

export function poolCardView(card: PoolCardInput): PoolCardView {
  return {
    className: `pool-result-card ${card.active ? 'active-pool-card' : ''} ${card.complete ? 'completed-pool-card' : ''}`,
    title: `Pool ${card.label}`,
    complete: card.complete,
    standings: card.standings.map((s, i) => ({ ...s, rank: String(i + 1) })),
    matches: card.matches.map(alignedRowView),
  };
}

export function teamStandingsView(s: TeamStandingsInput): TeamStandingsView {
  return {
    status: s.complete ? 'Final standings' : `Current standings • ${s.progress.complete} of ${s.progress.total} team pairings complete`,
    tableClass: `team-standings-table ${s.compact ? 'compact' : ''}`,
    rows: s.rows,
    nameFallbackNote: s.rows.some(r => r.nameFallback),
    pairs: s.pairs ? s.pairs.map(p => ({ title: p.title, row: alignedRowView(p.row) })) : null,
  };
}

export function bracketView(b: BracketInput): BracketView {
  switch (b.kind) {
    case 'cards': return { kind: 'cards', cards: b.cards.map(bracketCardView) };
    case 'team-standings': return { kind: 'team-standings', standings: teamStandingsView(b.standings) };
    case 'team-bracket': return { kind: 'team-bracket', rounds: b.rounds.map(r => ({ round: r.round, rows: r.rows.map(alignedRowView) })) };
    default: return b;
  }
}

/** The kachinuki lineup: players before the side's index are out, the one at it fights. */
export function kachinukiLines(lineup: readonly string[], index: number | null): KachinukiLineView[] {
  return lineup.map((name, i) => {
    const out = index !== null && i < index;
    return { name, className: `competitor-line ${out ? 'small' : ''}`, state: out ? 'eliminated' : i === index ? 'active' : 'waiting' };
  });
}

export function kachinukiSheetView(s: KachinukiSheetInput): KachinukiSheetView {
  return { teamWhite: s.teamWhite, teamRed: s.teamRed, current: alignedRowView(s.current), white: kachinukiLines(s.white.lineup, s.white.index), red: kachinukiLines(s.red.lineup, s.red.index) };
}

export function teamSheetView(s: TeamSheetInput): TeamSheetView {
  return { teamWhite: s.teamWhite, teamRed: s.teamRed, rows: s.rows.map(alignedRowView), totals: s.totals };
}

export function courtContextView(input: CourtContextInput): CourtContextView {
  switch (input.kind) {
    case 'empty':
    case 'message': return input;
    case 'kachinuki': return { kind: 'kachinuki', ...kachinukiSheetView(input.sheet) };
    case 'team-sheet': return { kind: 'team-sheet', ...teamSheetView(input.sheet) };
    case 'single-elim': return { kind: 'single-elim', left: input.left.map(bracketCardView), right: input.right.map(bracketCardView) };
    case 'split-single-elim': return { kind: 'split-single-elim', cards: input.cards.map(bracketCardView) };
    case 'pools': return { kind: 'pools', inProgress: input.inProgress.map(poolCardView), bracket: bracketView(input.bracket), completed: input.completed.map(poolCardView) };
    case 'bracket': return { kind: 'bracket', bracket: bracketView(input.bracket) };
  }
}
