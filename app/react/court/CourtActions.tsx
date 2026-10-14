// The court screen's score buttons (#score .score-controls-grid) and action row
// (#score .bottom-action-row), the same elements, classes, ids, test IDs and inline SVG as the
// legacy markup, so the court CSS (the Red/White side setting, the spectator and
// division-complete rules) and the tests apply unchanged. Each button calls the same legacy
// global as the legacy inline handler; the legacy updateUndoButton() publishes Undo/Redo.
import { TieFlashButton } from '../tie-flash/TieFlash.tsx';
import { useSyncExternalStore } from 'react';
import { DEFAULT_COURT_ACTION_ICONS, type CourtActionIcons } from './branding.ts';
import {
  STATIC_ACTIONS, courtActionsView, fusenButtonView, scoreButtons,
  type CourtActionsInput, type ScoreButton, type Side,
} from './actions-model.ts';
import { EMPTY_SCOREBOARD, HIKIWAKE_NEXT_LABEL, nextMatchView, type ScoreboardInput } from './scoreboard-model.ts';

export const ACTIONS_EVENT = 'ksm:court-actions';

interface CourtWindow {
  /** Undo/Redo as the legacy updateUndoButton() last published them. */
  ksmCourtActionsInput?: CourtActionsInput;
  /** The court's match as renderScore() last published it (ksm:court-scoreboard): Fusen-sho needs one. */
  ksmCourtScoreboardInput?: ScoreboardInput;
  point?: (side: Side, letter: string) => void;
  hansoku?: (side: Side) => void;
  undo?: () => void;
  redo?: () => void;
  openFusenDialog?: () => void;
  nextMatch?: () => void;
}

const courtWindow = (): CourtWindow => window as unknown as CourtWindow;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(ACTIONS_EVENT, onChange);
  return () => window.removeEventListener(ACTIONS_EVENT, onChange);
}

const snapshot = (): CourtActionsInput => courtWindow().ksmCourtActionsInput ?? STATIC_ACTIONS;

const SCOREBOARD_EVENT = 'ksm:court-scoreboard';
function subscribeMatch(onChange: () => void): () => void {
  window.addEventListener(SCOREBOARD_EVENT, onChange);
  return () => window.removeEventListener(SCOREBOARD_EVENT, onChange);
}
/** Whether the court screen shows a match (before the first publish: none). */
const hasMatch = (): boolean => Boolean(courtWindow().ksmCourtScoreboardInput?.match);
/** The published scoreboard (a new object each publish): Next Match follows the live score (#38). */
const scoreboard = (): ScoreboardInput => courtWindow().ksmCourtScoreboardInput ?? EMPTY_SCOREBOARD;

function press(b: ScoreButton) {
  const w = courtWindow();
  if (b.kind === 'point') w.point?.(b.side, b.letter);
  else w.hansoku?.(b.side);
}

function Panel({ side }: { side: Side }) {
  return (
    <div className={`control-panel ${side === 'W' ? 'white' : 'red'}-control-panel`}>
      <div className="score-buttons sk-score-buttons">
        {scoreButtons(side).map(b => (
          <button key={b.testId} onClick={() => press(b)} data-testid={b.testId}>
            <span className="point-letter">{b.letter}</span><span className="point-name">{b.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The contents of #score .score-controls-grid: the white and red panels. */
export function CourtScoreButtons() {
  return (
    <>
      <Panel side="W" />
      <Panel side="R" />
    </>
  );
}

function UndoIcon({ icon, mirrored }: { icon: CourtActionIcons['undo']; mirrored: boolean }) {
  return (
    <svg className="action-svg undo-svg" viewBox={icon.viewBox} aria-hidden="true" style={mirrored ? { transform: 'scaleX(-1)' } : undefined}>
      {icon.paths.map(p => (
        <path key={p.d} d={p.d} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin={p.round ? 'round' : undefined} />
      ))}
    </svg>
  );
}

/** The contents of #score .bottom-action-row. icons: the tournament's (default: KSM's). */
export function CourtActions({ icons = DEFAULT_COURT_ACTION_ICONS }: { icons?: CourtActionIcons }) {
  const view = courtActionsView(useSyncExternalStore(subscribe, snapshot, () => STATIC_ACTIONS));
  const fusen = fusenButtonView(useSyncExternalStore(subscribeMatch, hasMatch, () => false));
  const scoreInput = useSyncExternalStore(subscribeMatch, scoreboard, () => EMPTY_SCOREBOARD);
  const next = nextMatchView(scoreInput);
  const w = courtWindow;
  return (
    <>
      <button id="undoBtn" className="action-btn undo-action" onClick={() => w().undo?.()} disabled={view.undo.disabled} data-testid="undo">
        <UndoIcon icon={icons.undo} mirrored={false} />
        <span className="action-label">{view.undo.label}</span>
      </button>
      <button id="redoBtn" className="action-btn redo-action" onClick={() => w().redo?.()} disabled={view.redo.disabled} data-testid="redo">
        <UndoIcon icon={icons.undo} mirrored={true} />
        <span className="action-label">{view.redo.label}</span>
      </button>
      <button className="action-btn fusen-action" onClick={() => w().openFusenDialog?.()} disabled={fusen.disabled} data-testid="fusen-gachi">
        <span className="action-symbol flag-symbol" aria-hidden="true">{icons.fusen}</span>
        <span>{fusen.label}</span>
      </button>
      <button className="primary next-match-btn action-btn" onClick={() => w().nextMatch?.()} disabled={next.disabled} data-testid="next-match">
        <span className="action-symbol next-symbol" aria-hidden="true">{icons.next}</span>
        <span>
          {next.label === HIKIWAKE_NEXT_LABEL ? <>Next Match <small className="next-sub">(Hikiwake)</small></> : next.label}
        </span>
      </button>
      <TieFlashButton input={scoreInput} />
    </>
  );
}
