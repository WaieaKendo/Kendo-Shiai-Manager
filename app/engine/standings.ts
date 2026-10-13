// Pool standings, tiebreak resolution and winner helpers (moved from
// app/js/12-engine-result-integrity.js, 10-court-scoring-and-history.js,
// 13-engine-standings-and-tiebreaks.js, 14-engine-championship.js and
// 15-engine-pool-standings.js, step 2.3). Pure: callers pass the division's matches,
// the pool, the required places and the court in; nothing here reads `state`.
import { poolMatchPairs } from './pools.ts';

/** The fields of a match the standings and winner rules read. */
export interface StandingsMatch {
  white: string;
  red: string;
  wp?: readonly unknown[] | null | undefined;
  rp?: readonly unknown[] | null | undefined;
  done?: boolean | undefined;
  type?: string | undefined;
  pool?: string | undefined;
  championship?: boolean | undefined;
  tiebreak?: boolean | undefined;
  tiebreakSeries?: number | string | undefined;
  requiresWinner?: boolean | undefined;
  completedResult?: CompletedResultLike | null | undefined;
}

/** A saved result snapshot (only winner/wp/rp are checked). */
export interface CompletedResultLike {
  winner: string;
  wp?: unknown;
  rp?: unknown;
}

/** A pool standings row. Tied rows that went to a tiebreak also carry the tiebreak record. */
export interface StandingRow {
  name: string;
  dojo: string;
  /** Pool record (tiebreak bouts excluded). */
  wins: number;
  pts: number;
  tbWins?: number;
  tbPts?: number;
  seedLocked?: boolean;
}

/** Tiebreak-series record of tied players; base* is their pool record. */
export interface TiebreakStatsRow { name: string; dojo: string; wins: number; pts: number; baseWins: number; basePts: number }

/** Players tied on the same pool record, occupying places start..end (1-based). */
export interface TiedGroup<R extends StandingRow = StandingRow> { start: number; end: number; players: R[] }

export interface StandingsPool {
  label: string;
  players?: readonly { name: string; dojo: string }[] | null | undefined;
}

export interface TiebreakMatch<C extends string = string> {
  division: string; pool: string; white: string; red: string; wdojo: string; rdojo: string;
  done: false; wp: never[]; rp: never[]; tiebreak: true; type: 'individual';
  requiresWinner: boolean; tiebreakSeries: number; tiebreakIndex: number; court: C;
}

type Matches = readonly StandingsMatch[];
const len = (a: readonly unknown[] | null | undefined): number => (a || []).length;
const byRecord = (a: { wins: number; pts: number; name: string }, b: { wins: number; pts: number; name: string }): number =>
  b.wins - a.wins || b.pts - a.pts || a.name.localeCompare(b.name);

// ---- Winner helpers --------------------------------------------------------------

/** Championship individual bouts, representative playoffs, exhibitions and flagged bouts need a winner. */
export function matchRequiresWinner(m: { championship?: boolean | undefined; type?: string | undefined; requiresWinner?: boolean | undefined } | null | undefined): boolean {
  if (!m) return false;
  if ((m.championship && m.type === 'individual') || m.type === 'teamPlayoff' || m.type === 'exhibition') return true;
  return m.requiresWinner === true;
}

export function completedResultWinnerValid(m: StandingsMatch | null | undefined, winner: string | null | undefined): boolean {
  if (!m || !winner) return false;
  if (winner === m.white || winner === m.red) return true;
  return winner === 'Hikiwake' && !matchRequiresWinner(m);
}

/** The saved snapshot names a valid winner that agrees with its own points. */
export function completedResultSnapshotValid(m: StandingsMatch | null | undefined, snapshot: CompletedResultLike | null | undefined): snapshot is CompletedResultLike & { wp: unknown[]; rp: unknown[] } {
  if (!snapshot || !completedResultWinnerValid(m, snapshot.winner) || !Array.isArray(snapshot.wp) || !Array.isArray(snapshot.rp)) return false;
  const wp = snapshot.wp.length, rp = snapshot.rp.length;
  if (snapshot.winner === m!.white) return wp > rp;
  if (snapshot.winner === m!.red) return rp > wp;
  return snapshot.winner === 'Hikiwake' && wp === rp;
}

/** Winner's name from the points, or 'Hikiwake'. */
export function scoreWinnerOf(m: StandingsMatch | null | undefined): string {
  if (!m) return 'Hikiwake';
  const wp = len(m.wp), rp = len(m.rp);
  if (wp > rp) return m.white; if (rp > wp) return m.red; return 'Hikiwake';
}

/** Winner's name (the saved result when it is valid), or 'Hikiwake'. */
export function winnerOf(m: StandingsMatch | null | undefined): string {
  const snapshot = m?.done ? m.completedResult : null;
  if (completedResultSnapshotValid(m, snapshot)) return snapshot.winner;
  return scoreWinnerOf(m);
}

// ---- Standings ---------------------------------------------------------------------

/** An unfinished tiebreak bout exists in the pool. */
export function pendingTiebreak(matches: Matches, poolLabel: string): boolean {
  return matches.some(x => x.pool === poolLabel && x.tiebreak && !x.done);
}

/** Pool record only (wins, then points, then name); [] when there is no pool. */
export function initialPoolStandings(pool: StandingsPool | null | undefined, matches: Matches): StandingRow[] {
  if (!pool) return [];
  const rows: StandingRow[] = (pool.players || []).map(p => ({ name: p.name, dojo: p.dojo, wins: 0, pts: 0 }));
  matches.filter(m => m.pool === pool.label && m.done && !m.tiebreak).forEach(m => {
    const w = rows.find(r => r.name === m.white), r = rows.find(x => x.name === m.red);
    if (w) w.pts += len(m.wp); if (r) r.pts += len(m.rp);
    const win = winnerOf(m); if (win === m.white && w) w.wins++; if (win === m.red && r) r.wins++;
  });
  return rows.sort(byRecord);
}

function tiebreakStats(players: readonly StandingRow[], done: Matches): TiebreakStatsRow[] {
  const stats = players.map(x => ({ name: x.name, dojo: x.dojo, wins: 0, pts: 0, baseWins: x.wins, basePts: x.pts }));
  done.forEach(x => {
    const w = stats.find(r => r.name === x.white), r = stats.find(y => y.name === x.red);
    if (w) w.pts += len(x.wp); if (r) r.pts += len(x.rp);
    const win = winnerOf(x); if (win === x.white && w) w.wins++; if (win === x.red && r) r.wins++;
  });
  return stats.sort(byRecord);
}

/** Record of `players` over every completed individual tiebreak between them in the pool. */
export function tiebreakStatsForPlayers<M extends StandingsMatch>(matches: readonly M[], poolLabel: string, players: readonly StandingRow[]): { stats: TiebreakStatsRow[]; done: M[] } {
  const names = new Set(players.map(x => x.name));
  const done = matches.filter(x => x.pool === poolLabel && x.done && x.tiebreak && x.type === 'individual' && names.has(x.white) && names.has(x.red));
  return { stats: tiebreakStats(players, done), done };
}

/** Record of `players` over the completed bouts of one tiebreak series. */
export function tiebreakSeriesStats<M extends StandingsMatch>(matches: readonly M[], poolLabel: string, players: readonly StandingRow[], series: number): { stats: TiebreakStatsRow[]; matches: M[] } {
  const names = new Set(players.map(x => x.name));
  const done = matches.filter(x => x.pool === poolLabel && x.done && x.tiebreak && x.type === 'individual' && Number(x.tiebreakSeries || 1) === Number(series) && names.has(x.white) && names.has(x.red));
  return { stats: tiebreakStats(players, done), matches: done };
}

/**
 * Orders a tied group by its tiebreak series, one series after another (docs/TOURNAMENT_MANAGEMENT.md,
 * v3.12.4: "resolves any determinable seeds"). Each series orders all of its players by their series
 * record (wins, then points): a player alone on a record is placed (`locked`), players level on one
 * stay tied for the next series. F26: players behind a pair still tied after a series are ordered by
 * that series too (they kept the pool order, by name, and no tiebreak was made for them).
 * `unresolved`: the first players still tied (the next tiebreak; while a series is unplayed, its
 * players); `locked`: every placed player; `ordered`: everyone in place order.
 */
export function resolveTiebreakBaseGroup<R extends StandingRow>(matches: Matches, poolLabel: string, target: TiedGroup<R>): { locked: TiebreakStatsRow[]; unresolved: R[]; ordered: (R | TiebreakStatsRow)[]; lastStats: TiebreakStatsRow[] } {
  const base = [...target.players];
  const baseByName = new Map(base.map(x => [x.name, x]));
  const all = matches.filter(x => x.pool === poolLabel && x.tiebreak && x.type === 'individual' && baseByName.has(x.white) && baseByName.has(x.red));
  const series = [...new Set(all.map(x => Number(x.tiebreakSeries || 1)))].sort((a, b) => a - b);
  // The group as blocks in place order: a placed player alone (locked), or players still level.
  type Block = { players: (R | TiebreakStatsRow)[]; placed: boolean };
  let blocks: Block[] = [{ players: base, placed: false }];
  const isPlaced = (name: string) => blocks.some(b => b.placed && b.players[0]!.name === name);
  let pending: R[] | null = null; let lastStats: TiebreakStatsRow[] = [];
  for (const seriesId of series) {
    const participantNames = [...new Set(all.filter(x => Number(x.tiebreakSeries || 1) === seriesId).flatMap(x => [x.white, x.red]))];
    const participants = participantNames.map(n => baseByName.get(n)).filter((x): x is R => !!x).filter(x => !isPlaced(x.name));
    if (participants.length < 2) continue;
    const names = new Set(participants.map(x => x.name));
    const at = blocks.findIndex(b => b.players.some(x => names.has(x.name)));
    const result = tiebreakSeriesStats(matches, poolLabel, participants, seriesId);
    if (result.matches.length === 0 || result.matches.some(x => !x.done)) {
      // Not played yet: these players are the open tiebreak, listed first in their block (in the
      // series' order), the block's other players after them.
      pending = participants;
      const block = blocks[at]!;
      block.players = [...participants, ...block.players.filter(x => !names.has(x.name))];
      break;
    }
    lastStats = result.stats;
    // F26: the whole series splits the block, not only up to its first tie: a player alone on a
    // series record is placed, players level on one stay a block (in the series' order). Block
    // members who did not play this series stay a block right after them.
    const split: Block[] = [];
    for (let i = 0; i < result.stats.length;) {
      const row = (k: number): TiebreakStatsRow => result.stats[k]!;
      let j = i + 1;
      while (j < result.stats.length && row(j).wins === row(i).wins && row(j).pts === row(i).pts) j++;
      split.push(j - i === 1 ? { players: [row(i)], placed: true } : { players: result.stats.slice(i, j).map(x => baseByName.get(x.name)!), placed: false });
      i = j;
    }
    const rest = blocks[at]!.players.filter(x => !names.has(x.name));
    if (rest.length) split.push({ players: rest, placed: false });
    const without = (b: Block): Block => ({ ...b, players: b.players.filter(x => !names.has(x.name)) });
    blocks = [...blocks.slice(0, at).map(without), ...split, ...blocks.slice(at + 1).map(without)].filter(b => b.players.length);
  }
  const locked = blocks.filter(b => b.placed).map(b => b.players[0] as TiebreakStatsRow);
  const open = blocks.find(b => !b.placed && b.players.length > 1);
  const unresolved: R[] = pending || (open ? open.players as R[] : blocks.length === 1 && !blocks[0]!.placed ? [...base] : []);
  return { locked, unresolved, ordered: blocks.flatMap(b => b.players), lastStats };
}

/** Players still tied for a place that matters (up to reqSeed), or null. */
export function unresolvedRequiredTiebreakGroup<R extends StandingRow>(matches: Matches, poolLabel: string, target: TiedGroup<R>, reqSeed: number): R[] | null {
  const resolution = resolveTiebreakBaseGroup(matches, poolLabel, target);
  // The first place the still-tied players can take (after every player placed ahead of them).
  const first = resolution.unresolved[0];
  const unresolvedStart = target.start + (first ? Math.max(0, resolution.ordered.findIndex(x => x.name === first.name)) : resolution.locked.length);
  if (unresolvedStart > reqSeed) return null;
  if (resolution.unresolved.length > 1) return resolution.unresolved;
  if (!resolution.locked.length && !resolution.unresolved.length) return target.players;
  return null;
}

/**
 * Pool standings; tied groups for a required place (1..requiredPlaces) are ordered by
 * their tiebreaks. Rows keep the POOL record in wins/pts and the tiebreak record in tbWins/tbPts.
 */
export function poolStandings(pool: StandingsPool | null | undefined, matches: Matches, requiredPlaces: number): StandingRow[] {
  if (!pool) return [];
  const base = initialPoolStandings(pool, matches); if (!base.length) return [];
  const rebuilt: StandingRow[] = [];
  for (let i = 0; i < base.length;) {
    let j = i + 1;
    while (j < base.length && base[j]!.wins === base[i]!.wins && base[j]!.pts === base[i]!.pts) j++;
    const group = base.slice(i, j);
    if (group.length > 1 && (i + 1) <= requiredPlaces) {
      const resolved = resolveTiebreakBaseGroup(matches, pool.label, { start: i + 1, end: j, players: group });
      const statsByName = new Map(tiebreakStatsForPlayers(matches, pool.label, group).stats.map(x => [x.name, x]));
      // resolved.locked holds tiebreak-series stats; report the pool record (from `group`) as wins/pts
      // and keep the tiebreak record separately in tbWins/tbPts.
      const poolRecordByName = new Map(group.map(x => [x.name, x]));
      rebuilt.push(...resolved.ordered.map(x => {
        const st = statsByName.get(x.name), rec = poolRecordByName.get(x.name) || x;
        return { name: x.name, dojo: x.dojo, wins: rec.wins, pts: rec.pts, tbWins: st?.wins || 0, tbPts: st?.pts || 0, seedLocked: resolved.locked.some(l => l.name === x.name) };
      }));
    } else rebuilt.push(...group);
    i = j;
  }
  return rebuilt;
}

/**
 * How many places of each pool feed the championship (pool label -> places). A
 * pool-only division (pass its single pool) awards 1st–3rd from standings, so it needs
 * min(3, entrants); otherwise the highest place of each pool named in the labels ('A2').
 */
export function requiredSeedPlaces(poolOnlyPool: StandingsPool | null | undefined, championshipLabels: readonly unknown[]): Record<string, number> {
  if (poolOnlyPool) return { [poolOnlyPool.label]: Math.min(3, poolOnlyPool.players?.length || 0) };
  const req: Record<string, number> = {};
  championshipLabels.flat().forEach(label => {
    const m = String(label).match(/^([A-Z])(\d)$/);
    if (m) { const p = parseInt(m[2]!, 10); req[m[1]!] = Math.max(req[m[1]!] || 0, p); }
  });
  return req;
}

// ---- Tiebreak match objects --------------------------------------------------------

/** A new individual pool tiebreak bout (field order is part of the saved data). */
export function makeTiebreakMatch<C extends string>(division: string, pool: string, a: { name: string; dojo: string }, b: { name: string; dojo: string }, requiresWinner: boolean, tiebreakSeries: number, tiebreakIndex: number, court: C): TiebreakMatch<C> {
  return { division, pool, white: a.name, red: b.name, wdojo: a.dojo, rdojo: b.dojo, done: false, wp: [], rp: [], tiebreak: true, type: 'individual', requiresWinner: !!requiresWinner, tiebreakSeries, tiebreakIndex, court };
}

/** Tiebreak bouts for a tied group, as the next series of the pool (a winner is required for 2 players). */
export function tiebreakMatchesForGroup<C extends string>(matches: Matches, div: string, pool: string, players: readonly { name: string; dojo: string }[], court: C): TiebreakMatch<C>[] {
  const pairs = poolMatchPairs(players.length);
  const requiresWinner = players.length === 2;
  const existing = matches.filter(m => m.pool === pool && m.tiebreak && m.type === 'individual');
  const series = (existing.reduce((max, m) => Math.max(max, Number(m.tiebreakSeries || 1)), 0) || 0) + 1;
  return pairs.map(([i, j], index) => makeTiebreakMatch(div, pool, players[i]!, players[j]!, requiresWinner, series, index, court));
}
