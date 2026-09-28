// The Live Scores screen (#public, data-testid live-scores): where spectators land. The current
// match of Court A and Court B side by side, or, once the Live Scores court's division is
// complete, that division's placements.
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

export type LiveCourtInput =
  /** No match on the court. */
  | { court: string; kind: 'idle' }
  | {
    court: string; kind: 'individual'; meta: LiveMetaInput; white: LivePlayerInput; red: LivePlayerInput;
    /** The point letters so far (the live score for the match being scored). */
    points: { W: string[]; R: string[] };
    next: LiveNextInput | null;
  }
  /** A team bout or representative playoff: the pairing's bout sheet. */
  | { court: string; kind: 'team'; meta: LiveMetaInput; sheet: TeamSheetInput; next: LiveNextInput | null }
  | { court: string; kind: 'kachinuki'; meta: LiveMetaInput; sheet: KachinukiSheetInput; next: LiveNextInput | null };

export type LiveScoresInput =
  /** Nothing published yet: the static markup (an empty #publicLive). */
  | { kind: 'empty' }
  /** Court A and Court B, in that order. */
  | { kind: 'courts'; courts: LiveCourtInput[] }
  /** The Live Scores court's division is complete and the court has no match: its placements, instead of the courts. */
  | { kind: 'complete'; complete: CourtCompleteInput };

// ------------------------------------------------------------------------------- view

export type LiveCourtBodyView =
  | { kind: 'idle' }
  | { kind: 'individual'; white: LivePlayerInput; red: LivePlayerInput; whitePoints: string; redPoints: string }
  | { kind: 'team'; sheet: TeamSheetView }
  | { kind: 'kachinuki'; sheet: KachinukiSheetView };

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
export const NO_NEXT_TEXT = 'No match queued';

/** liveScorePoints(): the letters with spaces, '—' before the first point. */
export function pointText(points: readonly string[]): string {
  return points.join(' ') || '—';
}

export function liveCourtView(input: LiveCourtInput): LiveCourtView {
  const base = { testId: `live-court-${input.court}`, title: `Court ${input.court}` };
  if (input.kind === 'idle') return { ...base, className: 'live-court-card', meta: IDLE_META, body: { kind: 'idle' }, next: null };
  const meta = `${input.meta.division} • ${input.meta.line}`;
  const next = { match: input.next };
  switch (input.kind) {
    case 'individual':
      return {
        ...base, className: 'live-court-card', meta, next,
        body: { kind: 'individual', white: input.white, red: input.red, whitePoints: pointText(input.points.W), redPoints: pointText(input.points.R) },
      };
    case 'team': return { ...base, className: 'live-court-card live-team-card', meta, next, body: { kind: 'team', sheet: teamSheetView(input.sheet) } };
    case 'kachinuki': return { ...base, className: 'live-court-card live-team-card', meta, next, body: { kind: 'kachinuki', sheet: kachinukiSheetView(input.sheet) } };
  }
}

export function liveScoresView(input: LiveScoresInput): LiveScoresView {
  switch (input.kind) {
    case 'empty': return input;
    case 'courts': return { kind: 'courts', courts: input.courts.map(liveCourtView) };
    case 'complete': return { kind: 'complete', complete: courtCompleteView(input.complete) };
  }
}
