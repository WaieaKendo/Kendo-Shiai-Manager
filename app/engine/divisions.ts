// Division renames (issue #25): every individual division, preset or custom, can be renamed in
// Setup before the tournament is generated. A division's name is still its key (registrations,
// formats, courts, pools, matches, results); until stable IDs (issue #15) a rename rewrites the
// name everywhere it is used, which is only safe before the draw:
//   * state.divisions (the running order, #31: the position is kept), the divisionTypes and
//     divisionCourts keys (a renamed preset keeps its format and court), every competitor whose
//     division is that name, and the device's views of it (currentDivision, poolViewDivision, the
//     courts' divisions);
//   * the rename is recorded in state.divisionRenames ({id, from, to}, in order, synced with the
//     tournament), so a save conflict can replay it as one operation (rebaseDivisionRenames()) and
//     a renamed preset keeps its place among the presets (presetNames()).
// "Generated" means the whole tournament: once Generate Tournament has run (state.generated), or a
// division has a draw of its own, no division can be renamed (the name also lives in pools,
// matches, court history, results and other devices' court selections).
// The team event ('Team Tournament') and 'Exhibition Matches' are not renamable: they are fixed
// keys the engine and the screens look up by name, and they are not rows of the divisions table.
// Pure: every function returns new values and never changes its inputs.
import { TEAM_DIVISION, EXHIBITION_DIVISION } from './generation.ts';
import { renameGrandChampionSources, type GrandChampion } from './grand-champion.ts';

export const RENAME_AFTER_DRAW_MESSAGE = "Divisions can't be renamed after the draw; rename-anytime comes with stable IDs.";
export const RENAME_EMPTY_MESSAGE = "A division name can't be empty.";

/** One rename, as recorded in state.divisionRenames. */
export interface DivisionRename { id: string; from: string; to: string }

/** The parts of the tournament state a rename reads and rewrites (the rest is passed through). */
export interface RenameState {
  divisions?: string[] | undefined;
  divisionTypes?: Record<string, string> | undefined;
  divisionCourts?: Record<string, string> | undefined;
  competitors?: { division?: string | undefined }[] | undefined;
  divisionRenames?: DivisionRename[] | undefined;
  /** #86: grand champion rows name their source divisions. */
  grandChampions?: GrandChampion[] | undefined;
  generated?: boolean | undefined;
  currentDivision?: string | null | undefined;
  poolViewDivision?: string | null | undefined;
  courtState?: Record<string, { division?: string | null | undefined } | undefined> | undefined;
  courtActiveDivision?: Record<string, string | null | undefined> | undefined;
  [key: string]: unknown;
}

/** Per-division structure written by generation (the F10 structural keys of the sync code). */
export const DIVISION_STRUCTURE_KEYS = ['pools', 'teamPools', 'allMatches', 'teamBracketNodes', 'singleElimNodes',
  'singleElimComps', 'teamElimTeams', 'brackets', 'championshipNodes', 'byeWinners'] as const;

const fold = (name: string): string => name.trim().toLowerCase();

function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/** True when the draw was made: the tournament generated, or `division` (if given) has pools/matches. */
export function drawMade(st: RenameState, division?: string): boolean {
  if (st.generated) return true;
  if (division === undefined) return false;
  return DIVISION_STRUCTURE_KEYS.some(k => {
    const byDivision = st[k];
    return !!byDivision && typeof byDivision === 'object' && hasValue((byDivision as Record<string, unknown>)[division]);
  });
}

/** The presets' current names: each preset followed through the recorded renames, in preset order. */
export function presetNames(presets: readonly string[], renames: readonly DivisionRename[] | undefined): string[] {
  const names = [...presets];
  for (const r of renames || []) {
    const i = names.indexOf(r.from);
    if (i >= 0) names[i] = r.to;
  }
  return names;
}

/** Every division name in use (the table's rows and the reserved names), for the uniqueness check. */
export function divisionNamesInUse(st: RenameState, presets: readonly string[]): string[] {
  const names = new Set<string>([
    ...(st.divisions || []), ...Object.keys(st.divisionTypes || {}), ...Object.keys(st.divisionCourts || {}),
    ...presetNames(presets, st.divisionRenames), TEAM_DIVISION, EXHIBITION_DIVISION,
  ]);
  return [...names];
}

/** True when `name` is a division of `st` (a row of the divisions table). */
export function isDivision(st: RenameState, presets: readonly string[], name: string): boolean {
  if (name === TEAM_DIVISION || name === EXHIBITION_DIVISION) return false;
  return (st.divisions || []).includes(name) || Object.hasOwn(st.divisionTypes || {}, name)
    || presetNames(presets, st.divisionRenames).includes(name);
}

/**
 * Why renaming `from` to `to` (trimmed) is refused, or null when it is allowed. A rename to the same
 * name is allowed (it changes nothing); a change of case only is allowed.
 */
export function divisionRenameError(st: RenameState, presets: readonly string[], from: string, to: string): string | null {
  const name = String(to ?? '').trim();
  if (from === TEAM_DIVISION) return "The team event's name can't be changed.";
  if (from === EXHIBITION_DIVISION) return "Exhibition Matches can't be renamed.";
  if (drawMade(st, from)) return RENAME_AFTER_DRAW_MESSAGE;
  if (!name) return RENAME_EMPTY_MESSAGE;
  if (!isDivision(st, presets, from)) return `"${from}" is no longer a division.`;
  if (name === from) return null;
  if (fold(name) === fold(TEAM_DIVISION)) return `"${name}" is the team event's name; choose another name.`;
  if (fold(name) === fold(EXHIBITION_DIVISION)) return `"${name}" is the exhibition matches' name; choose another name.`;
  const clash = divisionNamesInUse(st, presets).find(d => d !== from && fold(d) === fold(name));
  if (clash !== undefined) return `There is already a division named "${clash}".`;
  return null;
}

function renameKey<T>(record: Record<string, T> | undefined, from: string, to: string): Record<string, T> | undefined {
  if (!record || !Object.hasOwn(record, from)) return record;
  // Rebuilt in key order, so the renamed key keeps its place (a stable JSON for the three-way merge).
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === from) { if (!Object.hasOwn(out, to) && !Object.hasOwn(record, to)) out[to] = v; }
    else out[k] = v;
  }
  return out;
}

/**
 * The state parts a rename rewrites, renamed (assign them over the state): `from` becomes `to`
 * everywhere it is used, in place. When `to` already exists (two devices' divisions meeting in a
 * save conflict) the two become one: the list keeps the first, the format and court of `to` stay.
 * `record` adds the rename to divisionRenames.
 */
export function renamedDivisionState(st: RenameState, from: string, to: string, record?: DivisionRename): Partial<RenameState> {
  const out: Partial<RenameState> = {};
  if (from === to) return record ? { divisionRenames: [...(st.divisionRenames || []), record] } : out;
  if (st.divisions) {
    const seen = new Set<string>();
    out.divisions = st.divisions.map(d => (d === from ? to : d)).filter(d => (seen.has(d) ? false : (seen.add(d), true)));
  }
  if (st.divisionTypes) out.divisionTypes = renameKey(st.divisionTypes, from, to);
  if (st.divisionCourts) out.divisionCourts = renameKey(st.divisionCourts, from, to);
  if (st.competitors) out.competitors = st.competitors.map(c => (c && c.division === from ? { ...c, division: to } : c));
  if (st.grandChampions) out.grandChampions = renameGrandChampionSources(st.grandChampions, from, to);
  if (st.currentDivision === from) out.currentDivision = to;
  if (st.poolViewDivision === from) out.poolViewDivision = to;
  if (st.courtState) {
    out.courtState = Object.fromEntries(Object.entries(st.courtState).map(([c, v]) => [c, v && v.division === from ? { ...v, division: to } : v]));
  }
  if (st.courtActiveDivision) {
    out.courtActiveDivision = Object.fromEntries(Object.entries(st.courtActiveDivision).map(([c, d]) => [c, d === from ? to : d]));
  }
  if (record) out.divisionRenames = [...(st.divisionRenames || []), record];
  return out;
}

function withRename(st: RenameState, from: string, to: string, record?: DivisionRename): RenameState {
  return { ...st, ...renamedDivisionState(st, from, to, record) };
}

/** A refused local rename: the rename and why (for the notice). */
export interface RefusedRename { rename: DivisionRename; reason: string }

export interface RenameRebase<S extends RenameState> {
  /** The server copy with this device's accepted renames applied (its divisionRenames: the server's, then those). */
  server: S;
  /** This device's state: refused renames undone, the other devices' renames applied. */
  local: S;
  /** The merge base with the other devices' and the accepted renames applied (so the three-way merge sees neither as an edit). */
  base: S;
  /** This device's renames applied over the server copy, in order. */
  accepted: DivisionRename[];
  /** This device's renames that could not be applied over the server copy (they are undone, never half-applied). */
  refused: RefusedRename[];
  /**
   * The other devices' renames of a division this device has an unsaved draw or other structural
   * edit for (pools, matches, brackets under the old name; found in external PR review, #36): that
   * edit must not be saved (it would stay keyed under a name that no longer exists).
   */
  blocked: DivisionRename[];
}

/** True when `div`'s structure (pools, matches, brackets) differs between `a` and `b`. */
function structureChanged(a: RenameState, b: RenameState, div: string): boolean {
  return DIVISION_STRUCTURE_KEYS.some(k => {
    const x = (a[k] as Record<string, unknown> | undefined)?.[div], y = (b[k] as Record<string, unknown> | undefined)?.[div];
    return JSON.stringify(x ?? null) !== JSON.stringify(y ?? null);
  });
}

function namesWithStructure(st: RenameState): Set<string> {
  const names = new Set<string>();
  for (const k of DIVISION_STRUCTURE_KEYS) {
    const byDivision = st[k];
    if (!byDivision || typeof byDivision !== 'object') continue;
    for (const [div, v] of Object.entries(byDivision as Record<string, unknown>)) if (hasValue(v)) names.add(div);
  }
  return names;
}

/**
 * Division names that have structure (pools, matches, brackets) in `st` but are not a division
 * there (nor the team event or the exhibition matches): a draw keyed under a name that no longer
 * exists. `except` (the server copy) excludes every name that already has structure there, so
 * only a draw this device would add is reported, never results played in a division the server
 * already holds (found in external PR review, #36).
 */
export function orphanedDivisionStructure(st: RenameState, presets: readonly string[], except?: RenameState): string[] {
  const existing = except ? namesWithStructure(except) : new Set<string>();
  const teamIds = new Set(((st.teamDivisions || []) as {id:string}[]).map(d => d.id));
  // #86: a grand champion row's draw is its division (a removed row's draw is orphaned).
  (st.grandChampions || []).forEach(g => teamIds.add(g.id));
  return [...namesWithStructure(st)].filter(d => !teamIds.has(d) && d !== TEAM_DIVISION && d !== EXHIBITION_DIVISION && !isDivision(st, presets, d) && !existing.has(d));
}

/** `st` without the structure (pools, matches, brackets) of `divisions` (assign over the state). */
export function withoutDivisionStructure(st: RenameState, divisions: readonly string[]): Partial<RenameState> {
  const out: Partial<RenameState> = {};
  for (const k of DIVISION_STRUCTURE_KEYS) {
    const byDivision = st[k];
    if (!byDivision || typeof byDivision !== 'object' || !divisions.some(d => Object.hasOwn(byDivision, d))) continue;
    out[k] = Object.fromEntries(Object.entries(byDivision as Record<string, unknown>).filter(([d]) => !divisions.includes(d)));
  }
  return out;
}

/**
 * A save conflict (409 rebase) with renames on either side. A rename touches several values the
 * three-way merge (F4) treats separately (divisions, divisionTypes, divisionCourts, competitors), so
 * it is replayed as one operation instead: before the merge, the other devices' renames (in the
 * server's divisionRenames, not in the base's) are applied to this device's state and to the base,
 * and this device's renames (in its divisionRenames, not in the base's) to the server copy and the
 * base, in order. A competitor the other device added to or edited in the old name then merges
 * onto the new one, and both devices' edits survive. A local rename is refused when it cannot be
 * applied over the server copy: the draw was made there, its division was removed or renamed there,
 * its new name is taken there, or the other device renamed to or from one of its names at the same
 * time. Then it is undone on this device (with every later local rename), so no part of it is saved
 * (the caller shows a notice). `blocked` lists the other devices' renames of a division this device
 * has an unsaved structural edit for (a draw racing the rename; external PR review, #36): the
 * caller does not save that edit (the rename and the other device's state win). Returns null when
 * neither side renamed anything.
 */
export function rebaseDivisionRenames<S extends RenameState>(server: S, local: S, base: S, presets: readonly string[]): RenameRebase<S> | null {
  const baseIds = new Set((base.divisionRenames || []).map(r => r.id));
  const serverIds = new Set((server.divisionRenames || []).map(r => r.id));
  const theirs = (server.divisionRenames || []).filter(r => !baseIds.has(r.id));
  const mine = (local.divisionRenames || []).filter(r => !baseIds.has(r.id) && !serverIds.has(r.id));
  if (!theirs.length && !mine.length) return null;
  // #36 review: the other device renamed a division this device has an unsaved structural edit for.
  const blocked = theirs.filter(r => structureChanged(local, base, r.from));
  const theirNames = new Set(theirs.flatMap(r => [fold(r.from), fold(r.to)]));
  let s: RenameState = server, known: RenameState = base;
  const accepted: DivisionRename[] = [], refused: RefusedRename[] = [];
  const taken = (st: RenameState, r: DivisionRename) => divisionNamesInUse(st, presets).some(d => d !== r.from && fold(d) === fold(r.to));
  for (const r of mine) {
    let reason: string | null = null;
    // A division added on this device since the base (not on the server either) is renamed with it:
    // only its new name must still be free there.
    const addedHere = !isDivision(s, presets, r.from) && !isDivision(known, presets, r.from);
    if (refused.length) reason = 'an earlier rename was not saved';
    else if (drawMade(s, r.from)) reason = 'the draw was made on another device';
    else if (theirNames.has(fold(r.from)) || theirNames.has(fold(r.to))) reason = 'another device renamed a division with that name at the same time';
    else if (addedHere ? taken(s, r) : !isDivision(s, presets, r.from)) reason = addedHere ? 'another device added a division with that name' : 'another device removed it';
    else if (!addedHere && divisionRenameError(s, presets, r.from, r.to)) reason = 'another device added a division with that name';
    if (reason) { refused.push({ rename: r, reason }); continue; }
    s = withRename(s, r.from, r.to, r);
    known = withRename(known, r.from, r.to);
    accepted.push(r);
  }
  let l: RenameState = local;
  // Undo the refused renames, the last one first (later renames may build on earlier ones).
  for (const { rename } of [...refused].reverse()) l = withRename(l, rename.to, rename.from);
  l = { ...l, divisionRenames: (l.divisionRenames || []).filter(r => !refused.some(x => x.rename.id === r.id)) };
  let b: RenameState = base;
  for (const r of theirs) {
    l = withRename(l, r.from, r.to);
    b = withRename(b, r.from, r.to);
  }
  for (const r of accepted) b = withRename(b, r.from, r.to);
  // The renames every side now holds: the server's, then this device's accepted ones.
  const log = [...(server.divisionRenames || []), ...accepted];
  return {
    server: { ...s, divisionRenames: log } as S,
    local: { ...l, divisionRenames: log } as S,
    base: { ...b, divisionRenames: log } as S,
    accepted,
    refused,
    blocked,
  };
}
