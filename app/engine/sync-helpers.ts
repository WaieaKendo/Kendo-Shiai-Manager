// Small value helpers used by the sync, rebase and undo code (issue #136 step 1b): moved from
// app/js/10-court-scoring-and-history.js and 18-sync-state-and-rebase.js.

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

