import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BRACKET_TITLE, DEFAULT_TOURNAMENT_NAME, EMPTY_RESULTS, EMPTY_RESULTS_BRACKET, NO_AWARDS_TEXT, NO_DIVISIONS_TEXT,
  resultCardView, resultDetailView, resultsBracketView, resultsView, tournamentNameText,
} from '../../app/react/results/results-model.ts';

const placements = [
  { place: '1st', name: 'P 2', tier: 'gold' },
  { place: '2nd', name: 'P 3', tier: 'silver' },
  { place: '3rd', name: 'P 1', tier: 'bronze' },
];

test('legacy texts: the static markup and the messages', () => {
  assert.equal(DEFAULT_TOURNAMENT_NAME, 'Kendo Tournament');
  assert.equal(DEFAULT_BRACKET_TITLE, 'Completed Bracket');
  assert.equal(NO_DIVISIONS_TEXT, 'Generate tournament matches to display results.');
  assert.equal(NO_AWARDS_TEXT, 'No special awards entered yet.');
});

test('nothing published yet: the static markup (empty body, default name and modal title)', () => {
  assert.deepEqual(resultsView(EMPTY_RESULTS), { kind: 'empty' });
  assert.equal(tournamentNameText(EMPTY_RESULTS), 'Kendo Tournament');
  assert.deepEqual(resultsBracketView(EMPTY_RESULTS_BRACKET), { kind: 'empty', title: 'Completed Bracket' });
});

test('resultCardView: an individual division in progress has no button', () => {
  assert.deepEqual(resultCardView({ division: 'Open', roundRobin: false, placements: null, progress: null }),
    { kind: 'progress', division: 'Open', message: 'Tournament in progress', button: null });
});

test('resultCardView: a team round robin in progress counts its pairings and offers the standings', () => {
  assert.deepEqual(resultCardView({ division: 'Team Tournament', roundRobin: true, placements: null, progress: { complete: 0, total: 3 } }),
    { kind: 'progress', division: 'Team Tournament', message: 'Round robin in progress • 0/3 pairings complete', button: 'View Standings →' });
});

test('resultCardView: placements, the champion row, the ribbon classes as the legacy template printed them', () => {
  const view = resultCardView({ division: 'Open', roundRobin: false, placements, progress: null });
  assert.equal(view.kind, 'award');
  assert.equal(view.button, 'View Bracket →');
  assert.deepEqual(view.kind === 'award' && view.rows.map(r => [r.className, r.ribbonClass, r.place, r.name]), [
    ['placement-row champion', 'placement-ribbon gold', '1st', 'P 2'],
    // The trailing space of `placement-row ${''}` is kept: the markup is compared as is.
    ['placement-row ', 'placement-ribbon silver', '2nd', 'P 3'],
    ['placement-row ', 'placement-ribbon bronze', '3rd', 'P 1'],
  ]);
  const rr = resultCardView({ division: 'Team Tournament', roundRobin: true, placements: placements.slice(0, 1), progress: null });
  assert.equal(rr.kind === 'award' && rr.button, 'View Standings →');
});

test('resultsView: Completed before In Progress, only sections with cards; the awards as published', () => {
  const card = { division: 'A', roundRobin: false, placements, progress: null };
  const pending = { division: 'B', roundRobin: false, placements: null, progress: null };
  const awards = [{ award: 'Fighting Spirit', name: '', dojo: '' }];
  const view = resultsView({ kind: 'results', tournamentName: 'Taikai', completed: [card], pending: [pending], noDivisions: false, awards });
  assert.equal(view.kind, 'results');
  if (view.kind !== 'results') return;
  assert.deepEqual(view.sections.map(s => [s.heading, s.cards.map(c => c.division)]), [['Completed', ['A']], ['In Progress', ['B']]]);
  assert.deepEqual(view.awards, awards);
  assert.equal(view.noDivisions, false);
  const onlyPending = resultsView({ kind: 'results', tournamentName: 'Taikai', completed: [], pending: [pending], noDivisions: false, awards: [] });
  assert.deepEqual(onlyPending.kind === 'results' && onlyPending.sections.map(s => s.heading), ['In Progress']);
  const none = resultsView({ kind: 'results', tournamentName: 'Kendo Tournament', completed: [], pending: [], noDivisions: true, awards: [] });
  assert.deepEqual(none.kind === 'results' && [none.sections, none.noDivisions], [[], true]);
});

test('tournamentNameText: the published name', () => {
  assert.equal(tournamentNameText({ kind: 'results', tournamentName: 'Aiea Taikai', completed: [], pending: [], noDivisions: true, awards: [] }), 'Aiea Taikai');
});

test('resultDetailView: pools with ranks and "Pool X" titles next to the bracket', () => {
  const view = resultDetailView({
    kind: 'pools',
    pools: [{ label: 'A', standings: [{ name: 'P 1', dojo: 'D', wins: '2', pts: '4' }, { name: 'P 2', dojo: '', wins: '0', pts: '0' }] }],
    bracket: { kind: 'message', text: 'Championship bracket will appear after pools are generated.' },
  });
  assert.deepEqual(view, {
    kind: 'pools',
    pools: [{ title: 'Pool A', standings: [
      { rank: '1', name: 'P 1', dojo: 'D', wins: '2', pts: '4' },
      { rank: '2', name: 'P 2', dojo: '', wins: '0', pts: '0' },
    ] }],
    bracket: { kind: 'message', text: 'Championship bracket will appear after pools are generated.' },
  });
});

test('resultsBracketView: the title and the court screen\'s bracket view', () => {
  const view = resultsBracketView({ kind: 'bracket', title: 'Team Tournament', detail: { kind: 'bracket', bracket: { kind: 'results-empty', text: 'No team bracket is available.' } } });
  assert.deepEqual(view, { kind: 'bracket', title: 'Team Tournament', detail: { kind: 'bracket', bracket: { kind: 'results-empty', text: 'No team bracket is available.' } } });
  const standings = resultsBracketView({ kind: 'bracket', title: 'T', detail: { kind: 'bracket', bracket: { kind: 'team-standings', standings: {
    complete: false, progress: { complete: 1, total: 3 }, compact: false, rows: [], pairs: [],
  } } } });
  assert.equal(standings.kind === 'bracket' && standings.detail.bracket.kind === 'team-standings' && standings.detail.bracket.standings.status,
    'Current standings • 1 of 3 team pairings complete');
});
