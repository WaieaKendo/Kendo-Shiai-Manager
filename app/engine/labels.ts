// Text helpers (issue #136 step 1b): moved from app/js/19-cloud-diagnostics.js
// and 24-court-queue-and-context.js.

/** A byte count as "n B", "n KB" or "n.nn MB" (a non-number counts as 0). */
export function formatSnapshotBytes(bytes: unknown): string {
  const n = Number(bytes) || 0;
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** A short description of a value's shape for the diagnostics: array length, object key count or its type. */
export function snapshotValueSummary(value: unknown): string {
  if (Array.isArray(value)) return `Array (${value.length})`;
  if (value && typeof value === 'object') return `Object (${Object.keys(value).length} keys)`;
  return typeof value;
}

/** The standard name of a queue group heading (Quarterfinals, Semifinals, Final, ...); other labels are returned trimmed. */
export function normalizeQueueGroupLabel(label: unknown): string {
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

