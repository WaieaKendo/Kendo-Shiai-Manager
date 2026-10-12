// Match rows shared by the court screen's queue and context panels, as the legacy HTML
// helpers draw them: the aligned result row (alignedMatchRowHtml() and the live
// alignedPointSlots() in app/js/28-/29-), the bracket placeholder (placeholderMatchHtml(), 14)
// and a bracket round card (.bracket-card).
//
// The legacy court screen (app/js/35-react-court.js) publishes the row's values; these
// functions add what the legacy helpers derived from them: fallbacks, classes and point slots.
// Class strings are kept character for character (with the legacy empty-class spaces), so the
// court CSS and the tests see the same attribute.

/** alignedMatchRowHtml(match, options) after its option defaults are resolved. */
export interface AlignedRowInput {
  kind: 'aligned';
  /** options.white ?? the match's side label ('' when none: shown as TBD). */
  white: string;
  red: string;
  /** Up to two point letters per side (more are cut, as the legacy slots). */
  wp: string[];
  rp: string[];
  /** 'DONE', 'vs', 'NOW', 'awaiting', 'BYE', 'TIEBREAK', 'Winner: …', '2/3', … */
  status: string;
  /** The match on the court: highlighted, with the current-bout name test IDs. */
  current: boolean;
  compact: boolean;
}

/** placeholderMatchHtml(red, white, status): a bracket match whose sides are not known yet. */
export interface BracketMatchInput {
  kind: 'bracket-match';
  white: string;
  red: string;
  status: string;
}

export type BracketRowInput = AlignedRowInput | BracketMatchInput;

/** A .bracket-card: the round title and its rows. */
export interface BracketCardInput {
  round: string;
  rows: BracketRowInput[];
}

export interface PointSlotView {
  className: string;
  /** The letter, or '·' for an empty slot. */
  text: string;
}

export interface AlignedRowView {
  className: string;
  white: string;
  red: string;
  whitePoints: PointSlotView[];
  redPoints: PointSlotView[];
  statusClass: string;
  status: string;
  current: boolean;
}

export function alignedRow(values: Partial<Omit<AlignedRowInput, 'kind'>>): AlignedRowInput {
  return { kind: 'aligned', white: '', red: '', wp: [], rp: [], status: 'vs', current: false, compact: false, ...values };
}

/** The live alignedPointSlots() (29-court-context-pools.js): two slots, red only when filled. */
export function pointSlots(points: readonly string[], side: 'W' | 'R'): PointSlotView[] {
  const values = [...points].slice(0, 2);
  while (values.length < 2) values.push('');
  return values.map(value => {
    const hasValue = !!value;
    const sideClass = hasValue && side === 'R' ? 'red' : '';
    return { className: `match-point ${sideClass} ${hasValue ? '' : 'empty'}`, text: hasValue ? String(value) : '·' };
  });
}

export function alignedRowView(row: AlignedRowInput): AlignedRowView {
  const status = String(row.status);
  const low = status.toLowerCase();
  return {
    className: `aligned-match-row ${row.current ? 'current' : ''} ${row.compact ? 'compact' : ''} `,
    white: row.white || 'TBD',
    red: row.red || 'TBD',
    whitePoints: pointSlots(row.wp, 'W'),
    redPoints: pointSlots(row.rp, 'R'),
    statusClass: `match-status ${low.includes('done') ? 'done' : low.includes('await') ? 'awaiting' : ''}`,
    status: status || 'vs',
    current: row.current,
  };
}
