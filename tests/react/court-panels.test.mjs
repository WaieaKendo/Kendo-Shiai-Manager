import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COURT_PANEL_ICONS } from '../../app/react/shared/ui/branding.ts';
import { alignedRow, alignedRowView, pointSlots } from '../../app/react/shared/ui/rows-model.ts';
import { EMPTY_QUEUE, courtQueueView, normalizeQueueGroupLabel, queueRowClass } from '../../app/react/features/court/queue-model.ts';
import {
  EMPTY_CONTEXT, bracketView, courtContextView, kachinukiLines, poolCardView, teamStandingsView,
} from '../../app/react/shared/ui/context-model.ts';

test('default panel icons: the legacy pool-complete mark', () => {
  assert.deepEqual(DEFAULT_COURT_PANEL_ICONS, { poolComplete: '✓' });
});

// ------------------------------------------------------------------- rows

test('pointSlots: two slots, a dot when empty, red only when filled (live alignedPointSlots)', () => {
  assert.deepEqual(pointSlots([], 'W'), [{ className: 'match-point  empty', text: '·' }, { className: 'match-point  empty', text: '·' }]);
  assert.deepEqual(pointSlots(['M'], 'R'), [{ className: 'match-point red ', text: 'M' }, { className: 'match-point  empty', text: '·' }]);
  assert.deepEqual(pointSlots(['M', 'K', 'D'], 'W').map(s => s.text), ['M', 'K'], 'more than two are cut');
  assert.equal(pointSlots(['K'], 'W')[0].className, 'match-point  ');
});

test('alignedRowView: classes, TBD fallbacks and the status class as alignedMatchRowHtml()', () => {
  const plain = alignedRowView(alignedRow({ white: 'Aoki', red: '', status: 'vs' }));
  assert.equal(plain.className, 'aligned-match-row   ');
  assert.equal(plain.white, 'Aoki');
  assert.equal(plain.red, 'TBD');
  assert.equal(plain.statusClass, 'match-status ');
  assert.equal(plain.current, false);
  const current = alignedRowView(alignedRow({ status: 'NOW', current: true, compact: true }));
  assert.equal(current.className, 'aligned-match-row current compact ');
  assert.equal(alignedRowView(alignedRow({ status: 'DONE', compact: true })).className, 'aligned-match-row  compact ');
  assert.equal(alignedRowView(alignedRow({ status: 'DONE' })).statusClass, 'match-status done');
  assert.equal(alignedRowView(alignedRow({ status: 'awaiting' })).statusClass, 'match-status awaiting');
  assert.equal(alignedRowView(alignedRow({ status: 'BYE' })).statusClass, 'match-status ');
  assert.equal(alignedRowView(alignedRow({ status: '' })).status, 'vs', 'an empty status shows vs');
});

// ------------------------------------------------------------------ queue

const side = (name, detail = null) => ({ name, detail });
const row = (extra = {}) => ({ kind: 'queue', team: false, placeholder: false, tiebreak: false, white: side('A', 'Dojo A'), red: side('B', 'Dojo B'), center: 'vs', round: 'A', ...extra });

test('queueRowClass: as each legacy row template wrote it', () => {
  assert.equal(queueRowClass({ team: false, placeholder: false, tiebreak: false }), 'queue-row ');
  assert.equal(queueRowClass({ team: false, placeholder: false, tiebreak: true }), 'queue-row gold');
  assert.equal(queueRowClass({ team: false, placeholder: true, tiebreak: false }), 'queue-row queue-placeholder');
  assert.equal(queueRowClass({ team: true, placeholder: false, tiebreak: false }), 'queue-row team-queue-row ');
  assert.equal(queueRowClass({ team: true, placeholder: false, tiebreak: true }), 'queue-row team-queue-row gold');
  assert.equal(queueRowClass({ team: true, placeholder: true, tiebreak: false }), 'queue-row team-queue-row queue-placeholder');
});

test('normalizeQueueGroupLabel: as the legacy function, and idempotent', () => {
  const cases = { 'Pool A': 'Pool A', Quarterfinal: 'Quarterfinals', 'Semifinal': 'Semifinals', Final: 'Final', 'Final Match': 'Final',
    'Round of 16': 'Round of 16', 'round of 32': 'Round of 32', 'First Round': 'First Round', '': 'Upcoming', '  Team Match ': 'Team Match' };
  for (const [label, title] of Object.entries(cases)) {
    assert.equal(normalizeQueueGroupLabel(label), title, label);
    assert.equal(normalizeQueueGroupLabel(title), title, `${title} again`);
  }
});

test('courtQueueView: titles normalized, empty groups left out, rows mapped', () => {
  assert.deepEqual(courtQueueView(EMPTY_QUEUE), { kind: 'empty' });
  assert.deepEqual(courtQueueView({ kind: 'message', text: 'Queue complete.' }), { kind: 'message', text: 'Queue complete.' });
  const view = courtQueueView({ kind: 'groups', groups: [
    { label: 'Semifinal', rows: [row({ tiebreak: true }), alignedRow({ white: 'W', red: 'R', status: 'awaiting', compact: true })] },
    { label: 'Pool B', rows: [] },
  ] });
  assert.equal(view.kind, 'groups');
  assert.equal(view.groups.length, 1);
  assert.equal(view.groups[0].title, 'Semifinals');
  assert.equal(view.groups[0].rows[0].className, 'queue-row gold');
  assert.deepEqual(view.groups[0].rows[0].white, side('A', 'Dojo A'));
  assert.equal(view.groups[0].rows[1].kind, 'aligned');
  assert.equal(view.groups[0].rows[1].statusClass, 'match-status awaiting');
});

// ---------------------------------------------------------------- context

const standing = (name, wins = '0', pts = '0') => ({ name, dojo: `${name} Dojo`, wins, pts });

test('poolCardView: classes, title, ranks', () => {
  const card = poolCardView({ label: 'B', active: true, complete: false, standings: [standing('Aoki', '2', '4'), standing('Baba')], matches: [alignedRow({ status: 'TIEBREAK', compact: true })] });
  assert.equal(card.className, 'pool-result-card active-pool-card ');
  assert.equal(card.title, 'Pool B');
  assert.deepEqual(card.standings.map(s => [s.rank, s.name, s.wins, s.pts]), [['1', 'Aoki', '2', '4'], ['2', 'Baba', '0', '0']]);
  assert.equal(card.matches[0].status, 'TIEBREAK');
  assert.equal(poolCardView({ label: 'A', active: false, complete: true, standings: [], matches: [] }).className, 'pool-result-card  completed-pool-card');
  assert.equal(poolCardView({ label: 'A', active: false, complete: false, standings: [], matches: [] }).className, 'pool-result-card  ');
  assert.equal(card.tiebreakNote, '', 'no tiebreak: no note');
  assert.deepEqual(card.tiebreakMatches, [], 'no tiebreak bouts: no Tiebreak section');
  const tied = poolCardView({ label: 'A', active: false, complete: true, tiebreakNote: '* Wins and points include the tiebreak. Baba and Cho were tied after the pool at 0 wins, 0 pts; the tiebreak only decides their order.',
    standings: [{ ...standing('Baba', '1', '1'), tiebreak: true }], matches: [], tiebreakMatches: [alignedRow({ status: 'DONE', compact: true })] });
  assert.equal(tied.tiebreakMatches.length, 1);
  assert.equal(tied.tiebreakMatches[0].status, 'DONE');
  assert.equal(tied.tiebreakNote, '* Wins and points include the tiebreak. Baba and Cho were tied after the pool at 0 wins, 0 pts; the tiebreak only decides their order.');
  assert.equal(tied.standings[0].tiebreak, true);
});

test('teamStandingsView: status line, table class, name-fallback note, pairs', () => {
  const rows = [{ rank: '1', name: 'Team A', nameFallback: false, record: '2-0', matchWins: '5', pts: '9' }];
  const live = teamStandingsView({ complete: false, progress: { complete: 1, total: 3 }, compact: true, rows, pairs: null });
  assert.equal(live.status, 'Current standings • 1 of 3 team pairings complete');
  assert.equal(live.tableClass, 'team-standings-table compact');
  assert.equal(live.nameFallbackNote, false);
  assert.equal(live.pairs, null);
  const done = teamStandingsView({ complete: true, progress: { complete: 3, total: 3 }, compact: false, rows: [...rows, { ...rows[0], nameFallback: true }],
    pairs: [{ title: 'Team A vs Team B', row: alignedRow({ white: 'Team A', red: 'Team B', wp: ['2', '5'], rp: ['1', '3'], status: 'Winner: Team A', compact: true }) }] });
  assert.equal(done.status, 'Final standings');
  assert.equal(done.tableClass, 'team-standings-table ');
  assert.equal(done.nameFallbackNote, true);
  assert.equal(done.pairs[0].row.whitePoints[1].text, '5');
});

test('kachinukiLines: eliminated before the index, active at it, waiting after (or with no index)', () => {
  assert.deepEqual(kachinukiLines(['A1', 'A2', 'A3'], 1).map(l => [l.className, l.state]),
    [['competitor-line small', 'eliminated'], ['competitor-line ', 'active'], ['competitor-line ', 'waiting']]);
  assert.deepEqual(kachinukiLines(['A1'], null).map(l => l.state), ['waiting']);
});

test('bracketView and courtContextView: every kind', () => {
  assert.deepEqual(courtContextView(EMPTY_CONTEXT), { kind: 'empty' });
  assert.deepEqual(courtContextView({ kind: 'message', text: 'No active match.' }), { kind: 'message', text: 'No active match.' });
  const cards = [{ round: 'Final', rows: [alignedRow({ status: 'DONE', compact: true }), { kind: 'bracket-match', white: 'Bye', red: 'Winner of Semifinal Match 1', status: 'BYE' }] }];
  const b = bracketView({ kind: 'cards', cards });
  assert.equal(b.cards[0].rows[0].kind, 'aligned');
  assert.equal(b.cards[0].rows[0].statusClass, 'match-status done');
  assert.deepEqual(b.cards[0].rows[1], cards[0].rows[1], 'placeholder bracket matches pass through');
  assert.deepEqual(bracketView({ kind: 'results-empty', text: 'No team bracket is available.' }), { kind: 'results-empty', text: 'No team bracket is available.' });
  const team = bracketView({ kind: 'team-bracket', rounds: [{ round: 'Final', rows: [alignedRow({ status: 'awaiting' })] }] });
  assert.equal(team.rounds[0].rows[0].statusClass, 'match-status awaiting');

  const pools = courtContextView({ kind: 'pools', inProgress: [{ label: 'A', active: true, complete: false, standings: [], matches: [] }], bracket: { kind: 'message', text: 'x' }, completed: [] });
  assert.equal(pools.inProgress[0].className, 'pool-result-card active-pool-card ');
  assert.deepEqual(pools.bracket, { kind: 'message', text: 'x' });
  const se = courtContextView({ kind: 'single-elim', left: [], right: cards });
  assert.deepEqual([se.left.length, se.right.length], [0, 1]);
  const sheet = courtContextView({ kind: 'team-sheet', sheet: { teamWhite: 'Team A', teamRed: 'Team B', rows: [alignedRow({ status: 'NOW', current: true })], totals: { wWins: '1', wPts: '2', rWins: '0', rPts: '1' } } });
  assert.equal(sheet.rows[0].className, 'aligned-match-row current  ');
  assert.equal(sheet.totals.wPts, '2');
  const k = courtContextView({ kind: 'kachinuki', sheet: { teamWhite: 'Team A', teamRed: 'Team B', current: alignedRow({ status: 'NOW', current: true }), white: { lineup: ['A1', 'A2'], index: 1 }, red: { lineup: ['B1'], index: 0 } } });
  assert.deepEqual(k.white.map(l => l.state), ['eliminated', 'active']);
  assert.deepEqual(k.red.map(l => l.state), ['active']);
  assert.equal(courtContextView({ kind: 'bracket', bracket: { kind: 'team-standings', standings: { complete: true, progress: { complete: 1, total: 1 }, compact: false, rows: [], pairs: [] } } }).bracket.standings.status, 'Final standings');
});

// #130: preview names remain literal (including "Semifinal"), never group-normalized.
const upNext = { division: 'Junior Semifinal', matches: [
  { white: 'A', red: 'B' }, { white: 'C', red: 'D' }, { white: 'E', red: 'F' },
] };
test('courtQueueView: empty own queue shows at most two read-only next-division rows', () => {
  for (const input of [EMPTY_QUEUE, { kind: 'groups', groups: [{ label: 'Pool A', rows: [] }] },
    { kind: 'message', text: 'Queue complete.' }]) {
    const view = courtQueueView({ ...input, upNext });
    assert.equal(view.kind, 'up-next');
    assert.equal(view.title, 'Up next: Junior Semifinal — not started');
    assert.equal(view.results, undefined);
    assert.equal(view.rows.length, 2);
    assert.deepEqual(view.rows.map(r => r.white.name), ['A', 'C']);
  }
});
test('courtQueueView: own queued rows take precedence over the next division', () => {
  const view = courtQueueView({ kind: 'groups', groups: [{ label: 'Pool A', rows: [row()] }], upNext });
  assert.equal(view.kind, 'groups');
  assert.equal(view.groups[0].rows.length, 1);
});
test('courtQueueView: no next division or no next matches preserves the own view', () => {
  for (const next of [undefined, null, { division: 'Next', matches: [] }]) {
    assert.equal(courtQueueView({ kind: 'empty', upNext: next }).kind, 'empty');
  }
});

test('courtQueueView: results remain above up-next, including the team Completed fallback', () => {
  const results = { title: 'Final Results', lines: [{ place: '1st', name: 'Aki' }] };
  for (const value of [results, null]) {
    const view = courtQueueView({ kind: 'results', results: value, upNext });
    assert.equal(view.kind, 'up-next');
    assert.equal(view.results, value);
    assert.equal(view.title, 'Up next: Junior Semifinal — not started');
    assert.equal(view.rows.length, 2);
  }
});
test('courtQueueView: adding up-next preserves Final Results title and placement lines unchanged', () => {
  const results = { title: 'Final Results', lines: [
    { place: '1st', name: 'Aki' }, { place: '2nd', name: 'Bo' }, { place: '3rd', name: 'Cy' },
  ] };
  const before = structuredClone(results);
  const own = courtQueueView({ kind: 'results', results });
  const preview = courtQueueView({ kind: 'results', results, upNext });
  assert.deepEqual(preview.results, own.results);
  assert.deepEqual(results, before);
});
