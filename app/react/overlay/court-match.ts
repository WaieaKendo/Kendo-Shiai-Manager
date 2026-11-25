// Which match a court is playing now, and which comes next: the same answer the TV
// display gives (app/js/26-tv-display.js buildTV3ViewModel -> courtCurrentMatch() in
// 11-court-queue-and-views.js, findNextForCourt() and tvUpcomingMatches() in
// 25-live-scores.js), ported as a pure function over a TournamentState.
//
// The legacy functions sort state.allMatches[division] in place while they search
// (sortTeamMatches, sortIndividualDivisionMatches) and write the court position back
// into state. Here nothing is mutated: `DivisionView` keeps a sorted copy per division
// once the legacy code would have sorted it, so the same index lands on the same match.
//
// Known simplifications (labels only, never which match is chosen):
// - championshipRoundIndex(): the legacy order starts at the division's first round;
//   here a fixed Round of 32 -> Final order is used, which sorts real brackets the same.
// - championshipLabels(): before generation the legacy code sizes the bracket from the
//   pools; here only the generated bracket (state.brackets) is used.
// - winnerOf(): a finished feeding match's winner is read from its completedResult.

export interface UpcomingMatch {
  white: string;
  red: string;
  /** Team matches: the round/position of the pairing, e.g. 'Semifinal'. */
  label: string;
}

export interface CourtMatch {
  court: Court;
  division: string;
  match: Match;
  teamMode: boolean;
  /** Up to two, as the TV's "Upcoming Matches". */
  upcoming: UpcomingMatch[];
}

type State = Partial<TournamentState>;

const isTeamMatch = (m: Match | undefined | null): boolean =>
  !!m && (m.type === 'teamPosition' || m.type === 'teamPlayoff' || m.type === 'kachinuki');

function matchBelongsToCourt(state: State, m: Match | undefined, court: Court): boolean {
  if (!m) return false;
  if (m.court) return m.court === court;
  const mode = state.divisionCourts?.[m.division] || 'A';
  return mode === 'split' ? court === 'A' : mode === court;
}

const individualMatchReady = (m: Match | undefined): boolean =>
  !!m && !m.done && !(m.templateNode && !m.ready) && !!(m.white && m.red);

const eliminationFinalDone = (list: Match[]): boolean => list.some(m => m && m.singleElim && m.position === 'Final' && m.done);

const TEAM_POSITION_ORDER: Record<string, number> = {
  senpo: 0, jiho: 1, chuken: 2, fukusho: 3, taisho: 4, kachinuki: 0, 'team playoff': 9, 'kachinuki playoff': 9,
};
const teamPositionOrder = (m: Match): number => TEAM_POSITION_ORDER[String(m.position || '').toLowerCase()] ?? 5;

const ROUND_ORDER = ['Round of 32', 'Round of 16', 'Quarterfinal', 'Semifinal', 'Final'];
const roundIndex = (round: string | undefined): number => {
  const i = ROUND_ORDER.indexOf(String(round || ''));
  return i < 0 ? 999 : i;
};

const firstRoundName = (n: number): string => n >= 8 ? 'Round of 16' : n >= 4 ? 'Quarterfinal' : n >= 2 ? 'Semifinal' : 'Final';
const PREVIOUS_ROUND: Record<string, string> = { Quarterfinal: 'Round of 16', Semifinal: 'Quarterfinal', Final: 'Semifinal' };
const previousRoundName = (round: string): string | null => PREVIOUS_ROUND[round] ?? null;

const indexById = (nodes: { id: string }[] | undefined): Map<string, number> =>
  new Map((nodes || []).map((n, i) => [n.id, i]));

/** sortTeamMatches(): team bouts by bracket node (or pairing), then position; others after. */
function sortTeam(state: State, division: string, list: Match[]): Match[] {
  if (!list.some(isTeamMatch)) return list;
  const nodeOrder = indexById(state.teamBracketNodes?.[division]);
  const pairOrder = new Map<string, number>();
  for (const m of list) if (isTeamMatch(m) && m.teamPair && !pairOrder.has(m.teamPair)) pairOrder.set(m.teamPair, pairOrder.size);
  const key = (m: Match): number => {
    let node = m.teamNodeId !== undefined ? nodeOrder.get(m.teamNodeId) : undefined;
    if (node === undefined && m.teamPair) {
      const sibling = list.find(x => x.teamPair === m.teamPair && x.teamNodeId && nodeOrder.has(x.teamNodeId));
      if (sibling?.teamNodeId) node = nodeOrder.get(sibling.teamNodeId);
    }
    if (node === undefined && m.teamPair && pairOrder.has(m.teamPair)) return (pairOrder.get(m.teamPair) ?? 0) * 100 + teamPositionOrder(m);
    return (node ?? 999) * 100 + teamPositionOrder(m);
  };
  return [...list].sort((a, b) => {
    const at = isTeamMatch(a), bt = isTeamMatch(b);
    if (at && bt) return key(a) - key(b);
    return at === bt ? 0 : at ? -1 : 1;
  });
}

/** sortIndividualDivisionMatches(): pool matches in order, then the bracket by round. */
function sortIndividual(state: State, division: string, list: Match[]): Match[] {
  const elimOrder = indexById(state.singleElimNodes?.[division]);
  return list.map((m, i) => ({ m, i })).sort((a, b) => {
    const ac = a.m.championship ? 1 : 0, bc = b.m.championship ? 1 : 0;
    if (ac !== bc) return ac - bc;
    if (!ac) return a.i - b.i;
    if (a.m.singleElim || b.m.singleElim) {
      return (elimOrder.get(a.m.elimNodeId || '') ?? 9999) - (elimOrder.get(b.m.elimNodeId || '') ?? 9999);
    }
    const ar = roundIndex(a.m.position), br = roundIndex(b.m.position);
    if (ar !== br) return ar - br;
    const as = Number(a.m.bracketSlot ?? 9999), bs = Number(b.m.bracketSlot ?? 9999);
    return as !== bs ? as - bs : a.i - b.i;
  }).map(x => x.m);
}

/** The match arrays as the legacy code would see them after its in-place sorts. */
class DivisionView {
  private readonly sorted = new Map<string, Match[]>();
  private readonly state: State;
  constructor(state: State) { this.state = state; }
  list(division: string): Match[] {
    return this.sorted.get(division) ?? (this.state.allMatches?.[division] || []);
  }
  /** Sorts like the legacy code (teams if any team bout, else individual) and remembers it. */
  sort(division: string): Match[] {
    const list = this.list(division);
    const out = list.some(isTeamMatch) ? sortTeam(this.state, division, list) : sortIndividual(this.state, division, list);
    this.sorted.set(division, out);
    return out;
  }
  sortTeamsOnly(division: string): Match[] {
    const list = this.list(division);
    if (!list.some(isTeamMatch)) return list;
    const out = sortTeam(this.state, division, list);
    this.sorted.set(division, out);
    return out;
  }
}

/** findNextForCourt(): the first ready match for the court in the (sorted) division. */
function findNextForCourt(state: State, view: DivisionView, court: Court, preferred: string | null): { division: string; index: number } {
  const first = (d: string) => {
    const list = view.sort(d);
    const index = list.findIndex(m => individualMatchReady(m) && matchBelongsToCourt(state, m, court));
    return { division: d, index: index >= 0 ? index : list.length };
  };
  if (preferred) return first(preferred);
  for (const d of Object.keys(state.allMatches || {}).filter(Boolean)) {
    const found = first(d);
    if (found.index < view.list(d).length) return found;
  }
  const d = state.currentDivision || '';
  return { division: d, index: view.list(d).length };
}

function teamSideLabel(state: State, side: BracketSource | null | undefined, division: string): string {
  if (!side) return 'TBD';
  if (side.team) {
    const team = (state.teams || []).filter(t => t.status !== 'NoShow' && t.team)[side.team - 1];
    return team?.team ? team.team : `Team ${side.team}`;
  }
  if (side.ref) {
    const node = (state.teamBracketNodes?.[division] || []).find(n => n.id === side.ref);
    return node?.winner ? node.winner : `Winner ${side.ref}`;
  }
  return 'TBD';
}

/** tvIndividualSideLabel(): the name, or the bracket placeholder while it is undecided. */
export function individualSideLabel(state: State, m: Match, side: 'white' | 'red'): string {
  const direct = side === 'white' ? m.white : m.red;
  if (direct) return direct;
  if (m.championship) {
    const nodes = state.championshipNodes?.[m.division] || [];
    const node = nodes.find(n => n.id === m.champNodeId);
    if (node) {
      const source = side === 'white' ? node.right : node.left;
      if (source?.seed) return source.seed;
      if (source?.ref) {
        const prev = nodes.find(n => n.id === source.ref);
        return `Winner of ${prev?.round || 'Previous Round'} Match ${(prev?.slot ?? 0) + 1}`;
      }
    }
    // Later rounds without a node: named after the feeding match (sourceLabelForRound).
    const bracketSize = state.generated ? (state.brackets?.[m.division] || []).length : 0;
    if (m.position && m.position !== firstRoundName(bracketSize)) {
      const prevRound = previousRoundName(m.position);
      const slot = (m.bracketSlot || 0) * 2 + (side === 'white' ? 1 : 0);
      const pm = (state.allMatches?.[m.division] || []).find(x => x.championship && x.position === prevRound && x.bracketSlot === slot);
      const winner = pm?.done ? pm.completedResult?.winner : undefined;
      if (winner && (winner === pm?.white || winner === pm?.red)) return winner;
      return `Winner of ${prevRound} Match ${slot + 1}`;
    }
  }
  if (m.singleElim && m.elimNodeId) {
    const node = (state.singleElimNodes?.[m.division] || []).find(n => n.id === m.elimNodeId);
    if (node) {
      const source = side === 'white' ? node.right : node.left;
      if (!source) return 'BYE';
      if (source.team) return (state.singleElimComps?.[m.division] || [])[source.team - 1]?.name || `Entry ${source.team}`;
      if (source.ref) {
        const prev = (state.singleElimNodes?.[m.division] || []).find(n => n.id === source.ref);
        return prev?.winner ? prev.winner.name : `Winner ${source.ref}`;
      }
      return 'TBD';
    }
  }
  return 'TBD';
}

const pairKey = (m: { teamPair?: string; teamNodeId?: string; teamWhite?: string; teamRed?: string }): string =>
  m.teamPair || m.teamNodeId || `${m.teamWhite}|${m.teamRed}`;

/** tvTeamNodeEntries(): later bracket pairings on this court that have no bouts yet. */
function teamNodeEntries(state: State, court: Court, current: Match): { key: string; entry: UpcomingMatch }[] {
  const division = current.division;
  const nodes = state.teamBracketNodes?.[division] || [];
  const all = state.allMatches?.[division] || [];
  let currentNode = nodes.findIndex(n => n.id === current.teamNodeId);
  if (currentNode < 0 && current.teamPair) {
    const sibling = all.find(x => x.teamPair === current.teamPair && x.teamNodeId);
    if (sibling) currentNode = nodes.findIndex(n => n.id === sibling.teamNodeId);
  }
  const out: { key: string; entry: UpcomingMatch }[] = [];
  const seen = new Set<string>();
  nodes.forEach((node, i) => {
    if (i <= currentNode || node.winner) return;
    const nodeCourt = String(node.court || '').toUpperCase();
    if (nodeCourt && nodeCourt !== 'BOTH' && nodeCourt !== court) return;
    const m = all.find(x => isTeamMatch(x) && x.teamNodeId === node.id && !x.done);
    const white = m ? (m.teamWhite || m.wdojo || teamSideLabel(state, node.right, division)) : teamSideLabel(state, node.right, division);
    const red = m ? (m.teamRed || m.rdojo || teamSideLabel(state, node.left, division)) : teamSideLabel(state, node.left, division);
    const key = m?.teamPair || node.id;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, entry: { white: white || 'TBD', red: red || 'TBD', label: node.round || m?.position || '' } });
  });
  return out;
}

function teamUpcomingSide(state: State, m: Match, side: 'white' | 'red'): string {
  return side === 'white'
    ? (m.teamWhite || m.wdojo || teamSideLabel(state, null, m.division) || 'TBD')
    : (m.teamRed || m.rdojo || teamSideLabel(state, null, m.division) || 'TBD');
}

/** tvUpcomingMatches() + tv3UpcomingModel(): the next (up to) two matches on the court. */
function upcomingMatches(state: State, view: DivisionView, court: Court, current: Match, teamMode: boolean): UpcomingMatch[] {
  const all = view.sort(current.division);
  const idx = all.indexOf(current);
  const candidates = all.slice(Math.max(0, idx + 1)).filter(x => !x.done && matchBelongsToCourt(state, x, court));
  if (!teamMode) {
    return candidates.slice(0, 2).map(m => ({ white: individualSideLabel(state, m, 'white'), red: individualSideLabel(state, m, 'red'), label: '' }));
  }
  const seen = new Set<string>();
  const out: UpcomingMatch[] = [];
  for (const x of candidates) {
    const key = pairKey(x);
    if (!isTeamMatch(x) || key === current.teamPair || seen.has(key)) continue;
    seen.add(key);
    out.push({ white: teamUpcomingSide(state, x, 'white'), red: teamUpcomingSide(state, x, 'red'), label: x.position || (x as { round?: string }).round || '' });
  }
  // Placeholder pairings share the legacy key rule: teamPair, else teamNodeId (the node id).
  for (const { entry, key } of teamNodeEntries(state, court, current)) {
    if (!seen.has(key)) { seen.add(key); out.push(entry); }
  }
  return out.slice(0, 2);
}

/** The TV's current match for `court` and its upcoming matches, or null (idle). */
export function selectCourtMatch(state: State | null | undefined, court: Court): CourtMatch | null {
  if (!state) return null;
  const view = new DivisionView(state);
  let cs: { division: string | null; index: number } | undefined = state.courtState?.[court];
  if (cs?.division && eliminationFinalDone(view.list(cs.division))) return null;
  const stored = cs?.division ? view.list(cs.division)[cs.index] : undefined;
  if (!cs || !cs.division || !stored || stored.done) {
    cs = findNextForCourt(state, view, court, cs?.division || state.courtActiveDivision?.[court] || null);
  }
  const division = cs.division || '';
  const list = view.sortTeamsOnly(division);
  const match = list[cs.index];
  if (!match || match.done || !matchBelongsToCourt(state, match, court)) return null;
  const teamMode = isTeamMatch(match);
  return { court, division: match.division, match, teamMode, upcoming: upcomingMatches(state, view, court, match, teamMode) };
}

/** The division the court is on, for the idle state (as the TV's header shows it). */
export function courtDivision(state: State | null | undefined, court: Court): string | null {
  return state?.courtActiveDivision?.[court] || state?.courtState?.[court]?.division || null;
}

/** audienceMeta(): the line under the division, e.g. 'Pool A', 'Semifinal', 'Senpo'. */
export function matchMetaLine(m: Match): string {
  if (m.type === 'teamPosition' || m.type === 'teamPlayoff' || m.type === 'kachinuki') return m.position || m.pool || 'Team Match';
  if (m.championship || m.pool === 'Championship') return m.position || 'Championship';
  return `Pool ${m.pool || 'A'}`;
}
