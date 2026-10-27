// Match predicates and labels (issue #136 step 1b): moved from app/js/02-court-match-order.js,
// 13-engine-standings-and-tiebreaks.js, 18-sync-state-and-rebase.js and
// 30-setup-header-and-director.js. Each reads only the match it is given.

/** The Match Object fields these helpers read; any of them may be missing. */
export interface HelperMatch {
  type?: unknown; position?: unknown; pool?: unknown; done?: unknown; templateNode?: unknown; ready?: unknown;
  white?: unknown; red?: unknown; tiebreak?: unknown; championship?: unknown; court?: unknown; division?: unknown;
}

/** Whether `m` is a team bout (a position bout, a team playoff or a kachinuki bout); a missing match comes back as is. */
export function isTeamMatch(m: HelperMatch | null | undefined) {
  return m && (m.type === 'teamPosition' || m.type === 'teamPlayoff' || m.type === 'kachinuki');
}

/** Sort order of a team bout's position (unknown positions sort at 5). */
export function teamPositionOrder(m: HelperMatch): number {
  const p = String(m.position || '').toLowerCase();
  const order: Record<string, number> = { 'senpo': 0, 'jiho': 1, 'chuken': 2, 'fukusho': 3, 'taisho': 4, 'kachinuki': 0, 'team playoff': 9, 'kachinuki playoff': 9 };
  return order[p] ?? 5;
}

/** Whether an individual match can be played now: open, both sides known, template node ready. */
export function individualMatchReady(m: HelperMatch | null | undefined): boolean {
  if (!m || m.done) return false;
  if (m.templateNode && !m.ready) return false;
  return !!(m.white && m.red);
}

/** Whether `match` is an individual pool tiebreak (not a championship match). */
export function isIndividualPoolTiebreakMatch(match: HelperMatch | null | undefined): boolean {
  return !!(match && match.type === 'individual' && match.tiebreak && !match.championship && match.pool);
}

/** The label the director screen shows for a match's pool or round. */
export function directorMatchLabel(m: HelperMatch | null | undefined): unknown {
  if (!m) return '';
  if (m.type === 'teamPosition' || m.type === 'teamPlayoff' || m.type === 'kachinuki') return m.position || m.pool || '';
  return m.pool === 'Championship' ? (m.position || 'Championship') : (m.pool ? `Pool ${m.pool}` : '');
}

/** Whether `m` is played on court `c` in `targetState` (its own court, else the division's court mode). */
export function matchBelongsToCourtInState(
  targetState: { divisionCourts?: Record<string, unknown> | null | undefined } | null | undefined,
  m: HelperMatch | null | undefined,
  c: unknown,
): boolean {
  if (!m) return false;
  if (m.court) return m.court === c;
  const mode = targetState?.divisionCourts?.[m.division as string] || 'A';
  return mode === 'split' ? c === 'A' : mode === c;
}

