// Kachinuki (winner-stays) team bouts, moved from app/js/07-engine-team-bracket.js and
// 16-court-context-and-pool-editing.js (step 2.6). Pure: callers pass the pairing's
// matches in; the next bout is returned as data and the legacy wrapper inserts it.
import { winnerOf } from './standings.ts';
import type { StandingsMatch } from './standings.ts';

/** The fields of a kachinuki / representative bout the rules read. */
export interface KachinukiMatchLike extends StandingsMatch {
  division: string; teamWhite: string; teamRed: string; teamPair: string; court: string;
  tiebreak?: boolean | undefined; lineupW?: string[] | undefined; lineupR?: string[] | undefined;
  wIndex?: number | undefined; rIndex?: number | undefined;
  teamNodeId?: string | undefined; bracketSlot?: number | undefined;
}

/** What kachinukiPairWinner reads of a pairing's bouts. */
export interface KachinukiBoutLike extends StandingsMatch {
  teamWhite?: string | undefined; teamRed?: string | undefined; wIndex?: number | undefined; rIndex?: number | undefined;
}

export interface KachinukiTransition { wi: number; ri: number; whiteExhausted: boolean; redExhausted: boolean }

/** Next lineup indexes after a kachinuki bout: the winner stays, a draw eliminates both (except a last player). */
export function kachinukiTransitionState(m: Pick<KachinukiMatchLike, 'wp' | 'rp' | 'wIndex' | 'rIndex'>): KachinukiTransition {
  const wp = (m.wp || []).length, rp = (m.rp || []).length;
  let wi = m.wIndex as number, ri = m.rIndex as number;
  if (wp > rp) { ri++; }
  else if (rp > wp) { wi++; }
  else {
    if (wi === 2 && ri < 2) { ri++; }
    else if (ri === 2 && wi < 2) { wi++; }
    else { wi++; ri++; }
  }
  return { wi, ri, whiteExhausted: wi > 2, redExhausted: ri > 2 };
}

/**
 * Winning team of a kachinuki pairing from its bouts (as teamPairMatches returns them):
 * the representative playoff's winner if there is one, else the side whose lineup is
 * not exhausted after the last finished bout; null while undecided.
 */
export function kachinukiPairWinner(ms: readonly KachinukiBoutLike[]): string | null {
  const playoff = ms.find(x => x.type === 'teamPlayoff');
  if (playoff) {
    if (!playoff.done) return null;
    const winner = winnerOf(playoff);
    if (winner === playoff.white) return playoff.teamWhite as string;
    if (winner === playoff.red) return playoff.teamRed as string;
    return null;
  }
  const bouts = ms.filter(x => x.type === 'kachinuki' && x.done);
  if (!bouts.length) return null;
  const last = bouts[bouts.length - 1]!, terminal = kachinukiTransitionState(last);
  if (terminal.whiteExhausted && !terminal.redExhausted) return last.teamRed as string;
  if (terminal.redExhausted && !terminal.whiteExhausted) return last.teamWhite as string;
  return null;
}

export interface KachinukiPlayoff {
  division: string; pool: string | undefined; white: string; red: string; wdojo: string; rdojo: string; teamWhite: string; teamRed: string;
  position: 'Kachinuki Playoff'; teamPair: string; done: false; wp: never[]; rp: never[]; tiebreak: true; type: 'teamPlayoff';
  court: string; teamNodeId: string | undefined; bracketSlot: number | undefined;
}
export interface KachinukiContinuation {
  division: string; pool: string | undefined; white: string; red: string; wdojo: string; rdojo: string; teamWhite: string; teamRed: string;
  position: 'Kachinuki'; teamPair: string; done: false; wp: never[]; rp: never[]; type: 'kachinuki'; court: string;
  lineupW: string[] | undefined; lineupR: string[] | undefined; wIndex: number; rIndex: number;
  teamNodeId: string | undefined; bracketSlot: number | undefined; origin: 'TEMPLATE_CONTINUATION';
}
export type KachinukiNext = { kind: 'playoff'; match: KachinukiPlayoff } | { kind: 'continuation'; match: KachinukiContinuation };

/**
 * After a kachinuki bout: the next bout (winner stays; placed right after `m`), a
 * representative playoff when both lineups are exhausted, or null (pairing decided,
 * or `m` is not a regular kachinuki bout).
 */
export function maybeCreateKachinukiNext(m: KachinukiMatchLike | null | undefined): KachinukiNext | null {
  if (!m || m.type !== 'kachinuki' || m.tiebreak) return null;
  const div = m.division;
  const { wi, ri, whiteExhausted, redExhausted } = kachinukiTransitionState(m);
  if (whiteExhausted && redExhausted) {
    return { kind: 'playoff', match: { division: div, pool: m.pool, white: `${m.teamWhite} Representative`, red: `${m.teamRed} Representative`, wdojo: m.teamWhite, rdojo: m.teamRed, teamWhite: m.teamWhite, teamRed: m.teamRed, position: 'Kachinuki Playoff', teamPair: m.teamPair, done: false, wp: [], rp: [], tiebreak: true, type: 'teamPlayoff', court: m.court, teamNodeId: m.teamNodeId, bracketSlot: m.bracketSlot } };
  }
  if (!whiteExhausted && !redExhausted) {
    return { kind: 'continuation', match: { division: div, pool: m.pool, white: m.lineupW![wi]!, red: m.lineupR![ri]!, wdojo: m.teamWhite, rdojo: m.teamRed, teamWhite: m.teamWhite, teamRed: m.teamRed, position: 'Kachinuki', teamPair: m.teamPair, done: false, wp: [], rp: [], type: 'kachinuki', court: m.court, lineupW: m.lineupW, lineupR: m.lineupR, wIndex: wi, rIndex: ri, teamNodeId: m.teamNodeId, bracketSlot: m.bracketSlot, origin: 'TEMPLATE_CONTINUATION' } };
  }
  return null;
}
