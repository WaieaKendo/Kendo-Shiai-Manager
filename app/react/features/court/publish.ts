// The court screen's inputs, computed here from the legacy app (were ksmScoreboardInput(),
// ksmStaticCourtHeader(), ksmPublishCourtHeader()'s merge, ksmPublishCourtComplete(),
// ksmContextPanelInput(), ksmPoolContext(), ksmPoolCard(), ksmOwnQueuePanelInput(),
// ksmQueuePanelInput() and the queue builders in app/js/35-react-court.js). Same output as the
// legacy builders gave, which tests/golden/court/*.json (recorded from the legacy renderer) pin.
// Text is what esc() showed (String(x||'')). Legacy is read only through shared/legacy.ts.
//
// The classic writers (renderScore(), renderDivisions(), updateScoreTournamentName(),
// updateUndoButton(), renderQueue(), renderContext(), setCourtCompletePresentation()) only record
// their request on `window` and signal; the signal runs the builder below synchronously, so the
// legacy calls that write state or the DOM happen at the same moment as before:
// * ksmContextPanelInput() calls setCourtSupportMode() (the layout classes around the panels);
// * ksmOwnQueuePanelInput() calls enforceUniqueIndividualMatches(div), which writes
//   state.allMatches[div] and state.matches (for a split single elimination).
// Without this module neither runs; the court screen then shows only the reload notice.
//
// What stays classic (app/js/35-react-court.js): the builders other classic code calls
// (ksmText, ksmBracket, ksmTeamResults, ksmPoolStandingRows, ksmHansokuCounts, the Daihyosen
// helpers, ksmTeamSheet, ksmKachinukiSheet, ksmDivisionCompleteInput, the court division list and
// next division) with the row and card builders they use, ksmSingleElimContext() and
// ksmFinalResults() (they read top-level `const`s the module cannot reach), the Red side and
// Setup actions, and the module-missing notice.
import { legacy } from '../../shared/legacy.ts';
import { ACTIONS_EVENT, type CourtActionsInput } from './actions-model.ts';
import { HEADER_EVENT, type CourtHeaderInput } from './header-model.ts';
import {
  QUEUE_EVENT, type CourtQueueInput, type QueueGroupInput, type QueueRow, type QueueRowInput,
} from './queue-model.ts';
import { COMPLETE_EVENT, type CourtCompleteInput } from '../../shared/ui/complete-model.ts';
import {
  CONTEXT_EVENT, type BracketInput, type CourtContextInput, type PoolCardInput,
} from '../../shared/ui/context-model.ts';
import { SCOREBOARD_EVENT, type ScoreboardInput, type Side } from '../../shared/ui/scoreboard-model.ts';

/** What the header writers asked for: the raw fields each sent (the module merges them, as the island needs). */
export type HeaderRequest = Partial<Pick<CourtHeaderInput,
  'tournamentName' | 'court' | 'divisions' | 'currentDivision' | 'divisionTitle' | 'matchLine' | 'requiresWinner' | 'redLeft'>>;

/** What legacy asked for last (the signal stubs in app/js record it before they signal). */
interface CourtRequests {
  ksmCourtScoreboardRequested?: { match: Match | null };
  ksmCourtHeaderRequested?: HeaderRequest;
  ksmCourtActionsRequested?: CourtActionsInput;
  ksmCourtCompleteRequested?: { div: string; complete: boolean };
  ksmCourtQueueRequested?: boolean;
  ksmCourtContextRequested?: boolean;
}

interface CourtInputs {
  ksmCourtScoreboardInput?: ScoreboardInput;
  ksmCourtHeaderInput?: CourtHeaderInput;
  ksmCourtActionsInput?: CourtActionsInput;
  ksmCourtCompleteInput?: CourtCompleteInput;
  ksmCourtQueueInput?: CourtQueueInput;
  ksmCourtContextInput?: CourtContextInput;
}

const courtWindow = (): CourtRequests & CourtInputs => window as unknown as CourtRequests & CourtInputs;

const text = (s: unknown): string => legacy('ksmText')(s);

// ------------------------------------------------------------------------------ scoreboard

export function ksmScoreboardInput(m: Match | null): ScoreboardInput {
  if (!m) return { match: null, score: { W: [], R: [], WT: 0, RT: 0 }, representatives: null };
  const state = legacy('ksmLegacyState')();
  const s: Partial<ActiveScore> = state.score || {};
  const score = { W: [...(s.W || [])], R: [...(s.R || [])], WT: s.WT || 0, RT: s.RT || 0 };
  const match = {
    white: m.white, red: m.red, wdojo: m.wdojo, rdojo: m.rdojo, teamWhite: m.teamWhite, teamRed: m.teamRed, type: m.type,
    // D1: a team round robin's daihyosen bout is labelled on the court screen.
    ...(legacy('ksmIsRoundRobinDaihyosen')(m) ? { rule: legacy('ksmDaihyosenLabel')() } : {}),
    requiresWinner: !!legacy('matchRequiresWinner')(m),
  };
  if (m.type !== 'teamPlayoff') return { match, score, representatives: null };
  // As repSelect(): the roster and permission come from the match at state.current.
  const current = state.matches[state.current];
  const playoff = current && current.type === 'teamPlayoff';
  const rep = (side: Side, team: string | undefined, name: string | undefined) => ({
    team: team || '', current: name || '',
    roster: [...legacy('teamRoster')(playoff ? (side === 'W' ? current!.teamWhite : current!.teamRed) : team, m.division)],
    editable: Boolean(legacy('canModifyRepresentative')(current)),
  });
  return { match, score, representatives: { W: rep('W', m.teamWhite, m.white), R: rep('R', m.teamRed, m.red) } };
}

// --------------------------------------------------------------------------------- header

/** The static header markup (app/index.html), which the merge starts from (was ksmStaticCourtHeader()). */
export function ksmStaticCourtHeader(): CourtHeaderInput {
  return { tournamentName: 'Kendo Tournament', court: 'A', divisions: [], currentDivision: '', divisionTitle: '—', matchLine: 'No active match' };
}

/**
 * The header input from the merged requests (was ksmPublishCourtHeader()): each writer sends only
 * its own fields, merged over the static header; the division names and the timer fields are read
 * at signal time.
 */
export function ksmCourtHeaderInput(request: HeaderRequest): CourtHeaderInput {
  const fields: CourtHeaderInput = { ...ksmStaticCourtHeader(), ...request };
  const divisionName = legacy('ksmDivisionName');
  if (request.divisionTitle) fields.divisionTitle = divisionName(request.divisionTitle);
  if (request.divisions) fields.divisionNames = Object.fromEntries(request.divisions.map(id => [id, divisionName(id)]));
  const state = legacy('ksmLegacyState')();
  const courtB = legacy('normalizeCourt')(state.currentCourt) === 'B';
  const timer = legacy('ksmNormalizeTimerSettings')(legacy('getSetupSnapshot')());
  const tvRedSide = (window.document.getElementById(courtB ? 'court2TvRedSide' : 'court1TvRedSide') as { value?: string } | null)?.value;
  return {
    ...fields,
    timerSound: timer[courtB ? 'court2TimerSound' : 'court1TimerSound'],
    timerEnabled: timer[courtB ? 'court2TimerEnabled' : 'court1TimerEnabled'] !== 'Off',
    tvRedLeft: tvRedSide === 'left',
  };
}

// --------------------------------------------------------------------------------- actions

export function ksmActionsInput(request: CourtActionsInput): CourtActionsInput {
  return { undo: { ...request.undo }, redo: { ...request.redo } };
}

// --------------------------------------------------------------------------------- complete

/**
 * setCourtCompletePresentation() (32-): the court screen's division-complete panel. Owner decision 7
 * and issue #31: a completed division's panel also gets the court, the division and the division
 * to continue to (ksmNextCourtDivision()), for the box "<Division> is complete ..." with
 * [Continue to <next> →] / [Keep showing results]; its buttons call selectScorekeeperDivision()
 * (08-), the court dropdown's action, so the TV and Live Scores follow (no new shared state).
 */
export function ksmCompleteInput(request: { div: string; complete: boolean }): CourtCompleteInput {
  let input = legacy('ksmDivisionCompleteInput')(request.div, request.complete);
  if (input && input.complete) {
    const state = legacy('ksmLegacyState')();
    const divisionName = legacy('ksmDivisionName');
    const court = state.currentCourt || 'A', division = state.currentDivision || '';
    const name = divisionName(division);
    const next = division ? legacy('ksmNextCourtDivision')(court, division) : null;
    const nextName = next ? divisionName(next) : null;
    input = {
      ...input, court: text(court), division: text(name), next,
      ...(name !== division ? { divisionId: division } : {}),
      ...(next && nextName !== next ? { nextName: nextName! } : {}),
    };
  }
  return input;
}

// ---------------------------------------------------------------------------------- context

// A pool's standings and bouts (poolResultCardHtml() (29-/31-, removed). The pool's bouts, then its
// tiebreak bouts in their own section.
export function ksmPoolCard(div: string, pool: Pool, options: { active?: boolean; completed?: boolean; currentMatch?: Match | null } = {}): PoolCardInput {
  const state = legacy('ksmLegacyState')();
  const aligned = legacy('ksmAlignedRow');
  const { rows, note } = legacy('ksmPoolStandingRows')(div, pool.label);
  const matches = (state.allMatches?.[div] || []).filter(match => match.pool === pool.label && !match.championship);
  const complete = options.completed ?? legacy('poolDisplayComplete')(div, pool.label);
  const row = (match: Match) => aligned(match, {
    status: match.done ? 'DONE' : (match.tiebreak ? 'TIEBREAK' : 'vs'), compact: true,
    current: !!options.currentMatch && match === options.currentMatch,
  });
  return {
    label: text(pool.label), active: !!options.active, complete: !!complete,
    standings: rows, tiebreakNote: note,
    matches: matches.filter(m => !m.tiebreak).map(row),
    tiebreakMatches: matches.filter(m => m.tiebreak).map(row),
  };
}

// orderedPoolContextHtml() (31-, removed).
export function ksmPoolContext(div: string, currentMatch: Match | null): CourtContextInput {
  const state = legacy('ksmLegacyState')();
  const poolDisplayComplete = legacy('poolDisplayComplete');
  const pools = [...(state.pools?.[div] || [])].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const incomplete = pools.filter(pool => !poolDisplayComplete(div, pool.label));
  const completed = pools.filter(pool => poolDisplayComplete(div, pool.label));
  const currentLabel = currentMatch && !currentMatch.championship ? currentMatch.pool : null;
  const inProgress = incomplete.map(pool => ksmPoolCard(div, pool, { active: pool.label === currentLabel, currentMatch }));
  const done = completed.map(pool => ksmPoolCard(div, pool, { completed: true }));
  return { kind: 'pools', inProgress, bracket: legacy('ksmBracket')(div), completed: done };
}

/**
 * renderContext() as the legacy renderer drew it (removed): the 32- wrapper, then renderContext()
 * (31-) for a match on this court or persistentContextHtml() (32-) otherwise, calling
 * setCourtSupportMode() as they did (it writes the layout classes around the panels).
 * (31- also computes an unused teamPairSummary() for a team match; left out.)
 */
export function ksmContextPanelInput(): CourtContextInput {
  const state = legacy('ksmLegacyState')();
  const setCourtSupportMode = legacy('setCourtSupportMode');
  const m = state.matches?.[state.current];
  if (m && legacy('matchBelongsToCourt')(m, state.currentCourt || 'A')) {
    if (m.type === 'teamPosition' || m.type === 'teamPlayoff' || m.type === 'kachinuki') {
      setCourtSupportMode('standard');
      if (m.type === 'kachinuki') return { kind: 'kachinuki', sheet: legacy('ksmKachinukiSheet')(m) };
      return { kind: 'team-sheet', sheet: legacy('ksmTeamSheet')(m.division, m.teamPair, m) };
    }
    if (m.singleElim || (m.championship && m.pool === 'Championship' && !(state.pools[m.division] || []).length)) {
      setCourtSupportMode('singleElim'); return legacy('ksmSingleElimContext')(m.division);
    }
    setCourtSupportMode('standard');
    return ksmPoolContext(m.division, m);
  }
  const div = legacy('contextDivisionForCourt')();
  setCourtSupportMode((state.singleElimNodes?.[div as string] || []).length ? 'singleElim' : 'standard');
  if (!div) return { kind: 'message', text: 'No division selected.' };
  if ((state.singleElimNodes?.[div] || []).length) return legacy('ksmSingleElimContext')(div);
  if ((state.pools?.[div] || []).length) return ksmPoolContext(div, null);
  const bracket: BracketInput = legacy('isTeamDivision')(div) ? legacy('ksmTeamResults')(div) : legacy('ksmBracket')(div);
  return { kind: 'bracket', bracket };
}

// ----------------------------------------------------------------------------------- queue

// renderGroupedQueueRow(m) (24-, removed).
export function ksmQueueRow(m: Match): QueueRowInput {
  return {
    kind: 'queue', team: false, placeholder: false, tiebreak: !!m.tiebreak,
    white: { name: text(legacy('specificMatchSideLabel')(m, 'white')), detail: text(m.wdojo || m.teamWhite || '') },
    red: { name: text(legacy('specificMatchSideLabel')(m, 'red')), detail: text(m.rdojo || m.teamRed || '') },
    center: 'vs', round: text(m.position || m.pool || 'Match'),
  };
}

export function ksmQueuePlaceholder(white: unknown, red: unknown, center: string, round: unknown, team = false): QueueRowInput {
  return { kind: 'queue', team, placeholder: true, tiebreak: false, white: { name: text(white), detail: null }, red: { name: text(red), detail: null }, center, round: text(round) };
}

/** Rows into groups by label, in order of first appearance. */
export function ksmQueueGroups(): { groups: QueueGroupInput[]; add: (label: string, row: QueueRow) => void } {
  const groups: QueueGroupInput[] = [];
  return {
    groups,
    add(label, row) {
      let g = groups.find(x => x.label === label);
      if (!g) { g = { label, rows: [] }; groups.push(g); }
      g.rows.push(row);
    },
  };
}

// poolChampionshipQueueGroups() (24-, removed).
export function ksmChampionshipQueueGroups(div: string, court: Court): QueueGroupInput[] {
  const labels = legacy('championshipLabels')(div);
  if (!labels.length) return [];
  const first = legacy('firstRoundName')(labels.length), out = ksmQueueGroups();
  legacy('roundSequenceFromFirst')(first).forEach(round => {
    const expected = legacy('expectedRoundCount')(div, round);
    if (!expected) return;
    for (let i = 0; i < expected; i++) {
      if (legacy('championshipCourtFor')(div, round, i, expected) !== court) continue;
      const m = legacy('champMatchBySlot')(div, round, i);
      if (m && m.done) continue;
      if (m) { if (legacy('matchBelongsToCourt')(m, court)) out.add(round, ksmQueueRow(m)); continue; }
      if (round === first) {
        const pair = labels[i] || [], rLabel = pair[0], wLabel = pair[1];
        const r = legacy('seedNameForLabel')(div, rLabel, true), w = legacy('seedNameForLabel')(div, wLabel, true);
        out.add(round, ksmQueuePlaceholder(w ? w.name : (wLabel || 'BYE'), r ? r.name : (rLabel || 'TBD'),
          (String(wLabel).toUpperCase() === 'BYE' || !wLabel) ? 'BYE' : 'awaiting', round));
      } else {
        const prev = legacy('previousRoundName')(round);
        const red = legacy('sourceLabelForRound')(div, prev, i * 2), white = legacy('sourceLabelForRound')(div, prev, i * 2 + 1);
        out.add(round, ksmQueuePlaceholder(white.name || 'TBD', red.name || 'TBD', 'awaiting', round));
      }
    }
  });
  return out.groups;
}

// teamQueueGroups() (24-, removed): one row per pairing, grouped by the normalized round.
export function ksmTeamQueueGroups(div: string, court: Court, current: Match | null): QueueGroupInput[] {
  const state = legacy('ksmLegacyState')();
  const isTeamMatch = legacy('isTeamMatch');
  const all = legacy('sortTeamMatches')(div), currentPair = current?.teamPair || null, seenPairs = new Set<string>(), out = ksmQueueGroups();
  const add = (label: string | undefined, row: QueueRow) => out.add(legacy('normalizeQueueGroupLabel')(label || 'Team Match'), row);
  all.forEach(m => {
    if (!isTeamMatch(m) || m.done || !legacy('matchBelongsToCourt')(m, court)) return;
    const pair = m.teamPair || `${m.teamWhite}|${m.teamRed}|${m.pool || m.position || ''}`;
    if (pair === currentPair || seenPairs.has(pair)) return;
    seenPairs.add(pair);
    const node = (state.teamBracketNodes?.[div] || []).find(n => n.id === m.teamNodeId);
    const round = node?.round || m.pool || m.position || 'Team Match';
    add(round, {
      kind: 'queue', team: true, placeholder: false, tiebreak: !!m.tiebreak, white: { name: text(m.teamWhite || m.wdojo || 'TBD'), detail: null },
      red: { name: text(m.teamRed || m.rdojo || 'TBD'), detail: null }, center: 'vs', round: text(round),
    });
  });
  (state.teamBracketNodes?.[div] || []).forEach(node => {
    if (node.winner || node.court !== court) return;
    const pair = legacy('nodePairId')(node);
    if (pair === currentPair || seenPairs.has(pair)) return;
    if (all.find(m => isTeamMatch(m) && m.teamNodeId === node.id && !m.done)) return;
    seenPairs.add(pair);
    add(node.round, ksmQueuePlaceholder(legacy('teamSideLabel')(node.right, div), legacy('teamSideLabel')(node.left, div), 'awaiting', node.round, true));
  });
  return out.groups;
}

/**
 * renderQueue() as the legacy renderer drew it (removed): the 32- wrapper (a split single
 * elimination: canonicalSingleElimQueue()), then renderQueue() (the last declaration, 24-).
 * For a split single elimination it calls enforceUniqueIndividualMatches(div), which writes
 * state.allMatches[div] and state.matches.
 */
export function ksmOwnQueuePanelInput(): CourtQueueInput {
  const state = legacy('ksmLegacyState')();
  const div = state.currentDivision, court = state.currentCourt || 'A';
  if (!div) return { kind: 'empty' };
  if (legacy('divisionComplete')(div)) return { kind: 'empty' };
  const divisionCourtMode = legacy('divisionCourtMode');
  const groupsOr = (groups: QueueGroupInput[], fallback: CourtQueueInput): CourtQueueInput => groups.length ? { kind: 'groups', groups } : fallback;
  if ((state.singleElimNodes?.[div] || []).length && divisionCourtMode(div) === 'split') {
    const current = state.matches?.[state.current] || null;
    const nodes = state.singleElimNodes?.[div] || [], arr = legacy('enforceUniqueIndividualMatches')(div), out = ksmQueueGroups();
    nodes.forEach(node => {
      const nodeCourt = divisionCourtMode(div) === 'split' ? (node.round === 'Final' ? 'A' : node.court) : (state.divisionCourts?.[div] || 'A');
      if (nodeCourt !== court) return;
      const m = arr.find(x => x.singleElim && x.elimNodeId === node.id);
      if (m?.done || m === current || node.winner) return;
      if (m && m.ready) out.add(node.round, ksmQueueRow(m));
      else out.add(node.round, legacy('ksmPlaceholderRow')(legacy('sideLabelGeneric')(node.right, div), legacy('sideLabelGeneric')(node.left, div), (!node.left || !node.right) ? 'BYE' : 'awaiting', true));
    });
    return groupsOr(out.groups.map(g => ({ label: text(g.label), rows: g.rows })), { kind: 'empty' });
  }
  const current = state.matches?.[state.current] || null;
  const all = state.allMatches?.[div] || [];
  const done = legacy('ksmFinalResults')(div);
  const doneOr = (message: string): CourtQueueInput => done || { kind: 'message', text: message };
  if ((current?.singleElim || (current?.championship && current?.pool === 'Championship' && !(state.pools?.[div] || []).length)) && divisionCourtMode(div) !== 'split') return { kind: 'empty' };
  if (legacy('eliminationFinalDone')(div)) return doneOr('Division complete.');
  if (all.some(m => m.singleElim) && divisionCourtMode(div) === 'split') {
    const out = ksmQueueGroups();
    legacy('dedupeSingleElimMatches')(div).filter(m => !m.done && legacy('matchBelongsToCourt')(m, court) && m !== current)
      .forEach(m => out.add(legacy('normalizeQueueGroupLabel')(m.position || 'Championship'), ksmQueueRow(m)));
    return groupsOr(out.groups, doneOr('Queue complete.'));
  }
  if (all.some(m => legacy('isTeamMatch')(m))) return groupsOr(ksmTeamQueueGroups(div, court, current), doneOr('Queue complete.'));
  // Pool play: the pool matches after the current one, then every future championship round.
  const currentIndex = current ? all.indexOf(current) : -1, out = ksmQueueGroups();
  all.filter((m, i) => !m.done && !m.championship && legacy('matchBelongsToCourt')(m, court) && m !== current && (currentIndex < 0 || i > currentIndex))
    .forEach(m => out.add(`Pool ${m.pool || 'A'}`, ksmQueueRow(m)));
  return groupsOr([...out.groups, ...ksmChampionshipQueueGroups(div, court)], doneOr('Queue complete.'));
}

export function ksmQueuePanelInput(): CourtQueueInput {
  const input = ksmOwnQueuePanelInput();
  const state = legacy('ksmLegacyState')();
  const div = state.currentDivision, court = state.currentCourt || 'A';
  const current = state.matches?.[state.current] || null;
  const queued = (state.allMatches?.[div] || []).some(m => legacy('isValidMatchObject')(m) && !m.done && m !== current && legacy('matchBelongsToCourt')(m, court));
  if (queued || (input.kind === 'groups' && input.groups.some(g => g.rows.length))) return input;
  // Resolved at call time: the TV/Live Scores helper in 36- is loaded by then.
  return { ...input, upNext: legacy('ksmUpNext')(court, div) };
}

// ------------------------------------------------------------------------------ the signals

function refreshScoreboard(): void {
  const request = courtWindow().ksmCourtScoreboardRequested;
  if (request) courtWindow().ksmCourtScoreboardInput = ksmScoreboardInput(request.match);
}

function refreshHeader(): void {
  const request = courtWindow().ksmCourtHeaderRequested;
  if (request) courtWindow().ksmCourtHeaderInput = ksmCourtHeaderInput(request);
}

function refreshActions(): void {
  const request = courtWindow().ksmCourtActionsRequested;
  if (request) courtWindow().ksmCourtActionsInput = ksmActionsInput(request);
}

function refreshComplete(): void {
  const request = courtWindow().ksmCourtCompleteRequested;
  if (request) courtWindow().ksmCourtCompleteInput = ksmCompleteInput(request);
}

function refreshQueue(): void {
  if (courtWindow().ksmCourtQueueRequested) courtWindow().ksmCourtQueueInput = ksmQueuePanelInput();
}

function refreshContext(): void {
  if (courtWindow().ksmCourtContextRequested) courtWindow().ksmCourtContextInput = ksmContextPanelInput();
}

/**
 * Pull: computes each input on its signal, and once now for each request legacy made before this
 * module ran (until then the islands draw the static markup). Call it before mounting, so it runs
 * ahead of the islands' own listeners (they redraw on the same event and read the input this
 * computed); it dispatches nothing, so there is no loop.
 */
export function startCourtInput(): void {
  const listeners: Array<[string, () => void]> = [
    [HEADER_EVENT, refreshHeader], [SCOREBOARD_EVENT, refreshScoreboard], [ACTIONS_EVENT, refreshActions],
    [COMPLETE_EVENT, refreshComplete], [QUEUE_EVENT, refreshQueue], [CONTEXT_EVENT, refreshContext],
  ];
  for (const [event, refresh] of listeners) {
    window.addEventListener(event, refresh);
    refresh();
  }
}
