// The court screen's score buttons (#score .score-controls-grid) and action row
// (#score .bottom-action-row: Undo, Redo, Fusen-sho (stored as Fusen-gachi), Next Match).
//
// The buttons call the legacy actions (point(), hansoku(), undo(), redo(), openFusenDialog(),
// nextMatch()); the legacy app keeps the court action history. Its updateUndoButton()
// (app/js/10-court-scoring-and-history.js) publishes a CourtActionsInput (whether Undo / Redo
// may be pressed and their labels) instead of writing #undoBtn / #redoBtn; courtActionsView()
// turns it into what CourtActions renders. Nothing else writes these elements: a spectator's
// court screen and a completed division hide them through CSS alone (body.ksm-spectator,
// .scoreboard-card.division-complete), which the React markup keeps.

export type Side = 'W' | 'R';

export interface ScoreButton {
  testId: string;
  side: Side;
  /** point(side, letter), or hansoku(side). */
  kind: 'point' | 'hansoku';
  /** The big letter: M, K, D, T or H. */
  letter: string;
  name: string;
}

const TECHNIQUES: ReadonlyArray<readonly [string, string]> = [['M', 'Men'], ['K', 'Kote'], ['D', 'Do'], ['T', 'Tsuki']];

/** One side's panel, in the legacy order: Men, Kote, Do, Tsuki, Hansoku. */
export function scoreButtons(side: Side): ScoreButton[] {
  const color = side === 'W' ? 'white' : 'red';
  return [
    ...TECHNIQUES.map(([letter, name]): ScoreButton => ({ testId: `point-${color}-${letter}`, side, kind: 'point', letter, name })),
    { testId: `hansoku-${color}`, side, kind: 'hansoku', letter: 'H', name: 'Hansoku' },
  ];
}

export interface HistoryButtonInput {
  /** Nothing to undo / redo on this court. */
  disabled: boolean;
  label: string;
}

export interface CourtActionsInput {
  undo: HistoryButtonInput;
  redo: HistoryButtonInput;
}

/** The static markup (app/index.html), before updateUndoButton() ran: Redo disabled. */
export const STATIC_ACTIONS: CourtActionsInput = {
  undo: { disabled: false, label: 'Undo' },
  redo: { disabled: true, label: 'Redo' },
};

export type CourtActionsView = CourtActionsInput;

/**
 * Owner decision 4 (#29): the button shows "Fusen-sho" (display text only; the action, its stored
 * history label "White/Red Fusen-gachi", the F F points and the test ID fusen-gachi are unchanged).
 */
export const FUSEN_LABEL = 'Fusen-sho';

export interface FusenButtonView {
  /** No match on the court (the scoreboard shows none): nothing to award (openFusenDialog() did nothing). */
  disabled: boolean;
  label: string;
}

/** The Fusen-sho button: disabled while the court screen has no match (owner decision 4). */
export function fusenButtonView(hasMatch: boolean): FusenButtonView {
  return { disabled: !hasMatch, label: FUSEN_LABEL };
}

export function courtActionsView(input: CourtActionsInput): CourtActionsView {
  const button = (b: HistoryButtonInput): HistoryButtonInput => ({ disabled: Boolean(b.disabled), label: b.label });
  return { undo: button(input.undo), redo: button(input.redo) };
}
