// Individual direct single elimination, moved from app/js/06-engine-single-elim.js and
// 32-split-court-templates.js (step 2.5). Pure: callers pass the bracket template nodes
// (teamBracketNodesForCount, still in app/js with the team bracket until 2.6), the
// division's matches, competitors and court choice in; nothing here reads `state`.
// Match and node objects keep the legacy field order (saved data and goldens compare JSON).
import { clubGroup } from './pools.ts';
import { winnerOf } from './standings.ts';
import type { StandingsMatch } from './standings.ts';

/** Where a bracket side comes from: entrant number `team` (1-based placed order) or an earlier node's winner. */
export interface SingleElimSource { team?: number | undefined; ref?: string | null | undefined; seed?: string | undefined }

/** A frozen bracket template node (as teamBracketNodesForCount returns it). */
export interface SingleElimTemplateNode<C extends string = string> {
  id: string; round: string; court: C; left: SingleElimSource | null; right: SingleElimSource | null; slot: number;
}

export interface SingleElimWinner { name: string; dojo: string }

/** A division's single-elimination node; `winner` is filled as the bracket plays out. */
export interface SingleElimNode<C extends string = string> extends SingleElimTemplateNode<C> {
  winner?: SingleElimWinner | null | undefined;
}

export interface SingleElimEntrant { name: string; dojo: string; seed?: string | number | null | undefined }

/** Placement metadata for bracket position `pos` (1-based). */
export interface SlotInfo<C extends string = string> {
  pos: number; nodeId?: string; round?: string; slot: number; opponent: number | null; court: C | 'A';
  isPlayIn: boolean; order: number; quadrant?: number; half?: number; protectedSeed?: number;
}

/** A single-elimination Match Object as created from a node (field order is part of the saved data). */
export interface SingleElimMatch<C extends string = string> {
  division: string; pool: 'Championship'; white: string; red: string; wdojo: string; rdojo: string;
  position: string; done: boolean; wp: never[]; rp: never[]; type: 'individual'; championship: true;
  singleElim: true; templateNode: true; origin: 'TEMPLATE'; ready: boolean; elimNodeId: string; court: C | 'A'; bracketSlot: number;
}

/** The fields of a match the single-elimination rules read. */
export interface SingleElimMatchLike extends StandingsMatch {
  rdojo: string; wdojo: string; singleElim?: boolean | undefined; elimNodeId?: string | undefined;
}

// ---- Placement -------------------------------------------------------------------------

const BRACKET_SLOT_TEMPLATES: Readonly<Record<number, readonly { slot: number; quadrant: number; protectedSeed?: number }[]>> = Object.freeze({
  4: [{ slot: 1, quadrant: 0, protectedSeed: 1 }, { slot: 2, quadrant: 0 }, { slot: 3, quadrant: 1, protectedSeed: 2 }, { slot: 4, quadrant: 1 }],
  8: [{ slot: 1, quadrant: 0, protectedSeed: 1 }, { slot: 2, quadrant: 0 }, { slot: 3, quadrant: 1, protectedSeed: 4 }, { slot: 4, quadrant: 1 }, { slot: 5, quadrant: 2, protectedSeed: 3 }, { slot: 6, quadrant: 2 }, { slot: 7, quadrant: 3, protectedSeed: 2 }, { slot: 8, quadrant: 3 }],
  16: [{ slot: 1, quadrant: 0, protectedSeed: 1 }, { slot: 2, quadrant: 0 }, { slot: 3, quadrant: 0 }, { slot: 4, quadrant: 0 }, { slot: 5, quadrant: 1, protectedSeed: 4 }, { slot: 6, quadrant: 1 }, { slot: 7, quadrant: 1 }, { slot: 8, quadrant: 1 }, { slot: 9, quadrant: 2, protectedSeed: 3 }, { slot: 10, quadrant: 2 }, { slot: 11, quadrant: 2 }, { slot: 12, quadrant: 2 }, { slot: 13, quadrant: 3, protectedSeed: 2 }, { slot: 14, quadrant: 3 }, { slot: 15, quadrant: 3 }, { slot: 16, quadrant: 3 }],
  32: [{ slot: 1, quadrant: 0, protectedSeed: 1 }, { slot: 9, quadrant: 1, protectedSeed: 4 }, { slot: 17, quadrant: 2, protectedSeed: 3 }, { slot: 25, quadrant: 3, protectedSeed: 2 }],
});

/** Power-of-two bracket size (4, 8, 16 or 32) for `n` entrants. */
export function singleElimBracketSize(n: number): number { return n <= 4 ? 4 : n <= 8 ? 8 : n <= 16 ? 16 : 32; }

/** Quadrant a top-four seed is protected into: 1 top, 4 upper middle, 3 lower middle, 2 bottom. */
export function protectedSeedQuadrant(seed: number): number | null {
  return ({ 1: 0, 2: 3, 3: 2, 4: 1 } as Record<number, number>)[seed] ?? null;
}

/**
 * Bracket slot metadata for placing `n` entrants into the template `nodes` (for `n`):
 * which node and opponent each position meets first, its court, quadrant and half.
 * Placement only: the template layer creates the matches from the placed positions.
 */
export function singleElimSlotInfo<C extends string>(n: number, nodes: readonly SingleElimTemplateNode<C>[]): Record<number, SlotInfo<C>> {
  const raw: Record<number, SlotInfo<C>> = {};
  const note = (side: SingleElimSource | null, node: SingleElimTemplateNode<C>, sideName: 'left' | 'right'): void => {
    if (side && side.team) {
      const opp = sideName === 'left' ? node.right : node.left;
      raw[side.team] = {
        pos: side.team,
        nodeId: node.id,
        round: node.round,
        slot: node.slot || 0,
        opponent: opp && opp.team ? opp.team : null,
        court: node.court || 'A',
        isPlayIn: node.round === 'Play-in',
        order: nodes.findIndex(x => x.id === node.id),
      };
    }
  };
  nodes.forEach(node => { note(node.left, node, 'left'); note(node.right, node, 'right'); });
  for (let i = 1; i <= n; i++) if (!raw[i]) raw[i] = { pos: i, slot: Math.floor((i - 1) / 2), opponent: null, court: 'A', isPlayIn: false, order: i };
  const slots = Object.values(raw).map(x => x.slot || 0);
  const firstRoundSlots = (slots.length ? Math.max(...slots) : 0) + 1;
  const slotsPerQuadrant = Math.max(1, Math.ceil(firstRoundSlots / 4));
  Object.values(raw).forEach(x => {
    x.quadrant = Math.max(0, Math.min(3, Math.floor((x.slot || 0) / slotsPerQuadrant)));
    x.half = x.quadrant < 2 ? 0 : 1;
    const explicit = (BRACKET_SLOT_TEMPLATES[singleElimBracketSize(n)] || []).find(t => t.slot === x.pos);
    if (explicit && explicit.protectedSeed) x.protectedSeed = explicit.protectedSeed;
  });
  return raw;
}

/**
 * Best free position for a seed in quadrant `q`: non-play-in in that quadrant first,
 * preferring a slot whose direct opponent is still empty (seeds do not meet first round).
 */
export function chooseBestSeedSlot(q: number | null, positions: readonly unknown[], info: Readonly<Record<number, SlotInfo>>, allPositions: readonly number[]): number | undefined {
  let candidates = allPositions.filter(pos => !positions[pos - 1] && (info[pos]?.quadrant || 0) === q && !info[pos]?.isPlayIn);
  if (!candidates.length) candidates = allPositions.filter(pos => !positions[pos - 1] && (info[pos]?.quadrant || 0) === q);
  if (!candidates.length) candidates = allPositions.filter(pos => !positions[pos - 1] && !info[pos]?.isPlayIn);
  if (!candidates.length) candidates = allPositions.filter(pos => !positions[pos - 1]);
  candidates.sort((a, b) => {
    const ao = info[a]?.opponent, bo = info[b]?.opponent;
    const aOppFilled = ao && positions[ao - 1] ? 1 : 0, bOppFilled = bo && positions[bo - 1] ? 1 : 0;
    if (aOppFilled !== bOppFilled) return aOppFilled - bOppFilled;
    const aOrder = info[a]?.order ?? a, bOrder = info[b]?.order ?? b;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a - b;
  });
  return candidates[0];
}

const seedNum = (c: SingleElimEntrant): number => parseInt(String(c.seed));

/**
 * Bracket order for `comps` into the template `nodes` for comps.length entrants: seeds
 * 1–4 into protected quadrants, then the rest spread apart by dojo (same opponent,
 * quadrant, half, court). Returns `comps` itself for 0–1 entrants.
 */
export function placeIndividualsForSingleElim<T extends SingleElimEntrant>(comps: T[], nodes: readonly SingleElimTemplateNode[]): T[] {
  const n = comps.length; if (n <= 1) return comps;
  const sorted = [...comps].sort((a, b) => (seedNum(a) || 999) - (seedNum(b) || 999) || a.name.localeCompare(b.name));
  const info = singleElimSlotInfo(n, nodes), positions: (T | null)[] = Array(n).fill(null), used = new Set<T>();
  const allPositions = Object.keys(info).map(Number).sort((a, b) => a - b);

  sorted.filter(c => seedNum(c) >= 1 && seedNum(c) <= 4).sort((a, b) => seedNum(a) - seedNum(b)).forEach(c => {
    const q = protectedSeedQuadrant(seedNum(c));
    const slot = chooseBestSeedSlot(q, positions, info, allPositions);
    if (slot) { positions[slot - 1] = c; used.add(c); }
  });

  const rest = sorted.filter(c => !used.has(c));
  rest.forEach(c => {
    let best: number | null = null, bestScore = Infinity;
    for (const pos of allPositions) {
      if (positions[pos - 1]) continue;
      const si: Partial<SlotInfo> = info[pos] || {}, q = si.quadrant || 0, half = si.half || 0, opp = si.opponent ? positions[si.opponent - 1] : null;
      const group = clubGroup(c.dojo);
      const sameOpp = opp && clubGroup(opp.dojo) === group ? 1000 : 0;
      const sameQ = positions.filter((x, idx) => x && ((info[idx + 1]?.quadrant || 0) === q) && clubGroup(x.dojo) === group).length;
      const sameHalf = positions.filter((x, idx) => x && ((info[idx + 1]?.half || 0) === half) && clubGroup(x.dojo) === group).length;
      const sameCourt = positions.filter((x, idx) => x && (info[idx + 1]?.court || 'A') === (si.court || 'A') && clubGroup(x.dojo) === group).length;
      const qFill = positions.filter((x, idx) => x && ((info[idx + 1]?.quadrant || 0) === q)).length;
      const playInPenalty = si.isPlayIn ? 0.15 : 0;
      const score = sameOpp + sameQ * 20 + sameHalf * 6 + sameCourt * 2 + qFill * 0.25 + playInPenalty + (si.order || pos) * 0.001;
      if (score < bestScore) { bestScore = score; best = pos; }
    }
    if (best) positions[best - 1] = c;
  });

  sorted.forEach(c => { if (!positions.includes(c)) { const i = positions.findIndex(x => !x); if (i >= 0) positions[i] = c; } });
  return positions.filter((x): x is T => Boolean(x));
}

// ---- Nodes, Match Objects and advancement ------------------------------------------------

/** Court of a node's bout: split courts use the node's court (Final on A), else the division's court. */
export function singleElimCourtFor<C extends string>(courtMode: C | 'split', node: SingleElimTemplateNode<C>): C | 'A' {
  return courtMode === 'split' ? (node.round === 'Final' ? 'A' : node.court) : courtMode;
}

/**
 * The division's nodes (template copies with `winner: null`) and one Match Object per
 * node, empty until syncIndividualSingleElim fills the sides.
 */
export function buildIndividualSingleElimMatches<C extends string>(div: string, templateNodes: readonly SingleElimTemplateNode<C>[], courtMode: C | 'split'): { nodes: SingleElimNode<C>[]; matches: SingleElimMatch<C>[] } {
  const nodes = templateNodes.map(n => ({ ...n, winner: null }));
  const matches = nodes.map((node): SingleElimMatch<C> => ({
    division: div, pool: 'Championship', white: '', red: '', wdojo: '', rdojo: '',
    position: node.round, done: false, wp: [], rp: [], type: 'individual', championship: true,
    singleElim: true, templateNode: true, origin: 'TEMPLATE', ready: false, elimNodeId: node.id,
    court: singleElimCourtFor(courtMode, node),
    bracketSlot: node.slot || 0,
  }));
  return { nodes, matches };
}

/** A side's competitor: the placed entrant, or the feeder node's winner once known; null for a bye/undecided. */
export function indivSide(side: SingleElimSource | null | undefined, comps: readonly (SingleElimEntrant | null | undefined)[], nodes: readonly SingleElimNode[]): SingleElimWinner | null {
  if (!side) return null;
  if (side.team) { const c = comps[side.team - 1]; return c ? { name: c.name, dojo: c.dojo } : null; }
  if (side.ref) { const n = nodes.find(x => x.id === side.ref); return n && n.winner ? n.winner : null; }
  return null;
}

/** Field values syncIndividualSingleElim writes on an unfinished bout (keys in legacy write order). */
export interface SingleElimUpdate<C extends string = string> {
  index: number;
  set: { position?: string; court?: C | 'A'; bracketSlot?: number; red?: string; rdojo?: string; white?: string; wdojo?: string; ready?: boolean };
}

/**
 * Plans filling the bracket as data, repeating until nothing changes: a finished bout's
 * winner becomes its node's winner; a node with one entrant and an empty (bye) side
 * advances that entrant (a side fed by an undecided node waits); other unfinished bouts
 * get their sides, round, court and slot. `winners` are assigned onto nodes[index].winner,
 * `updates[i].set` onto matches[index]; `missing` lists node ids without a Match Object
 * (once per pass, as the legacy code logged them).
 */
export function syncIndividualSingleElim<C extends string>(nodes: readonly SingleElimNode<C>[], matches: readonly SingleElimMatchLike[], comps: readonly (SingleElimEntrant | null | undefined)[], courtMode: C | 'split'): { winners: { index: number; winner: SingleElimWinner }[]; updates: SingleElimUpdate<C>[]; missing: string[] } {
  const work = nodes.map(n => ({ ...n }));
  const won = new Set<number>(), sets = new Map<number, SingleElimUpdate<C>['set']>(), missing: string[] = [];
  const setOf = (i: number) => { let s = sets.get(i); if (!s) sets.set(i, s = {}); return s; };
  let changed = true, guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    work.forEach((node, ni) => {
      const index = matches.findIndex(m => m.singleElim && m.elimNodeId === node.id);
      const match = matches[index];
      if (!match) { missing.push(node.id); return; }
      if (match.done) {
        const winner = winnerOf(match);
        if (winner && winner !== 'Hikiwake') {
          const next = winner === match.red ? { name: match.red, dojo: match.rdojo } : { name: match.white, dojo: match.wdojo };
          if (!node.winner || node.winner.name !== next.name) { node.winner = next; won.add(ni); changed = true; }
        }
        return;
      }
      const set = setOf(index);
      if (node.winner) { set.ready = false; return; }
      const red = indivSide(node.left, comps, work), white = indivSide(node.right, comps, work);
      if (red && !white && !node.right?.ref) { node.winner = red; won.add(ni); set.ready = false; changed = true; return; }
      if (white && !red && !node.left?.ref) { node.winner = white; won.add(ni); set.ready = false; changed = true; return; }
      set.position = node.round;
      set.court = singleElimCourtFor(courtMode, node);
      set.bracketSlot = node.slot || 0;
      set.red = red?.name || ''; set.rdojo = red?.dojo || '';
      set.white = white?.name || ''; set.wdojo = white?.dojo || '';
      set.ready = !!(red && white);
    });
  }
  return {
    winners: [...won].sort((a, b) => a - b).map(index => ({ index, winner: work[index]!.winner! })),
    updates: [...sets].sort((a, b) => a[0] - b[0]).map(([index, set]) => ({ index, set })),
    missing,
  };
}

/** Bracket label of a side: entrant name ('Entry n' if missing), feeder winner or 'Winner <node id>', 'BYE', 'TBD'. */
export function sideLabelGeneric(side: SingleElimSource | null | undefined, comps: readonly (SingleElimEntrant | null | undefined)[], nodes: readonly SingleElimNode[]): string {
  if (!side) return 'BYE';
  if (side.team) { const c = comps[side.team - 1]; return c ? c.name : 'Entry ' + side.team; }
  if (side.ref) { const n = nodes.find(x => x.id === side.ref); return n && n.winner ? n.winner.name : 'Winner ' + side.ref; }
  return 'TBD';
}
