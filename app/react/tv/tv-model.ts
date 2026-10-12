// The TV display (?view=tv, the contents of #tvLive): one court on a fixed 1920×1080 canvas
// (.tv3-root, data-testid tv-canvas) with three zones: the header (court, division, match line),
// the current match (individual, team bout sheet or kachinuki lineups; or a completed division's
// Final Results) and Upcoming Matches (or the "Division Complete" footer).
//
// The legacy app still decides what is shown: buildTV3ViewModel() (app/js/26-tv-display.js)
// chooses the TV court's match with courtCurrentMatch() (which also moves the court on, as
// before), its upcoming matches (tvUpcomingMatches(), 25-live-scores.js) and when the Final
// Results show; ksmTvDisplayInput() (37-react-tv.js) publishes a TvInput (ksm:tv) instead of writing
// #tvLive. tvView() adds what the legacy tv3 renderer derived: "Court X", the name split into
// first name and the rest, the point strings, classes, the kachinuki fighters' states.
import { courtCompleteView, type CourtCompleteInput, type CourtCompleteView } from '../court/complete-model.ts';
import { pointText } from '../live-scores/live-scores-model.ts';

// ------------------------------------------------------------------------------ input

/** Point letters so far (the live score for the match being scored). */
export interface TvPoints {
  W: string[];
  R: string[];
}

export interface TvPlayerInput {
  /** The name or bracket placeholder (tvIndividualSideLabel()). */
  name: string;
  /** The dojo ('' when none). */
  sub: string;
}

export interface TvTeamRowInput {
  white: string;
  red: string;
  points: TvPoints;
  /** The bout being fought (the court's current match). */
  active: boolean;
}

export type TvBodyInput =
  /** No match on the court. */
  | { kind: 'idle' }
  /** The court's division is complete and nothing is left on the court: its placements. */
  | { kind: 'results'; complete: CourtCompleteInput }
  | { kind: 'individual'; white: TvPlayerInput; red: TvPlayerInput; points: TvPoints }
  /** A team bout or representative playoff: the pairing's bouts and the Wins/Points summary. */
  | {
    kind: 'team'; teamWhite: string; teamRed: string; rows: TvTeamRowInput[];
    summary: { wWins: string; wPts: string; rWins: string; rPts: string };
  }
  | {
    kind: 'kachinuki'; white: string; red: string; points: TvPoints; teamWhite: string; teamRed: string;
    /** Three fighters each ('—' for a missing one); the index of each side's current fighter. */
    lineupW: string[]; lineupR: string[]; wIndex: number; rIndex: number;
  };

/** One Upcoming Matches card (team names for a team match; subs: dojos or the round). */
export interface TvUpcomingInput {
  white: string;
  red: string;
  whiteSub: string;
  redSub: string;
}

export type TvInput =
  /** Nothing published yet: the static markup (an empty #tvLive). */
  | { kind: 'empty' }
  | {
    kind: 'tv'; court: string; division: string; meta: string; body: TvBodyInput;
    /** Two cards, null for an empty one (not shown with Final Results). */
    upcoming: (TvUpcomingInput | null)[];
  };

// ------------------------------------------------------------------------------- view

export interface TvPlayerView {
  /** tv3Name(): one span per part, the first name and the rest ('—' when empty). */
  nameParts: string[];
  sub: string;
}

export interface TvTeamRowView {
  /** The bout's position in the lineup, from 1. */
  pos: string;
  white: string;
  red: string;
  whitePoints: string;
  redPoints: string;
  active: boolean;
}

export type TvKachinukiState = 'eliminated' | 'active' | 'waiting';

export interface TvKachinukiRowView {
  name: string;
  state: TvKachinukiState;
}

export type TvBodyView =
  | { kind: 'idle' }
  | { kind: 'results'; complete: CourtCompleteView }
  | { kind: 'individual'; white: TvPlayerView; red: TvPlayerView; whitePoints: string; redPoints: string }
  | {
    kind: 'team'; teamWhite: string; teamRed: string; rosterClass: string; rows: TvTeamRowView[];
    summary: { wWins: string; wPts: string; rWins: string; rPts: string };
  }
  | {
    kind: 'kachinuki'; white: TvPlayerView; red: TvPlayerView; whitePoints: string; redPoints: string;
    teamWhite: string; teamRed: string; rowsW: TvKachinukiRowView[]; rowsR: TvKachinukiRowView[];
  };

export type TvFooterView =
  | { kind: 'upcoming'; cards: (TvUpcomingInput | null)[] }
  /** Final Results: "Division Complete" instead of Upcoming Matches. */
  | { kind: 'results' };

export type TvView =
  | { kind: 'empty' }
  | { kind: 'tv'; header: { court: string; division: string; meta: string }; body: TvBodyView; footer: TvFooterView };

export const EMPTY_TV: TvInput = { kind: 'empty' };

export const UPCOMING_TITLE = 'Upcoming Matches';
export const NO_UPCOMING_TEXT = 'No additional match scheduled';
export const DIVISION_COMPLETE_TEXT = 'Division Complete';

/** tv3Name(): a name as its first part and the rest; '—' for an empty name. */
export function nameParts(name: string): string[] {
  const [first = '—', ...rest] = String(name || '—').trim().split(/\s+/).filter(Boolean);
  return rest.length ? [first, rest.join(' ')] : [first];
}

/** tv3KRow(): before the side's current fighter eliminated, then active, then waiting. */
export function kachinukiState(index: number, active: number): TvKachinukiState {
  return index < active ? 'eliminated' : index === active ? 'active' : 'waiting';
}

const player = (name: string, sub: string): TvPlayerView => ({ nameParts: nameParts(name), sub });

export function tvBodyView(body: TvBodyInput): TvBodyView {
  switch (body.kind) {
    case 'idle': return body;
    case 'results': return { kind: 'results', complete: courtCompleteView(body.complete) };
    case 'individual':
      return {
        kind: 'individual', white: player(body.white.name, body.white.sub), red: player(body.red.name, body.red.sub),
        whitePoints: pointText(body.points.W), redPoints: pointText(body.points.R),
      };
    case 'team':
      return {
        kind: 'team', teamWhite: body.teamWhite, teamRed: body.teamRed,
        rosterClass: `tv3-roster ${body.rows.length <= 3 ? 'three' : 'five'}`,
        rows: body.rows.map((r, i) => ({
          pos: String(i + 1), white: r.white, red: r.red, whitePoints: pointText(r.points.W), redPoints: pointText(r.points.R), active: r.active,
        })),
        summary: body.summary,
      };
    case 'kachinuki':
      return {
        kind: 'kachinuki', white: player(body.white, ''), red: player(body.red, ''),
        whitePoints: pointText(body.points.W), redPoints: pointText(body.points.R),
        teamWhite: body.teamWhite, teamRed: body.teamRed,
        rowsW: body.lineupW.map((name, i) => ({ name, state: kachinukiState(i, body.wIndex) })),
        rowsR: body.lineupR.map((name, i) => ({ name, state: kachinukiState(i, body.rIndex) })),
      };
  }
}

export function tvView(input: TvInput): TvView {
  if (input.kind === 'empty') return input;
  return {
    kind: 'tv',
    header: { court: `Court ${input.court}`, division: input.division, meta: input.meta },
    body: tvBodyView(input.body),
    footer: input.body.kind === 'results' ? { kind: 'results' } : { kind: 'upcoming', cards: input.upcoming },
  };
}
