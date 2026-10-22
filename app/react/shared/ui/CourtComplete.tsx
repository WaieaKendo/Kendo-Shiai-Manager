// The court screen's division-complete presentation: the .division-complete class on the
// scoreboard card and the .division-complete-panel as the card's last child, the same
// elements, classes and test IDs as the legacy divisionCompletePanelHtml(), so the court CSS (which hides
// the match display, score buttons, Fusen-gachi and Next Match; Undo/Redo stay, F2) and the
// tests apply unchanged. The card
// itself is legacy markup that holds the other islands, so the panel is a portal into it and
// the class is set on it after each render. The legacy setCourtCompletePresentation()
// publishes whether the division is complete and its placements (ksm:court-complete).
import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  CONTINUE_TEXTS, DIVISION_COMPLETE_CLASS, NOT_COMPLETE, NO_PLACEMENTS_TEXT, continueBoxView, courtCompleteView, keptKey,
  type ContinueBoxView, type CourtCompleteInput, type CourtCompleteView,
} from './complete-model.ts';

export const COMPLETE_EVENT = 'ksm:court-complete';

interface CourtWindow {
  /** The division-complete state as setCourtCompletePresentation() last published it. */
  ksmCourtCompleteInput?: CourtCompleteInput;
  /** The court dropdown's action (08-): the court, its TV and Live Scores move to the division. */
  selectScorekeeperDivision?: (division: string) => void;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(COMPLETE_EVENT, onChange);
  return () => window.removeEventListener(COMPLETE_EVENT, onChange);
}

const snapshot = (): CourtCompleteInput => (window as unknown as CourtWindow).ksmCourtCompleteInput ?? NOT_COMPLETE;

/** divisionCompletePanelHtml() (legacy): also the division-complete view of Live Scores and the TV's Final Results. */
export function DivisionCompletePanel({ view, children }: { view: CourtCompleteView; children?: ReactNode }) {
  return (
    <div className="division-complete-panel" data-testid="division-complete">
      {children}
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

/** Owner decision 7 / #31: the court screen's "<Division> is complete" box with Continue. */
function ContinueBox({ box, onKeep }: { box: ContinueBoxView; onKeep: () => void }) {
  const go = (next: string) => (window as unknown as CourtWindow).selectScorekeeperDivision?.(next);
  return (
    <div className="muted-card court-continue-box" role="status" data-testid="court-continue-box">
      <div className="court-continue-message" data-testid="court-continue-message">{box.message}</div>
      {box.kind === 'done' && <div className="court-continue-done" data-testid="court-all-done">{box.doneText}</div>}
      {box.kind !== 'done' && (
        <div className="row court-continue-actions">
          {box.kind === 'offer' && <>
            <button className="primary" onClick={() => go(box.next)} data-testid="court-continue">{box.continueLabel}</button>
            <button onClick={onKeep} data-testid="court-keep-results">{CONTINUE_TEXTS.keep}</button>
          </>}
          {box.kind === 'kept' && <button className="primary" onClick={() => go(box.next)} data-testid="court-close-results">{CONTINUE_TEXTS.close}</button>}
        </div>
      )}
    </div>
  );
}

export function CourtComplete({ card }: { card: Element }) {
  const input = useSyncExternalStore(subscribe, snapshot, snapshot);
  const view = courtCompleteView(input);
  // Keep showing results is this court screen's choice for this division (not shared): a new
  // division (or court) shows the offer again.
  const [kept, setKept] = useState<string | null>(null);
  const box = continueBoxView(input, kept === keptKey(input));
  useLayoutEffect(() => {
    card.classList.toggle(DIVISION_COMPLETE_CLASS, view.complete);
  }, [card, view.complete]);
  return view.complete
    ? createPortal(<DivisionCompletePanel view={view}>{box && <ContinueBox box={box} onKeep={() => setKept(keptKey(input))} />}</DivisionCompletePanel>, card)
    : null;
}
