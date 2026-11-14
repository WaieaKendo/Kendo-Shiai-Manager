// The TV display's input, computed here from the legacy app (was app/js/37-react-tv.js).
// The legacy code only signals (renderTvDisplay() -> ksmRenderTv() -> ksm:tv); buildTV3ViewModel()
// (26-tv-display.js) takes the TV court's match with courtCurrentMatch() (which also moves the
// court on, as before), its upcoming matches (tvUpcomingMatches(), which sorts the division's
// matches in place) and decides when a completed division's Final Results show; this module turns
// that into plain data and never writes #tvLive. Same output as the tv3 renderer's reads, in the
// same order, which tests/golden/tv/*.json (recorded from it) pin; text is what esc() showed
// (ksmText(), String(x||'')); the placements are the court screen's division-complete data
// (ksmDivisionCompleteInput(), 35-react-court.js). Legacy is read only through shared/legacy.ts.
import { legacy, legacyTvLive, setupSetting, type LegacyTvViewModel } from '../../shared/legacy.ts';
import { TV_EVENT, type TvBodyInput, type TvInput, type TvPoints, type TvUpcomingInput } from './tv-model.ts';

interface TvWindow {
  /** The TV display as last computed (the golden test reads it here). */
  ksmTvInput?: TvInput;
  /** Set by legacy ksmRenderTv(): a signal came, possibly before this module ran. */
  ksmTvRequested?: boolean;
}

const tvWindow = (): TvWindow => window as unknown as TvWindow;

const state = (): TournamentState => legacy('ksmLegacyState')();

/** The fields every TV input has (the header), plus the footer's next division when it applies. */
type TvHeader = { court: string; division: string; meta: string; nextDivision?: string };
type TvContent = Extract<TvInput, { kind: 'tv' }>;

/**
 * Point letters as Array.join() prints them (the view adds the '—' before the first point, as
 * tvPointText() did).
 */
export function ksmTvLetters(arr: ReadonlyArray<unknown> | null | undefined): string[] {
  return (arr || []).map(x => (x == null ? '' : String(x)));
}

/** tv3Upcoming(): up to two cards, null for an empty one. */
export function ksmTvUpcoming(vm: LegacyTvViewModel): (TvUpcomingInput | null)[] {
  const text = legacy('ksmText');
  return (vm.upcoming || []).map(x => (x ? { white: text(x.left), red: text(x.right), whiteSub: text(x.leftSub), redSub: text(x.rightSub) } : null));
}

/** tv3Team(): the pairing's bouts (after tvUpcomingMatches() sorted them), the current one marked. */
export function ksmTvTeam(vm: LegacyTvViewModel): Extract<TvBodyInput, { kind: 'team' }> {
  const text = legacy('ksmText');
  const m = vm.match as Match;
  const all = (state().allMatches[m.division] || []).filter(x => x.teamPair === m.teamPair && (x.type === 'teamPosition' || x.type === 'teamPlayoff'));
  const rows = all.length ? all : [m];
  const first = rows[0] || m;
  const sum = legacy('teamPairSummary')(m.division, m.teamPair as string);
  return {
    kind: 'team', teamWhite: text(first.teamWhite || m.teamWhite || 'White Team'), teamRed: text(first.teamRed || m.teamRed || 'Red Team'),
    rows: rows.map(x => {
      const p = legacy('activeScoreArrays')(x);
      return { white: text(x.white || 'TBD'), red: text(x.red || 'TBD'), points: { W: ksmTvLetters(p.W), R: ksmTvLetters(p.R) }, hansoku: legacy('ksmHansokuCounts')(x), active: x === m };
    }),
    // Printed into the template as they are (no esc()).
    summary: { wWins: String(sum.wWins), wPts: String(sum.wPts), rWins: String(sum.rWins), rPts: String(sum.rPts) },
  };
}

/** tv3Kachinuki(): the current bout and both three-fighter lineups. */
export function ksmTvKachinuki(vm: LegacyTvViewModel): Extract<TvBodyInput, { kind: 'kachinuki' }> {
  const text = legacy('ksmText');
  const m = vm.match as Match;
  const p = legacy('activeScoreArrays')(m);
  const lineup = (arr: string[] | null | undefined): string[] => {
    const l = (arr || []).slice(0, 3);
    while (l.length < 3) l.push('—');
    return l.map(n => text(n || '—'));
  };
  return {
    kind: 'kachinuki', white: text(m.white || '—'), red: text(m.red || '—'), points: { W: ksmTvLetters(p.W), R: ksmTvLetters(p.R) }, hansoku: legacy('ksmHansokuCounts')(m),
    teamWhite: text(m.teamWhite || 'White Team'), teamRed: text(m.teamRed || 'Red Team'),
    lineupW: lineup(m.lineupW), lineupR: lineup(m.lineupR), wIndex: Number(m.wIndex || 0), rIndex: Number(m.rIndex || 0),
  };
}

/**
 * renderTvDisplay() as the tv3 renderer drew it: header, body by format, then Upcoming Matches
 * (or, for Final Results, the court's next division).
 */
export function ksmTvDisplayInput(court: Court): TvContent {
  document.body.classList.toggle('ksm-tv-red-left', setupSetting(court === 'B' ? 'court2TvRedSide' : 'court1TvRedSide') === 'left');
  const s = state();
  const text = legacy('ksmText');
  const divisionName = legacy('ksmDivisionName');
  const vm = legacy('buildTV3ViewModel')(court);
  // D1: a team round robin's daihyosen bout is labelled as the header's match line.
  const header: TvHeader = {
    court: text(vm.court), division: text(divisionName(vm.meta?.division || vm.division || 'No active match')),
    meta: legacy('ksmIsRoundRobinDaihyosen')(vm.match) ? legacy('ksmDaihyosenLabel')() : text(vm.meta?.line || ''),
  };
  if (vm.empty) {
    // Owner decision 6: "Waiting for the next match" (with the reason when known) while the court's
    // division waits; "Up next on this court" (the next division's first matches) in Upcoming.
    const own = vm.division;
    const between = legacy('ksmBetweenMatches')(court, own);
    const waiting = !!own && (s.allMatches?.[own] || []).some(m => legacy('isValidMatchObject')(m) && !m.done && legacy('matchBelongsToCourt')(m, court));
    const body: Extract<TvBodyInput, { kind: 'idle' }> = { kind: 'idle' };
    if (waiting) body.waiting = { next: 'match', reason: between.reason };
    else if (between.upNext) body.waiting = { next: 'division', reason: null };
    if (!between.upNext) return { kind: 'tv', ...header, body, upcoming: ksmTvUpcoming(vm) };
    const cards: (TvUpcomingInput | null)[] = between.upNext.matches.map(x => ({ white: x.white, red: x.red, whiteSub: '', redSub: '' }));
    while (cards.length < 2) cards.push(null);
    return { kind: 'tv', ...header, body, upcoming: cards, upNext: between.upNext.division };
  }
  // Owner request: the footer shows the court's next division (the court screen's Continue to
  // <next>, ksmNextCourtDivision()), information only; no "Division Complete" (the header says Final Results).
  if (vm.format === 'results') {
    const next = vm.division ? legacy('ksmNextCourtDivision')(court, vm.division) : null;
    return {
      kind: 'tv', ...header, body: { kind: 'results', complete: legacy('ksmDivisionCompleteInput')(vm.division as string, true) }, upcoming: [],
      ...(next ? { nextDivision: text(divisionName(next)) } : {}),
    };
  }
  const upcoming = ksmTvUpcoming(vm);
  // Owner request: once the division has no more matches to queue, the empty Upcoming cards give way
  // to "Next: <the court's next division>".
  const nextUp = upcoming.some(card => !card) && vm.division ? legacy('ksmNextCourtDivision')(court, vm.division) : null;
  if (nextUp) header.nextDivision = text(divisionName(nextUp));
  if (vm.format === 'individual') {
    const m = vm.match as Match;
    const p = legacy('activeScoreArrays')(m);
    const points: TvPoints = { W: ksmTvLetters(p.W), R: ksmTvLetters(p.R) };
    return {
      kind: 'tv', ...header, upcoming, body: {
        kind: 'individual',
        white: { name: text(legacy('tvIndividualSideLabel')(m, 'white')), sub: text(m.wdojo) }, red: { name: text(legacy('tvIndividualSideLabel')(m, 'red')), sub: text(m.rdojo) },
        points, hansoku: legacy('ksmHansokuCounts')(m),
      },
    };
  }
  return { kind: 'tv', ...header, upcoming, body: vm.format === 'kachinuki' ? ksmTvKachinuki(vm) : ksmTvTeam(vm) };
}

/** The body of ksmRenderTv(): nothing without #tvLive (window.tvLive, read through legacyTvLive()). */
export function ksmRenderTv(): void {
  if (!legacyTvLive()) return;
  tvWindow().ksmTvInput = ksmTvDisplayInput(legacy('tvAssignedCourt')());
}

/**
 * Pull: computes the input on every ksm:tv event, and once now for a signal legacy sent before
 * this module ran (until then the island draws the static markup). Call it before mounting, so it
 * runs ahead of the island's own listener (it redraws on the same event and reads the input this
 * computed); it dispatches nothing, so there is no loop.
 */
export function startTvInput(): void {
  window.addEventListener(TV_EVENT, ksmRenderTv);
  if (tvWindow().ksmTvRequested) ksmRenderTv();
}
