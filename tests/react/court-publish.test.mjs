import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  ksmCompleteInput, ksmContextPanelInput, ksmCourtHeaderInput, ksmOwnQueuePanelInput, ksmQueuePanelInput, ksmScoreboardInput,
  ksmStaticCourtHeader, startCourtInput,
} from '../../app/react/features/court/publish.ts';

// The classic signal stubs (app/js/35-react-court.js), run as they are against the fake window.
const classic = readFileSync(new URL('../../app/js/35-react-court.js', import.meta.url), 'utf8');
const stubSource = ['ksmSignalCourtScoreboard', 'ksmSignalCourtHeader', 'ksmSignalCourtActions'].map(name => {
  const start = classic.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is missing from 35-react-court.js`);
  return classic.slice(start, classic.indexOf('\n}\n', start) + 3);
}).join('\n');

const daihyosen = m => !!(m && m.roundRobinTiebreak && m.type === 'teamPlayoff');

// A fake `window` with the legacy functions and elements publish.ts reads through shared/legacy.ts.
// `log.calls` records the legacy calls that write state or the DOM, in order.
function fake({ state = {}, legacy = {}, elements = {}, names = {} } = {}) {
  const listeners = new Map();
  const log = { calls: [], events: [] };
  const s = {
    currentCourt: 'A', currentDivision: '', current: 0, matches: [], allMatches: {}, pools: {}, singleElimNodes: {}, teamBracketNodes: {},
    divisionCourts: {}, score: { W: [], R: [], WT: 0, RT: 0 }, ...state,
  };
  const win = {
    ksmLegacyState: () => s,
    ksmText: x => String(x || ''),
    ksmDivisionName: id => names[id] ?? id,
    ksmIsRoundRobinDaihyosen: daihyosen,
    ksmDaihyosenLabel: () => 'Daihyosen — first point wins',
    matchRequiresWinner: m => !!m.needsWinner,
    teamRoster: (team, div) => [`${team} roster ${div}`],
    canModifyRepresentative: m => !!(m && m.editable),
    normalizeCourt: v => (v === 'B' ? 'B' : 'A'),
    getSetupSnapshot: () => ({ court1TimerSound: 'whistle02', court2TimerSound: 'whistle01', court1TimerEnabled: 'On', court2TimerEnabled: 'Off' }),
    ksmNormalizeTimerSettings: data => ({
      court1TimerSound: data.court1TimerSound === 'whistle02' ? 'whistle02' : 'whistle01',
      court2TimerSound: data.court2TimerSound === 'whistle01' ? 'whistle01' : 'whistle02',
      court1TimerEnabled: data.court1TimerEnabled === 'Off' ? 'Off' : 'On',
      court2TimerEnabled: data.court2TimerEnabled === 'Off' ? 'Off' : 'On',
    }),
    matchBelongsToCourt: (m, court) => (m.court ?? 'A') === court,
    isValidMatchObject: m => !!m,
    isTeamDivision: div => div === 'Teams',
    isTeamMatch: m => m.type === 'teamPosition' || m.type === 'teamPlayoff' || m.type === 'kachinuki',
    divisionComplete: div => div === 'Done',
    divisionCourtMode: div => s.divisionCourts[div] || 'A',
    eliminationFinalDone: () => false,
    poolDisplayComplete: (div, label) => label === 'B',
    contextDivisionForCourt: () => s.currentDivision || null,
    setCourtSupportMode: mode => { log.calls.push(`setCourtSupportMode ${mode}`); },
    enforceUniqueIndividualMatches: div => { log.calls.push(`enforceUniqueIndividualMatches ${div}`); s.allMatches[div] = [...(s.allMatches[div] || [])]; s.matches = s.allMatches[div]; return s.allMatches[div]; },
    dedupeSingleElimMatches: div => s.allMatches[div] || [],
    normalizeQueueGroupLabel: label => String(label || 'Upcoming').trim(),
    specificMatchSideLabel: (m, side) => m[side],
    sideLabelGeneric: (side, div) => `side ${side}`,
    sortTeamMatches: div => s.allMatches[div] || [],
    nodePairId: node => `node ${node.id}`,
    teamSideLabel: (side, div) => `team ${side}`,
    championshipLabels: () => [],
    ksmDivisionCompleteInput: (div, complete) => (complete ? { complete: true, placements: [{ place: '1st', name: `win ${div}`, tier: 'gold' }] } : { complete: false, placements: [] }),
    ksmNextCourtDivision: (court, current) => ({ Open: 'Women', Women: null })[current] ?? null,
    ksmKachinukiSheet: m => ({ sheet: 'kachinuki', white: m.teamWhite }),
    ksmTeamSheet: (div, pair, m) => ({ sheet: 'team', div, pair, white: m.teamWhite }),
    ksmSingleElimContext: div => ({ kind: 'message', text: `single elim ${div}` }),
    ksmTeamResults: div => ({ kind: 'message', text: `team results ${div}` }),
    ksmBracket: div => ({ kind: 'message', text: `bracket ${div}` }),
    ksmPoolStandingRows: (div, label) => ({ note: '', rows: [{ name: `P${label}`, dojo: '', wins: '0', pts: '0', tiebreak: false }] }),
    ksmAlignedRow: (match, options = {}) => ({ kind: 'aligned', white: match.white, red: match.red, wp: [], rp: [], status: options.status, current: !!options.current, compact: !!options.compact }),
    ksmPlaceholderRow: (white, red, status, compact) => ({ kind: 'aligned', white, red, wp: [], rp: [], status, current: false, compact: !!compact }),
    ksmFinalResults: () => null,
    ksmUpNext: (court, own) => { log.calls.push(`ksmUpNext ${court} ${own}`); return legacy.upNext === undefined ? { division: 'Women', matches: [{ white: 'W', red: 'R' }] } : legacy.upNext; },
    ...legacy,
    document: { getElementById: id => elements[id] ?? null },
    addEventListener: (type, fn) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    dispatchEvent: event => { log.events.push(event.type); (listeners.get(event.type) ?? []).forEach(fn => fn(event)); return true; },
  };
  win.upNext = undefined;
  globalThis.window = win;
  // The classic stubs, as written in app/js/35-react-court.js.
  const context = vm.createContext({ window: win, CustomEvent: class { constructor(type) { this.type = type; } } });
  vm.runInContext(stubSource, context);
  for (const name of ['ksmSignalCourtScoreboard', 'ksmSignalCourtHeader', 'ksmSignalCourtActions']) win[name] = context[name];
  return { win, log, s };
}

const match = (extra = {}) => ({ division: 'Open', type: 'individual', white: 'Ann', red: 'Bo', wdojo: 'Aiea', rdojo: 'Maui', ...extra });

// ------------------------------------------------------------------------------ scoreboard

test('scoreboard: no match gives the empty scoreboard', () => {
  fake();
  assert.deepEqual(ksmScoreboardInput(null), { match: null, score: { W: [], R: [], WT: 0, RT: 0 }, representatives: null });
});

test('scoreboard: a normal match copies the live score and the rule fields', () => {
  fake({ state: { score: { W: ['M'], R: [], WT: 1, RT: 0 } } });
  const m = match({ needsWinner: true });
  const input = ksmScoreboardInput(m);
  assert.deepEqual(input, {
    match: { white: 'Ann', red: 'Bo', wdojo: 'Aiea', rdojo: 'Maui', teamWhite: undefined, teamRed: undefined, type: 'individual', requiresWinner: true },
    score: { W: ['M'], R: [], WT: 1, RT: 0 }, representatives: null,
  });
  assert.equal('rule' in input.match, false);
});

test('scoreboard: a team playoff takes its representatives from the match at state.current', () => {
  const m = match({ type: 'teamPlayoff', teamWhite: 'Aiea', teamRed: 'Maui', white: 'Aiea Representative', red: '' });
  const current = { ...m, teamWhite: 'Cur W', teamRed: 'Cur R', editable: true };
  fake({ state: { current: 0, matches: [current] } });
  const input = ksmScoreboardInput(m);
  assert.deepEqual(input.representatives, {
    W: { team: 'Aiea', current: 'Aiea Representative', roster: ['Cur W roster Open'], editable: true },
    R: { team: 'Maui', current: '', roster: ['Cur R roster Open'], editable: true },
  });
});

test('scoreboard: a team playoff whose current match is not a playoff uses its own teams', () => {
  const m = match({ type: 'teamPlayoff', teamWhite: 'Aiea', teamRed: 'Maui' });
  fake({ state: { current: 0, matches: [match()] } });
  const input = ksmScoreboardInput(m);
  assert.deepEqual(input.representatives.W.roster, ['Aiea roster Open']);
  assert.equal(input.representatives.W.editable, false);
});

test('scoreboard: D1 labels a team round robin daihyosen bout', () => {
  fake({ state: { current: 0, matches: [] } });
  const input = ksmScoreboardInput(match({ type: 'teamPlayoff', roundRobinTiebreak: true, teamWhite: 'A', teamRed: 'B' }));
  assert.equal(input.match.rule, 'Daihyosen — first point wins');
  const plain = ksmScoreboardInput(match({ type: 'teamPlayoff', teamWhite: 'A', teamRed: 'B' }));
  assert.equal('rule' in plain.match, false);
});

// --------------------------------------------------------------------------------- header

// The old ksmPublishCourtHeader() (app/js/35-react-court.js before #136 step 2), as the reference.
function oldPublish(win, previous, fields) {
  const legacy = name => win[name];
  if (fields.divisionTitle) fields.divisionTitle = legacy('ksmDivisionName')(fields.divisionTitle);
  if (fields.divisions) fields.divisionNames = Object.fromEntries(fields.divisions.map(id => [id, legacy('ksmDivisionName')(id)]));
  const s = legacy('ksmLegacyState')();
  const settings = legacy('ksmNormalizeTimerSettings')(legacy('getSetupSnapshot')());
  const court = legacy('normalizeCourt')(s.currentCourt) === 'B';
  return {
    ...(previous || ksmStaticCourtHeader()), ...fields,
    timerSound: settings[court ? 'court2TimerSound' : 'court1TimerSound'],
    timerEnabled: settings[court ? 'court2TimerEnabled' : 'court1TimerEnabled'] !== 'Off',
    tvRedLeft: win.document.getElementById(court ? 'court2TvRedSide' : 'court1TvRedSide')?.value === 'left',
  };
}

test('header: a sequence of partial requests gives the input the old publisher gave', () => {
  const elements = { court1TvRedSide: { value: 'right' }, court2TvRedSide: { value: 'left' } };
  const { win, s } = fake({ elements, names: { open: 'Open Division', women: "Women's" } });
  startCourtInput();
  let reference;
  const send = (fields, before) => {
    before?.();
    // The old publisher mutated the fields it was given, so it gets its own copy.
    reference = oldPublish(win, reference, { ...fields });
    win.ksmSignalCourtHeader({ ...fields });
    assert.deepEqual(win.ksmCourtHeaderInput, reference);
  };
  send({ tournamentName: 'Aiea Open' });
  send({ court: 'A', divisions: ['open', 'women'], currentDivision: 'open' });
  send({ matchLine: 'Pool A', divisionTitle: 'open', requiresWinner: false, redLeft: true });
  send({ tournamentName: 'Aiea Open 2' });
  // A division complete: the title and match line, with the rest kept.
  send({ divisionTitle: 'women', matchLine: 'Division complete' });
  // The truthiness of divisionTitle: '' is kept as it is.
  send({ divisionTitle: '' });
  // Timer fields are read at signal time: court B, with its own audience side and timer.
  send({ matchLine: 'Final', requiresWinner: null }, () => { s.currentCourt = 'B'; });
  send({ tournamentName: 'Aiea Open 3' }, () => { elements.court2TvRedSide.value = 'right'; });
  // The merge is the raw fields (the names are made at signal time, from the static header).
  assert.deepEqual(win.ksmCourtHeaderRequested.divisions, ['open', 'women']);
  assert.equal(win.ksmCourtHeaderRequested.divisionTitle, '');
});

test('header: ksmCourtHeaderInput starts from the static header and adds the names and timer fields', () => {
  fake({ names: { A: 'Alpha' }, elements: { court1TvRedSide: { value: 'left' } } });
  assert.deepEqual(ksmCourtHeaderInput({ divisions: ['A'], divisionTitle: 'A' }), {
    ...ksmStaticCourtHeader(), divisions: ['A'], divisionTitle: 'Alpha', divisionNames: { A: 'Alpha' },
    timerSound: 'whistle02', timerEnabled: true, tvRedLeft: true,
  });
});

// --------------------------------------------------------------------------------- actions

test('actions: the module copies the request', () => {
  const { win } = fake();
  startCourtInput();
  const request = { undo: { disabled: false, label: 'Undo' }, redo: { disabled: true, label: 'Redo' } };
  win.ksmSignalCourtActions(request);
  assert.deepEqual(win.ksmCourtActionsInput, request);
  assert.notEqual(win.ksmCourtActionsInput, request);
  assert.notEqual(win.ksmCourtActionsInput.undo, request.undo);
});

// -------------------------------------------------------------------------------- scoreboard signal

test('scoreboard: the signal records the match and the module computes the input', () => {
  const { win } = fake();
  startCourtInput();
  const m = match();
  win.ksmSignalCourtScoreboard(m);
  assert.equal(win.ksmCourtScoreboardRequested.match, m);
  assert.equal(win.ksmCourtScoreboardInput.match.white, 'Ann');
  win.ksmSignalCourtScoreboard(null);
  assert.deepEqual(win.ksmCourtScoreboardInput.match, null);
});

// --------------------------------------------------------------------------------- complete

test('complete: not complete gives the empty placements', () => {
  fake();
  assert.deepEqual(ksmCompleteInput({ div: 'Open', complete: false }), { complete: false, placements: [] });
});

test('complete: with a next division (the id differs from the name)', () => {
  fake({ state: { currentCourt: 'A', currentDivision: 'Open' }, names: { Open: 'Open Men', Women: "Women's" } });
  assert.deepEqual(ksmCompleteInput({ div: 'Open', complete: true }), {
    complete: true, placements: [{ place: '1st', name: 'win Open', tier: 'gold' }],
    court: 'A', division: 'Open Men', next: 'Women', divisionId: 'Open', nextName: "Women's",
  });
});

test('complete: without a next division, and names equal to ids add no extra fields', () => {
  fake({ state: { currentCourt: 'B', currentDivision: 'Women' } });
  const input = ksmCompleteInput({ div: 'Women', complete: true });
  assert.deepEqual(input, {
    complete: true, placements: [{ place: '1st', name: 'win Women', tier: 'gold' }], court: 'B', division: 'Women', next: null,
  });
});

test('complete: the signal computes it from the recorded request', () => {
  const { win } = fake({ state: { currentCourt: 'A', currentDivision: 'Open' } });
  startCourtInput();
  win.ksmCourtCompleteRequested = { div: 'Open', complete: true };
  win.dispatchEvent({ type: 'ksm:court-complete' });
  assert.equal(win.ksmCourtCompleteInput.next, 'Women');
});

// ---------------------------------------------------------------------------------- context

test('context: a kachinuki and a team bout take the standard layout and their sheets', () => {
  const kachinuki = match({ type: 'kachinuki', teamWhite: 'K' });
  const { log } = fake({ state: { current: 0, matches: [kachinuki] } });
  assert.deepEqual(ksmContextPanelInput(), { kind: 'kachinuki', sheet: { sheet: 'kachinuki', white: 'K' } });
  assert.deepEqual(log.calls, ['setCourtSupportMode standard']);
  const team = match({ type: 'teamPosition', teamWhite: 'T', teamPair: 'p1' });
  const second = fake({ state: { current: 0, matches: [team] } });
  assert.deepEqual(ksmContextPanelInput(), { kind: 'team-sheet', sheet: { sheet: 'team', div: 'Open', pair: 'p1', white: 'T' } });
  assert.deepEqual(second.log.calls, ['setCourtSupportMode standard']);
});

test('context: a single elimination match sets the single elimination layout', () => {
  const { log } = fake({ state: { current: 0, matches: [match({ singleElim: true })] } });
  assert.deepEqual(ksmContextPanelInput(), { kind: 'message', text: 'single elim Open' });
  assert.deepEqual(log.calls, ['setCourtSupportMode singleElim']);
});

test('context: a championship match with no pools is a single elimination too', () => {
  const { log } = fake({ state: { current: 0, matches: [match({ championship: true, pool: 'Championship' })], pools: {} } });
  assert.equal(ksmContextPanelInput().kind, 'message');
  assert.deepEqual(log.calls, ['setCourtSupportMode singleElim']);
});

test('context: a pool match gives the pools, the active pool first, then the bracket and the completed pools', () => {
  const m = match({ pool: 'A' });
  const other = match({ pool: 'B', done: true, tiebreak: false });
  const { log } = fake({
    state: { current: 0, matches: [m], allMatches: { Open: [m, other] }, pools: { Open: [{ label: 'B' }, { label: 'A' }] } },
  });
  const input = ksmContextPanelInput();
  assert.equal(input.kind, 'pools');
  assert.deepEqual(input.inProgress.map(p => [p.label, p.active, p.complete]), [['A', true, false]]);
  assert.deepEqual(input.completed.map(p => [p.label, p.active, p.complete]), [['B', false, true]]);
  assert.deepEqual(input.inProgress[0].matches.map(r => [r.white, r.status, r.current]), [['Ann', 'vs', true]]);
  assert.deepEqual(input.completed[0].matches.map(r => [r.status, r.current]), [['DONE', false]]);
  assert.deepEqual(input.bracket, { kind: 'message', text: 'bracket Open' });
  assert.deepEqual(log.calls, ['setCourtSupportMode standard']);
});

test('context: a match on another court shows the court division (no division, bracket, pools, team results, single elimination)', () => {
  const away = match({ court: 'B' });
  const none = fake({ state: { current: 0, matches: [away], currentDivision: '' } });
  assert.deepEqual(ksmContextPanelInput(), { kind: 'message', text: 'No division selected.' });
  assert.deepEqual(none.log.calls, ['setCourtSupportMode standard']);
  const single = fake({ state: { currentDivision: 'Open', singleElimNodes: { Open: [{ id: 'n1' }] } } });
  assert.deepEqual(ksmContextPanelInput(), { kind: 'message', text: 'single elim Open' });
  assert.deepEqual(single.log.calls, ['setCourtSupportMode singleElim']);
  const pools = fake({ state: { currentDivision: 'Open', pools: { Open: [{ label: 'A' }] } } });
  assert.equal(ksmContextPanelInput().kind, 'pools');
  assert.deepEqual(pools.log.calls, ['setCourtSupportMode standard']);
  fake({ state: { currentDivision: 'Teams' } });
  assert.deepEqual(ksmContextPanelInput(), { kind: 'bracket', bracket: { kind: 'message', text: 'team results Teams' } });
  fake({ state: { currentDivision: 'Open' } });
  assert.deepEqual(ksmContextPanelInput(), { kind: 'bracket', bracket: { kind: 'message', text: 'bracket Open' } });
});

// ------------------------------------------------------------------------------------ queue

test('queue: no division and a complete division are empty (and fall back to up next)', () => {
  fake({ state: { currentDivision: '' } });
  assert.deepEqual(ksmOwnQueuePanelInput(), { kind: 'empty' });
  const { log } = fake({ state: { currentDivision: 'Done' } });
  assert.deepEqual(ksmOwnQueuePanelInput(), { kind: 'empty' });
  assert.deepEqual(ksmQueuePanelInput(), { kind: 'empty', upNext: { division: 'Women', matches: [{ white: 'W', red: 'R' }] } });
  assert.deepEqual(log.calls, ['ksmUpNext A Done']);
});

test('queue: pool play lists the matches after the current one by pool', () => {
  const a = match({ pool: 'A' }), b = match({ pool: 'A', white: 'C', red: 'D' }), c = match({ pool: 'B', white: 'E', red: 'F', tiebreak: true });
  fake({ state: { currentDivision: 'Open', current: 0, matches: [a, b, c], allMatches: { Open: [a, b, c] } } });
  const input = ksmQueuePanelInput();
  assert.equal(input.kind, 'groups');
  assert.equal(input.upNext, undefined);
  assert.deepEqual(input.groups.map(g => [g.label, g.rows.map(r => [r.white.name, r.white.detail, r.tiebreak, r.round])]), [
    ['Pool A', [['C', 'Aiea', false, 'A']]],
    ['Pool B', [['E', 'Aiea', true, 'B']]],
  ]);
});

test('queue: a finished queue is a message, and the up next fallback adds the next division', () => {
  const a = match({ pool: 'A', done: true });
  const { log } = fake({ state: { currentDivision: 'Open', current: 0, matches: [a], allMatches: { Open: [a] } } });
  assert.deepEqual(ksmOwnQueuePanelInput(), { kind: 'message', text: 'Queue complete.' });
  const input = ksmQueuePanelInput();
  assert.deepEqual(input, { kind: 'message', text: 'Queue complete.', upNext: { division: 'Women', matches: [{ white: 'W', red: 'R' }] } });
  assert.deepEqual(log.calls, ['ksmUpNext A Open']);
  fake({ state: { currentDivision: 'Open', current: 0, matches: [a], allMatches: { Open: [a] } }, legacy: { upNext: null } });
  assert.equal(ksmQueuePanelInput().upNext, null);
});

test('queue: results of a finished bracket come from ksmFinalResults()', () => {
  const a = match({ pool: 'A', done: true });
  const results = { kind: 'results', results: { title: 'Final Results', lines: [{ place: '1st', name: 'Ann' }] } };
  fake({ state: { currentDivision: 'Open', current: 0, matches: [a], allMatches: { Open: [a] } }, legacy: { ksmFinalResults: () => results } });
  assert.deepEqual(ksmOwnQueuePanelInput(), results);
});

test('queue: a split single elimination queue enforces unique matches (writes state) and lists the court nodes', () => {
  const nodes = [
    { id: 'n1', round: 'Semifinal', court: 'A', left: {}, right: {} },
    { id: 'n2', round: 'Semifinal', court: 'B', left: {}, right: {} },
    { id: 'n3', round: 'Final', court: 'B', left: null, right: {} },
  ];
  const ready = match({ singleElim: true, elimNodeId: 'n1', ready: true });
  const { log, s } = fake({
    state: { currentDivision: 'Open', current: 5, matches: [], allMatches: { Open: [ready] }, divisionCourts: { Open: 'split' }, singleElimNodes: { Open: nodes } },
  });
  const input = ksmOwnQueuePanelInput();
  assert.deepEqual(log.calls, ['enforceUniqueIndividualMatches Open']);
  assert.equal(s.matches, s.allMatches.Open);
  // Court A: node n1 (a ready match) and the Final, which is always on court A (a placeholder row).
  assert.deepEqual(input.groups.map(g => [g.label, g.rows.map(r => r.kind + ':' + (r.kind === 'queue' ? r.white.name : r.status))]), [
    ['Semifinal', ['queue:Ann']],
    ['Final', ['aligned:BYE']],
  ]);
});

test('queue: a team division groups one row per pairing and the awaiting bracket nodes', () => {
  const t1 = match({ type: 'teamPosition', teamPair: 'p1', teamWhite: 'Aiea', teamRed: 'Maui', teamNodeId: 'n1', pool: 'Round 1' });
  const t2 = match({ type: 'teamPosition', teamPair: 'p1', teamWhite: 'Aiea', teamRed: 'Maui', teamNodeId: 'n1', pool: 'Round 1' });
  const t3 = match({ type: 'teamPosition', teamPair: 'p2', teamWhite: 'Kona', teamRed: 'Hilo', teamNodeId: 'n2', pool: 'Round 1' });
  const nodes = [{ id: 'n1', round: 'Round 1', court: 'A' }, { id: 'n2', round: 'Round 1', court: 'A' }, { id: 'n3', round: 'Final', court: 'A', left: 'x', right: 'y' }];
  fake({
    state: { currentDivision: 'Open', current: 0, matches: [t1], allMatches: { Open: [t1, t2, t3] }, teamBracketNodes: { Open: nodes } },
  });
  const input = ksmOwnQueuePanelInput();
  assert.deepEqual(input.groups.map(g => [g.label, g.rows.map(r => [r.team, r.placeholder, r.white.name, r.red.name, r.center])]), [
    ['Round 1', [[true, false, 'Kona', 'Hilo', 'vs']]],
    ['Final', [[true, true, 'team y', 'team x', 'awaiting']]],
  ]);
});

test('queue: the championship placeholders after the pool matches, per court', () => {
  const pool = match({ pool: 'A', white: 'X', red: 'Y' });
  const champ = match({ championship: true, pool: 'Championship', position: 'Final', white: 'F1', red: 'F2' });
  const labels = [['A1', 'B2'], ['B1', 'A2']];
  const legacy = {
    championshipLabels: () => labels,
    firstRoundName: () => 'Semifinal',
    roundSequenceFromFirst: () => ['Semifinal', 'Final'],
    expectedRoundCount: (div, round) => (round === 'Semifinal' ? 2 : 1),
    championshipCourtFor: (div, round, i) => (round === 'Final' || i === 0 ? 'A' : 'B'),
    champMatchBySlot: (div, round, i) => (round === 'Final' ? champ : undefined),
    seedNameForLabel: (div, label) => (label === 'A1' ? { name: 'Ann' } : null),
    previousRoundName: () => 'Semifinal',
    sourceLabelForRound: (div, prev, slot) => ({ name: `Winner ${slot}` }),
  };
  const { s } = fake({ state: { currentDivision: 'Open', current: 0, matches: [pool], allMatches: { Open: [pool] } }, legacy });
  // The current match is the only pool match: no pool group, then the championship groups for court A.
  let input = ksmOwnQueuePanelInput();
  assert.deepEqual(input.groups.map(g => [g.label, g.rows.map(r => [r.placeholder, r.white.name, r.red.name, r.center])]), [
    ['Semifinal', [[true, 'B2', 'Ann', 'awaiting']]],
    ['Final', [[false, 'F1', 'F2', 'vs']]],
  ]);
  s.currentCourt = 'B';
  input = ksmOwnQueuePanelInput();
  assert.deepEqual(input.groups.map(g => [g.label, g.rows.length]), [['Semifinal', 1]]);
});

test('queue: a queued match on this court means no up next', () => {
  const a = match({ pool: 'A' }), b = match({ pool: 'A', done: true });
  const { log } = fake({ state: { currentDivision: 'Open', current: 0, matches: [b], allMatches: { Open: [b, a] } } });
  const input = ksmQueuePanelInput();
  assert.equal(input.kind, 'groups');
  assert.deepEqual(log.calls, []);
});

// ------------------------------------------------------------------------------- start-up

test('start-up computes every input whose request was made earlier, and only those', () => {
  const m = match({ pool: 'A' });
  const { win, log } = fake({ state: { currentDivision: 'Open', current: 0, matches: [m], allMatches: { Open: [m] }, pools: { Open: [{ label: 'A' }] } } });
  win.ksmCourtScoreboardRequested = { match: m };
  win.ksmCourtHeaderRequested = { tournamentName: 'Aiea', matchLine: 'Pool A' };
  win.ksmCourtQueueRequested = true;
  win.ksmCourtContextRequested = true;
  startCourtInput();
  assert.equal(win.ksmCourtScoreboardInput.match.white, 'Ann');
  assert.equal(win.ksmCourtHeaderInput.tournamentName, 'Aiea');
  assert.equal(win.ksmCourtQueueInput.kind, 'message');
  assert.equal(win.ksmCourtContextInput.kind, 'pools');
  // The queue (up next, nothing queued) before the context (its layout classes), as the signals came.
  assert.deepEqual(log.calls, ['ksmUpNext A Open', 'setCourtSupportMode standard']);
  assert.equal(win.ksmCourtActionsInput, undefined);
  assert.equal(win.ksmCourtCompleteInput, undefined);
  // Start-up dispatches nothing.
  assert.deepEqual(log.events, []);
});

test('start-up with no earlier request computes nothing and a later signal does', () => {
  const { win } = fake();
  startCourtInput();
  for (const key of ['Scoreboard', 'Header', 'Actions', 'Complete', 'Queue', 'Context']) assert.equal(win[`ksmCourt${key}Input`], undefined);
  win.ksmCourtQueueRequested = true;
  win.dispatchEvent({ type: 'ksm:court-queue' });
  assert.deepEqual(win.ksmCourtQueueInput, { kind: 'empty', upNext: { division: 'Women', matches: [{ white: 'W', red: 'R' }] } });
});
