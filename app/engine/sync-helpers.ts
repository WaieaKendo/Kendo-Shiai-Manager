// Small value helpers used by the sync, rebase and undo code (issue #136 step 1b): moved from
// app/js/10-court-scoring-and-history.js and 18-sync-state-and-rebase.js. Step 1c adds cloneJson,
// mergeHistoryEntries, stampHistoryPatchMatchIdentity and nextReadyIndexInState.
import { isValidMatchObject, matchSyncIdentity } from './integrity.ts';
import { individualMatchReady, matchBelongsToCourtInState } from './match-helpers.ts';
import type { HelperMatch } from './match-helpers.ts';

/** Court letter: 'B' for "b"/"B", otherwise 'A'. */
export function normalizeCourt(value: unknown): 'A' | 'B' {
  return String(value || '').toUpperCase() === 'B' ? 'B' : 'A';
}

/** Strict equality, except that NaN equals NaN. */
export function historyValuesEqual(a: unknown, b: unknown): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}

interface HistoryEntryFields { clientId?: unknown; when?: unknown; court?: unknown; label?: unknown }

/** The key that identifies a court action history entry across devices. */
export function historyEntryIdentity(entry: HistoryEntryFields | null | undefined): string {
  return [entry?.clientId || '', entry?.when || '', entry?.court || '', entry?.label || ''].join('|');
}

/** A deep copy through JSON (throws on undefined, as before). */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** The patch-v1 history entries of both lists merged by identity, oldest first, the last 80. */
export function mergeHistoryEntries(remoteEntries: readonly any[] = [], localEntries: readonly any[] = []): any[] {
  const map = new Map();
  [...remoteEntries, ...localEntries].forEach(entry => {
    if (!entry || entry.format !== 'patch-v1') return;
    const key = [entry.clientId || '', entry.when || '', entry.court || '', entry.label || ''].join('|');
    map.set(key, cloneJson(entry));
  });
  return [...map.values()].sort((a, b) => String(a.when || '').localeCompare(String(b.when || ''))).slice(-80);
}

/** The patch with the identity of the match it changes (when it changes one), so a rebase can find that match again. */
export function stampHistoryPatchMatchIdentity(patch: any, before: any, after: any): any {
  const path = patch?.path || [];
  if (path[0] !== 'allMatches' || typeof path[2] !== 'number') return patch;
  const div = path[1], index = path[2];
  const afterMatch = after?.allMatches?.[div]?.[index], beforeMatch = before?.allMatches?.[div]?.[index];
  const match = isValidMatchObject(afterMatch) ? afterMatch : (isValidMatchObject(beforeMatch) ? beforeMatch : null);
  const matchIdentity = matchSyncIdentity(match);
  return matchIdentity ? { ...patch, matchIdentity } : patch;
}

/** Index of the first match on `court` that is ready to play (the end of the list if none). */
export function nextReadyIndexInState(targetState: any, div: string, court: unknown): number {
  const arr = targetState?.allMatches?.[div] || [];
  const idx = arr.findIndex((m: HelperMatch) => individualMatchReady(m) && matchBelongsToCourtInState(targetState, m, court));
  return idx < 0 ? arr.length : idx;
}

