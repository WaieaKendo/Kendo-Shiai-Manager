// Pool sizing (moved from app/js/04-engine-pools.js, step 2.0 engine-bridge).

/**
 * Frozen template library for 6..40 entrants: as many 4-person pools as possible
 * while avoiding 2-person pools.
 */
const POOL_SIZE_TEMPLATES: Readonly<Record<number, readonly number[]>> = {
  6: [3, 3], 7: [4, 3], 8: [4, 4],
  9: [3, 3, 3], 10: [4, 3, 3], 11: [4, 4, 3],
  12: [4, 4, 4], 13: [4, 3, 3, 3], 14: [4, 4, 3, 3], 15: [4, 4, 4, 3], 16: [4, 4, 4, 4],
  17: [4, 4, 3, 3, 3], 18: [4, 4, 4, 3, 3], 19: [4, 4, 4, 4, 3], 20: [4, 4, 4, 4, 4],
  21: [4, 4, 4, 3, 3, 3], 22: [4, 4, 4, 4, 3, 3],
  23: [4, 4, 3, 3, 3, 3, 3], 24: [4, 4, 4, 3, 3, 3, 3], 25: [4, 4, 4, 4, 3, 3, 3], 26: [4, 4, 4, 4, 4, 3, 3], 27: [4, 4, 4, 4, 4, 4, 3], 28: [4, 4, 4, 4, 4, 4, 4],
  29: [4, 4, 4, 4, 4, 3, 3, 3], 30: [4, 4, 4, 4, 4, 4, 3, 3], 31: [4, 4, 4, 4, 4, 4, 4, 3], 32: [4, 4, 4, 4, 4, 4, 4, 4],
  33: [4, 4, 4, 4, 4, 4, 3, 3, 3], 34: [4, 4, 4, 4, 4, 4, 4, 3, 3], 35: [4, 4, 4, 4, 4, 4, 4, 4, 3], 36: [4, 4, 4, 4, 4, 4, 4, 4, 4],
  37: [4, 4, 4, 4, 4, 4, 4, 3, 3, 3], 38: [4, 4, 4, 4, 4, 4, 4, 4, 3, 3], 39: [4, 4, 4, 4, 4, 4, 4, 4, 4, 3], 40: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
};

/**
 * Pool sizes for `n` entrants: the template for 6..40, otherwise pools of 3 with the
 * remainder added round-robin (n=5 → [5], never a lost entrant). Always a new array.
 */
export function poolSizes(n: number): number[] {
  const template = POOL_SIZE_TEMPLATES[n];
  if (template) return [...template];
  let poolCount = Math.max(1, Math.ceil(n / 4));
  while (n / poolCount < 3 && poolCount > 1) poolCount--;
  const sizes: number[] = Array<number>(poolCount).fill(3);
  const rem = n - poolCount * 3;
  for (let i = 0; i < rem; i++) sizes[i % poolCount] = (sizes[i % poolCount] ?? 3) + 1;
  return sizes;
}

// Pool building, slots and pool match order (moved from app/js/04-engine-pools.js,
// step 2.2). Pure: callers pass the competitors / pools / courts in.

/** A registration row that can be placed in a pool. `seed` is '' or a number as text. */
export interface PoolEntrant {
  name: string;
  dojo: string;
  seed?: string | number | null | undefined;
}

/** A pool entry after slot assignment (a copy of the entrant). */
export type SlottedPlayer<P> = P & { poolSlot: string; poolSlotIndex: number };

export interface BuiltPool<P> {
  label: string;
  size: number;
  players: P[];
}

/** Dojo group used to keep dojo-mates apart in pools (Aiea and Waipahu count as one). */
export function clubGroup(dojo: string | null | undefined): string {
  const s = (dojo || '').toLowerCase();
  return s.includes('aiea') || s.includes('waipahu') ? 'aiea-waipahu' : s;
}

/** Stable order by dojo group + name + original index. Always a new array. */
export function shuffleDeterministic<T extends { name: string; dojo: string }>(arr: readonly T[]): T[] {
  return arr
    .map((x, i) => ({ x, k: clubGroup(x.dojo) + x.name + i }))
    .sort((a, b) => a.k.localeCompare(b.k))
    .map(o => o.x);
}

/** Slot letter for a 0-based pool position (0 → 'A'). */
export function poolPlayerSlotLetter(index: number): string {
  return String.fromCharCode(65 + Math.max(0, Number(index) || 0));
}

/** A player's stored slot letter, or the letter for its position. */
export function poolPlayerSlot(player: { poolSlot?: string | undefined } | null | undefined, index: number): string {
  return player?.poolSlot || poolPlayerSlotLetter(index);
}

/**
 * New pools whose players are copies carrying their A/B/C/D slot (top-to-bottom order
 * is the canonical slot order). The input pools and players are not changed.
 */
export function assignPoolPlayerSlots<P extends object, Q extends { players?: readonly P[] | null | undefined }>(
  pools: readonly Q[] | null | undefined,
): (Q & { players: SlottedPlayer<P>[] })[] {
  return (pools || []).map(pool => ({
    ...pool,
    players: (pool.players || []).map((player, index) => ({ ...player, poolSlot: poolPlayerSlotLetter(index), poolSlotIndex: index })),
  }));
}

const seedRank = (c: PoolEntrant): number => parseInt(String(c.seed)) || 999;

/**
 * Pools for a division: sizes from poolSizes(), one seed per pool (best seeds first),
 * then the rest by dojo group (largest group first, deterministic order), each into the
 * pool with the fewest dojo-mates, then the least full, then the lowest label.
 */
export function buildPools<T extends PoolEntrant>(comps: readonly T[]): BuiltPool<SlottedPlayer<T>>[] {
  const pools: BuiltPool<T>[] = poolSizes(comps.length).map((size, i) => ({ label: String.fromCharCode(65 + i), size, players: [] }));
  const sorted = [...comps].sort((a, b) => seedRank(a) - seedRank(b) || a.name.localeCompare(b.name));
  const seeds = sorted.filter(c => c.seed).slice(0, pools.length);
  seeds.forEach((c, i) => pools[i]?.players.push(c));
  const rest = sorted.filter(c => !seeds.includes(c));
  const groups: Record<string, T[]> = {};
  rest.forEach(c => { const g = clubGroup(c.dojo); (groups[g] = groups[g] || []).push(c); });
  const grouped = Object.values(groups).sort((a, b) => b.length - a.length).map(g => shuffleDeterministic(g));
  grouped.forEach(group => group.forEach(c => {
    const g = clubGroup(c.dojo);
    const choices = pools.filter(p => p.players.length < p.size);
    choices.sort((p1, p2) => {
      const same1 = p1.players.filter(x => clubGroup(x.dojo) === g).length;
      const same2 = p2.players.filter(x => clubGroup(x.dojo) === g).length;
      if (same1 !== same2) return same1 - same2;
      const fill = p1.players.length / p1.size - p2.players.length / p2.size;
      if (fill !== 0) return fill;
      return p1.label.localeCompare(p2.label);
    });
    choices[0]?.players.push(c);
  }));
  return assignPoolPlayerSlots<T, BuiltPool<T>>(pools);
}

/** Fixed bout orders for pools of 2..4 as [white, red] player indexes. */
const POOL_MATCH_TEMPLATES: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  2: [[0, 1]],
  3: [[0, 1], [2, 1], [2, 0]],
  4: [[0, 1], [2, 3], [2, 0], [1, 3], [1, 2], [3, 0]],
};

/** Bout order of a pool as [white, red] player indexes (plain round robin above 4). */
export function poolMatchPairs(size: number): [number, number][] {
  const fixed = POOL_MATCH_TEMPLATES[size];
  if (fixed) return fixed.map(([w, r]) => [w, r]);
  const pairs: [number, number][] = [];
  for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) pairs.push([i, j]);
  return pairs;
}

export interface PoolMatch<C> {
  division: string;
  pool: string;
  white: string;
  red: string;
  wdojo: string;
  rdojo: string;
  whitePoolSlot: string;
  redPoolSlot: string;
  done: false;
  wp: never[];
  rp: never[];
  type: 'individual';
  origin: 'TEMPLATE';
  court: C;
  poolOrder: number;
  poolTemplateOrder: number;
}

/**
 * Template pool matches for a division in canonical order (pool by pool, each in
 * poolMatchPairs order). `courts[i]` is the court of `pools[i]`. Field order is fixed
 * (goldens compare JSON).
 */
export function buildPoolMatches<C>(
  div: string,
  pools: readonly { label: string; players?: readonly { name: string; dojo: string; poolSlot?: string | undefined }[] | null | undefined }[] | null | undefined,
  courts: readonly C[],
): PoolMatch<C>[] {
  const matches: PoolMatch<C>[] = [];
  (pools || []).forEach((pool, poolOrder) => {
    const players = pool.players || [];
    const court = courts[poolOrder] as C;
    poolMatchPairs(players.length).forEach(([whiteIndex, redIndex], poolTemplateOrder) => {
      const w = players[whiteIndex]!, r = players[redIndex]!;
      matches.push({
        division: div,
        pool: pool.label,
        white: w.name,
        red: r.name,
        wdojo: w.dojo,
        rdojo: r.dojo,
        whitePoolSlot: poolPlayerSlot(w, whiteIndex),
        redPoolSlot: poolPlayerSlot(r, redIndex),
        done: false,
        wp: [],
        rp: [],
        type: 'individual',
        origin: 'TEMPLATE',
        court,
        poolOrder,
        poolTemplateOrder,
      });
    });
  });
  return matches;
}
