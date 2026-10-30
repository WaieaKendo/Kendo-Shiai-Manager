// The Overview's input, computed here from the legacy app (was app/js/39-react-overview.js).
// Same output as the legacy builders gave, which tests/golden/overview/*.json pin; text goes
// through ksmText()/ksmDivisionName() as before. Legacy is read only through shared/legacy.ts.
import { legacy, legacyTournamentNameInput } from '../../shared/legacy.ts';
import type { OverviewCourtInput, OverviewInput, OverviewMatchInput, OverviewProgressInput } from './overview-model.ts';

export const OVERVIEW_EVENT = 'ksm:overview';

interface OverviewWindow {
  /** The Overview as last computed (the golden test reads it here). */
  ksmOverviewInput?: OverviewInput;
  /** Set by legacy ksmRenderOverview(): a signal came, possibly before this module ran. */
  ksmOverviewRequested?: boolean;
}

const overviewWindow = (): OverviewWindow => window as unknown as OverviewWindow;

/** directorMatchRow(label, m)'s match: null draws "No match scheduled". */
export function ksmOverviewMatch(m: Match | null | undefined): OverviewMatchInput | null {
  if (!m) return null;
  const text = legacy('ksmText');
  return { white: text(m.white || '—'), red: text(m.red || '—') };
}

export function ksmOverviewProgress(x: { completed: number; total: number | null; remaining: number | null; variable?: boolean }): OverviewProgressInput {
  return { completed: x.completed, total: x.total, remaining: x.remaining, variable: !!x.variable };
}

/** One court card of renderDirector(): courtSummaryFor(court) as data. */
export function ksmOverviewCourt(c: string): OverviewCourtInput {
  const x = legacy('courtSummaryFor')(c);
  const text = legacy('ksmText');
  return {
    court: c,
    division: text(legacy('ksmDivisionName')(x.division || 'No active division')),
    round: text(x.round || ''),
    ...ksmOverviewProgress(x),
    current: ksmOverviewMatch(x.current),
    onDeck: ksmOverviewMatch(x.onDeck),
    following: ksmOverviewMatch(x.following),
  };
}

/** renderDirector() as data: the overall numbers, the tournament name, then Court A and Court B. */
export function ksmOverviewInputData(): OverviewInput {
  const t = legacy('tournamentSummary')();
  const tournamentName = legacyTournamentNameInput()?.value || 'Kendo Tournament';
  return { kind: 'overview', tournamentName: String(tournamentName), overall: ksmOverviewProgress(t), courts: ['A', 'B'].map(ksmOverviewCourt) };
}

function refresh(): void {
  overviewWindow().ksmOverviewInput = ksmOverviewInputData();
}

/**
 * Pull: computes the input on every ksm:overview event, and once now when the legacy code already
 * signalled before this module ran (until then the island draws the static markup).
 * Call it before mounting, so it runs ahead of the island's own listener.
 */
export function startOverviewInput(): void {
  window.addEventListener(OVERVIEW_EVENT, refresh);
  if (overviewWindow().ksmOverviewRequested) refresh();
}
