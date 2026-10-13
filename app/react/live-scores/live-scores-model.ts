// The Live Scores screen (#public, data-testid live-scores): where spectators land. The current
// match of Court A and Court B side by side (a court whose division is complete shows its
// placements in its card), or, once neither court has a match, a finished division's placements
// (F16).
//
// The legacy app still decides what is shown: renderPublic() (app/js) chooses each court's match
// with courtCurrentMatch() (which also moves the court on, as before), audienceMeta() gives the
// division and match line (shared with the TV), the court screen's own publishers give a team
// match's bout sheet and a kachinuki sheet (ksmTeamSheet(), ksmKachinukiSheet(), the court's
// context panel data) and resultPlacements() (engine) the placements. It publishes a
// LiveScoresInput (ksm:live-scores) instead of writing #publicLive. liveScoresView() adds what the
// legacy liveScoresCourtCard() derived: test IDs, classes, the "Court X" title, the meta line and
// the point strings.
import { courtCompleteView, type CourtCompleteInput, type CourtCompleteView } from '../court/complete-model.ts';
import {
  kachinukiSheetView, teamSheetView,
  type KachinukiSheetInput, type KachinukiSheetView, type TeamSheetInput, type TeamSheetView,
} from '../court/context-model.ts';

// ------------------------------------------------------------------------------ input

/** audienceMeta(m) (app/js/25-live-scores.js): text as esc() showed it. */
export interface LiveMetaInput {
  division: string;
  line: string;
}

/** The next match on the court: the names shown (team names for a team match), already 'TBD' when missing. */
export interface LiveNextInput {
  white: string;
  red: string;
}

export interface LivePlayerInput {
  /** The name ('TBD' when missing). */
  name: string;
  dojo: string;
}

/** Each side's hansoku count (owner decision 5: shown as on the court screen). */
export interface HansokuCounts {
  W: number;
  R: number;
}

/** Each side's hansoku as triangles ('' for none), as the court screen's '△ △'. */
export interface HansokuView {
  white: string;
  red: string;
}

/** One triangle per hansoku, separated by spaces; '' for none. */
export function hansokuMarks(count: number | undefined): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return Array.from({ length: n }, () => '△').join(' ');
}

/** The hansoku to show, or undefined when neither side has one (nothing is drawn then). */
export function hansokuView(counts: HansokuCounts | undefined): HansokuView | undefined {
  if (!counts || (!counts.W && !counts.R)) return undefined;
  return { white: hansokuMarks(counts.W), red: hansokuMarks(counts.R) };
}

export type LiveCourtInput =
  /**
   * No match on the court. waiting: its division still has an unplayed match on this court that
   * is not ready yet (e.g. a split final waiting for the other court's semifinal; quirk pass).
   */
  | { court: string; kind: 'idle'; waiting?: true }
  | {
    court: string; kind: 'individual'; meta: LiveMetaInput; white: LivePlayerInput; red: LivePlayerInput;
    /** The point letters so far (the live score for the match being scored). */
    points: { W: string[]; R: string[] };
    /** Each side's hansoku (owner decision 5). */
    hansoku?: HansokuCounts;
    next: LiveNextInput | null;
  }
  /** A team bout or representative playoff: the pairing's bout sheet (hansoku: the current bout's). */
  | { court: string; kind: 'team'; meta: LiveMetaInput; sheet: TeamSheetInput; next: LiveNextInput | null; hansoku?: HansokuCounts }
  | { court: string; kind: 'kachinuki'; meta: LiveMetaInput; sheet: KachinukiSheetInput; next: LiveNextInput | null; hansoku?: HansokuCounts }
  /** No match on the court and its division is complete (F16): the division's placements in the card. */
  | { court: string; kind: 'complete'; division: string; complete: CourtCompleteInput };

export type LiveScoresInput =
  /** Nothing published yet: the static markup (an empty #publicLive). */
  | { kind: 'empty' }
  /** Court A and Court B, in that order. */
  | { kind: 'courts'; courts: LiveCourtInput[] }
  /**
   * Neither court has a match and a court's division is complete (the Live Scores court's
   * first): its placements, instead of the courts (F16; before, whenever the Live Scores
   * court's division was complete and that court had no match).
   */
  | { kind: 'complete'; complete: CourtCompleteInput };

// ------------------------------------------------------------------------------- view

export type LiveCourtBodyView =
  | { kind: 'idle'; waiting?: true }
  | { kind: 'individual'; white: LivePlayerInput; red: LivePlayerInput; whitePoints: string; redPoints: string; hansoku?: HansokuView }
  | { kind: 'team'; sheet: TeamSheetView; hansoku?: HansokuView }
  | { kind: 'kachinuki'; sheet: KachinukiSheetView; hansoku?: HansokuView }
  | { kind: 'complete'; complete: CourtCompleteView };

export interface LiveCourtView {
  testId: string;
  className: string;
  title: string;
  /** The text of data-testid live-meta: 'No active match' or "<division> • <line>". */
  meta: string;
  body: LiveCourtBodyView;
  /** The "Next" line (null on an idle court, which has none); next.match null: "No match queued". */
  next: { match: LiveNextInput | null } | null;
}

export type LiveScoresView =
  | { kind: 'empty' }
  | { kind: 'courts'; courts: LiveCourtView[] }
  | { kind: 'complete'; complete: CourtCompleteView };

export const EMPTY_LIVE_SCORES: LiveScoresInput = { kind: 'empty' };

export const LIVE_SCORES_HEADING = { eyebrow: 'Live Tournament', title: 'Live Scores' };
export const IDLE_META = 'No active match';
export const IDLE_TEXT = 'Waiting for the next division';
/** An idle court whose division still has a match to play here (quirk pass). */
export const WAITING_TEXT = 'Waiting for the next match';
export const NO_NEXT_TEXT = 'No match queued';
/** The meta line's match part on a court card showing its finished division's placements (F16). */
export const COMPLETE_LINE = 'Final Results';

/** liveScorePoints(): the letters with spaces, '—' before the first point. */
export function pointText(points: readonly string[]): string {
  return points.join(' ') || '—';
}

export function liveCourtView(input: LiveCourtInput): LiveCourtView {
  const base = { testId: `live-court-${input.court}`, title: `Court ${input.court}` };
  if (input.kind === 'idle') return { ...base, className: 'live-court-card', meta: IDLE_META, body: input.waiting ? { kind: 'idle', waiting: true } : { kind: 'idle' }, next: null };
  if (input.kind === 'complete') {
    return {
      ...base, className: 'live-court-card', meta: `${input.division} • ${COMPLETE_LINE}`,
      body: { kind: 'complete', complete: courtCompleteView(input.complete) }, next: null,
    };
  }
  const meta = `${input.meta.division} • ${input.meta.line}`;
  const next = { match: input.next };
  const hansoku = hansokuView(input.hansoku);
  const withHansoku = hansoku ? { hansoku } : {};
  switch (input.kind) {
    case 'individual':
      return {
        ...base, className: 'live-court-card', meta, next,
        body: { kind: 'individual', white: input.white, red: input.red, whitePoints: pointText(input.points.W), redPoints: pointText(input.points.R), ...withHansoku },
      };
    case 'team': return { ...base, className: 'live-court-card live-team-card', meta, next, body: { kind: 'team', sheet: teamSheetView(input.sheet), ...withHansoku } };
    case 'kachinuki': return { ...base, className: 'live-court-card live-team-card', meta, next, body: { kind: 'kachinuki', sheet: kachinukiSheetView(input.sheet), ...withHansoku } };
  }
}

export function liveScoresView(input: LiveScoresInput): LiveScoresView {
  switch (input.kind) {
    case 'empty': return input;
    case 'courts': return { kind: 'courts', courts: input.courts.map(liveCourtView) };
    case 'complete': return { kind: 'complete', complete: courtCompleteView(input.complete) };
  }
}
