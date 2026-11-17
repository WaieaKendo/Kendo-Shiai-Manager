// Pool, bracket and result helpers (issue #136 step 1c): moved from app/js/14-engine-championship.js,
// 06-engine-single-elim.js, 32-split-court-templates.js and 12-engine-result-integrity.js.
import { individualLogicalMatchKey } from './integrity.ts';
import { completedResultSnapshotValid } from './standings.ts';

/** Seeds, unchanged (kept as the one place the bracket pairs are read from). */
export function bracketPairsFromSeeds<T>(seeds: T): T {
  return seeds;
}

type PointLetter = 'M' | 'K' | 'D' | 'T' | 'H' | 'F';

interface TiedRow { wins?: unknown; pts?: unknown; tbWins?: unknown; tbPts?: unknown }

/** Whether two pool rows are still tied, using their tiebreak wins and points when either has them. */
export function poolRowsStillTied(a: TiedRow | null | undefined, b: TiedRow | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.wins !== b.wins || a.pts !== b.pts) return false;
  // If this tied base-position group has completed tiebreak data, use that data to resolve placement.
  const aHasTb = typeof a.tbWins === 'number' || typeof a.tbPts === 'number';
  const bHasTb = typeof b.tbWins === 'number' || typeof b.tbPts === 'number';
  if (aHasTb || bHasTb) {
    const aw = (a.tbWins as number) || 0, bw = (b.tbWins as number) || 0, ap = (a.tbPts as number) || 0, bp = (b.tbPts as number) || 0;
    if (aw !== bw || ap !== bp) return false;
  }
  return true;
}

/** Whether `arr` already has the match of single-elimination node `node`. */
export function indivNodeHasMatch(arr: readonly any[], node: { id?: unknown }): boolean {
  return arr.some(m => individualLogicalMatchKey(m) === `single:${node.id}`);
}

/** The one match kept for a single-elimination node (a finished one first); the others are removed from `arr`. */
export function canonicalSingleElimMatch(_div: unknown, node: { id?: unknown }, arr: any[]): any {
  // By position, not Match Object identity (#15, before 13c): the node's entries, the kept one, the others removed.
  const at: number[] = [];
  arr.forEach((m, i) => { if (m.singleElim && m.elimNodeId === node.id) at.push(i); });
  if (!at.length) return null;
  const keptAt = at.find(i => arr[i].done) ?? at[0]!, kept = arr[keptAt];
  for (let j = at.length - 1; j >= 0; j--) if (at[j] !== keptAt) arr.splice(at[j]!, 1);
  return kept;
}

/** The point marks of one side ('W' white, otherwise red) of a match, from its saved result when that is valid. */
export function pointsFor(m: any, side: string): PointLetter[] {
  const snapshot = m?.done && completedResultSnapshotValid(m, m.completedResult) ? m.completedResult : null;
  const saved = side === 'W' ? snapshot?.wp : snapshot?.rp;
  return Array.isArray(saved) ? saved : ((side === 'W' ? m?.wp : m?.rp) || []);
}
