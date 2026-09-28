// The court screen's division-complete presentation: the .division-complete class on the
// scoreboard card and the .division-complete-panel as the card's last child, the same
// elements, classes and test IDs as divisionCompletePanelHtml(), so the court CSS (which hides
// the match display, score buttons, Fusen-gachi and Next Match; Undo/Redo stay, F2) and the
// tests apply unchanged. The card
// itself is legacy markup that holds the other islands, so the panel is a portal into it and
// the class is set on it after each render. The legacy setCourtCompletePresentation()
// publishes whether the division is complete and its placements (ksm:court-complete).
import { useLayoutEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  DIVISION_COMPLETE_CLASS, NOT_COMPLETE, NO_PLACEMENTS_TEXT, courtCompleteView,
  type CourtCompleteInput, type CourtCompleteView,
} from './complete-model.ts';

export const COMPLETE_EVENT = 'ksm:court-complete';

interface CourtWindow {
  /** The division-complete state as setCourtCompletePresentation() last published it. */
  ksmCourtCompleteInput?: CourtCompleteInput;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(COMPLETE_EVENT, onChange);
  return () => window.removeEventListener(COMPLETE_EVENT, onChange);
}

const snapshot = (): CourtCompleteInput => (window as unknown as CourtWindow).ksmCourtCompleteInput ?? NOT_COMPLETE;

/** divisionCompletePanelHtml(): also the division-complete view of Live Scores. */
export function DivisionCompletePanel({ view }: { view: CourtCompleteView }) {
  return (
    <div className="division-complete-panel" data-testid="division-complete">
      {view.rows === null
        ? <div className="small">{NO_PLACEMENTS_TEXT}</div>
        : (
          <div className="division-complete-list">
            {view.rows.map((row, i) => (
              <div key={i} className="division-complete-row" data-testid="division-complete-row">
                <b className={row.placeClass}>{row.place}</b><span>{row.name}</span>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

export function CourtComplete({ card }: { card: Element }) {
  const view = courtCompleteView(useSyncExternalStore(subscribe, snapshot, snapshot));
  useLayoutEffect(() => {
    card.classList.toggle(DIVISION_COMPLETE_CLASS, view.complete);
  }, [card, view.complete]);
  return view.complete ? createPortal(<DivisionCompletePanel view={view} />, card) : null;
}
