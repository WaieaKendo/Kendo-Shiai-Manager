// Grand champion (#86): the winners of chosen individual divisions meet for a Grand Champion
// award. A row (state.grandChampions[]) names its source divisions, its format, court and award;
// once every source division is complete, its winners are drawn into a division of their own
// (key: the row's id, `gc:<hex>`), which the courts, Results, TV and print show like any other.
//
// The draw is derived, never edited by hand: it is the generated division of the entrants the
// sources give right now (generateDivision with those entrants as its competitors), so every device
// that saves computes the same draw, and a save conflict needs no special merge for it (the app
// recomputes it after every load, live update and rebase; grandChampionPlan() says what to do).
// The director's decisions are fields of the row, merged like any Setup record:
//   * standIns: a source winner who withdraws is replaced by that division's runner-up, or loses
//     by Fusen-sho; keyed by the source, valid only while that person is still its winner;
//   * keep / rebuild: a source corrected after the grand champion started is either kept as played
//     or drawn again; the decision names the entrants it was made for (a signature), so a later
//     correction asks again.
// Sources are individual division names for 4.0.0 (team divisions, `state.teamDivisions[].id`,
// are refused by grandChampionSetupError() until a team grand champion exists).
// Pure: every function returns new values and never changes its inputs.
export const GRAND_CHAMPION_PREFIX = 'gc:';
export const GRAND_CHAMPION_FORMATS = ['Single Elimination', 'Round Robin'] as const;
export type GrandChampionFormat = typeof GRAND_CHAMPION_FORMATS[number];
export type GrandChampionAwardMode = 'top1' | 'top2';
/** A pool of winners holds 3–5 (one pool, no championship bracket: the standings decide). */
export const GRAND_CHAMPION_POOL_MIN = 3;
export const GRAND_CHAMPION_POOL_MAX = 5;

export interface GrandChampionStandIn {
  /** The source winner this decision is for; ignored once the source has another winner. */
  winner: string;
  /** runner-up: the source's runner-up plays instead; fusen-sho: the winner's bouts are lost by Fusen-sho. */
  kind: 'runner-up' | 'fusen-sho';
}

export interface GrandChampion {
  id: string;
  name: string;
  /** Source division keys, in order (individual division names). */
  sources: string[];
  format: GrandChampionFormat;
  court: 'A' | 'B';
  awardMode: GrandChampionAwardMode;
  order: number;
  standIns?: Record<string, GrandChampionStandIn>;
  /** The entrants' signature the director kept a started grand champion against. */
  keep?: string;
  /** The entrants' signature the director had a started grand champion drawn again for. */
  rebuild?: string;
}

export interface Entrant { name: string; dojo: string }
export interface SourceResult {
  /** The division's result is final (divisionComplete()). */
  complete: boolean;
  winner?: Entrant | null | undefined;
  runnerUp?: Entrant | null | undefined;
}
export interface GrandChampionEntrant extends Entrant {
  source: string;
  via: 'winner' | 'runner-up' | 'fusen-sho';
}
export interface GrandChampionEntrants {
  /** One per source, in source order; null while that source is not decided. */
  entrants: (GrandChampionEntrant | null)[];
  /** Sources not complete yet. */
  waiting: string[];
  /** Sources whose entrant also comes from an earlier source (the same person won both): a stand-in is needed. */
  duplicates: string[];
  /** Every source decided, no duplicates: the draw can be made. */
  ready: boolean;
}

export const isGrandChampionId = (id: unknown): boolean => typeof id === 'string' && id.startsWith(GRAND_CHAMPION_PREFIX);
const key = (e: Entrant) => `${e.name}\u0000${e.dojo || ''}`;

/** Who plays for each source now: its winner, or the director's stand-in for that winner. */
export function grandChampionEntrants(gc: Pick<GrandChampion, 'sources' | 'standIns'>, results: Readonly<Record<string, SourceResult | undefined>>): GrandChampionEntrants {
  const waiting: string[] = [], duplicates: string[] = [], seen = new Set<string>();
  const entrants = gc.sources.map((source): GrandChampionEntrant | null => {
    const r = results[source];
    if (!r?.complete || !r.winner?.name) { waiting.push(source); return null; }
    const standIn = gc.standIns?.[source];
    let e: GrandChampionEntrant = { source, via: 'winner', name: r.winner.name, dojo: r.winner.dojo || '' };
    if (standIn && standIn.winner === r.winner.name) {
      if (standIn.kind === 'runner-up' && r.runnerUp?.name) e = { source, via: 'runner-up', name: r.runnerUp.name, dojo: r.runnerUp.dojo || '' };
      else if (standIn.kind === 'fusen-sho') e = { ...e, via: 'fusen-sho' };
    }
    if (seen.has(key(e))) duplicates.push(source); else seen.add(key(e));
    return e;
  });
  return { entrants, waiting, duplicates, ready: !waiting.length && !duplicates.length };
}

/** A stable text for the entrants (who, from which source, and how), for the director's decisions. */
export function grandChampionSignature(entrants: readonly (GrandChampionEntrant | null)[]): string {
  return JSON.stringify(entrants.map(e => (e ? [e.source, e.name, e.dojo, e.via] : null)));
}

/** The format the draw uses: two entrants always play one match (single elimination, a Final with Encho). */
export function grandChampionFormat(gc: Pick<GrandChampion, 'format' | 'sources'>): GrandChampionFormat {
  return gc.sources.length <= 2 ? 'Single Elimination' : gc.format;
}

/** The registration rows the draw is generated from (the division's own competitors). */
export function grandChampionCompetitors(gcId: string, entrants: readonly Entrant[]): { name: string; dojo: string; division: string; seed: string; status: string }[] {
  return entrants.map(e => ({ name: e.name, dojo: e.dojo || '', division: gcId, seed: '', status: 'Checked' }));
}

/** The structure a draw holds (state keys by the row's id). */
export interface GrandChampionStructure {
  matches?: readonly { white?: string; red?: string; wdojo?: string; rdojo?: string; done?: boolean; wp?: readonly unknown[]; rp?: readonly unknown[]; wt?: number | undefined; rt?: number | undefined }[] | null | undefined;
  singleElimComps?: readonly (Entrant | null)[] | null | undefined;
  pools?: readonly { players: readonly Entrant[] }[] | null | undefined;
}

/** Who the existing draw was made for (null: no draw). */
export function drawnEntrants(s: GrandChampionStructure): Entrant[] | null {
  if (!s.matches?.length) return null;
  const pooled = (s.pools || []).flatMap(p => p.players || []);
  const list = (s.singleElimComps?.length ? s.singleElimComps : pooled).filter((e): e is Entrant => !!e && !!e.name);
  return list.map(e => ({ name: e.name, dojo: e.dojo || '' }));
}

/** A bout of the draw has been played or scored. */
export function grandChampionStarted(matches: GrandChampionStructure['matches']): boolean {
  return (matches || []).some(m => m && (m.done || (m.wp?.length || 0) > 0 || (m.rp?.length || 0) > 0 || (m.wt || 0) > 0 || (m.rt || 0) > 0));
}

const sameEntrants = (a: readonly Entrant[], b: readonly Entrant[]) => a.length === b.length && [...a.map(key)].sort().join('\u0001') === [...b.map(key)].sort().join('\u0001');

export type GrandChampionAction =
  | { kind: 'none' }
  /** Draw (or draw again) with these entrants. */
  | { kind: 'draw'; entrants: GrandChampionEntrant[] }
  /** Remove the draw: a source is no longer decided (before the start, or the director said so). */
  | { kind: 'clear' }
  /** The draw has started and the sources changed: the director decides (keep, or draw again / clear). */
  | { kind: 'ask'; signature: string; ready: boolean };

/**
 * What the draw needs now. Before it starts it always follows the sources (filled when they are
 * all decided, refilled or cleared when one is corrected); once started, a change is the
 * director's decision, remembered by signature (keep: leave it; rebuild: draw again / clear).
 */
export function grandChampionPlan(gc: Pick<GrandChampion, 'keep' | 'rebuild'>, now: GrandChampionEntrants, structure: GrandChampionStructure): GrandChampionAction {
  const drawn = drawnEntrants(structure);
  const wanted = now.entrants.filter((e): e is GrandChampionEntrant => !!e);
  if (!drawn) return now.ready ? { kind: 'draw', entrants: wanted } : { kind: 'none' };
  if (now.ready && sameEntrants(drawn, wanted)) return { kind: 'none' };
  const follow: GrandChampionAction = now.ready ? { kind: 'draw', entrants: wanted } : { kind: 'clear' };
  if (!grandChampionStarted(structure.matches)) return follow;
  const signature = grandChampionSignature(now.entrants);
  if (gc.keep === signature) return { kind: 'none' };
  if (gc.rebuild === signature) return follow;
  return { kind: 'ask', signature, ready: now.ready };
}

/**
 * Bouts lost by Fusen-sho because an entrant withdrew (stand-in kind 'fusen-sho'): every bout of
 * the draw with that entrant on one side, both sides known, and nothing scored yet. Returns the
 * indexes and the winning side; the app records them as the court's Fusen-sho does (F F).
 */
export function grandChampionFusenBouts(matches: GrandChampionStructure['matches'], withdrawn: readonly Entrant[]): { index: number; winner: 'W' | 'R' }[] {
  const out = withdrawn.map(key), gone = new Set(out);
  const side = (name?: string, dojo?: string) => gone.has(`${name || ''}\u0000${dojo || ''}`);
  const bouts: { index: number; winner: 'W' | 'R' }[] = [];
  (matches || []).forEach((m, index) => {
    if (!m || !m.white || !m.red || grandChampionStarted([m])) return;
    const w = side(m.white, m.wdojo), r = side(m.red, m.rdojo);
    if (w !== r) bouts.push({ index, winner: w ? 'R' : 'W' });
  });
  return bouts;
}

export interface Placement { place: string; name: string; tier: string }
/** The division's placements as awards: 1st is the Grand Champion; 2nd the Runner-up (top2). */
export function grandChampionPlacements(placements: readonly Placement[], awardMode: GrandChampionAwardMode | string | undefined): Placement[] {
  const first = placements.find(p => p.place === '1st'), second = placements.find(p => p.place === '2nd');
  const rows: Placement[] = [];
  if (first) rows.push({ place: 'Grand Champion', name: first.name, tier: 'gold' });
  if (first && second && awardMode === 'top2') rows.push({ place: 'Runner-up', name: second.name, tier: 'silver' });
  return rows;
}

/** Why the row cannot be drawn as set up (shown in Setup and by the generation check), or null. */
export function grandChampionSetupError(gc: Pick<GrandChampion, 'name' | 'sources' | 'format' | 'court'>, divisions: readonly string[], teamDivisionIds: readonly string[] = []): string | null {
  if (!String(gc.name || '').trim()) return 'Enter a name for the grand champion match.';
  if (gc.sources.some(s => teamDivisionIds.includes(s))) return 'Team divisions cannot be a grand champion source yet.';
  if (gc.sources.length < 2) return 'Choose at least two divisions.';
  if (new Set(gc.sources).size !== gc.sources.length) return 'Each division can be chosen once.';
  const missing = gc.sources.find(s => !divisions.includes(s));
  if (missing !== undefined) return `"${missing}" is not one of the divisions in use.`;
  if (gc.court !== 'A' && gc.court !== 'B') return 'Choose Court A or Court B.';
  if (grandChampionFormat(gc as GrandChampion) === 'Round Robin' && (gc.sources.length < GRAND_CHAMPION_POOL_MIN || gc.sources.length > GRAND_CHAMPION_POOL_MAX))
    return `A pool of winners holds ${GRAND_CHAMPION_POOL_MIN}–${GRAND_CHAMPION_POOL_MAX} divisions; choose Single elimination for more.`;
  return null;
}

/** A new row (the app gives the id). */
export function newGrandChampion(id: string, order: number, sources: string[] = []): GrandChampion {
  return { id, name: 'Grand Champion', sources, format: 'Single Elimination', court: 'A', awardMode: 'top1', order };
}

/** Load boundary: a list of well-formed rows, in order (older files have none and stay without the key). */
export function migrateGrandChampions<S extends { grandChampions?: unknown }>(state: S): S & { grandChampions?: GrandChampion[] } {
  if (state.grandChampions === undefined) return state as S & { grandChampions?: GrandChampion[] };
  const raw = Array.isArray(state.grandChampions) ? state.grandChampions : [];
  const rows = raw.filter((r): r is GrandChampion => !!r && typeof r === 'object' && isGrandChampionId((r as GrandChampion).id))
    .map(r => ({
      ...r,
      name: String(r.name ?? ''),
      sources: Array.isArray(r.sources) ? r.sources.map(String) : [],
      format: (GRAND_CHAMPION_FORMATS as readonly string[]).includes(r.format) ? r.format : 'Single Elimination',
      court: r.court === 'B' ? 'B' : 'A',
      awardMode: r.awardMode === 'top2' ? 'top2' : 'top1',
      order: Number.isFinite(r.order) ? r.order : 0,
    } as GrandChampion));
  return { ...state, grandChampions: sortGrandChampions(rows) };
}

export function sortGrandChampions<T extends { order: number; id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Issue #25: a source division renamed before the draw is renamed in every row (its stand-in too). */
export function renameGrandChampionSources(rows: readonly GrandChampion[], from: string, to: string): GrandChampion[] {
  return rows.map(gc => {
    if (!gc.sources.includes(from)) return gc;
    const out: GrandChampion = { ...gc, sources: gc.sources.map(s => (s === from ? to : s)) };
    if (gc.standIns && Object.hasOwn(gc.standIns, from)) {
      const { [from]: moved, ...rest } = gc.standIns;
      out.standIns = { ...rest, [to]: moved! };
    }
    return out;
  });
}

/** Display text for a division key: a grand champion row's name, else the key. */
export function grandChampionName(rows: readonly Pick<GrandChampion, 'id' | 'name'>[] | undefined, id: string): string | null {
  return rows?.find(r => r.id === id)?.name ?? null;
}
