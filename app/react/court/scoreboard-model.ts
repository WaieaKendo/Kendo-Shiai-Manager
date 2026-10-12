// The court screen scoreboard: each side's name, dojo (or team), points and hansoku for the
// match on the court, and the team-playoff representative picker.
//
// The legacy app still chooses the court's match: renderScore() (app/js/22-scorekeeper-screen.js)
// publishes a ScoreboardInput (the match or null, the live score and, for a team playoff,
// each side's roster and whether it may be changed). scoreboardView() turns it into what
// CourtScoreboard renders: exactly what the legacy renderer (removed in M.8 step 5) wrote into
// the same elements.

export type Side = 'W' | 'R';

export type ScoreboardMatch = Pick<Match, 'white' | 'red' | 'wdojo' | 'rdojo' | 'teamWhite' | 'teamRed' | 'type'>;

export interface RepresentativeInput {
  /** The side's team (m.teamWhite / m.teamRed). */
  team: string;
  /** The side's current name (m.white / m.red): a roster name or "<team> Representative". */
  current: string;
  /** teamRoster(team). */
  roster: string[];
  /** canModifyRepresentative(m). */
  editable: boolean;
}

export interface ScoreboardInput {
  match: ScoreboardMatch | null;
  score: ActiveScore;
  /** Only for a team playoff (m.type === 'teamPlayoff'). */
  representatives: Record<Side, RepresentativeInput> | null;
}

export interface RepresentativeView {
  editable: boolean;
  /** "<team> Representative" (or "Dojo Representative"): the empty choice. */
  placeholder: string;
  /** Read-only text: the placeholder or the chosen name. */
  text: string;
  /** Selected option: '' (placeholder) or a roster name. */
  value: string;
  options: string[];
}

export interface SideView {
  name: string;
  /** Replaces the name in a team playoff. */
  representative: RepresentativeView | null;
  dojo: string;
  points: string[];
  /** One "△ " per hansoku. */
  hansoku: string;
}

export interface ScoreboardView {
  white: SideView;
  red: SideView;
}

export const EMPTY_SCOREBOARD: ScoreboardInput = { match: null, score: { W: [], R: [], WT: 0, RT: 0 }, representatives: null };

const EMPTY_SIDE: SideView = { name: '—', representative: null, dojo: '—', points: [], hansoku: '' };

/** As the legacy repSelect(): a select for staff while the playoff may change, else text. */
export function representativeView(rep: RepresentativeInput): RepresentativeView {
  const placeholder = `${rep.team || 'Dojo'} Representative`;
  const isPlaceholder = !rep.current || /Representative/.test(rep.current);
  return {
    editable: rep.editable,
    placeholder,
    text: isPlaceholder ? placeholder : rep.current,
    // No option matches a name outside the roster, so the browser shows the first (placeholder).
    value: !isPlaceholder && rep.roster.includes(rep.current) ? rep.current : '',
    options: rep.roster,
  };
}

export function scoreboardView(input: ScoreboardInput): ScoreboardView {
  const m = input.match;
  if (!m) return { white: EMPTY_SIDE, red: EMPTY_SIDE };
  const reps = m.type === 'teamPlayoff' ? input.representatives : null;
  const side = (s: Side): SideView => {
    const w = s === 'W';
    const rep = reps?.[s];
    return {
      name: (w ? m.white : m.red) || 'TBD',
      representative: rep ? representativeView(rep) : null,
      dojo: (w ? m.wdojo || m.teamWhite : m.rdojo || m.teamRed) || '—',
      points: [...((w ? input.score.W : input.score.R) || [])],
      hansoku: '△ '.repeat((w ? input.score.WT : input.score.RT) || 0),
    };
  };
  return { white: side('W'), red: side('R') };
}
