// Championship (post-pool bracket) engine, moved from app/js/14-engine-championship.js,
// 04-engine-pools.js and 27-results-screen.js (step 2.4). Pure: callers pass the
// division's matches, nodes, pools, court choice and seed lookups in; nothing here reads
// `state`. Match and node objects keep the legacy field order (saved data and goldens
// compare JSON). Team brackets and direct single elimination are not here (2.5/2.6).
import {
  winnerOf, pendingTiebreak, initialPoolStandings, resolveTiebreakBaseGroup, poolStandings,
} from './standings.ts';
import type { StandingsMatch, StandingsPool, StandingRow, TiebreakStatsRow } from './standings.ts';

/** Where a championship side comes from: a pool seed ('A1') or an earlier node's winner. */
export interface ChampSource { seed?: string | undefined; ref?: string | null | undefined }

export interface ChampNode<C extends string = string> {
  id: string; round: string; slot: number; left: ChampSource; right: ChampSource; court: C;
}

/** The fields of a match the championship rules read. */
export interface ChampMatchLike extends StandingsMatch {
  rdojo: string; wdojo: string;
  position?: string | undefined;
  bracketSlot?: number | undefined;
  champNodeId?: string | undefined;
}

export interface Competitor { name: string; dojo: string }

/** A championship Match Object as created from a node (field order is part of the saved data). */
export interface ChampionshipMatch<C extends string = string> {
  division: string; pool: 'Championship'; white: string; red: string; wdojo: string; rdojo: string;
  position: string; done: boolean; wp: never[]; rp: never[];
  type: 'individual'; championship: true; templateNode: true; origin: 'TEMPLATE'; ready: boolean;
  champNodeId: string; bracketSlot: number; court: C; seedRed: string | null; seedWhite: string | null;
}

export interface SeedResolution { complete: boolean; seeds: Record<number, StandingRow | TiebreakStatsRow>; rows: StandingRow[] }

// ---- Template library ----------------------------------------------------------------

type Pairs = readonly (readonly [string, string])[];
const P = (...pairs: string[]): Pairs => Object.freeze(pairs.map(p => Object.freeze(p.split('-') as [string, string])));
const T6 = P('A1-B2', 'B1-A2');
const T10 = P('A1-B2', 'C1-A3', 'B1-C2', 'A2-B3');
const T13 = P('A1-B2', 'C1-D2', 'B1-C2', 'D1-A2');
const T18 = P('A1-C2', 'B1-D2', 'E1-A2', 'D1-C1');
const T21 = P('A1-B2', 'C1-D1', 'A2-F1', 'E1-B1');
const T23 = P('A1-D2', 'E1-B3', 'C1-F2', 'G1-B2', 'B1-E2', 'F1-A2', 'D1-A3', 'C2-G2');
const T29 = P('A1-D2', 'E1-H2', 'C1-F2', 'G1-B2', 'B1-E2', 'F1-A2', 'D1-C2', 'H1-G2');
const T33 = P('A1-D2', 'G1-B2', 'C1-F2', 'E1-D1', 'B1-E2', 'F1-A2', 'I1-C2', 'H1-G2');
const T37 = P('A1-D2', 'E1-I1', 'C1-F2', 'G1-B2', 'B1-E2', 'F1-A2', 'D1-C2', 'H1-J1');
/** Frozen Championship Template Library v1.0: [first entrant total, pairs] ranges. */
const TEMPLATES: readonly (readonly [number, number, Pairs])[] = Object.freeze([
  [6, 8, T6], [9, 9, P('A1-B1', 'C1-A2')], [10, 12, T10], [13, 16, T13], [17, 17, P('A1-D1', 'B1-C2', 'C1-A2', 'B2-E1')],
  [18, 20, T18], [21, 22, T21], [23, 28, T23], [29, 32, T29], [33, 36, T33], [37, 40, T37],
] as const);

/**
 * First-round seed pairs [Red seed, White seed] for `total` pool entrants (6–40; none
 * below 6 or above 40). Returns fresh arrays: callers store them in state.brackets.
 */
export function championshipTemplateForTotal(total: number): string[][] {
  const t = TEMPLATES.find(([lo, hi]) => total >= lo && total <= hi && Number.isInteger(total));
  return t ? t[2].map(p => [...p]) : [];
}

/**
 * The division's seed pairs. Once generated, the stored bracket stays authoritative
 * even if a no-show reduces the number of active pool competitors.
 */
export function championshipLabels<L>(generated: unknown, brackets: L[] | null | undefined, pools: readonly StandingsPool[]): L[] | string[][] {
  if (generated && Array.isArray(brackets) && brackets.length) return brackets;
  const total = pools.reduce((sum, p) => sum + (p.players ? p.players.length : 0), 0);
  return championshipTemplateForTotal(total);
}

// ---- Rounds and courts -----------------------------------------------------------------

/** Name of the first round for `n` first-round matches. */
export function firstRoundName(n: number): string {
  if (n >= 8) return 'Round of 16'; if (n >= 4) return 'Quarterfinal'; if (n >= 2) return 'Semifinal'; return 'Final';
}
export function nextRoundFromName(name: string): string | null {
  if (name === 'Round of 16') return 'Quarterfinal'; if (name === 'Quarterfinal') return 'Semifinal'; if (name === 'Semifinal') return 'Final'; return null;
}
/** Matches in `round` for a bracket whose first round has `initial` matches (as used for courts). */
export function roundMatchCount(initial: number, round: string): number {
  if (round === 'Round of 16') return initial; if (round === 'Quarterfinal') return initial >= 8 ? 4 : initial;
  if (round === 'Semifinal') return 2; if (round === 'Final') return 1; return initial;
}
/** Court of a championship bout: the division's court, or (split) first half A / second half B, Final on A. */
export function championshipCourtFor<M extends string>(mode: M, round: string, slot: number | null | undefined, totalInRound: number): M | 'A' | 'B' {
  if (mode !== 'split') return mode;
  if (round === 'Final') return 'A';
  const total = Math.max(1, totalInRound || 1);
  return Number(slot || 0) < Math.ceil(total / 2) ? 'A' : 'B';
}

// ---- Nodes and Match Objects -------------------------------------------------------------

export function championshipMatchObjectForNode<C extends string>(div: string, node: ChampNode<C>): ChampionshipMatch<C> {
  return {
    division: div,
    pool: 'Championship',
    white: '', red: '', wdojo: '', rdojo: '',
    position: node.round,
    done: false, wp: [], rp: [],
    type: 'individual', championship: true, templateNode: true, origin: 'TEMPLATE', ready: false,
    champNodeId: node.id, bracketSlot: node.slot, court: node.court,
    seedRed: node.left?.seed || null, seedWhite: node.right?.seed || null,
  };
}

/**
 * Championship nodes (first round from the seed pairs, later rounds referencing the two
 * feeder nodes) and one Match Object per node. `courtFor(round, slot, totalInRound)`
 * picks each court; totals come from `initialCount` first-round matches.
 */
export function buildChampionshipTemplateMatches<C extends string>(div: string, seedPairs: readonly (readonly string[])[] | null | undefined, courtFor: (round: string, slot: number, totalInRound: number) => C, initialCount: number): { nodes: ChampNode<C>[]; matches: ChampionshipMatch<C>[] } {
  const pairs = seedPairs || [];
  const nodes: ChampNode<C>[] = [], matches: ChampionshipMatch<C>[] = [];
  if (!pairs.length) return { nodes, matches };
  const first = firstRoundName(pairs.length);
  const addNode = (id: string, round: string, slot: number, left: ChampSource, right: ChampSource): ChampNode<C> => {
    const court = courtFor(round, slot, roundMatchCount(initialCount, round));
    const node: ChampNode<C> = { id, round, slot, left, right, court }; nodes.push(node);
    matches.push(championshipMatchObjectForNode(div, node));
    return node;
  };
  pairs.forEach(([red, white], i) => addNode(`C-${first}-${i}`, first, i, { seed: red as string }, { seed: white as string }));
  let prev = nodes.filter(n => n.round === first), round = nextRoundFromName(first);
  while (round && prev.length > 1) {
    const next: ChampNode<C>[] = [];
    for (let i = 0; i < Math.ceil(prev.length / 2); i++) {
      const a = prev[i * 2], b = prev[i * 2 + 1];
      next.push(addNode(`C-${round}-${i}`, round, i, { ref: a?.id || null }, { ref: b?.id || null }));
    }
    prev = next; round = nextRoundFromName(round);
  }
  return { nodes, matches };
}

// ---- Seeds -------------------------------------------------------------------------

/** Every non-tiebreak pool bout is done (false when the pool has none). */
export function poolFinished(matches: readonly StandingsMatch[], poolLabel: string): boolean {
  const base = matches.filter(m => m.pool === poolLabel && !m.tiebreak && !m.championship);
  return base.length > 0 && base.every(m => m.done);
}

/**
 * Seeds (place -> row) of a finished pool for places 1..requiredPlaces; complete once
 * every needed place is decided (tied groups only count once their tiebreak locks them).
 */
export function poolSeedResolution(pool: StandingsPool | null | undefined, poolLabel: string, matches: readonly StandingsMatch[], requiredPlaces: number): SeedResolution {
  if (!poolFinished(matches, poolLabel) || pendingTiebreak(matches, poolLabel)) return { complete: false, seeds: {}, rows: [] };
  const req = requiredPlaces;
  const base = initialPoolStandings(pool, matches);
  const seeds: Record<number, StandingRow | TiebreakStatsRow> = {}; let complete = true;
  for (let i = 0; i < base.length;) {
    let j = i + 1; while (j < base.length && base[j]!.wins === base[i]!.wins && base[j]!.pts === base[i]!.pts) j++;
    const group = base.slice(i, j), start = i + 1, end = j;
    if (group.length === 1) { if (start <= req) seeds[start] = group[0]!; }
    else if (start <= req) {
      const resolved = resolveTiebreakBaseGroup(matches, poolLabel, { start, end, players: group });
      if (resolved.unresolved.length) complete = false;
      const ordered = resolved.ordered || [];
      for (let offset = 0; offset < ordered.length; offset++) {
        const place = start + offset;
        // Only a player its tiebreaks placed (F26: players still level behind them are not seeds yet).
        if (place <= req && resolved.locked.some(x => x.name === ordered[offset]!.name)) seeds[place] = ordered[offset]!;
      }
      // A fully resolved two-person tie for first explicitly owns both Seed 1
      // and Seed 2; a tie at the advancement boundary owns only that boundary.
      if (!resolved.unresolved.length) {
        for (let offset = 0; offset < ordered.length; offset++) {
          const place = start + offset; if (place <= req) seeds[place] = ordered[offset]!;
        }
      }
    }
    i = j;
  }
  for (let place = 1; place <= Math.min(req, base.length); place++) if (!seeds[place]) complete = false;
  return { complete, seeds, rows: poolStandings(pool, matches, req) };
}

/** 'A1' -> { pool: 'A', place: 1 } (places 1–3), else null. */
export function parseSeedLabel(label: unknown): { pool: string; place: number } | null {
  const m = String(label).match(/^([A-Z])([123])$/);
  return m ? { pool: m[1]!, place: parseInt(m[2]!, 10) } : null;
}

/**
 * The row holding a seed label, or null while undecided. `resolutionFor(pool)` gives the
 * pool's seed resolution (poolSeedResolution); with onlyFinalized, an incomplete pool gives null.
 */
export function seedNameForLabel<R>(label: unknown, resolutionFor: (poolLabel: string) => { complete: boolean; seeds: Record<number, R>; rows: readonly R[] }, onlyFinalized = true): R | null {
  const parsed = parseSeedLabel(label); if (!parsed) return null;
  const resolution = resolutionFor(parsed.pool);
  if (onlyFinalized && !resolution.complete) return null;
  return resolution.seeds[parsed.place] || resolution.rows[parsed.place - 1] || null;
}

// ---- Advancement -------------------------------------------------------------------

/** Winner of a championship bout as {name, dojo}, or null (not decided / hikiwake). */
export function champWinnerObj(m: ChampMatchLike): Competitor | null {
  const win = winnerOf(m);
  if (win === m.red) return { name: m.red, dojo: m.rdojo };
  if (win === m.white) return { name: m.white, dojo: m.wdojo };
  return null;
}

/** Who fills a node side: the seed's row (via `seedFor`) or the winner of the finished feeder node. */
export function championshipNodeSource<S>(side: ChampSource | null | undefined, seedFor: (label: string) => S | null, matches: readonly ChampMatchLike[]): S | Competitor | null {
  if (!side) return null;
  if (side.seed) return seedFor(side.seed);
  if (side.ref) {
    const m = matches.find(x => x.championship && x.champNodeId === side.ref);
    if (m?.done) return champWinnerObj(m);
  }
  return null;
}

/** Field values syncChampionshipTemplate writes on an unfinished bout (in this order). */
export interface ChampionshipUpdate<C extends string = string> {
  index: number;
  set: { position: string; bracketSlot: number; court: C; red: string; rdojo: string; white: string; wdojo: string; ready: boolean };
}

/**
 * Plans filling the championship bouts from pool seeds and earlier winners, as data:
 * `missing` are Match Objects to append for nodes that have none (self-heal for older
 * states), and `updates[i].set` is assigned onto the bout at `index` of matches+missing.
 * Finished bouts are left alone.
 */
export function syncChampionshipTemplate<C extends string, S extends { name: string; dojo: string }>(div: string, nodes: readonly ChampNode<C>[], matches: readonly ChampMatchLike[], seedFor: (label: string) => S | null): { missing: ChampionshipMatch<C>[]; updates: ChampionshipUpdate<C>[] } {
  const all: ChampMatchLike[] = [...matches], missing: ChampionshipMatch<C>[] = [], updates: ChampionshipUpdate<C>[] = [];
  for (const node of nodes) {
    let index = all.findIndex(x => x && x.championship && x.champNodeId === node.id);
    if (index < 0) {
      const m = championshipMatchObjectForNode(div, node);
      missing.push(m); all.push(m); index = all.length - 1;
    }
    if (all[index]!.done) continue;
    const red = championshipNodeSource(node.left, seedFor, all), white = championshipNodeSource(node.right, seedFor, all);
    updates.push({ index, set: {
      position: node.round, bracketSlot: node.slot, court: node.court,
      red: red?.name || '', rdojo: red?.dojo || '', white: white?.name || '', wdojo: white?.dojo || '',
      ready: !!(red && white),
    } });
  }
  return { missing, updates };
}

/** A later-round side as shown in the bracket: the feeder's winner, or "Winner of <round> Match n". */
export function sourceLabelForRound(matches: readonly ChampMatchLike[], prevRound: string, slot: number): { name: string; dojo: string; done: boolean } {
  const pm = matches.find(x => x.championship && x.position === prevRound && x.bracketSlot === slot);
  if (pm?.done) { const winner = champWinnerObj(pm); if (winner) return { name: winner.name, dojo: winner.dojo || '', done: true }; }
  return { name: `Winner of ${prevRound} Match ${slot + 1}`, dojo: '', done: false };
}

// ---- Placements ----------------------------------------------------------------------

export interface Placement { place: string; name: string; tier: string }

/**
 * Medal rows of an individual division: Final winner/loser and both Semifinal losers
 * (two 3rds). Without a finished Final, a pool-only division (pass a function giving its
 * standings; only called then) awards 1st–3rd from the pool; otherwise none.
 */
export function individualPlacements(matches: readonly ChampMatchLike[], poolOnlyRows: (() => readonly { name: string }[]) | null | undefined): Placement[] {
  const final = matches.find(m => m.championship && m.position === 'Final' && m.done);
  if (!final && poolOnlyRows) {
    return poolOnlyRows().slice(0, 3).map((r, i) => ({ place: ['1st', '2nd', '3rd'][i]!, name: r.name, tier: ['gold', 'silver', 'bronze'][i]! }));
  }
  if (!final) return [];
  const first = winnerOf(final);
  const second = first === final.red ? final.white : final.red;
  const rows: Placement[] = [
    { place: '1st', name: first, tier: 'gold' },
    { place: '2nd', name: second, tier: 'silver' },
  ];
  matches.filter(m => m.championship && m.position === 'Semifinal' && m.done).forEach(m => {
    const w = winnerOf(m);
    const loser = w === m.red ? m.white : m.red;
    if (loser) rows.push({ place: '3rd', name: loser, tier: 'bronze' });
  });
  return rows;
}
