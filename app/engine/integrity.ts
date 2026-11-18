// Result integrity and match identity, moved from app/js/12-engine-result-integrity.js,
// 14-engine-championship.js, 18-sync-state-and-rebase.js and 21-cloud-realtime-save-and-load.js
// (step 2.7): completed-result snapshots, the load-time repair of completed results
// (restore a valid snapshot, re-open a winner-required match with no winner, snapshot the
// rest), duplicate individual match removal and the match identities sync uses. Pure: the
// repair comes back as a plan for the legacy wrapper to apply (and log) on `state`.
import { completedResultSnapshotValid, matchRequiresWinner, scoreWinnerOf } from './standings.ts';
import type { StandingsMatch } from './standings.ts';

/** The result saved on a match when it is completed (the points, the winner and when). */
export interface CompletedResult { winner: string; wp: unknown[]; rp: unknown[]; wt: number; rt: number; recordedAt: string }

/** Anything that may be a Match Object; the identity helpers read these fields. */
export interface IdentityMatch {
  division?: unknown; type?: unknown; pool?: unknown; position?: unknown; white?: unknown; red?: unknown;
  teamWhite?: unknown; teamRed?: unknown; bracketSlot?: unknown; champNodeId?: unknown; elimNodeId?: unknown;
  teamNodeId?: unknown; teamPair?: unknown; tiebreak?: unknown; tiebreakId?: unknown; tiebreakSeries?: unknown;
  tiebreakIndex?: unknown; championship?: unknown; singleElim?: unknown; poolOrder?: unknown;
  whitePoolSlot?: unknown; redPoolSlot?: unknown; done?: unknown;
}

type ScoredMatch = StandingsMatch & { wt?: unknown; rt?: unknown };
const s = (v: unknown): string => (v || '') as string;

/** Snapshot of a match's current points and winner, stamped `recordedAt`. */
export function completedResultSnapshot(m: ScoredMatch | null | undefined, recordedAt: string): CompletedResult {
  const winner = scoreWinnerOf(m);
  return { winner, wp: [...(m?.wp || [])], rp: [...(m?.rp || [])], wt: Number(m?.wt || 0), rt: Number(m?.rt || 0), recordedAt };
}

/** What the load-time repair does to one completed match (`index` in its division's array). */
export type CompletedResultRepair =
  | { division: string; index: number; action: 'restore'; set: { wp?: unknown[]; rp?: unknown[]; wt?: number; rt?: number } }
  | { division: string; index: number; action: 'reopen'; set: { done: false; ready?: boolean } }
  | { division: string; index: number; action: 'create'; set: { completedResult: CompletedResult } };

/**
 * Plans the repair of every completed match: a valid snapshot restores the points; a
 * winner-required match whose points give no winner is re-opened (a literal 'Hikiwake'
 * must never advance into a bracket); otherwise a snapshot is created from the points.
 * `restored` counts restores that carried White's points (legacy count).
 */
export function planCompletedResultRepairs(allMatches: unknown, recordedAt: string): { restored: number; created: number; reopened: number; repairs: CompletedResultRepair[] } {
  let restored = 0, created = 0, reopened = 0;
  const repairs: CompletedResultRepair[] = [];
  if (!allMatches || typeof allMatches !== 'object') return { restored, created, reopened, repairs };
  for (const [division, arr] of Object.entries(allMatches as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    arr.forEach((raw: unknown, index: number) => {
      if (!raw || typeof raw !== 'object') return;
      const m = raw as ScoredMatch & { templateNode?: unknown; completedResult?: unknown };
      if (!m.done) return;
      const snapshot = m.completedResult as Parameters<typeof completedResultSnapshotValid>[1];
      const totals = (m.completedResult || {}) as { wt?: unknown; rt?: unknown };
      if (snapshot && completedResultSnapshotValid(m, snapshot)) {
        const set: { wp?: unknown[]; rp?: unknown[]; wt?: number; rt?: number } = {};
        if (Array.isArray(snapshot.wp)) { set.wp = [...snapshot.wp]; restored++; }
        if (Array.isArray(snapshot.rp)) set.rp = [...snapshot.rp];
        if (Number.isFinite(Number(totals.wt))) set.wt = Number(totals.wt);
        if (Number.isFinite(Number(totals.rt))) set.rt = Number(totals.rt);
        repairs.push({ division, index, action: 'restore', set });
        return;
      }
      const computed = scoreWinnerOf(m);
      if (matchRequiresWinner(m) && computed === 'Hikiwake') {
        repairs.push({ division, index, action: 'reopen', set: m.templateNode ? { done: false, ready: !!(m.white && m.red) } : { done: false } });
        reopened++;
        return;
      }
      repairs.push({ division, index, action: 'create', set: { completedResult: { winner: computed, wp: [...(m.wp || [])], rp: [...(m.rp || [])], wt: Number(m.wt || 0), rt: Number(m.rt || 0), recordedAt } } });
      created++;
    });
  }
  return { restored, created, reopened, repairs };
}

/** Divisions whose elimination advancement is re-derived after a load (championship and/or single-elim nodes). */
export function loadedEliminationRepairPlan(
  divisions: readonly string[],
  championshipNodes: Record<string, readonly unknown[] | null | undefined> | null | undefined,
  singleElimNodes: Record<string, readonly unknown[] | null | undefined> | null | undefined,
): { division: string; championship: boolean; singleElim: boolean }[] {
  return divisions.map(division => ({
    division,
    championship: (championshipNodes?.[division] || []).length > 0,
    singleElim: (singleElimNodes?.[division] || []).length > 0,
  }));
}

export function isValidMatchObject(match: unknown): match is IdentityMatch {
  return Boolean(match && typeof match === 'object' && !Array.isArray(match));
}

/** Key of an individual bracket/tiebreak bout that must exist once per division (null for others). */
export function individualLogicalMatchKey(m: IdentityMatch | null | undefined): string | null {
  if (!m || m.type !== 'individual') return null;
  if (m.singleElim) return `single:${m.elimNodeId || String(m.position) + ':' + String(m.bracketSlot ?? '')}`;
  if (m.championship) return `champ:${m.position || 'Championship'}:${String(m.bracketSlot ?? '')}`;
  if (m.tiebreak) {
    const pair = [s(m.white), s(m.red)].sort().join('|');
    return `tiebreak:${s(m.pool)}:${m.tiebreakSeries || 1}:${String(m.tiebreakIndex ?? 0)}:${pair}`;
  }
  return null;
}

/** The division's matches with duplicate individual bouts removed (a completed duplicate wins). New array. */
export function uniqueIndividualMatches<M extends IdentityMatch>(arr: readonly M[]): M[] {
  const seen = new Map<string, M>(), out: M[] = [];
  arr.forEach(m => {
    const key = individualLogicalMatchKey(m);
    if (!key) { out.push(m); return; }
    const kept = seen.get(key);
    if (!kept) { seen.set(key, m); out.push(m); return; }
    if (!kept.done && m.done) {
      const idx = out.indexOf(kept);
      if (idx >= 0) out[idx] = m;
      seen.set(key, m);
    }
  });
  return out;
}

/** Identity the pre-2.x sync used for tiebreak bouts ('' when not a tiebreak). */
export function legacyTiebreakSyncIdentity(match: unknown): string {
  if (!isValidMatchObject(match) || !match.tiebreak) return '';
  const div = String(match.division || '');
  return `tiebreak:${div}:${s(match.pool)}:${s(match.tiebreakId || match.position)}:${s(match.white)}:${s(match.red)}`;
}

/** Stable identity of a Match Object across devices (sync rebase addresses matches by it). */
export function matchSyncIdentity(match: unknown): string {
  if (!isValidMatchObject(match)) return '';
  const div = String(match.division || ''), type = String(match.type || '');
  if (match.champNodeId) return `champ:${div}:${s(match.champNodeId)}`;
  if (match.elimNodeId) return `elim:${div}:${s(match.elimNodeId)}`;
  if (match.teamNodeId && match.teamPair) return `team-node:${div}:${s(match.teamNodeId)}:${s(match.teamPair)}:${s(match.position)}`;
  if (match.teamPair) return `team-pair:${div}:${s(match.teamPair)}:${s(match.position)}:${s(match.type)}`;
  if (match.tiebreak) return `tiebreak:${div}:${s(match.pool)}:${Number(match.tiebreakSeries || 1)}:${Number(match.tiebreakIndex ?? 0)}:${type}:${s(match.white)}:${s(match.red)}`;
  if (type === 'individual' && !match.championship) {
    const order = Number.isInteger(match.poolOrder) ? String(match.poolOrder) : '';
    const slots = [s(match.whitePoolSlot), s(match.redPoolSlot)].join('-');
    return `pool:${div}:${s(match.pool)}:${order}:${slots}:${s(match.white)}:${s(match.red)}`;
  }
  if (type === 'exhibition') return `exhibition:${div}:${s(match.white)}:${s(match.red)}`;
  return `match:${div}:${s(match.pool)}:${s(match.position)}:${String(match.bracketSlot ?? '')}:${type}:${s(match.white || match.teamWhite)}:${s(match.red || match.teamRed)}`;
}

export function matchHasSyncIdentity(match: unknown, identity: string | null | undefined): boolean {
  return !!identity && (matchSyncIdentity(match) === identity || legacyTiebreakSyncIdentity(match) === identity);
}

/**
 * Where `match` is in `list` (#15, before 13c: no code relies on a Match Object staying the same object). The same object
 * first (the answer `indexOf` gave), else an entry with the same `matchSyncIdentity()` (a structural copy, or the match
 * after a write gave it a new object). Several entries can share an identity (a kachinuki pairing's bouts, a 4.0 save's
 * duplicates): then the one equal to `match` in every field, else the one at `hint` (the index the caller held), else the
 * first. When no entry has its identity (a name in it changed: pool and tiebreak identities hold the names), the entry at
 * `hint` if it is the same slot (sameMatchSlot()) and no other entry is. -1 when it is not there. No new saved field: the identity is computed
 * from the match.
 */
export function matchIndexIn(list: readonly unknown[] | null | undefined, match: unknown, hint?: number | null): number {
  if (!Array.isArray(list) || !match) return -1;
  const atHint = Number.isInteger(hint) ? (hint as number) : -1;
  if (atHint >= 0 && list[atHint] === match) return atHint;
  const same = list.indexOf(match);
  if (same >= 0) return same;
  const identity = matchSyncIdentity(match);
  if (!identity) return -1;
  const found: number[] = [];
  list.forEach((m, i) => { if (matchSyncIdentity(m) === identity) found.push(i); });
  // The identity missed (a name in it changed): the held index, only when that entry is the one entry of the list in the
  // same slot (exhibitions, and pool bouts saved before the slots, share theirs).
  if (!found.length) {
    if (atHint < 0 || !sameMatchSlot(list[atHint], match)) return -1;
    return list.some((m, i) => i !== atHint && sameMatchSlot(m, match)) ? -1 : atHint;
  }
  if (found.length === 1) return found[0]!;
  const text = JSON.stringify(match), equal = found.filter(i => JSON.stringify(list[i]) === text);
  const pick = equal.length ? equal : found;
  return pick.includes(atHint) ? atHint : pick[0]!;
}

const SLOT_FIELDS = ['division', 'type', 'pool', 'position', 'bracketSlot', 'poolOrder', 'poolTemplateOrder', 'whitePoolSlot', 'redPoolSlot', 'teamPair',
  'teamNodeId', 'elimNodeId', 'champNodeId', 'tiebreak', 'tiebreakSeries', 'tiebreakIndex', 'championship', 'singleElim'] as const;
/** Whether two Match Objects are the same bout's slot: every placement field equal, the names aside. */
export function sameMatchSlot(a: unknown, b: unknown): boolean {
  if (!isValidMatchObject(a) || !isValidMatchObject(b)) return false;
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  return SLOT_FIELDS.every(k => String(x[k] ?? '') === String(y[k] ?? ''));
}

/** The entry of `list` that is `match` (matchIndexIn()), or null. */
export function findMatchAgain<M>(list: readonly M[] | null | undefined, match: unknown, hint?: number | null): M | null {
  const i = matchIndexIn(list, match, hint);
  return i >= 0 ? list![i]! : null;
}
