import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIVISION_COMPLETE_TEXT, EMPTY_TV, NO_UPCOMING_TEXT, UPCOMING_TITLE, kachinukiState, nameParts, tvBodyView, tvView,
} from '../../app/react/tv/tv-model.ts';

const header = { court: 'A', division: 'Open', meta: 'Pool A' };

test('tvView: nothing published yet is the empty static markup', () => {
  assert.deepEqual(tvView(EMPTY_TV), { kind: 'empty' });
});

test('legacy texts: Upcoming Matches, an empty card, the Final Results footer', () => {
  assert.equal(UPCOMING_TITLE, 'Upcoming Matches');
  assert.equal(NO_UPCOMING_TEXT, 'No additional match scheduled');
  assert.equal(DIVISION_COMPLETE_TEXT, 'Division Complete');
});

test('nameParts: the first name and the rest, a dash for an empty name (tv3Name())', () => {
  assert.deepEqual(nameParts('P 1'), ['P', '1']);
  assert.deepEqual(nameParts('Anna Maria de Souza'), ['Anna', 'Maria de Souza']);
  assert.deepEqual(nameParts('  Kenji  '), ['Kenji']);
  assert.deepEqual(nameParts('Winner of Semifinal Match 1'), ['Winner', 'of Semifinal Match 1']);
  assert.deepEqual(nameParts(''), ['—']);
  assert.deepEqual(nameParts('   '), ['—']);
});

test('kachinukiState: eliminated before the current fighter, then active, then waiting', () => {
  assert.deepEqual([0, 1, 2].map(i => kachinukiState(i, 1)), ['eliminated', 'active', 'waiting']);
  assert.deepEqual([0, 1, 2].map(i => kachinukiState(i, 0)), ['active', 'waiting', 'waiting']);
  assert.deepEqual([0, 1, 2].map(i => kachinukiState(i, 3)), ['eliminated', 'eliminated', 'eliminated']);
});

test('tvView: an idle court keeps its header and two empty Upcoming cards', () => {
  const view = tvView({ kind: 'tv', court: 'B', division: 'Kids', meta: '', body: { kind: 'idle' }, upcoming: [null, null] });
  assert.deepEqual(view, {
    kind: 'tv', header: { court: 'Court B', division: 'Kids', meta: '' }, body: { kind: 'idle' },
    footer: { kind: 'upcoming', cards: [null, null] },
  });
});

test('tvView: an individual match (names split, dojos, point strings with the leading dash)', () => {
  const upcoming = [{ white: 'P 3', red: 'P 2', whiteSub: 'Dojo 3', redSub: '' }, null];
  const view = tvView({
    kind: 'tv', ...header, upcoming,
    body: { kind: 'individual', white: { name: 'P 1', sub: 'Dojo 1' }, red: { name: 'P 2', sub: '' }, points: { W: ['M', 'K'], R: [] } },
  });
  assert.equal(view.kind, 'tv');
  assert.deepEqual(view.header, { court: 'Court A', division: 'Open', meta: 'Pool A' });
  assert.deepEqual(view.body, {
    kind: 'individual', white: { nameParts: ['P', '1'], sub: 'Dojo 1' }, red: { nameParts: ['P', '2'], sub: '' },
    whitePoints: 'M K', redPoints: '—',
  });
  assert.deepEqual(view.footer, { kind: 'upcoming', cards: upcoming });
});

test('tvBodyView: a team pairing (positions from 1, the active bout, three or five rows)', () => {
  const row = (white, red, active = false) => ({ white, red, points: { W: active ? ['M'] : [], R: [] }, active });
  const summary = { wWins: '1', wPts: '2', rWins: '0', rPts: '0' };
  const three = tvBodyView({ kind: 'team', teamWhite: 'Team A', teamRed: 'Team B', rows: [row('A1', 'B1'), row('A2', 'B2', true), row('A3', 'B3')], summary });
  assert.equal(three.kind, 'team');
  assert.equal(three.rosterClass, 'tv3-roster three');
  assert.deepEqual(three.rows[1], { pos: '2', white: 'A2', red: 'B2', whitePoints: 'M', redPoints: '—', active: true });
  assert.deepEqual(three.summary, summary);
  const playoff = tvBodyView({ kind: 'team', teamWhite: 'Team A', teamRed: 'Team B', rows: [1, 2, 3, 4].map(i => row(`A${i}`, `B${i}`)), summary });
  assert.equal(playoff.rosterClass, 'tv3-roster five', 'a representative playoff (4 rows) uses the five-row roster');
});

test('tvBodyView: kachinuki (current fighters without dojos, lineup states)', () => {
  const view = tvBodyView({
    kind: 'kachinuki', white: 'TA2', red: 'TB1', points: { W: [], R: ['D'] }, teamWhite: 'Team A', teamRed: 'Team B',
    lineupW: ['TA1', 'TA2', 'TA3'], lineupR: ['TB1', '—', '—'], wIndex: 1, rIndex: 0,
  });
  assert.equal(view.kind, 'kachinuki');
  assert.deepEqual(view.white, { nameParts: ['TA2'], sub: '' });
  assert.equal(view.whitePoints, '—');
  assert.equal(view.redPoints, 'D');
  assert.deepEqual(view.rowsW.map(r => r.state), ['eliminated', 'active', 'waiting']);
  assert.deepEqual(view.rowsR, [{ name: 'TB1', state: 'active' }, { name: '—', state: 'waiting' }, { name: '—', state: 'waiting' }]);
});

test('tvView: Final Results use the division-complete panel and the "Division Complete" footer', () => {
  const view = tvView({
    kind: 'tv', court: 'A', division: 'Open', meta: 'Final Results', upcoming: [],
    body: { kind: 'results', complete: { complete: true, placements: [{ place: '1st', name: 'P 2', tier: 'gold' }, { place: '3rd', name: 'P 1', tier: '' }] } },
  });
  assert.equal(view.kind, 'tv');
  assert.deepEqual(view.body, {
    kind: 'results', complete: { complete: true, rows: [{ place: '1st', name: 'P 2', placeClass: 'gold' }, { place: '3rd', name: 'P 1', placeClass: '' }] },
  });
  assert.deepEqual(view.footer, { kind: 'results' });
});

test('tvView: hansoku on an individual match and a team row (owner decision 5)', () => {
  const view = tvView({
    kind: 'tv', ...header, upcoming: [null, null],
    body: { kind: 'individual', white: { name: 'P 1', sub: '' }, red: { name: 'P 2', sub: '' }, points: { W: [], R: ['H'] }, hansoku: { W: 2, R: 0 } },
  });
  assert.deepEqual(view.body.hansoku, { white: '△ △', red: '' });
  const team = tvView({
    kind: 'tv', ...header, upcoming: [null, null],
    body: { kind: 'team', teamWhite: 'A', teamRed: 'B', summary: { wWins: '0', wPts: '0', rWins: '0', rPts: '0' }, rows: [
      { white: 'A1', red: 'B1', points: { W: [], R: [] }, hansoku: { W: 0, R: 1 }, active: true },
      { white: 'A2', red: 'B2', points: { W: [], R: [] }, active: false },
    ] },
  });
  assert.deepEqual(team.body.rows[0].hansoku, { white: '', red: '△' });
  assert.equal('hansoku' in team.body.rows[1], false);
});
