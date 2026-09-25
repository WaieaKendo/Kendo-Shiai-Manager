// The court screen's queue panel (#queue, data-testid court-queue): the court's upcoming
// matches in groups (pool, round), or a message.
//
// The legacy app still decides what is queued: the live renderQueue() (the split-court
// wrapper in app/js/32- around the last declaration in 24-) is mirrored by ksmQueuePanelInput()
// in app/js/35-react-court.js, which publishes a CourtQueueInput (ksm:court-queue) instead of
// writing #queue. courtQueueView() adds what the legacy HTML helpers derived: row classes,
// group titles (normalizeQueueGroupLabel()) and empty groups left out (groupedQueueSection()).
import { alignedRowView, type AlignedRowInput, type AlignedRowView } from './rows-model.ts';

export interface QueueSideInput {
  name: string;
  /** The dojo or team line under the name; null: no line (placeholders, team rows). */
  detail: string | null;
}

/**
 * A .queue-row: renderGroupedQueueRow() (placeholder false, team false), a championship
 * placeholder (poolChampionshipQueueGroups(): placeholder true) or a team row
 * (teamQueueGroups(): team true, placeholder for a pairing that has no bouts yet).
 */
export interface QueueRowInput {
  kind: 'queue';
  team: boolean;
  placeholder: boolean;
  /** m.tiebreak: the gold row (never on a placeholder). */
  tiebreak: boolean;
  white: QueueSideInput;
  red: QueueSideInput;
  /** 'vs', 'awaiting' or 'BYE'. */
  center: string;
  /** The small line under the center: position, pool or round. */
  round: string;
}

/** A split single-elimination queue shows bracket placeholders as compact aligned rows. */
export type QueueRow = QueueRowInput | AlignedRowInput;

export interface QueueGroupInput {
  /** The group's label before normalizeQueueGroupLabel() (the title applies it). */
  label: string;
  rows: QueueRow[];
}

export interface FinalResultsInput {
  /** 'Final Results' (individual) or 'Team Results'. */
  title: string;
  lines: Array<{ place: string; name: string }>;
}

export type CourtQueueInput =
  /** Nothing (no division, a completed division, a single-elimination match on one court). */
  | { kind: 'empty' }
  /** A .muted-card message: 'No active division.', 'Queue complete.', 'Division complete.' */
  | { kind: 'message'; text: string }
  /** finalResultsHtml(): the medal lines; null: a team division without placements ('Completed'). */
  | { kind: 'results'; results: FinalResultsInput | null }
  | { kind: 'groups'; groups: QueueGroupInput[] };

export interface QueueRowView {
  kind: 'queue';
  className: string;
  white: QueueSideInput;
  red: QueueSideInput;
  center: string;
  round: string;
}

export type QueueRowItemView = QueueRowView | ({ kind: 'aligned' } & AlignedRowView);

export interface QueueGroupView {
  title: string;
  rows: QueueRowItemView[];
}

export type CourtQueueView =
  | { kind: 'empty' }
  | { kind: 'message'; text: string }
  | { kind: 'results'; results: FinalResultsInput | null }
  | { kind: 'groups'; groups: QueueGroupView[] };

/** The static markup (app/index.html): an empty #queue. */
export const EMPTY_QUEUE: CourtQueueInput = { kind: 'empty' };

/** The legacy normalizeQueueGroupLabel() (24-court-queue-and-context.js). */
export function normalizeQueueGroupLabel(label: string): string {
  const raw = String(label || 'Upcoming').trim();
  const low = raw.toLowerCase();
  if (low.includes('quarter')) return 'Quarterfinals';
  if (low.includes('semi')) return 'Semifinals';
  if (low === 'final' || low.includes('final match')) return 'Final';
  if (low.includes('round of 32')) return 'Round of 32';
  if (low.includes('round of 16')) return 'Round of 16';
  if (low.includes('first round')) return 'First Round';
  return raw;
}

/** The row's class attribute, as each legacy row template wrote it. */
export function queueRowClass(row: Pick<QueueRowInput, 'team' | 'placeholder' | 'tiebreak'>): string {
  const base = row.team ? 'queue-row team-queue-row' : 'queue-row';
  return row.placeholder ? `${base} queue-placeholder` : `${base} ${row.tiebreak ? 'gold' : ''}`;
}

function rowView(row: QueueRow): QueueRowItemView {
  if (row.kind === 'aligned') return { kind: 'aligned', ...alignedRowView(row) };
  return { kind: 'queue', className: queueRowClass(row), white: row.white, red: row.red, center: row.center, round: row.round };
}

export function courtQueueView(input: CourtQueueInput): CourtQueueView {
  if (input.kind !== 'groups') return input;
  return {
    kind: 'groups',
    groups: input.groups.filter(g => g.rows.length).map(g => ({ title: normalizeQueueGroupLabel(g.label), rows: g.rows.map(rowView) })),
  };
}
