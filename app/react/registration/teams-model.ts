// Registration part 2: the parts React draws, the team cards (#teamTable inside Team Registration
// #teamReg), the exhibition table (#exhibitionTable inside Exhibition #exhibitionReg) and the tab
// bar (the first row of the Registration toolbar card: the four tabs, Generate Tournament and
// Regenerate Single Division). Everything else on those cards (the toolbars and their buttons, the
// team filter #teamFilter, the hint line) is legacy markup.
//
// The legacy app decides what is shown: renderTeams() (app/js/03-registration-and-validation.js)
// publishes a TeamsInput (ksm:registration-teams), renderExhibitions() (03) an ExhibitionsInput
// (ksm:registration-exhibitions) and regTab() (app/js/23-navigation.js) a TabsInput
// (ksm:registration-tab), through app/js/43-react-registration.js. The legacy renderers' markup
// (the team card template, the exhibition row template, the static tab bar of app/index.html) is
// mirrored here: texts, classes, ids and test IDs (team-card, team-name, team-remove,
// team-member-<position>, team-status; exhibition-row, exhibition-white, exhibition-red,
// exhibition-status, exhibition-remove; reg-tab-*, generate-button, regenerate-division-button),
// which tests/golden/registration-teams (recorded from them) pins.
//
// A card and a row are one object each: a later field (e.g. a team's dojo or an exhibition's
// court) is one more property here and one more element in RegistrationTeams.tsx.

// ------------------------------------------------------------------------------ input

/** One team card (one team). Texts are as the legacy markup showed them. */
export interface TeamCardInput {
  /** The team's index in state.teams (what the inline handlers passed). */
  index: number;
  team: string;
  /** One text per position of TeamsInput.slots, in that order. */
  members: string[];
  /** The stored status, printed into the class (`status ${status}`, through esc()). */
  status: string;
  /** status === 'Checked' / status === 'NoShow'. */
  checked: boolean;
  noShow: boolean;
}

export interface TeamsInput {
  /** The Setup team format as the card's format line shows it ('5-Person Team' when empty). */
  format: string;
  /** The Setup team tournament format ('Single Elimination' when empty). */
  tournamentFormat: string;
  /** The positions shown: senpo, chuken, taisho (3-Person, Kachinuki) or all five. */
  slots: string[];
  /** The teams the filter lets through, in order. */
  cards: TeamCardInput[];
}

/** One exhibition row (one match). */
export interface ExhibitionRowInput {
  /** The match's index in state.exhibitions (what the inline handlers passed). */
  index: number;
  white: string;
  red: string;
  status: string;
  checked: boolean;
  noShow: boolean;
}

export interface ExhibitionsInput {
  rows: ExhibitionRowInput[];
}

export interface TabsInput {
  /** state.regMode as regTab() set it (any text: an unknown one marks no tab). */
  mode: string;
  /** Owner decision 19: Setup's Exhibition Matches is Enabled (else the Exhibition tab is hidden). */
  exhibitions?: boolean;
}

/** Owner decision 19 (#29): the tab bar's buttons, without Exhibition while exhibitions are off. */
export function visibleTabButtons(input: TabsInput): readonly TabButton[] {
  return input.exhibitions === false ? TAB_BUTTONS.filter(b => b.mode !== 'exhibition') : TAB_BUTTONS;
}

/** Nothing published yet: the static markup's empty #teamTable (a <table>, which the first
 * renderTeams() replaced by the cards' <div>). */
export const EMPTY_TEAMS: TeamsInput | null = null;
/** Nothing published yet: the static markup's empty #exhibitionTable. */
export const EMPTY_EXHIBITIONS: ExhibitionsInput | null = null;
/** Nothing published yet: the static tab bar marks Individual Players. */
export const EMPTY_TABS: TabsInput = { mode: 'individual' };

// ------------------------------------------------------------------------------ texts

export const TEAM_NAME_LABEL = 'Team Name';
export const EXHIBITION_HEADERS = ['White Player', 'Red Player', 'Status', ''] as const;

/** The card's format line: "<team format> • <tournament format>". */
export function teamFormatLine(input: Pick<TeamsInput, 'format' | 'tournamentFormat'>): string {
  return `${input.format} • ${input.tournamentFormat}`;
}

/** The tab bar's buttons, in order: the four tabs (regTab(mode)), then Generate Tournament and
 * Regenerate Single Division (their legacy handlers). */
export interface TabButton {
  id: string;
  testId: string;
  label: string;
  /** The tab's mode for regTab(); none for the two action buttons. */
  mode?: string;
  /** The action buttons' fixed class ('primary' for Generate). */
  className?: string;
}

export const TAB_BUTTONS: readonly TabButton[] = [
  { id: 'indTab', testId: 'reg-tab-individual', label: 'Individual Players', mode: 'individual' },
  { id: 'teamTab', testId: 'reg-tab-team', label: 'Team Registration', mode: 'team' },
  { id: 'exhibitionTab', testId: 'reg-tab-exhibition', label: 'Exhibition', mode: 'exhibition' },
  { id: 'poolsTab', testId: 'reg-tab-pools', label: 'Pools', mode: 'pools' },
  { id: 'generateBtn', testId: 'generate-button', label: 'Generate Tournament', className: 'primary' },
  { id: 'regenerateDivisionBtn', testId: 'regenerate-division-button', label: 'Regenerate Single Division' },
];

/** A button's class: a tab is "tab", plus "active" when it is the current tab (classList.toggle()
 * on "tab" as regTab() did); an action button keeps its own (none for Regenerate). */
export function tabButtonClass(button: TabButton, mode: string): string | undefined {
  if (!button.mode) return button.className;
  return button.mode === mode ? 'tab active' : 'tab';
}
