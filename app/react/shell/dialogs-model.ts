// The app's pop-up dialogs, as the legacy code drew them and now publishes them
// (ksm:shell-dialogs): Fusen-gachi (#fusenDialog on the court screen), the generation check
// (#validationModal), Regenerate Single Division (#regenerateModal) and the cloud modal
// (#ksmCloudModal at the end of <body>: Tournament Access, Developer Tools, the Load Tournament
// File confirmation of roadmap 0.5). Dialogs.tsx draws them with the legacy markup's elements,
// classes, ids and test IDs; tests/golden/shell pins them.
//
// Texts are as the legacy markup showed them (esc() and the HTML parser), worked out by the
// legacy code. Each dialog that the legacy code drew afresh (innerHTML, a new cloud modal) has a
// `key`: a new key draws new elements, as the legacy redraw did.

// ------------------------------------------------------------------------------ Fusen-gachi

export interface FusenInput {
  /** Shown (openFusenDialog()) or hidden (closeFusenDialog()). */
  open: boolean;
  /** #38: the bout's fighters (openFusenDialog()); absent: "White" / "Red" only. */
  white?: string;
  red?: string;
  /** #38: the court is set to Red on the left (redOnLeftForCourt()): the buttons follow. */
  redLeft?: boolean;
}

/**
 * Owner decision 4 (#29): shown as "Fusen-sho" (display only; stored values keep Fusen-gachi).
 * #38: the dialog asks who WON. The stored result is unchanged: choosing the winner records the
 * other side's forfeit exactly as before ("<forfeiting side> Fusen-gachi", the winner gets F F).
 */
export const FUSEN_TEXTS = {
  title: 'Fusen-sho — who won?',
  question: 'The winner is recorded with F F.',
  white: 'White',
  red: 'Red',
  cancel: 'Cancel',
} as const;

export interface FusenSideView {
  /** The winning side this button records: confirmFusen(side). */
  side: 'W' | 'R';
  testId: 'fusen-white' | 'fusen-red';
  className: string;
  /** "White" / "Red". */
  label: string;
  /** The bout's fighter on that side. */
  name: string;
}

/** #38: the two side buttons in the court's left-to-right order (Red first when Red is on the left). */
export function fusenSides(input: FusenInput): FusenSideView[] {
  const white: FusenSideView = { side: 'W', testId: 'fusen-white', className: 'fusen-side fusen-side-white', label: FUSEN_TEXTS.white, name: input.white || '' };
  const red: FusenSideView = { side: 'R', testId: 'fusen-red', className: 'fusen-side fusen-side-red', label: FUSEN_TEXTS.red, name: input.red || '' };
  return input.redLeft ? [red, white] : [white, red];
}

// ------------------------------------------------------------------------------ generation check

export interface ValidationIssueView {
  /** Printed into the class: `validation-issue <severity>`. */
  severity: string;
  /** The division, or "Tournament". */
  division: string;
  message: string;
  /** The suggested action; empty: no line. */
  action: string;
}

export type ValidationContent = { valid: true } | { valid: false; issues: ValidationIssueView[] };

export interface ValidationInput {
  open: boolean;
  /** Changes with every showValidationDialog() (the body and buttons were drawn afresh). */
  key: number;
  title: string;
  /** null: nothing drawn yet (the empty body and button row of the markup). */
  content: ValidationContent | null;
}

export const VALIDATION_TEXTS = {
  passed: 'Tournament Validation Passed',
  failed: 'Tournament Validation',
  noIssues: '✓ No blocking issues found.',
  question: 'Generate Tournament?',
  cancel: 'Cancel',
  generate: 'Generate',
  close: 'Close',
} as const;

// ------------------------------------------------------------------------------ Regenerate

export type RegenerateStatus = 'ready' | 'started' | 'not-generated';

export interface RegenerateOption {
  /** The division as the option shows it (also its radio's value). */
  name: string;
  status: RegenerateStatus;
  /** The first ready division is chosen. */
  checked: boolean;
}

export type RegenerateContent =
  | { view: 'list'; options: RegenerateOption[] }
  | { view: 'confirm'; division: string }
  | { view: 'done'; division: string };

export interface RegenerateInput {
  open: boolean;
  /** Changes whenever the body and buttons were drawn afresh. */
  key: number;
  title: string;
  /** For 'confirm': the division as continueRegenerateDivision() read it (Regenerate passes it on). */
  content: RegenerateContent | null;
}

export const REGENERATE_TEXTS = {
  title: 'Regenerate Division',
  close: '×',
  closeLabel: 'Close',
  intro: 'Select one generated division. Other divisions will remain unchanged.',
  cancel: 'Cancel',
  continue: 'Continue',
  rebuild: 'This will rebuild this division’s pools or bracket, Match Objects, court queues, Court Context, Results state, and Director progress.',
  others: 'All other divisions will remain unchanged.',
  regenerate: 'Regenerate',
  done: ' successfully regenerated.',
  doneDetail: 'Pools/bracket, Match Objects, queues, Court Context, Results, and Director progress were updated. Other divisions were not changed.',
  ok: 'OK',
} as const;

/** An option's status label. */
export function regenerateStatusText(status: RegenerateStatus): string {
  return status === 'ready' ? 'Ready' : status === 'started' ? 'Matches Started' : 'Not Generated';
}

/** An option's class (`regenerate-option ${ready?'':'disabled'}`: a ready one keeps the space). */
export function regenerateOptionClass(status: RegenerateStatus): string {
  return `regenerate-option ${status === 'ready' ? '' : 'disabled'}`;
}

// ------------------------------------------------------------------------------ cloud modal

/** One detail box: a label and its value (a test ID on the value where the markup had one). */
export interface CloudDetail {
  label: string;
  value: string;
  testId?: string;
}

/** A box of the snapshot analysis: a label, a size, an optional summary line. */
export interface CloudSizeBox {
  label: string;
  value: string;
  summary?: string;
}

export interface SnapshotAnalysisView {
  total: string;
  analyzed: string;
  breakdown: CloudSizeBox[];
  largest: CloudSizeBox[];
}

/** An entry box of the action history (historyEntryCard()): none, or its heading, line and changes. */
export type HistoryEntryView = { title: string; entry: null } | { title: string; entry: { heading: string; line: string; changes: string } };

export interface HistoryCourtView {
  court: string;
  /** The entry count, printed as it is (not through esc()). */
  entries: string;
  total: string;
  average: string;
  largest: string;
  cards: HistoryEntryView[];
}

export type CloudBody =
  /** link: as shown; copy: what Copy Link copies (the link itself); qr: the QR code image's address. */
  | { kind: 'access'; link: string; copy: string; qr: string }
  | {
    kind: 'diagnostics';
    details: CloudDetail[];
    /** null: none recorded yet (the message instead). */
    analysis: SnapshotAnalysisView | null;
    history: HistoryCourtView[];
    /** Work is queued and the device may save: "Retry queued save". */
    retry: boolean;
    /** Owner decision 20: this device's test tools (the sample-data buttons) are on. */
    testTools?: boolean;
  }
  | { kind: 'file'; same: boolean; details: CloudDetail[]; message: string };

export interface CloudInput {
  /** A new key for every openCloudModal() (a new modal at the end of <body>). */
  key: number;
  title: string;
  body: CloudBody;
}

export const CLOUD_TEXTS = {
  eyebrow: 'KSM Cloud',
  close: 'Close',
  copyLink: 'Copy Link',
  copied: 'Tournament link copied',
  qrAlt: 'Tournament access QR code',
  scan: 'Scan to open the tournament in Spectator mode.',
  snapshotHeading: 'Snapshot Analysis',
  historyHeading: 'Action History Analysis',
  readOnly: 'Read-only diagnostics. Scoring, undo, redo, saving, and synchronization are unchanged.',
  noAnalysis: 'No snapshot analysis has been recorded yet. Make a change or press Save Now.',
  total: 'Total snapshot',
  analyzed: 'Analyzed',
  breakdown: 'State breakdown',
  largestPaths: 'Largest nested paths',
  entries: 'Entries',
  totalHistory: 'Total history',
  averageEntry: 'Average entry',
  largestEntry: 'Largest entry',
  noEntry: 'No entry',
  downloadAnalysis: 'Download snapshot analysis',
  downloadHistory: 'Download action history sample',
  retry: 'Retry queued save',
  cancel: 'Cancel',
  replace: 'Replace open tournament',
  loadNew: 'Load as new tournament',
} as const;

// ------------------------------------------------------------------------------ all

export interface DialogsInput {
  fusen: FusenInput;
  validation: ValidationInput;
  regenerate: RegenerateInput;
  /** The cloud modal, or null when there is none. */
  cloud: CloudInput | null;
}

/** Nothing published yet: the static markup (every dialog hidden, empty bodies, no cloud modal). */
export const EMPTY_DIALOGS: DialogsInput = {
  fusen: { open: false },
  validation: { open: false, key: 0, title: VALIDATION_TEXTS.failed, content: null },
  regenerate: { open: false, key: 0, title: REGENERATE_TEXTS.title, content: null },
  cloud: null,
};

/** Owner decision 20 (#29): Developer Tools' switch for this device's test tools. */
export function testToolsLabel(on: boolean | undefined): string {
  return on ? 'Hide test tools' : 'Show test tools';
}
