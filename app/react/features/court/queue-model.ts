// The court screen's queue panel (#queue, data-testid court-queue): the court's upcoming
// matches in groups (pool, round), or a message.
//
// The legacy app still decides what is queued: ksmQueuePanelInput() in app/js/35-react-court.js
// makes the decisions of the legacy queue renderer (the split-court renderQueue() wrapper in
// app/js/32- around the last declaration in 24-, removed in M.8 step 5) and renderQueue()
// publishes a CourtQueueInput (ksm:court-queue). courtQueueView() adds what the legacy HTML
// helpers derived: row classes, group titles (normalizeQueueGroupLabel()) and empty groups left
// out (as groupedQueueSection() did).
import { alignedRowView, type AlignedRowInput, type AlignedRowView } from '../../shared/ui/rows-model.ts';

/** Signalled by renderQueue() (32-); publish.ts computes the input and the island redraws. */
export const QUEUE_EVENT = 'ksm:court-queue';

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

export interface QueueUpNext {
  division: string;
  matches: Array<{ white: string; red: string }>;
}

/** The court's running order (ksmCourtRunningOrder(), app/modules/react-bridges/court.js): display only, never tappable. */
export interface CourtRunningOrderInput {
  /** The division being played (what Continue opened): the header over the queue's rounds. */
  current: { name: string } | null;
  /** The court's remaining divisions in running order: one collapsed line each. */
  later: Array<{ name: string; matches: number; alsoOn: string | null }>;
}

export type CourtQueueInput = CourtOwnQueueInput & {
  upNext?: QueueUpNext | null;
  order?: CourtRunningOrderInput;
  /** The matches the waiting court's division is waiting for (ksmQueuePanelInput()): display only, never tappable. */
  waitingFor?: string[];
};

type CourtOwnQueueInput =
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

export type CourtQueueView = (
  // undefined: no results view; null: retain the team's existing Completed card.
  | { kind: 'up-next'; title: string; rows: QueueRowItemView[]; results: FinalResultsInput | null | undefined }
  | { kind: 'empty' }
  | { kind: 'message'; text: string }
  | { kind: 'results'; results: FinalResultsInput | null }
  | { kind: 'groups'; groups: QueueGroupView[] }) & {
  order?: CourtRunningOrderView;
  /** 'Waiting for: Semifinal 1 (Court A), Final': why the court is not playing. */
  waiting?: string;
  /** The next division's bouts after the rounds (when the rounds have rows of their own). */
  next?: { title: string; rows: QueueRowItemView[] };
};

export const NOW_LABEL = 'Now';
export const UP_NEXT_LABEL = 'Up next';

export interface CourtRunningOrderView {
  current: string | null;
  /** upNext on the first line; meta: "3 matches · also on Court B". */
  later: Array<{ name: string; upNext: boolean; meta: string }>;
}

/**
 * `nextShown`: the next division is listed above with its bouts, so it is left out here (once)
 * and no remaining line claims the Up next badge.
 */
export function runningOrderView(order: CourtRunningOrderInput, nextShown?: string): CourtRunningOrderView {
  const later = nextShown ? order.later.filter(d => d.name !== nextShown) : order.later;
  return {
    current: order.current ? order.current.name : null,
    later: later.map((d, i) => ({
      name: d.name,
      upNext: i === 0 && !nextShown,
      meta: [`${d.matches} ${d.matches === 1 ? 'match' : 'matches'}`, ...(d.alsoOn ? [`also on Court ${d.alsoOn}`] : [])].join(' · '),
    })),
  };
}

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

const MAX_WAITING_SHOWN = 6;

/** 'Waiting for: Semifinal 1 (Court A), Semifinal 2 (Court B)'; null when nothing is named. */
export function waitingText(waitingFor: unknown): string | null {
  if (!Array.isArray(waitingFor)) return null;
  const names = waitingFor.filter((w): w is string => typeof w === 'string' && !!w);
  if (!names.length) return null;
  const shown = names.slice(0, MAX_WAITING_SHOWN).join(', ');
  return `Waiting for: ${shown}${names.length > MAX_WAITING_SHOWN ? ` and ${names.length - MAX_WAITING_SHOWN} more` : ''}`;
}

/** The next division's first two bouts as the group shows them. */
function nextRows(upNext: QueueUpNext): QueueRowItemView[] {
  return upNext.matches.slice(0, 2).map(m => rowView({
    kind: 'queue', team: false, placeholder: false, tiebreak: false,
    white: { name: m.white, detail: null }, red: { name: m.red, detail: null },
    center: 'vs', round: '',
  }));
}

export function courtQueueView(input: CourtQueueInput): CourtQueueView {
  const { order, waitingFor, ...rest } = input;
  const waiting = waitingText(waitingFor);
  const hasOwnRows = rest.kind === 'groups' && rest.groups.some(g => g.rows.length);
  const upNext = rest.upNext?.matches.length ? rest.upNext : null;
  // The next division is shown with its bouts when the court has no rounds of its own to show,
  // or when it is waiting (its own rounds are then bracket places that cannot be played yet).
  const nextShown = upNext && (!hasOwnRows || !!waiting) ? upNext : null;
  // Display only: malformed data drops the running order, never the queue.
  const ok = !!order && Array.isArray(order.later) && (!!order.current || order.later.length > 0);
  const extra = { ...(ok ? { order: runningOrderView(order, nextShown?.division) } : {}), ...(waiting ? { waiting } : {}) };
  const title = nextShown ? `Up next: ${nextShown.division} — not started` : '';
  if (nextShown && !hasOwnRows) {
    return {
      ...extra,
      kind: 'up-next', title,
      results: rest.kind === 'results' ? rest.results : undefined,
      rows: nextRows(nextShown),
    };
  }
  const { upNext: _upNext, ...base } = rest;
  if (base.kind !== 'groups') return { ...base, ...extra };
  return {
    ...extra,
    ...(nextShown ? { next: { title, rows: nextRows(nextShown) } } : {}),
    kind: 'groups',
    groups: base.groups.filter(g => g.rows.length).map(g => ({ title: normalizeQueueGroupLabel(g.label), rows: g.rows.map(rowView) })),
  };
}
