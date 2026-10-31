import test from 'node:test';
import assert from 'node:assert/strict';
import { ksmResultDetail, ksmResultsBracketInputData, ksmResultsDashboardInput, startResultsInput } from '../../app/react/features/results/publish.ts';

// A fake `window` with the legacy functions publish.ts reads through shared/legacy.ts.
// `placements` maps a division to resultPlacements(); `complete` lists finished divisions.
function fakeWindow({
  state = {}, placements = {}, complete = [], teamDivisions = [], grandChampions = [], rr = [],
  entrants = null, readOnly = false, teamEnabled = 'Enabled', name, pools = {}, brackets = {},
} = {}) {
  const listeners = new Map();
  const s = { generated: true, divisions: [], allMatches: {}, awards: [], pools: {}, ...state };
  const win = {
    ksmLegacyState: () => s,
    ksmText: x => String(x || ''),
    ksmDivisionName: id => (id === 'open' ? 'Open Division' : id),
    resultPlacements: div => placements[div] ?? [],
    isTeamRoundRobinDivision: div => rr.includes(div),
    teamRoundRobinProgress: () => ({ complete: 2, total: 6 }),
    ksmGrandChampion: id => grandChampions.find(g => g.id === id) ?? null,
    ksmGrandChampions: () => grandChampions,
    divisionComplete: div => complete.includes(div),
    ksmTeamDivisions: () => teamDivisions,
    eligibleTeams: div => entrants?.[div] ?? ['t'],
    eligibleIndividuals: div => entrants?.[div] ?? ['p'],
    tournamentSettings: () => ({ teamEnabled }),
    isReadOnlySession: () => readOnly,
    isTeamDivision: div => teamDivisions.some(d => d.id === div),
    ksmTeamResults: div => ({ kind: 'team-bracket', rounds: [], div }),
    ksmPoolStandingRows: (div, label) => ({ note: `note ${label}`, rows: [{ name: 'A', dojo: '', wins: '1', pts: '2', tiebreak: false }] }),
    ksmBracket: div => brackets[div] ?? { kind: 'message', text: `bracket ${div}` },
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    dispatch: type => listeners.get(type)?.(),
  };
  s.pools = pools;
  if (name !== undefined) win.tName = { value: name };
  globalThis.window = win;
  return win;
}

const matches = n => Array.from({ length: n }, () => ({}));

test('no divisions: the default name, no cards, the empty-state flag', () => {
  fakeWindow({ state: { generated: false } });
  assert.deepEqual(ksmResultsDashboardInput(), {
    kind: 'results', tournamentName: 'Kendo Tournament', completed: [], pending: [], noDivisions: true, awards: [], readOnly: false,
  });
});

test('the tournament name and the awards (text as esc() showed it); a spectator is read-only', () => {
  fakeWindow({ name: 'Aiea <Taikai>', readOnly: true, state: { awards: [{ award: 'Spirit', name: 'Ann' }, { award: null }] } });
  const input = ksmResultsDashboardInput();
  assert.equal(input.tournamentName, 'Aiea <Taikai>');
  assert.deepEqual(input.awards, [{ award: 'Spirit', name: 'Ann', dojo: '' }, { award: '', name: '', dojo: '' }]);
  assert.equal(input.readOnly, true);
});

test('a division of the event that is not drawn yet gets the "Not drawn yet" placeholder', () => {
  fakeWindow({ state: { divisions: ['open'] } });
  const input = ksmResultsDashboardInput();
  assert.deepEqual(input.pending, [{ division: 'open', name: 'Open Division', roundRobin: false, placements: null, progress: null, notDrawn: true }]);
  assert.equal(input.noDivisions, true);
});

test('a division nobody registered for gets no card', () => {
  fakeWindow({ state: { divisions: ['open'] }, entrants: { open: [] } });
  assert.deepEqual(ksmResultsDashboardInput().pending, []);
});

test('a grand champion waits on its unfinished sources, in the placeholder', () => {
  const gc = { id: 'gc:1', sources: ['open', 'kids'] };
  fakeWindow({ state: { divisions: ['open', 'kids'], allMatches: { open: matches(1), kids: matches(1) } }, grandChampions: [gc], complete: ['open'] });
  const input = ksmResultsDashboardInput();
  const card = input.pending.find(c => c.division === 'gc:1');
  assert.deepEqual(card, { division: 'gc:1', name: 'gc:1', roundRobin: false, placements: null, progress: null, waitingFor: ['kids'] });
  assert.deepEqual(input.completed.map(c => c.division), ['open']);
  assert.equal(input.noDivisions, false);
});

test('an in-progress team round robin shows its pairing count', () => {
  fakeWindow({ state: { divisions: [], allMatches: { 'Team Tournament': matches(3) } }, teamDivisions: [{ id: 'Team Tournament' }], rr: ['Team Tournament'] });
  const input = ksmResultsDashboardInput();
  assert.deepEqual(input.pending, [{ division: 'Team Tournament', name: 'Team Tournament', roundRobin: true, placements: null, progress: { complete: 2, total: 6 } }]);
});

test('a team division is left out when team divisions are disabled and nothing is drawn', () => {
  fakeWindow({ teamDivisions: [{ id: 'Team Tournament' }], teamEnabled: 'Disabled' });
  assert.deepEqual(ksmResultsDashboardInput().pending, []);
});

test('a completed division: placements as text, the tier printed as it is', () => {
  fakeWindow({
    state: { divisions: ['open'], allMatches: { open: matches(2) } }, complete: ['open'],
    placements: { open: [{ place: '1st', name: 'A <b>', tier: 'gold' }, { place: '2nd', name: 'B', tier: 'silver' }] },
  });
  const input = ksmResultsDashboardInput();
  assert.deepEqual(input.pending, []);
  assert.deepEqual(input.completed, [{
    division: 'open', name: 'Open Division', roundRobin: false, progress: null,
    placements: [{ place: '1st', name: 'A <b>', tier: 'gold' }, { place: '2nd', name: 'B', tier: 'silver' }],
  }]);
});

test('the bracket detail of a pool division: each pool with its standings and note, then the bracket', () => {
  fakeWindow({ pools: { open: [{ label: 'A' }, { label: 'B' }] } });
  const detail = ksmResultDetail('open');
  assert.equal(detail.kind, 'pools');
  assert.deepEqual(detail.pools.map(p => [p.label, p.tiebreakNote]), [['A', 'note A'], ['B', 'note B']]);
  assert.deepEqual(detail.bracket, { kind: 'message', text: 'bracket open' });
});

test('the bracket detail of a division without pools is its bracket alone', () => {
  fakeWindow();
  assert.deepEqual(ksmResultDetail('open'), { kind: 'bracket', bracket: { kind: 'message', text: 'bracket open' } });
});

test('the bracket detail of a team division is the team results; the title is the division name', () => {
  fakeWindow({ teamDivisions: [{ id: 'Team Tournament' }] });
  assert.deepEqual(ksmResultsBracketInputData('Team Tournament'), {
    kind: 'bracket', title: 'Team Tournament', detail: { kind: 'bracket', bracket: { kind: 'team-bracket', rounds: [], div: 'Team Tournament' } },
  });
  assert.equal(ksmResultsBracketInputData('open').title, 'Open Division');
  assert.equal(ksmResultsBracketInputData(null).title, '');
});

test('a missing legacy function is a clear error', () => {
  globalThis.window = {};
  assert.throws(() => ksmResultsDashboardInput(), /ksmLegacyState\(\) is not defined/);
});

test('startResultsInput: computes on each event, and on start only after an earlier signal', () => {
  let win = fakeWindow();
  startResultsInput();
  assert.equal(win.ksmResultsInput, undefined, 'no signal yet: nothing computed');
  assert.equal(win.ksmResultsBracketInput, undefined);
  win.dispatch('ksm:results');
  assert.equal(win.ksmResultsInput.kind, 'results');
  win.dispatch('ksm:results-bracket');
  assert.equal(win.ksmResultsBracketInput, undefined, 'no division was asked for');
  win.ksmResultsBracketRequested = { div: 'open' };
  win.dispatch('ksm:results-bracket');
  assert.equal(win.ksmResultsBracketInput.title, 'Open Division');

  win = fakeWindow();
  win.ksmResultsRequested = true;
  win.ksmResultsBracketRequested = { div: 'open' };
  startResultsInput();
  assert.equal(win.ksmResultsInput.kind, 'results', 'a signal before the module ran: computed on start');
  assert.equal(win.ksmResultsBracketInput.kind, 'bracket');
});
