// Team events, moved from app/js/05-engine-team-matches.js, 07-engine-team-bracket.js,
// 09-results-and-awards.js and 13-engine-standings-and-tiebreaks.js (step 2.6): team
// positions, bout generation (round robin and single elimination), the frozen bracket
// templates (also used by individual single elimination), bracket advancement, pairing
// winners, the representative playoff, round-robin standings and placements. Pure:
// callers pass the division's matches, teams, nodes and settings in; bracket advancement
// and new bouts come back as data for the legacy wrappers to apply to `state`.
// Match and node objects keep the legacy field order (saved data and goldens compare JSON).
import { kachinukiPairWinner } from './kachinuki.ts';
import { tiebreakBlocks, unresolvedRequiredTiebreakGroup } from './standings.ts';
import type { StandingsMatch, StandingRow } from './standings.ts';
import { poolMatchPairs } from './pools.ts';
import type { TournamentSettings } from './settings.ts';

export type TeamPosition = 'senpo' | 'jiho' | 'chuken' | 'fukusho' | 'taisho';

/** A registered team: its name and the member in each position. */
export type TeamEntry = { team: string } & Partial<Record<TeamPosition, string | null | undefined>>;

/** Where a bracket side comes from: team number `team` (1-based registration order) or an earlier node's winner. */
export interface TeamBracketSource { team?: number | undefined; ref?: string | undefined }

export interface TeamBracketNode<C extends string = string> {
  id: string; round: string; court: C; left: TeamBracketSource | null; right: TeamBracketSource | null; slot: number; winner?: string | null | undefined;
}

/** A position bout of a team pairing (field order is part of the saved data). */
export interface TeamPositionMatch {
  division: string; pool: string; white: string; red: string; wdojo: string; rdojo: string; teamWhite: string; teamRed: string;
  position: string; teamPair: string; done: false; wp: never[]; rp: never[]; type: 'teamPosition'; origin: 'TEMPLATE'; court: string;
  teamNodeId?: string; bracketSlot?: number;
}
/** The first kachinuki bout of a pairing, carrying both lineups. */
export interface KachinukiStartMatch {
  division: string; pool: string; white: string; red: string; wdojo: string; rdojo: string; teamWhite: string; teamRed: string;
  position: 'Kachinuki'; teamPair: string; done: false; wp: never[]; rp: never[]; type: 'kachinuki'; origin: 'TEMPLATE'; court: string;
  lineupW: string[]; lineupR: string[]; wIndex: 0; rIndex: 0; teamNodeId?: string; bracketSlot?: number;
}
export type TeamBout = TeamPositionMatch | KachinukiStartMatch;

/** The fields of a match the team rules read. */
export interface TeamMatchLike extends StandingsMatch {
  teamPair?: string | undefined; teamWhite?: string | undefined; teamRed?: string | undefined; teamNodeId?: string | undefined;
  /** A team round robin's daihyosen (F27): not a pairing of the round robin. */
  roundRobinTiebreak?: boolean | undefined;
}

// ---- Positions and bouts ---------------------------------------------------------------

/** Member positions of the team format, in bout order. */
export function teamSlots(teamFormat: TournamentSettings['teamFormat'] | null | undefined): TeamPosition[] {
  const fmt = teamFormat || '5-Person Team';
  return fmt === '3-Person Team' || fmt === 'Kachinuki' ? ['senpo', 'chuken', 'taisho'] : ['senpo', 'jiho', 'chuken', 'fukusho', 'taisho'];
}

/** 'senpo' -> 'Senpo' (unknown keys unchanged). */
export function slotLabel(k: string): string {
  return ({ senpo: 'Senpo', jiho: 'Jiho', chuken: 'Chuken', fukusho: 'Fukusho', taisho: 'Taisho' } as Record<string, string>)[k] || k;
}

/** A pairing's bouts: one kachinuki bout with both lineups, or one per position. `a` is White, `b` Red. */
export function teamPairMatchObjects(div: string, a: TeamEntry, b: TeamEntry, pool: string, pairId: string, court: string, matchFmt: string, slots: readonly TeamPosition[]): TeamBout[] {
  if (matchFmt === 'Kachinuki') {
    const keys: TeamPosition[] = ['senpo', 'chuken', 'taisho'];
    const lineupW = keys.map(k => a[k] || `${a.team} ${slotLabel(k)}`), lineupR = keys.map(k => b[k] || `${b.team} ${slotLabel(k)}`);
    return [{ division: div, pool, white: lineupW[0]!, red: lineupR[0]!, wdojo: a.team, rdojo: b.team, teamWhite: a.team, teamRed: b.team, position: 'Kachinuki', teamPair: pairId, done: false, wp: [], rp: [], type: 'kachinuki', origin: 'TEMPLATE', court, lineupW, lineupR, wIndex: 0, rIndex: 0 }];
  }
  return slots.map((k): TeamPositionMatch => ({ division: div, pool, white: a[k] || `${a.team} ${slotLabel(k)}`, red: b[k] || `${b.team} ${slotLabel(k)}`, wdojo: a.team, rdojo: b.team, teamWhite: a.team, teamRed: b.team, position: slotLabel(k), teamPair: pairId, done: false, wp: [], rp: [], type: 'teamPosition', origin: 'TEMPLATE', court }));
}

/**
 * Team event bouts. Round robin: every pairing i<j (pair id `i-j`, pool 'A', courts
 * alternating A/B by i+j). Single elimination: `singleElim` and no bouts; the caller
 * stores the bracket template and fills it with syncTeamBracket.
 */
export function buildTeamMatches(div: string, teams: readonly TeamEntry[], settings: Pick<TournamentSettings, 'teamFormat' | 'teamTournamentFormat'>): { singleElim: boolean; matches: TeamBout[] } {
  const fmt = settings.teamTournamentFormat || 'Single Elimination';
  if (fmt === 'Single Elimination') return { singleElim: true, matches: [] };
  const m: TeamBout[] = [], slots = teamSlots(settings.teamFormat), matchFmt = settings.teamFormat || '5-Person Team';
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
    m.push(...teamPairMatchObjects(div, teams[i]!, teams[j]!, 'A', `${i}-${j}`, (i + j) % 2 === 0 ? 'A' : 'B', matchFmt, slots));
  }
  return { singleElim: false, matches: m };
}

// ---- Bracket templates -----------------------------------------------------------------

/** Bracket side: team number n (1-based registration order). */
export function teamSource(n: number): TeamBracketSource { return { team: n }; }
/** Bracket side: winner of node id. */
export function winnerSource(id: string): TeamBracketSource { return { ref: id }; }
export function teamNode<C extends string>(id: string, round: string, court: C, left: TeamBracketSource | null, right: TeamBracketSource | null, slot: number): TeamBracketNode<C> {
  return { id, round, court, left, right, slot, winner: null };
}

type Court = 'A' | 'B';
type PlayIn = readonly [Court, number, number, number, string];
type Pair = readonly [number | string, number | string];
const LARGE_SPECS: Readonly<Record<number, { P: readonly PlayIn[]; R: readonly Pair[] }>> = {
  16: { P: [], R: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16]] },
  17: { P: [['B', 16, 17, 8, 'White']], R: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 'P1']] },
  18: { P: [['A', 15, 16, 4, 'White'], ['B', 17, 18, 8, 'White']], R: [[1, 2], [3, 4], [5, 6], [7, 'P1'], [8, 9], [10, 11], [12, 13], [14, 'P2']] },
  19: { P: [['A', 14, 15, 4, 'White'], ['B', 16, 17, 7, 'White'], ['B', 18, 19, 8, 'White']], R: [[1, 2], [3, 4], [5, 6], [7, 'P1'], [8, 9], [10, 11], [12, 'P2'], [13, 'P3']] },
  20: { P: [['A', 13, 14, 3, 'White'], ['A', 15, 16, 4, 'White'], ['B', 17, 18, 7, 'White'], ['B', 19, 20, 8, 'White']], R: [[1, 2], [3, 4], [5, 'P1'], [6, 'P2'], [7, 8], [9, 10], [11, 'P3'], [12, 'P4']] },
  21: { P: [['A', 12, 13, 3, 'White'], ['A', 14, 15, 4, 'White'], ['B', 16, 17, 6, 'White'], ['B', 18, 19, 7, 'White'], ['B', 20, 21, 8, 'White']], R: [[1, 2], [3, 4], [5, 'P1'], [6, 'P2'], [7, 8], [9, 'P3'], [10, 'P4'], [11, 'P5']] },
  22: { P: [['A', 11, 12, 2, 'White'], ['A', 13, 14, 3, 'White'], ['A', 15, 16, 4, 'White'], ['B', 17, 18, 6, 'White'], ['B', 19, 20, 7, 'White'], ['B', 21, 22, 8, 'White']], R: [[1, 2], [3, 'P1'], [4, 'P2'], [5, 'P3'], [6, 7], [8, 'P4'], [9, 'P5'], [10, 'P6']] },
  23: { P: [['A', 10, 11, 1, 'White'], ['A', 12, 13, 2, 'White'], ['A', 14, 15, 3, 'White'], ['A', 16, 17, 4, 'White'], ['B', 18, 19, 6, 'White'], ['B', 20, 21, 7, 'White'], ['B', 22, 23, 8, 'White']], R: [[1, 'P1'], [2, 'P2'], [3, 'P3'], [4, 'P4'], [5, 6], [7, 'P5'], [8, 'P6'], [9, 'P7']] },
  24: { P: [['A', 9, 10, 1, 'White'], ['A', 11, 12, 2, 'White'], ['A', 13, 14, 3, 'White'], ['A', 15, 16, 4, 'White'], ['B', 17, 18, 5, 'White'], ['B', 19, 20, 6, 'White'], ['B', 21, 22, 7, 'White'], ['B', 23, 24, 8, 'White']], R: [[1, 'P1'], [2, 'P2'], [3, 'P3'], [4, 'P4'], [5, 'P5'], [6, 'P6'], [7, 'P7'], [8, 'P8']] },
  25: { P: [['A', 8, 9, 1, 'White'], ['A', 10, 11, 2, 'White'], ['A', 12, 13, 3, 'White'], ['A', 14, 15, 4, 'Red'], ['A', 16, 17, 4, 'White'], ['B', 18, 19, 5, 'White'], ['B', 20, 21, 6, 'White'], ['B', 22, 23, 7, 'White'], ['B', 24, 25, 8, 'White']], R: [[1, 'P1'], [2, 'P2'], [3, 'P3'], ['P4', 'P5'], [4, 'P6'], [5, 'P7'], [6, 'P8'], [7, 'P9']] },
  26: { P: [['A', 7, 8, 1, 'White'], ['A', 9, 10, 2, 'White'], ['A', 11, 12, 3, 'White'], ['A', 13, 14, 4, 'Red'], ['A', 15, 16, 4, 'White'], ['B', 17, 18, 5, 'White'], ['B', 19, 20, 6, 'White'], ['B', 21, 22, 7, 'White'], ['B', 23, 24, 8, 'Red'], ['B', 25, 26, 8, 'White']], R: [[1, 'P1'], [2, 'P2'], [3, 'P3'], ['P4', 'P5'], [4, 'P6'], [5, 'P7'], [6, 'P8'], ['P9', 'P10']] },
  27: { P: [['A', 6, 7, 1, 'White'], ['A', 8, 9, 2, 'White'], ['A', 10, 11, 3, 'Red'], ['A', 12, 13, 3, 'White'], ['A', 14, 15, 4, 'Red'], ['A', 16, 17, 4, 'White'], ['B', 18, 19, 5, 'White'], ['B', 20, 21, 6, 'White'], ['B', 22, 23, 7, 'White'], ['B', 24, 25, 8, 'Red'], ['B', 26, 27, 8, 'White']], R: [[1, 'P1'], [2, 'P2'], ['P3', 'P4'], ['P5', 'P6'], [3, 'P7'], [4, 'P8'], [5, 'P9'], ['P10', 'P11']] },
  28: { P: [['A', 5, 6, 1, 'White'], ['A', 7, 8, 2, 'White'], ['A', 9, 10, 3, 'Red'], ['A', 11, 12, 3, 'White'], ['A', 13, 14, 4, 'Red'], ['A', 15, 16, 4, 'White'], ['B', 17, 18, 5, 'White'], ['B', 19, 20, 6, 'White'], ['B', 21, 22, 7, 'Red'], ['B', 23, 24, 7, 'White'], ['B', 25, 26, 8, 'Red'], ['B', 27, 28, 8, 'White']], R: [[1, 'P1'], [2, 'P2'], ['P3', 'P4'], ['P5', 'P6'], [3, 'P7'], [4, 'P8'], ['P9', 'P10'], ['P11', 'P12']] },
  29: { P: [['A', 4, 5, 1, 'White'], ['A', 6, 7, 2, 'Red'], ['A', 8, 9, 2, 'White'], ['A', 10, 11, 3, 'Red'], ['A', 12, 13, 3, 'White'], ['A', 14, 15, 4, 'Red'], ['A', 16, 17, 4, 'White'], ['B', 18, 19, 5, 'White'], ['B', 20, 21, 6, 'White'], ['B', 22, 23, 7, 'Red'], ['B', 24, 25, 7, 'White'], ['B', 26, 27, 8, 'Red'], ['B', 28, 29, 8, 'White']], R: [[1, 'P1'], ['P2', 'P3'], ['P4', 'P5'], ['P6', 'P7'], [2, 'P8'], [3, 'P9'], ['P10', 'P11'], ['P12', 'P13']] },
  30: { P: [['A', 3, 4, 1, 'White'], ['A', 5, 6, 2, 'Red'], ['A', 7, 8, 2, 'White'], ['A', 9, 10, 3, 'Red'], ['A', 11, 12, 3, 'White'], ['A', 13, 14, 4, 'Red'], ['A', 15, 16, 4, 'White'], ['B', 17, 18, 5, 'White'], ['B', 19, 20, 6, 'Red'], ['B', 21, 22, 6, 'White'], ['B', 23, 24, 7, 'Red'], ['B', 25, 26, 7, 'White'], ['B', 27, 28, 8, 'Red'], ['B', 29, 30, 8, 'White']], R: [[1, 'P1'], ['P2', 'P3'], ['P4', 'P5'], ['P6', 'P7'], [2, 'P8'], ['P9', 'P10'], ['P11', 'P12'], ['P13', 'P14']] },
  31: { P: [['A', 2, 3, 1, 'White'], ['A', 4, 5, 2, 'Red'], ['A', 6, 7, 2, 'White'], ['A', 8, 9, 3, 'Red'], ['A', 10, 11, 3, 'White'], ['A', 12, 13, 4, 'Red'], ['A', 14, 15, 4, 'White'], ['B', 16, 17, 5, 'Red'], ['B', 18, 19, 5, 'White'], ['B', 20, 21, 6, 'Red'], ['B', 22, 23, 6, 'White'], ['B', 24, 25, 7, 'Red'], ['B', 26, 27, 7, 'White'], ['B', 28, 29, 8, 'Red'], ['B', 30, 31, 8, 'White']], R: [[1, 'P1'], ['P2', 'P3'], ['P4', 'P5'], ['P6', 'P7'], ['P8', 'P9'], ['P10', 'P11'], ['P12', 'P13'], ['P14', 'P15']] },
  32: { P: [], R: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]] },
};

/**
 * Frozen bracket template for n teams (Team Single-Elimination Template Library v1.0; also
 * used for individual single elimination). Red listed first, White second; top half Court A,
 * bottom half Court B, Final Court A. [] for 0–1 teams, null when n is not supported (2–32).
 */
export function teamBracketNodesForCount(n: number): TeamBracketNode<Court>[] | null {
  const T = teamSource, W = winnerSource, N = teamNode<Court>;
  if (n <= 1) return [];
  if (n === 2) return [N('F', 'Final', 'A', T(1), T(2), 0)];
  if (n === 3) return [N('SF1', 'Semifinal', 'A', T(1), T(2), 0), N('F', 'Final', 'A', W('SF1'), T(3), 0)];
  if (n === 4) return [N('SF1', 'Semifinal', 'A', T(1), T(2), 0), N('SF2', 'Semifinal', 'B', T(3), T(4), 1), N('F', 'Final', 'A', W('SF1'), W('SF2'), 0)];
  if (n === 5) return [N('QF1', 'Quarterfinal', 'A', T(1), T(2), 0), N('QF2', 'Quarterfinal', 'B', T(3), T(4), 1), N('SF1', 'Semifinal', 'A', W('QF1'), null, 0), N('SF2', 'Semifinal', 'B', W('QF2'), T(5), 1), N('F', 'Final', 'A', W('SF1'), W('SF2'), 0)];
  if (n === 6) return [N('QF1', 'Quarterfinal', 'A', T(1), T(2), 0), N('QF2', 'Quarterfinal', 'A', T(3), T(4), 1), N('QF3', 'Quarterfinal', 'B', T(5), T(6), 2), N('SF1', 'Semifinal', 'A', W('QF1'), W('QF2'), 0), N('SF2', 'Semifinal', 'B', W('QF3'), null, 1), N('F', 'Final', 'A', W('SF1'), W('SF2'), 0)];
  if (n === 7) return [N('QF1', 'Quarterfinal', 'A', T(1), T(2), 0), N('QF2', 'Quarterfinal', 'A', T(3), T(4), 1), N('QF3', 'Quarterfinal', 'B', T(5), T(6), 2), N('SF1', 'Semifinal', 'A', W('QF1'), W('QF2'), 0), N('SF2', 'Semifinal', 'B', W('QF3'), T(7), 1), N('F', 'Final', 'A', W('SF1'), W('SF2'), 0)];
  if (n === 8) return [N('QF1', 'Quarterfinal', 'A', T(1), T(2), 0), N('QF2', 'Quarterfinal', 'A', T(3), T(4), 1), N('QF3', 'Quarterfinal', 'B', T(5), T(6), 2), N('QF4', 'Quarterfinal', 'B', T(7), T(8), 3), N('SF1', 'Semifinal', 'A', W('QF1'), W('QF2'), 0), N('SF2', 'Semifinal', 'B', W('QF3'), W('QF4'), 1), N('F', 'Final', 'A', W('SF1'), W('SF2'), 0)];
  const tail = [N('SF1', 'Semifinal', 'A', W('QF1'), W('QF2'), 0), N('SF2', 'Semifinal', 'B', W('QF3'), W('QF4'), 1), N('F', 'Final', 'A', W('SF1'), W('SF2'), 0)];
  if (n === 9) return [N('P1', 'Play-in', 'B', T(8), T(9), 3), N('QF1', 'Quarterfinal', 'A', T(1), T(2), 0), N('QF2', 'Quarterfinal', 'A', T(3), T(4), 1), N('QF3', 'Quarterfinal', 'B', T(5), T(6), 2), N('QF4', 'Quarterfinal', 'B', T(7), W('P1'), 3), ...tail];
  if (n === 10) return [N('P1', 'Play-in', 'A', T(7), T(8), 1), N('P2', 'Play-in', 'B', T(9), T(10), 3), N('QF1', 'Quarterfinal', 'A', T(1), T(2), 0), N('QF2', 'Quarterfinal', 'A', W('P1'), T(3), 1), N('QF3', 'Quarterfinal', 'B', T(4), T(5), 2), N('QF4', 'Quarterfinal', 'B', T(6), W('P2'), 3), ...tail];
  if (n === 11) return [N('P1', 'Play-in', 'A', T(6), T(7), 0), N('P2', 'Play-in', 'A', T(8), T(9), 1), N('P3', 'Play-in', 'B', T(10), T(11), 3), N('QF1', 'Quarterfinal', 'A', T(1), W('P1'), 0), N('QF2', 'Quarterfinal', 'A', T(2), W('P2'), 1), N('QF3', 'Quarterfinal', 'B', T(3), T(4), 2), N('QF4', 'Quarterfinal', 'B', T(5), W('P3'), 3), ...tail];
  if (n === 12) return [N('P1', 'Play-in', 'A', T(5), T(6), 0), N('P2', 'Play-in', 'A', T(7), T(8), 1), N('P3', 'Play-in', 'B', T(9), T(10), 2), N('P4', 'Play-in', 'B', T(11), T(12), 3), N('QF1', 'Quarterfinal', 'A', T(1), W('P1'), 0), N('QF2', 'Quarterfinal', 'A', T(2), W('P2'), 1), N('QF3', 'Quarterfinal', 'B', T(3), W('P3'), 2), N('QF4', 'Quarterfinal', 'B', T(4), W('P4'), 3), ...tail];
  if (n === 13) return [N('P1', 'Play-in', 'A', T(4), T(5), 0), N('P2', 'Play-in', 'A', T(6), T(7), 1), N('P3', 'Play-in', 'A', T(8), T(9), 1), N('P4', 'Play-in', 'B', T(10), T(11), 2), N('P5', 'Play-in', 'B', T(12), T(13), 3), N('QF1', 'Quarterfinal', 'A', T(1), W('P1'), 0), N('QF2', 'Quarterfinal', 'A', W('P2'), W('P3'), 1), N('QF3', 'Quarterfinal', 'B', T(2), W('P4'), 2), N('QF4', 'Quarterfinal', 'B', T(3), W('P5'), 3), ...tail];
  if (n === 14) return [N('P1', 'Play-in', 'A', T(3), T(4), 0), N('P2', 'Play-in', 'A', T(5), T(6), 1), N('P3', 'Play-in', 'A', T(7), T(8), 1), N('P4', 'Play-in', 'B', T(9), T(10), 2), N('P5', 'Play-in', 'B', T(11), T(12), 3), N('P6', 'Play-in', 'B', T(13), T(14), 3), N('QF1', 'Quarterfinal', 'A', T(1), W('P1'), 0), N('QF2', 'Quarterfinal', 'A', W('P2'), W('P3'), 1), N('QF3', 'Quarterfinal', 'B', T(2), W('P4'), 2), N('QF4', 'Quarterfinal', 'B', W('P5'), W('P6'), 3), ...tail];
  if (n === 15) return [N('P1', 'Play-in', 'A', T(1), T(2), 0), N('P2', 'Play-in', 'A', T(3), T(4), 0), N('P3', 'Play-in', 'A', T(5), T(6), 1), N('P4', 'Play-in', 'A', T(7), T(8), 1), N('P5', 'Play-in', 'B', T(9), T(10), 2), N('P6', 'Play-in', 'B', T(11), T(12), 3), N('P7', 'Play-in', 'B', T(13), T(14), 3), N('QF1', 'Quarterfinal', 'A', W('P1'), W('P2'), 0), N('QF2', 'Quarterfinal', 'A', W('P3'), W('P4'), 1), N('QF3', 'Quarterfinal', 'B', T(15), W('P5'), 2), N('QF4', 'Quarterfinal', 'B', W('P6'), W('P7'), 3), ...tail];
  if (n >= 16 && n <= 32) {
    const spec = LARGE_SPECS[n] || LARGE_SPECS[32]!, nodes: TeamBracketNode<Court>[] = [];
    spec.P.forEach((p, i) => nodes.push(N('P' + (i + 1), 'Play-in', p[0], T(p[1]), T(p[2]), p[3] - 1)));
    const firstRound = n === 32 ? 'Round of 32' : 'Round of 16', prefix = n === 32 ? 'R32' : 'R16';
    const side = (x: number | string) => (typeof x === 'number' ? T(x) : W(x));
    spec.R.forEach((r, i) => nodes.push(N(prefix + '-' + (i + 1), firstRound, i < Math.ceil(spec.R.length / 2) ? 'A' : 'B', side(r[0]), side(r[1]), i)));
    if (n === 32) for (let i = 1; i <= 8; i++) nodes.push(N('R16-' + i, 'Round of 16', i <= 4 ? 'A' : 'B', W('R32-' + (2 * i - 1)), W('R32-' + (2 * i)), i - 1));
    for (let i = 1; i <= 4; i++) nodes.push(N('QF' + i, 'Quarterfinal', i <= 2 ? 'A' : 'B', W('R16-' + (2 * i - 1)), W('R16-' + (2 * i)), i - 1));
    nodes.push(...tail);
    return nodes;
  }
  return null;
}

// ---- Pairings --------------------------------------------------------------------------

const isTeamBout = (x: TeamMatchLike) => x.type === 'teamPosition' || x.type === 'teamPlayoff' || x.type === 'kachinuki';

/** A pairing's bouts (positions, representative playoff, kachinuki) among the division's matches. */
export function teamPairMatches<M extends TeamMatchLike>(matches: readonly M[], pair: string): M[] {
  return matches.filter(x => x.teamPair === pair && isTeamBout(x));
}
/** A pairing's position bouts only. */
export function teamPositionMatches<M extends TeamMatchLike>(matches: readonly M[], pair: string): M[] {
  return matches.filter(x => x.teamPair === pair && x.type === 'teamPosition');
}

export interface TeamPairSummary<M extends TeamMatchLike = TeamMatchLike> {
  teamWhite: string; teamRed: string; wWins: number; rWins: number; wPts: number; rPts: number; done: number; total: number; matches: M[];
}
/** Bout wins and points of each side over a pairing's finished bouts. */
export function teamPairSummary<M extends TeamMatchLike>(matches: readonly M[], pair: string): TeamPairSummary<M> {
  const ms = teamPairMatches(matches, pair), first: Partial<TeamMatchLike> = ms[0] || {};
  let wWins = 0, rWins = 0, wPts = 0, rPts = 0, done = 0;
  ms.forEach(x => {
    if (x.done) { done++; const wp = (x.wp || []).length, rp = (x.rp || []).length; wPts += wp; rPts += rp; if (wp > rp) wWins++; else if (rp > wp) rWins++; }
  });
  return { teamWhite: first.teamWhite || '', teamRed: first.teamRed || '', wWins, rWins, wPts, rPts, done, total: ms.length, matches: ms };
}

/**
 * Winning team of a pairing, or null while undecided: kachinuki by lineups (or its
 * playoff); otherwise bout wins, then points, then the representative playoff (whose
 * bout win counts in the summary).
 */
export function teamWinner(matches: readonly TeamMatchLike[], pair: string): string | null {
  const ms = teamPairMatches(matches, pair);
  if (ms.some(x => x.type === 'kachinuki')) return kachinukiPairWinner(ms);
  const s = teamPairSummary(matches, pair);
  if (s.wWins > s.rWins) return s.teamWhite; if (s.rWins > s.wWins) return s.teamRed;
  if (s.wPts > s.rPts) return s.teamWhite; if (s.rPts > s.wPts) return s.teamRed;
  return null;
}

/** Distinct pairing ids in bout order (a round robin's daihyosen bouts are not pairings, F27). */
export function teamPairIds(matches: readonly TeamMatchLike[]): string[] {
  return [...new Set(matches.filter(m => m.teamPair && isTeamBout(m) && !m.roundRobinTiebreak).map(m => m.teamPair as string))];
}

// ---- Bracket advancement ---------------------------------------------------------------

/** The team on a bracket side: team number n, or the decided winner of the referenced node. */
export function teamSideTeam<T extends TeamEntry>(side: TeamBracketSource | null | undefined, teams: readonly (T | null | undefined)[], nodes: readonly TeamBracketNode[]): T | null {
  if (!side) return null;
  if (side.team) return teams[side.team - 1] || null;
  if (side.ref) { const n = nodes.find(x => x.id === side.ref); return n && n.winner ? teams.find(t => t && t.team === n.winner) || null : null; }
  return null;
}
export function nodeHasMatch(matches: readonly TeamMatchLike[], node: Pick<TeamBracketNode, 'id'>): boolean { return matches.some(m => m.teamNodeId === node.id); }
export function nodePairId(node: Pick<TeamBracketNode, 'id'>): string { return 'node-' + node.id; }

/**
 * Plans filling the team bracket as data, repeating until nothing changes: a node with
 * one team and an empty (bye) side advances it (a side fed by an undecided node waits);
 * a node with both teams gets its bouts (right side White, left Red; pool = round,
 * pair `node-<id>`, the node's court and slot); a node whose bouts are all done gets
 * its pairing winner. `winners` go onto nodes[index].winner and `added` is appended to
 * `matches`. Pairing results are read from `current` (the division's saved matches)
 * when given, else from `matches` plus the bouts added so far, as the legacy code did.
 */
export function syncTeamBracket(div: string, nodes: readonly TeamBracketNode[], matches: readonly TeamMatchLike[], teams: readonly (TeamEntry | null | undefined)[], teamFormat: TournamentSettings['teamFormat'] | null | undefined, current?: readonly TeamMatchLike[]): { winners: { index: number; winner: string }[]; added: TeamBout[] } {
  const work = nodes.map(n => ({ ...n })), all: TeamMatchLike[] = [...matches], added: TeamBout[] = [], won: { index: number; winner: string }[] = [];
  const slots = teamSlots(teamFormat), matchFmt = teamFormat || '5-Person Team';
  const results = () => current || all;
  let changed = true, guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    work.forEach((node, index) => {
      if (node.winner) return;
      const a = teamSideTeam(node.left, teams, work), b = teamSideTeam(node.right, teams, work);
      const win = (winner: string) => { node.winner = winner; won.push({ index, winner }); changed = true; };
      if (a && !b && !node.right?.ref) { win(a.team); return; }
      if (b && !a && !node.left?.ref) { win(b.team); return; }
      if (a && b) {
        if (!nodeHasMatch(all, node)) {
          const bouts = teamPairMatchObjects(div, b, a, node.round, nodePairId(node), node.court, matchFmt, slots);
          bouts.forEach(x => { x.teamNodeId = node.id; x.bracketSlot = node.slot || 0; });
          all.push(...bouts); added.push(...bouts); changed = true;
        } else {
          const pair = nodePairId(node), ms = teamPairMatches(results(), pair);
          if (ms.length && ms.every(x => x.done)) { const w = teamWinner(results(), pair); if (w) win(w); }
        }
      }
    });
  }
  return { winners: won, added };
}

// ---- Representative playoff ------------------------------------------------------------

export interface TeamPlayoffSource extends TeamMatchLike {
  division: string; court?: string | undefined; tiebreak?: boolean | undefined; bracketSlot?: number | undefined;
}
export interface TeamPlayoff {
  division: string; pool: string | undefined; white: string; red: string; wdojo: string; rdojo: string; teamWhite: string; teamRed: string;
  position: 'Team Playoff'; teamPair: string | undefined; done: false; wp: never[]; rp: never[]; tiebreak: true; type: 'teamPlayoff';
  court: string; teamNodeId: string | undefined; bracketSlot: number | undefined; parentTeamMatch: true;
}
export type TeamRepresentativeType = 'TEAM_3_PERSON_REPRESENTATIVE' | 'TEAM_5_PERSON_REPRESENTATIVE';

/**
 * After a team position bout: once all of the pairing's position bouts are done and the
 * sides are level on bout wins and points, the representative playoff to add after
 * `anchor` (the pairing's last position bout), unless one already exists; else null.
 */
export function maybeCreateTeamTiebreak<M extends TeamPlayoffSource>(m: M | null | undefined, matches: readonly M[], teamFormat: TournamentSettings['teamFormat'] | null | undefined): { anchor: M; playoff: TeamPlayoff; dynamicType: TeamRepresentativeType } | null {
  if (!m || m.type !== 'teamPosition' || m.tiebreak) return null;
  const div = m.division, pair = m.teamPair as string;
  const ms = teamPositionMatches(matches, pair);
  if (!ms.length || !ms.every(x => x.done)) return null;
  if (matches.some(x => x.tiebreak && x.type === 'teamPlayoff' && x.teamPair === pair)) return null;
  const s = teamPairSummary(matches, pair);
  if (!(s.wWins === s.rWins && s.wPts === s.rPts)) return null;
  const anchor = ms[ms.length - 1] || m;
  const playoff: TeamPlayoff = { division: div, pool: m.pool, white: `${s.teamWhite} Representative`, red: `${s.teamRed} Representative`, wdojo: s.teamWhite, rdojo: s.teamRed, teamWhite: s.teamWhite, teamRed: s.teamRed, position: 'Team Playoff', teamPair: pair, done: false, wp: [], rp: [], tiebreak: true, type: 'teamPlayoff', court: anchor.court || m.court || 'A', teamNodeId: anchor.teamNodeId, bracketSlot: anchor.bracketSlot, parentTeamMatch: true };
  const dynamicType: TeamRepresentativeType = (teamFormat || '5-Person Team') === '3-Person Team' ? 'TEAM_3_PERSON_REPRESENTATIVE' : 'TEAM_5_PERSON_REPRESENTATIVE';
  return { anchor, playoff, dynamicType };
}

// ---- Round-robin standings and placements ----------------------------------------------

export interface TeamStandingRow { name: string; played: number; wins: number; losses: number; matchWins: number; pts: number; rank?: number; nameFallback?: boolean }

/** A pairing counts once all its bouts are done and it has a winner. */
export function teamRoundRobinPairResolved(matches: readonly TeamMatchLike[], pair: string): boolean {
  const ms = teamPairMatches(matches, pair);
  return !!(ms.length && ms.every(m => m.done) && teamWinner(matches, pair));
}

/** Places of a team round robin that a daihyosen decides when teams are level (1st–3rd, the medals; F27): the default. */
export const TEAM_ROUND_ROBIN_COUNTED_PLACES = 3;

/**
 * D2 (owner decision, #29): a daihyosen only for the places that get an award under Setup's team
 * award mode: "Champion only" (top1) 1st; "Champion + Runner-up" (top2, the default) 1st–2nd;
 * "Champion + Runner-up + 3rd place(s)" (dual3) 1st–3rd. Level teams below share the rank.
 */
export function teamRoundRobinCountedPlaces(mode: string | null | undefined): number {
  return mode === 'top1' ? 1 : mode === 'dual3' ? 3 : 2;
}
// The daihyosen bouts as individual tiebreak bouts between team names, for the tiebreak engine.
const DAIHYOSEN_POOL = 'Daihyosen';
function daihyosenAsTiebreaks(matches: readonly TeamMatchLike[]): StandingsMatch[] {
  return matches.filter(m => m.roundRobinTiebreak && m.type === 'teamPlayoff').map(m => ({
    pool: DAIHYOSEN_POOL, type: 'individual', tiebreak: true, requiresWinner: true, tiebreakSeries: m.tiebreakSeries,
    white: m.teamWhite || '', red: m.teamRed || '', wp: m.wp, rp: m.rp, done: m.done,
  }));
}
const byTeamRecord = (a: TeamStandingRow, b: TeamStandingRow): number =>
  b.wins - a.wins || b.matchWins - a.matchWins || b.pts - a.pts || a.name.localeCompare(b.name);
const levelTeams = (a: TeamStandingRow, b: TeamStandingRow): boolean => a.wins === b.wins && a.matchWins === b.matchWins && a.pts === b.pts;
// Teams level on the record as tied groups (start..end, 1-based), in table order.
function levelTeamGroups(sorted: readonly TeamStandingRow[]): { start: number; end: number; rows: TeamStandingRow[] }[] {
  const groups: { start: number; end: number; rows: TeamStandingRow[] }[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && levelTeams(sorted[j]!, sorted[i]!)) j++;
    groups.push({ start: i + 1, end: j, rows: sorted.slice(i, j) });
    i = j;
  }
  return groups;
}
const asStandingRow = (r: TeamStandingRow): StandingRow => ({ name: r.name, dojo: '', wins: r.wins, pts: r.pts });

/**
 * Round-robin table: every team (eligible teams first, then any other team in the
 * matches), resolved pairings only. F27 (the owners' rule, WKC style): ranked by team
 * match wins, then individual bout wins (`matchWins`), then points (ippon) scored; teams
 * still level on all three for a counted place (1st–3rd) are ordered by their daihyosen
 * (one-point representative bouts, teamRoundRobinTiebreakPlan()); level teams below the
 * counted places, or before their daihyosen is decided, share the rank and are listed by
 * name (`nameFallback`).
 */
export function teamStandings(matches: readonly TeamMatchLike[], teams: readonly TeamEntry[], countedPlaces: number = TEAM_ROUND_ROBIN_COUNTED_PLACES): TeamStandingRow[] {
  const base = teamRecordRows(matches, teams).sort(byTeamRecord);
  const places = Math.min(countedPlaces, base.length), tiebreaks = daihyosenAsTiebreaks(matches);
  const out: TeamStandingRow[] = [];
  for (const group of levelTeamGroups(base)) {
    const byName = new Map(group.rows.map(r => [r.name, r]));
    const blocks = group.rows.length > 1 && group.start <= places
      ? tiebreakBlocks(tiebreaks, DAIHYOSEN_POOL, { start: group.start, end: group.end, players: group.rows.map(asStandingRow) }).blocks.map(b => b.players.map(p => byName.get(p.name)!))
      : [group.rows];
    for (const block of blocks) {
      const rank = out.length + 1;
      [...block].sort((a, b) => a.name.localeCompare(b.name)).forEach(row => { row.rank = rank; row.nameFallback = block.length > 1; out.push(row); });
    }
  }
  return out;
}

/**
 * F27: after a team round-robin bout, the daihyosen to add when every pairing is decided and
 * teams are level on team wins, bout wins and points for a counted place (1st–3rd): one
 * representative bout per pair of the level teams (one-point, a winner required), as the next
 * series; a pair still level after it (a circle of three) plays another series. Only one group
 * at a time, the highest first; none while a daihyosen bout is unplayed. Null otherwise (also
 * for a bracket, which has its own representative playoffs).
 */
export function teamRoundRobinTiebreakPlan<M extends TeamPlayoffSource>(m: M | null | undefined, matches: readonly M[], teams: readonly TeamEntry[], teamFormat: TournamentSettings['teamFormat'] | null | undefined, countedPlaces: number = TEAM_ROUND_ROBIN_COUNTED_PLACES): { anchor: M; bouts: TeamDaihyosen[]; dynamicType: TeamRoundRobinTiebreakType } | null {
  if (!m || !m.done || !isTeamBout(m) || matches.some(x => x.teamNodeId)) return null;
  const progress = teamRoundRobinProgress(matches);
  if (!progress.total || progress.complete < progress.total) return null;
  if (matches.some(x => x.roundRobinTiebreak && !x.done)) return null;
  const base = teamRecordRows(matches, teams).sort(byTeamRecord);
  const places = Math.min(countedPlaces, base.length), tiebreaks = daihyosenAsTiebreaks(matches);
  for (const group of levelTeamGroups(base)) {
    if (group.rows.length < 2 || group.start > places) continue;
    const level = unresolvedRequiredTiebreakGroup(tiebreaks, DAIHYOSEN_POOL, { start: group.start, end: group.end, players: group.rows.map(asStandingRow) }, places);
    if (!level || level.length < 2) continue;
    const series = tiebreaks.reduce((max, x) => Math.max(max, Number(x.tiebreakSeries || 1)), 0) + 1;
    const court = m.court || 'A';
    const bouts = poolMatchPairs(level.length).map(([i, j], index): TeamDaihyosen => {
      const a = level[i]!.name, b = level[j]!.name;
      return { division: m.division, pool: m.pool, white: `${a} Representative`, red: `${b} Representative`, wdojo: a, rdojo: b, teamWhite: a, teamRed: b,
        position: 'Daihyosen', teamPair: `daihyosen-${series}-${index}`, done: false, wp: [], rp: [], tiebreak: true, type: 'teamPlayoff', court,
        roundRobinTiebreak: true, requiresWinner: true, tiebreakSeries: series, tiebreakIndex: index };
    });
    const fmt = teamFormat || '5-Person Team';
    const dynamicType: TeamRoundRobinTiebreakType = fmt === 'Kachinuki' ? 'KACHINUKI_ROUND_ROBIN_TIEBREAK' : fmt === '3-Person Team' ? 'TEAM_3_PERSON_ROUND_ROBIN_TIEBREAK' : 'TEAM_5_PERSON_ROUND_ROBIN_TIEBREAK';
    return { anchor: matches[matches.length - 1] || m, bouts, dynamicType };
  }
  return null;
}

/** A team round robin's daihyosen bout (F27; field order is part of the saved data). */
export interface TeamDaihyosen {
  division: string; pool: string | undefined; white: string; red: string; wdojo: string; rdojo: string; teamWhite: string; teamRed: string;
  position: 'Daihyosen'; teamPair: string; done: false; wp: never[]; rp: never[]; tiebreak: true; type: 'teamPlayoff'; court: string;
  roundRobinTiebreak: true; requiresWinner: true; tiebreakSeries: number; tiebreakIndex: number;
}
export type TeamRoundRobinTiebreakType = 'TEAM_3_PERSON_ROUND_ROBIN_TIEBREAK' | 'TEAM_5_PERSON_ROUND_ROBIN_TIEBREAK' | 'KACHINUKI_ROUND_ROBIN_TIEBREAK';

/** Every team's round-robin record over its resolved pairings (unsorted, rank not set). */
function teamRecordRows(matches: readonly TeamMatchLike[], teams: readonly TeamEntry[]): TeamStandingRow[] {
  const rows: Record<string, TeamStandingRow> = {};
  const ensure = (name: string | undefined) => {
    if (name && !rows[name]) rows[name] = { name, played: 0, wins: 0, losses: 0, matchWins: 0, pts: 0 };
    return name ? rows[name] : undefined;
  };
  teams.forEach(team => ensure(team.team));
  matches.forEach(match => { ensure(match.teamWhite); ensure(match.teamRed); });
  teamPairIds(matches).forEach(pair => {
    const summary = teamPairSummary(matches, pair);
    const white = ensure(summary.teamWhite), red = ensure(summary.teamRed);
    if (!white || !red || !teamRoundRobinPairResolved(matches, pair)) return;
    const winner = teamWinner(matches, pair);
    white.played++; red.played++;
    white.matchWins += summary.wWins; red.matchWins += summary.rWins;
    white.pts += summary.wPts; red.pts += summary.rPts;
    if (winner === white.name) { white.wins++; red.losses++; }
    else if (winner === red.name) { red.wins++; white.losses++; }
  });
  return Object.values(rows);
}

/** Resolved and total round-robin pairings. */
export function teamRoundRobinProgress(matches: readonly TeamMatchLike[]): { complete: number; total: number } {
  const pairs = teamPairIds(matches), complete = pairs.filter(pair => teamRoundRobinPairResolved(matches, pair)).length;
  return { complete, total: pairs.length };
}

export interface TeamPlacements { first: string; second: string; thirds: string[]; standings?: TeamStandingRow[]; roundRobin: boolean }

/** Round-robin placements from the standings, once the division is complete; else null. */
export function teamRoundRobinPlacements(complete: boolean, matches: readonly TeamMatchLike[], teams: readonly TeamEntry[], countedPlaces: number = TEAM_ROUND_ROBIN_COUNTED_PLACES): TeamPlacements | null {
  if (!complete) return null;
  const rows = teamStandings(matches, teams, countedPlaces);
  if (!rows.length) return null;
  return { first: rows[0]?.name || '', second: rows[1]?.name || '', thirds: rows[2] ? [rows[2].name] : [], standings: rows, roundRobin: true };
}

/** Team name on a bracket side ('' while unknown). */
export function teamNodeSideName(side: TeamBracketSource | null | undefined, teams: readonly (TeamEntry | null | undefined)[], nodes: readonly TeamBracketNode[]): string {
  if (!side) return '';
  if (side.team) { const t = teams[side.team - 1]; return t && t.team ? t.team : ''; }
  if (side.ref) { const n = nodes.find(x => x.id === side.ref); return n && n.winner ? n.winner : ''; }
  return '';
}

/** Single-elimination placements: Final winner and loser, and both Semifinal losers; null until the Final is decided. */
export function teamFinalPlacements(nodes: readonly TeamBracketNode[], teams: readonly (TeamEntry | null | undefined)[]): TeamPlacements | null {
  const final = nodes.find(n => n.round === 'Final') || nodes[nodes.length - 1];
  if (!final || !final.winner) return null;
  const left = teamNodeSideName(final.left, teams, nodes), right = teamNodeSideName(final.right, teams, nodes);
  const second = final.winner === left ? right : left;
  const thirds = nodes.filter(n => n.round === 'Semifinal' && n.winner).map(n => {
    const l = teamNodeSideName(n.left, teams, nodes), r = teamNodeSideName(n.right, teams, nodes);
    return n.winner === l ? r : l;
  }).filter(Boolean);
  return { first: final.winner, second, thirds, roundRobin: false };
}
