// Match rows of the court screen's queue and context panels, the same elements and classes as
// the legacy helpers: alignedMatchRowHtml() (.aligned-match-row), placeholderMatchHtml()
// (.bracket-match) and the bracket round card (.bracket-card).
import type { AlignedRowView, BracketMatchInput } from './rows-model.ts';
import type { BracketCardView } from './context-model.ts';

export function AlignedRow({ row }: { row: AlignedRowView }) {
  return (
    <div className={row.className}>
      <div className="match-name white" data-testid={row.current ? 'current-bout-white-name' : undefined}>{row.white}</div>
      {row.whitePoints.map((p, i) => <div key={i} className={p.className}>{p.text}</div>)}
      <div className={row.statusClass}>{row.status}</div>
      {row.redPoints.map((p, i) => <div key={i} className={p.className}>{p.text}</div>)}
      <div className="match-name red" data-testid={row.current ? 'current-bout-red-name' : undefined}>{row.red}</div>
    </div>
  );
}

export function BracketMatch({ row }: { row: BracketMatchInput }) {
  return (
    <div className="bracket-match">
      <div className="white"><b>{row.white}</b></div>
      <div className="bracket-status">{row.status}</div>
      <div className="red"><b>{row.red}</b></div>
    </div>
  );
}

export function BracketCard({ card }: { card: BracketCardView }) {
  return (
    <div className="bracket-card">
      <div className="bracket-round">{card.round}</div>
      {card.rows.map((r, i) => (r.kind === 'aligned' ? <AlignedRow key={i} row={r} /> : <BracketMatch key={i} row={r} />))}
    </div>
  );
}
