// The Live Scores screen's input, computed here from the legacy app (was app/js/36-react-live-scores.js).
// The legacy code only signals (renderPublic() -> ksmRenderLiveScores() -> ksm:live-scores); this
// module chooses each court's match (courtCurrentMatch(), which also moves a court on to its next
// match, as before) and decides when a court's division is complete (F16), and never writes
// #publicLive. Same output as the legacy renderer's decisions, which tests/golden/live-scores/*.json
// (recorded from it) pin; text is what esc() showed (ksmText(), String(x||'')). Team and kachinuki
// sheets are the court screen's data (ksmTeamSheet(), ksmKachinukiSheet(), 35-react-court.js), the
// placements its division-complete data (ksmDivisionCompleteInput()). audienceMeta() (25-) stays:
// the TV shares it. The "between matches" helpers (ksmStageLabel(), ksmWaitingReason(),
// ksmUpNext(), ksmBetweenMatches()) stay classic, in 36-react-live-scores.js: classic
// 35-react-court.js and KSMTest.app call ksmUpNext(), and classic code must never call a module
// function; they move with the court file. Legacy is read only through shared/legacy.ts.
import { legacy, legacyPublicLive } from '../../shared/legacy.ts';
import {
  LIVE_SCORES_EVENT,
  type LiveCourtInput, type LiveScoresInput, type UpNextInput,
} from './live-scores-model.ts';

interface LiveScoresWindow {
  /** Live Scores as last computed (the golden test reads it here). */
  ksmLiveScoresInput?: LiveScoresInput;
  /** Set by legacy ksmRenderLiveScores(): a signal came, possibly before this module ran. */
  ksmLiveScoresRequested?: boolean;
}

const liveScoresWindow = (): LiveScoresWindow => window as unknown as LiveScoresWindow;

const state = (): TournamentState => legacy('ksmLegacyState')();

/**
 * The idle court's extra fields, only when there is something to say (so other idle courts are
 * published as before). waiting=false: the reason does not apply (the division does not wait here).
 */
export function ksmBetweenFields(
  _court: Court, _own: string | null | undefined, between: { reason: string | null; upNext: UpNextInput | null }, waiting = true,
): { reason?: string; upNext?: UpNextInput } {
  const out: { reason?: string; upNext?: UpNextInput } = {};
  if (waiting && between.reason) out.reason = between.reason;
  if (between.upNext) out.upNext = between.upNext;
  return out;
}

/**
 * The court's division when it is complete and played on this court (F16): the court's own
 * division (courtActiveDivision / courtState, which the scorekeepers publish, so every device
 * knows both courts'); for the Live Scores court also this device's current division, as the
 * legacy renderer read it. A division played only on the other court (a court with nothing
 * left falls back to such a division) is not this court's.
 */
export function ksmLiveScoresFinishedDivision(court: Court): string | null {
  const s = state();
  const div = s.courtActiveDivision?.[court] || s.courtState?.[court]?.division || (court === (s.publicCourt || 'A') ? s.currentDivision : null);
  if (!div || !legacy('divisionComplete')(div)) return null;
  return (s.allMatches?.[div] || []).some(m => legacy('isValidMatchObject')(m) && legacy('matchBelongsToCourt')(m, court)) ? div : null;
}

/**
 * liveScoresCourtCard(court) (25-, removed) as data: text is what esc() showed (String(x||'')).
 * F16: a court with no match whose division is complete shows that division's placements in
 * its card (kind 'complete'), on every device, instead of "No active match".
 */
export function ksmLiveScoresCourt(court: Court): LiveCourtInput {
  const s = state();
  const text = legacy('ksmText');
  const divisionName = legacy('ksmDivisionName');
  const data = legacy('courtCurrentMatch')(court);
  if (!data) {
    const div = ksmLiveScoresFinishedDivision(court);
    if (div) return { court: text(court), kind: 'complete', division: text(divisionName(div)), complete: legacy('ksmDivisionCompleteInput')(div, true) };
    // Quirk pass: "Waiting for the next match" (not "...division") while the court's division
    // still has an unplayed match on this court that is not ready yet.
    // Owner decision 6: with the reason when it is known, and the court's next division's first
    // matches ("Up next on this court").
    const own = s.courtActiveDivision?.[court] || s.courtState?.[court]?.division;
    const between = legacy('ksmBetweenMatches')(court, own);
    if (own && (s.allMatches?.[own] || []).some(m => legacy('isValidMatchObject')(m) && !m.done && legacy('matchBelongsToCourt')(m, court))) {
      return { court: text(court), kind: 'idle', waiting: true, ...ksmBetweenFields(court, own, between) };
    }
    return { court: text(court), kind: 'idle', ...ksmBetweenFields(court, own, between, false) };
  }
  const m = data.match;
  const next = data.next;
  const meta = legacy('audienceMeta')(m);
  // D1: a team round robin's daihyosen bout is labelled as its line.
  const base = {
    court: text(court),
    meta: { division: text(divisionName(meta.division)), line: legacy('ksmIsRoundRobinDaihyosen')(m) ? legacy('ksmDaihyosenLabel')() : text(meta.line) },
  };
  if (m.type === 'teamPosition' || m.type === 'teamPlayoff' || m.type === 'kachinuki') {
    // Quirk pass: "Next" is the court's next pairing, as the TV's Upcoming shows it
    // (tvUpcomingMatches(), 25-), not the next bout of the pairing being fought.
    const up = legacy('tvUpcomingMatches')(court, m, true)[0] || null;
    const nextTeams = up ? { white: text(up.teamWhite || up.white || 'TBD'), red: text(up.teamRed || up.red || 'TBD') } : null;
    // Owner decision 5: the current bout's hansoku under the sheet.
    if (m.type === 'kachinuki') return { ...base, kind: 'kachinuki', sheet: legacy('ksmKachinukiSheet')(m), next: nextTeams, hansoku: legacy('ksmHansokuCounts')(m) };
    return { ...base, kind: 'team', sheet: legacy('ksmTeamSheet')(m.division, m.teamPair, m), next: nextTeams, hansoku: legacy('ksmHansokuCounts')(m) };
  }
  // liveScorePoints(): the letters as Array.join() prints them.
  const pts = legacy('activeScoreArrays')(m);
  const letters = (arr: ReadonlyArray<unknown> | null | undefined): string[] => (arr || []).map(x => (x == null ? '' : String(x)));
  return {
    ...base, kind: 'individual',
    white: { name: text(m.white || 'TBD'), dojo: text(m.wdojo || '') }, red: { name: text(m.red || 'TBD'), dojo: text(m.rdojo || '') },
    points: { W: letters(pts.W), R: letters(pts.R) }, hansoku: legacy('ksmHansokuCounts')(m),
    next: next ? { white: text(next.white || 'TBD'), red: text(next.red || 'TBD') } : null,
  };
}

/**
 * renderPublic(): Court A and Court B (courtCurrentMatch() moves each court on, as before).
 * F16 (was: the Live Scores court's complete division, with no match on that court, replaced the
 * whole screen and hid the other court's live match): both courts stay while either has a
 * match, a finished division's placements in its court's card; only when neither court has a
 * match do a finished division's placements fill the screen: the Live Scores court's if it has
 * one, else the other court's.
 * A TV device (body.ksm-tv) redraws its TV display after the courts, as before.
 */
export function ksmRenderLiveScores(): void {
  const publicCourt = state().publicCourt || 'A';
  const courts = [ksmLiveScoresCourt('A'), ksmLiveScoresCourt('B')];
  const playing = courts.some(c => c.kind !== 'idle' && c.kind !== 'complete');
  const finished = courts.filter(c => c.kind === 'complete').sort((a, b) => Number(b.court === publicCourt) - Number(a.court === publicCourt))[0];
  if (!playing && finished && finished.kind === 'complete') {
    liveScoresWindow().ksmLiveScoresInput = { kind: 'complete', complete: finished.complete };
    // The TV is not redrawn when the Live Scores court's own division fills the screen, as before
    // (where the legacy renderer showed placements instead of the courts).
    if (finished.court === publicCourt) return;
  } else {
    // window.publicLive is the Live Scores element (reached by its id), read through
    // legacyPublicLive(): the same truthiness as the legacy `window.publicLive`.
    if (!legacyPublicLive()) return;
    liveScoresWindow().ksmLiveScoresInput = { kind: 'courts', courts };
  }
  if (document.body.classList.contains('ksm-tv')) legacy('renderTvDisplay')();
}

/**
 * Pull: computes the input on every ksm:live-scores event, and once now for a signal legacy sent
 * before this module ran (until then the island draws the static markup). Call it before
 * mounting, so it runs ahead of the island's own listener (it redraws on the same event and reads
 * the input this computed); it dispatches nothing itself (a TV device's renderTvDisplay() signals
 * ksm:tv, a different event), so there is no loop.
 */
export function startLiveScoresInput(): void {
  window.addEventListener(LIVE_SCORES_EVENT, ksmRenderLiveScores);
  if (liveScoresWindow().ksmLiveScoresRequested) ksmRenderLiveScores();
}
