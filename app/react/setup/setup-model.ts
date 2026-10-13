// The Setup screen (#setup): the parts React draws, the Individual Divisions table's rows
// (#divisionSetupRows: Use, the division, its format and its court; × on a custom division) and
// the tournament name in the hero (#setupTournamentName). Everything else on Setup (the fields,
// Add Custom Division, the team, exhibition, referee and court-side settings) is legacy markup:
// the legacy code reads and writes those fields by id synchronously.
//
// The legacy app decides what is shown: renderDivisionSetup() (app/js/01-state-and-setup.js)
// publishes a SetupDivisionsInput (ksm:setup-divisions) and syncSetupHeader()
// (30-setup-header-and-director.js) a SetupHeaderInput (ksm:setup-header), through
// app/js/42-react-setup.js. The legacy renderer (divisionSetupRow()'s markup, syncSetupHeader()'s
// text) is mirrored here: its texts, options, classes and test IDs (setup-division-row,
// setup-division-enabled, setup-division-name, setup-division-format, setup-division-court),
// which tests/golden/setup (recorded from it) pins.
//
// Timing fields per division (roadmap 1.5) will be more columns of a row: a row is one object,
// so a later field is one more property here and one more cell in Setup.tsx.

// ------------------------------------------------------------------------------ input

/** One row of the divisions table (divisionSetupRow(d, enabled, custom)). */
export interface SetupDivisionRowInput {
  /** The division as the handlers get it (jsArg(): String(d ?? '')). */
  division: string;
  /** Its name as esc() showed it. */
  name: string;
  /** In state.divisions (Use checked; the selects enabled). */
  enabled: boolean;
  /** Not a preset: marked "custom", with ×. */
  custom: boolean;
  /** state.divisionTypes[d] (null when unset). */
  format: string | null;
  /** state.divisionCourts[d] || 'A'. */
  court: string;
  /**
   * Issue #31: an enabled division's move buttons (whether it can move up / down in the running
   * order); null or missing for a switched-off division (no buttons).
   */
  move?: { up: boolean; down: boolean } | null;
}

export interface SetupDivisionsInput {
  /** The enabled divisions in their running order (#31), then the switched-off ones. */
  rows: SetupDivisionRowInput[];
}

export interface SetupHeaderInput {
  /** The Tournament Name field's value. */
  name: string;
}

/** Nothing published yet: no rows (the static markup's empty tbody). */
export const EMPTY_SETUP_DIVISIONS: SetupDivisionsInput = { rows: [] };
/** Nothing published yet: the static markup's "Kendo Tournament". */
export const EMPTY_SETUP_HEADER: SetupHeaderInput = { name: '' };

// ------------------------------------------------------------------------------ texts

export const SETUP_HEADER_FALLBACK = 'Kendo Tournament';
/** Issue #31: the move buttons' symbols and accessible names. */
export const MOVE_TEXTS = { up: '↑', down: '↓' } as const;
export function moveLabel(name: string, direction: 'up' | 'down'): string {
  return `Move ${name} ${direction}`;
}
export const CUSTOM_TEXT = 'custom';
export const REMOVE_TEXT = '×';
/** The format select's options (no value attribute: the value is the text). */
export const FORMAT_OPTIONS = ['Round Robin', 'Single Elimination'] as const;
/** The court select's options. */
export const COURT_OPTIONS = [
  { value: 'A', label: 'Court A' },
  { value: 'B', label: 'Court B' },
  { value: 'split', label: 'Split Between Courts' },
] as const;

// ------------------------------------------------------------------------------ view

export interface SetupDivisionRowView extends SetupDivisionRowInput {
  /** The format option printed `selected` (the one equal to the format), or null for none. */
  formatSelected: string | null;
  /** The court option printed `selected`, or null for none (a court other than A, B, split). */
  courtSelected: string | null;
}

export function setupDivisionRowView(row: SetupDivisionRowInput): SetupDivisionRowView {
  return {
    ...row,
    formatSelected: FORMAT_OPTIONS.find(f => f === row.format) ?? null,
    courtSelected: COURT_OPTIONS.find(c => c.value === row.court)?.value ?? null,
  };
}

/** syncSetupHeader(): the name, or "Kendo Tournament" when the field is empty. */
export function setupHeaderText(input: SetupHeaderInput): string {
  return input.name ? input.name : SETUP_HEADER_FALLBACK;
}
