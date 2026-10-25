// The court screen's queue panel (the contents of #queue), the same elements, classes and
// test IDs as the legacy renderQueue() drew (removed in M.8 step 5; tests/golden/court pins
// it), so the court CSS (including the Red/White side setting on .queue-row and
// .aligned-match-row) and the tests apply unchanged. renderQueue() (app/js/32-) publishes what
// to show (ksm:court-queue).
import { useSyncExternalStore } from 'react';
import { AlignedRow } from '../../shared/ui/MatchRows.tsx';
import {
  EMPTY_QUEUE, courtQueueView,
  type CourtQueueInput, type FinalResultsInput, type QueueRowItemView, type QueueSideInput,
} from './queue-model.ts';

export const QUEUE_EVENT = 'ksm:court-queue';

interface CourtWindow {
  /** The queue as renderQueue() last published it. */
  ksmCourtQueueInput?: CourtQueueInput;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(QUEUE_EVENT, onChange);
  return () => window.removeEventListener(QUEUE_EVENT, onChange);
}

const snapshot = (): CourtQueueInput => (window as unknown as CourtWindow).ksmCourtQueueInput ?? EMPTY_QUEUE;

function Side({ side, className }: { side: QueueSideInput; className: string }) {
  return (
    <div className={className}>
      <b>{side.name}</b>
      {side.detail !== null && <div className="small">{side.detail}</div>}
    </div>
  );
}

function Row({ row }: { row: QueueRowItemView }) {
  if (row.kind === 'aligned') return <AlignedRow row={row} />;
  return (
    <div className={row.className}>
      <Side side={row.white} className="white" />
      <div className="vs">{row.center}<div className="small">{row.round}</div></div>
      <Side side={row.red} className="red" />
    </div>
  );
}

/** As the legacy finalResultsHtml() (11-, removed) and teamFinalResultsHtml() (09-, removed in M.13). */
export function FinalResults({ results }: { results: FinalResultsInput | null }) {
  if (!results) return <div className="muted-card"><b>Completed</b></div>;
  return (
    <div className="muted-card">
      <h2>{results.title}</h2>
      {results.lines.map((l, i) => <div key={i} className="competitor-line"><b>{l.place}</b><span>{l.name}</span></div>)}
    </div>
  );
}

/** The contents of #queue. */
export function CourtQueue() {
  const view = courtQueueView(useSyncExternalStore(subscribe, snapshot, () => EMPTY_QUEUE));
  switch (view.kind) {
    case 'empty': return null;
    case 'message': return <div className="muted-card">{view.text}</div>;
    case 'results': return <FinalResults results={view.results} />;
    case 'up-next':
      return (
        <>
          {view.results !== undefined && <FinalResults results={view.results} />}
          <section className="queue-group queue-up-next" data-testid="queue-up-next" aria-disabled="true">
            <div className="queue-group-title">{view.title}</div>
            <div className="queue-group-body">{view.rows.map((row, i) => (
              <div key={i} aria-disabled="true"><Row row={row} /></div>
            ))}</div>
          </section>
        </>
      );
    case 'groups':
      return (
        <>
          {view.groups.map((g, i) => (
            <section key={i} className="queue-group">
              <div className="queue-group-title">{g.title}</div>
              <div className="queue-group-body">{g.rows.map((r, j) => <Row key={j} row={r} />)}</div>
            </section>
          ))}
        </>
      );
  }
}
