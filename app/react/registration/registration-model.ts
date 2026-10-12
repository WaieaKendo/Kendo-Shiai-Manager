// Registration part 1: the parts React draws, the individual players table (#regTable: a row per
// competitor the filter lets through, with name, dojo, division, seed, status and ×) and the
// contents of the tournament status card (#tournamentStatusCard). Everything else on
// Registration (the tab bar, the toolbars and their buttons, the filter field, the team,
// exhibition and Pools cards) is legacy markup.
//
// The legacy app decides what is shown: renderReg() (app/js/03-registration-and-validation.js)
// publishes a PlayersInput (ksm:registration-players) and renderTournamentStatus() (03) a
// StatusInput (ksm:registration-status), through app/js/43-react-registration.js. The legacy
// renderer (renderReg()'s table markup, renderTournamentStatus()'s card markup) is mirrored here:
// its texts, classes and test IDs (reg-row, reg-name, reg-dojo, reg-division, reg-seed,
// reg-status, reg-remove), which tests/golden/registration (recorded from it) pins.
//
// A row is one object: a later column (e.g. a member ID or a rank) is one more property here and
// one more cell in Registration.tsx.

// ------------------------------------------------------------------------------ input

/** One row of the players table (one competitor). Texts are as the legacy markup showed them. */
export interface PlayerRowInput {
  /** The competitor's index in state.competitors (what the inline handlers passed). */
  index: number;
  name: string;
  dojo: string;
  seed: string;
  /** The stored status, printed into the class as is (`status ${status}`). */
  status: string;
  /** status === 'Checked' / status === 'NoShow'. */
  checked: boolean;
  noShow: boolean;
  /** The division options printed `selected` (equal to the competitor's division), by position;
   * the last one is the one selected, none selects the first option. */
  selected: number[];
}

export interface PlayersInput {
  /** The division select's options (state.divisions), in order. */
  divisions: string[];
  rows: PlayerRowInput[];
}

export interface StatusInput {
  /** validateTournament().valid */
  valid: boolean;
  /** Named competitors who are not No Show. */
  competitors: number;
  /** Divisions with eligible competitors (+1 for an enabled team tournament with teams). */
  divisions: number;
  /** The Setup courts field's text ('2' when empty). */
  courts: string;
  /** How many validation issues are errors. */
  errors: number;
}

/** Nothing published yet: the static markup's empty table. */
export const EMPTY_PLAYERS: PlayersInput = { divisions: [], rows: [] };
/** Nothing published yet: the static markup's empty card. */
export const EMPTY_STATUS: StatusInput | null = null;

// ------------------------------------------------------------------------------ texts

/** The table's header cells (the last one is empty: the × column). */
export const PLAYER_HEADERS = ['Name', 'Dojo', 'Division', 'Seed', 'Status', ''] as const;
export const REMOVE_TEXT = '×';
export const STATUS_TITLE = 'Tournament Status';

/** The status chip's text. */
export function statusText(row: Pick<PlayerRowInput, 'checked' | 'noShow'>): string {
  return row.checked ? '● Checked In' : row.noShow ? '● No Show' : '○ Registered';
}

/** The status chip's class, as the template printed it (not escaped by the template; React
 * escapes it, see F19). */
export function statusClass(row: Pick<PlayerRowInput, 'status'>): string {
  return `status ${row.status}`;
}

export interface StatusView {
  /** 'Ready to Generate' / 'Needs Attention'. */
  verdict: string;
  /** "N competitors • N divisions • N courts" (never singular). */
  counts: string;
  /** The line under the head. */
  message: string;
}

export function statusView(input: StatusInput): StatusView {
  return {
    verdict: input.valid ? 'Ready to Generate' : 'Needs Attention',
    counts: `${input.competitors} competitors • ${input.divisions} divisions • ${input.courts} courts`,
    message: input.valid ? 'No blocking validation issues.' : `${input.errors} validation issue(s). Generate Tournament to review.`,
  };
}
