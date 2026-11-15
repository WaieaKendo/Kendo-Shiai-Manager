// The division lists a rename rewrites and the standard divisions (#15 PR 9). No imports: the store's `tournament` slice
// (app/store, bundled on its own into app.js, docs/STORE.md section 5) uses these, and must not pull in the rest of the
// engine. app/engine/divisions.ts builds the whole rename on them (renamedDivisionState()). Pure.

/** One rename, as recorded in state.divisionRenames. */
export interface DivisionRename { id: string; from: string; to: string }

/**
 * The standard divisions a new tournament starts with: name, format, court (#15 PR 9: here so the store's initial
 * `tournament` slice and app/modules/app-state.js build the same values).
 */
export const DIVISION_PRESETS: readonly (readonly [string, string, 'A' | 'B'])[] = [
  ['Yonenbu (11 years and under)', 'Round Robin', 'A'], ['Shonenbu (12–14 years old)', 'Round Robin', 'A'],
  ['Seinenbu (15+ years without dan)', 'Round Robin', 'A'], ['Women’s Open', 'Round Robin', 'B'],
  ['Yudansha 1–3 Dan', 'Round Robin', 'A'], ['Yudansha 4 Dan+', 'Round Robin', 'B'], ['Masters Open (50+ years old)', 'Round Robin', 'B'],
];

/** The division lists of a state (the part the store holds). */
export interface DivisionRecords {
  divisions?: string[] | undefined;
  divisionTypes?: Record<string, string> | undefined;
  divisionCourts?: Record<string, string> | undefined;
}

function renameKey<T>(record: Record<string, T>, from: string, to: string): Record<string, T> {
  if (!Object.hasOwn(record, from)) return record;
  // Rebuilt in key order, so the renamed key keeps its place (a stable JSON for the three-way merge).
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === from) { if (!Object.hasOwn(out, to) && !Object.hasOwn(record, to)) out[to] = v; }
    else out[k] = v;
  }
  return out;
}

/**
 * The running order, formats and courts with `from` renamed to `to` (the running order keeps the position; when `to`
 * already exists, the list keeps the first and the format and court of `to` stay). Only the lists `st` has.
 */
export function renamedDivisionRecords(st: DivisionRecords, from: string, to: string): DivisionRecords {
  const out: DivisionRecords = {};
  if (st.divisions) {
    const seen = new Set<string>();
    out.divisions = st.divisions.map(d => (d === from ? to : d)).filter(d => (seen.has(d) ? false : (seen.add(d), true)));
  }
  if (st.divisionTypes) out.divisionTypes = renameKey(st.divisionTypes, from, to);
  if (st.divisionCourts) {
    // The team court's entry stays (an individual division of that name, from a 4.0 save, gets its own key: the court it had; the team court's 'Both' is
    // not an individual court, so it becomes 'split', as loadedDivisionCourts() does on load).
    out.divisionCourts = from === TEAM_COURT_KEY && Object.hasOwn(st.divisionCourts, from) && !Object.hasOwn(st.divisionCourts, to)
      ? { ...st.divisionCourts, [to]: st.divisionCourts[from] === 'Both' ? 'split' : st.divisionCourts[from] as string }
      : renameKey(st.divisionCourts, from, to);
  }
  return out;
}

// ---- The division edits (#15 PR 9). Each returns only the lists it changes (assign them over the state; {} = nothing
// changes), never writes its input, and never touches the team court's entry (TEAM_COURT_KEY: the Setup's teamCourt).

/** The legacy team division's key, whose `divisionCourts` entry is the Setup's team court, never a division's court. */
export const TEAM_COURT_KEY = 'Team Tournament';

/** The division lists a division edit sets (the store's `tournament` slice holds them). */
export interface DivisionListsState extends DivisionRecords {
  hiddenPresets?: string[] | undefined;
  divisionRenames?: DivisionRename[] | undefined;
}

/** `courts` with each named division's court set (null: forgotten), the team court's entry left alone. */
export function withDivisionCourts(courts: Record<string, string> | undefined, changes: Record<string, string | null>): Record<string, string> {
  const out: Record<string, string> = { ...(courts || {}) };
  for (const [division, court] of Object.entries(changes)) {
    if (division === TEAM_COURT_KEY) continue;
    if (court === null) delete out[division];
    else out[division] = court;
  }
  return out;
}

/** An individual division added at the end of the running order with its format and court; {} when it is there already. */
export function addedDivision(st: DivisionListsState, division: string, format: string, court: string): DivisionListsState {
  if ((st.divisions || []).includes(division)) return {};
  return {
    divisions: [...(st.divisions || []), division],
    divisionTypes: { ...(st.divisionTypes || {}), [division]: format },
    divisionCourts: withDivisionCourts(st.divisionCourts, { [division]: court }),
  };
}

/**
 * A division taken out of the running order: at `index` (removeDivision(i); a negative index counts from the end, as
 * Array#splice does) or wherever it is. Its format and court are forgotten unless `keepSettings` (a preset switched off).
 */
export function removedDivision(st: DivisionListsState, division: string, { index, keepSettings }: { index?: number | undefined; keepSettings?: boolean | undefined } = {}): DivisionListsState {
  const divisions = [...(st.divisions || [])];
  if (index !== undefined) divisions.splice(index, 1);
  const out: DivisionListsState = { divisions: index !== undefined ? divisions : divisions.filter(d => d !== division) };
  if (keepSettings) return out;
  const types = { ...(st.divisionTypes || {}) };
  delete types[division];
  out.divisionTypes = types;
  out.divisionCourts = withDivisionCourts(st.divisionCourts, { [division]: null });
  return out;
}

/** A division moved one place up or down in the running order (#31); {} at either end or when it is not there. */
export function movedDivision(st: DivisionListsState, division: string, direction: 'up' | 'down'): DivisionListsState {
  const divisions = [...(st.divisions || [])], i = divisions.indexOf(division), j = i + (direction === 'up' ? -1 : 1);
  if (i < 0 || j < 0 || j >= divisions.length) return {};
  [divisions[i], divisions[j]] = [divisions[j] as string, divisions[i] as string];
  return { divisions };
}

/** Each listed division without a court (missing or empty) given `court` (renderDivisions(): 'A'); {} when none lacks one. */
export function defaultedDivisionCourts(st: DivisionListsState, divisions: readonly string[], court: string): DivisionListsState {
  const missing = divisions.filter(d => d !== TEAM_COURT_KEY && !st.divisionCourts?.[d]);
  return missing.length ? { divisionCourts: withDivisionCourts(st.divisionCourts, Object.fromEntries(missing.map(d => [d, court]))) } : {};
}
