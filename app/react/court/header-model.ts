// The court screen header: tournament name, court title, division select, division title
// and match line.
//
// The legacy app still computes everything the header shows (app/js/35-react-court.js):
// updateScoreTournamentName() publishes the tournament name, renderDivisions() the court and
// the divisions this court may select (its selection rules stay legacy), and renderScore()
// the division title and match line (matchDisplayMeta()). Each writer publishes only its own
// fields, as each legacy writer only wrote its own elements: when a division completes,
// renderScore() updates the tournament name alone and the rest keeps what it showed before.
// courtHeaderView() turns that into what CourtHeader renders.

export interface CourtHeaderInput {
  /** tName.value or "Kendo Tournament". */
  tournamentName: string;
  /** state.currentCourt ('A' / 'B'). */
  court: string;
  /** The division select's options, in order (renderDivisions()). */
  divisions: string[];
  /** state.currentDivision when renderDivisions() last ran ('' when none). */
  currentDivision: string;
  divisionTitle: string;
  matchLine: string;
  /** #38: the engine says the court's bout needs a winner (true) or may be a hikiwake (false); null/absent: no match. */
  requiresWinner?: boolean | null;
  /** #38: this court is set to Red on the left (redOnLeftForCourt(), Setup's "Red side" field). */
  redLeft?: boolean;
}

export type RedSide = 'left' | 'right';

/** #38: "Configure court" (staff): the same wording and values as Setup's "Court A/B — Red side" field. */
export const CONFIGURE_TEXTS = {
  button: 'Configure court',
  heading: 'Red side (as seen from the scoring table)',
  setupLink: 'More court settings in Setup',
} as const;
export const RED_SIDE_OPTIONS: ReadonlyArray<{ value: RedSide; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

/** #38: the tag next to the bout line. */
export const RULE_TAGS = { winner: 'Winner required', hikiwake: 'Hikiwake allowed' } as const;

export interface CourtHeaderView {
  tournamentName: string;
  title: string;
  divisions: string[];
  /**
   * What the select shows, as the legacy renderDivisions() left it: the current division
   * (assigned to select.value, so a division that is not an option selects nothing), or,
   * with no current division, null: the first option.
   */
  selectValue: string | null;
  divisionTitle: string;
  matchLine: string;
  /** #38: "Winner required" or "Hikiwake allowed"; absent without a match. */
  ruleTag?: string;
}

/** The static markup (app/index.html), before any legacy writer ran. */
export const EMPTY_HEADER: CourtHeaderInput = {
  tournamentName: 'Kendo Tournament', court: 'A', divisions: [], currentDivision: '', divisionTitle: '—', matchLine: 'No active match',
};

export function courtHeaderView(input: CourtHeaderInput): CourtHeaderView {
  return {
    tournamentName: input.tournamentName,
    title: `Court ${input.court}`,
    divisions: [...input.divisions],
    selectValue: input.currentDivision ? input.currentDivision : null,
    divisionTitle: input.divisionTitle,
    matchLine: input.matchLine,
    ...(typeof input.requiresWinner === 'boolean' ? { ruleTag: input.requiresWinner ? RULE_TAGS.winner : RULE_TAGS.hikiwake } : {}),
  };
}

/** #38: the Configure court panel: the court's current Red side, shown as the chosen option. */
export function courtConfigView(input: CourtHeaderInput): { redSide: RedSide } {
  return { redSide: input.redLeft ? 'left' : 'right' };
}
