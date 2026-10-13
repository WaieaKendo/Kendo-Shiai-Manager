// The court screen scoreboard: each side's name, dojo (or team), points and hansoku for the
// match on the court, and the team-playoff representative picker.
//
// The legacy app still chooses the court's match: renderScore() (app/js/22-scorekeeper-screen.js)
// publishes a ScoreboardInput (the match or null, the live score and, for a team playoff,
// each side's roster and whether it may be changed). scoreboardView() turns it into what
// CourtScoreboard renders: exactly what the legacy renderer (removed in M.8 step 5) wrote into
// the same elements.

export type Side = 'W' | 'R';

export type ScoreboardMatch = Pick<Match, 'white' | 'red' | 'wdojo' | 'rdojo' | 'teamWhite' | 'teamRed' | 'type'> & {
  /** D1: a team round robin's daihyosen bout: "Daihyosen — first point wins". */
  rule?: string;
  /** #38: the engine says this bout needs a winner (matchRequiresWinner()): no hikiwake. */
  requiresWinner?: boolean;
};

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
  /** D1: the bout's rule label, only for a team round robin's daihyosen. */
  rule?: string;
  /** #38: shown in the match area while a winner-required bout is tied ("Encho — winner needed"). */
  encho?: string;
}

/** #38: the match-area label for a tied bout that needs a winner. */
export const ENCHO_LABEL = 'Encho — winner needed';
/** #38: Next Match's text for a tied bout that may be a draw. */
export const HIKIWAKE_NEXT_LABEL = 'Next Match (Hikiwake)';

export interface NextMatchView {
  /** A tied bout that needs a winner cannot be advanced (nextMatch() still alerts as a fallback). */
  disabled: boolean;
  label: string;
}

/** The live score is tied, as nextMatch() decides: equal point counts. */
export function isTied(score: ActiveScore): boolean {
  return (score.W || []).length === (score.R || []).length;
}

/** #38: Next Match for the court's bout: disabled while a winner-required bout is tied; "(Hikiwake)" while a draw would be recorded. */
export function nextMatchView(input: ScoreboardInput): NextMatchView {
  const m = input.match;
  if (!m || !isTied(input.score)) return { disabled: false, label: 'Next Match' };
  if (m.requiresWinner) return { disabled: true, label: 'Next Match' };
  return { disabled: false, label: HIKIWAKE_NEXT_LABEL };
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
  const encho = m.requiresWinner && isTied(input.score) ? { encho: ENCHO_LABEL } : {};
  return { white: side('W'), red: side('R'), ...(m.rule ? { rule: m.rule } : {}), ...encho };
}
