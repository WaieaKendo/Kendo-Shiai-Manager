// The court screen's queue panel (the contents of #queue), the same elements, classes and
// test IDs as the legacy renderQueue() drew (removed in M.8 step 5; tests/golden/court pins
// it), so the court CSS (including the Red/White side setting on .queue-row and
// .aligned-match-row) and the tests apply unchanged. renderQueue() (app/js/32-) publishes what
// to show (ksm:court-queue).
import { useSyncExternalStore } from 'react';
import { AlignedRow } from './MatchRows.tsx';
import {
  EMPTY_QUEUE, NOW_LABEL, UP_NEXT_LABEL, courtQueueView,
  type CourtQueueInput, type CourtQueueView, type CourtRunningOrderView, type FinalResultsInput, type QueueRowItemView, type QueueSideInput,
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

/** The queue's rounds (or its message / results) for the division being played. */
function QueueBody({ view }: { view: CourtQueueView }) {
  switch (view.kind) {
    case 'empty': return null;
    case 'message': return <div className="muted-card">{view.text}</div>;
    case 'results': return <FinalResults results={view.results} />;
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

/** The court's remaining divisions, one collapsed line each: display only (not buttons). */
function LaterDivisions({ order }: { order: CourtRunningOrderView }) {
  if (!order.later.length) return null;
  return (
    <div className="queue-later" data-testid="queue-later">
      {order.later.map((d, i) => (
        <div key={i} className="queue-division-line">
          <span className="queue-division-name">{d.name}</span>
          {d.upNext && <span className="queue-division-badge">{UP_NEXT_LABEL}</span>}
          <span className="queue-division-meta">{d.meta}</span>
        </div>
      ))}
    </div>
  );
}

/** The contents of #queue: the division being played (header + its rounds), then the court's
 *  later divisions in running order. */
export function CourtQueue() {
  const view = courtQueueView(useSyncExternalStore(subscribe, snapshot, () => EMPTY_QUEUE));
  const order = view.order;
  if (!order) return <QueueBody view={view} />;
  return (
    <>
      {order.current
        ? (
          <section className="queue-division-now" data-testid="queue-division-now">
            <div className="queue-division-head">
              <span className="queue-division-name">{order.current}</span>
              <span className="queue-division-badge now">{NOW_LABEL}</span>
            </div>
            <QueueBody view={view} />
          </section>
        )
        : <QueueBody view={view} />}
      <LaterDivisions order={order} />
    </>
  );
}
