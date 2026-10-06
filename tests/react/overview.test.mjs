import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TOURNAMENT_NAME, DIVISION_PROGRESS_LABEL, EMPTY_OVERVIEW, NO_MATCH_TEXT, OVERALL_PROGRESS_LABEL, OVERVIEW_KICKER,
  overviewCourtView, overviewView,
} from '../../app/react/overview/overview-model.ts';

const court = (over = {}) => ({
  court: 'A', division: 'Open', round: 'Pool A', completed: 1, total: 6, remaining: 5, variable: false,
  current: { white: 'P 1', red: 'P 2' }, onDeck: { white: 'P 3', red: '—' }, following: null, ...over,
});

test('legacy texts: the static markup and the templates', () => {
  assert.equal(OVERVIEW_KICKER, 'Tournament Overview');
  assert.equal(OVERALL_PROGRESS_LABEL, 'Overall Progress');
  assert.equal(DIVISION_PROGRESS_LABEL, 'Division Progress');
  assert.equal(DEFAULT_TOURNAMENT_NAME, 'Kendo Tournament');
  assert.equal(NO_MATCH_TEXT, 'No match scheduled');
});

test('nothing published yet: the static markup (no bar width, no court cards)', () => {
  assert.deepEqual(overviewView(EMPTY_OVERVIEW),
    { tournamentName: 'Kendo Tournament', count: '0 / 0 Matches', remaining: '0 Remaining', barWidth: null, courts: [] });
});

test('overviewView: fixed totals, the bar rounded to a whole percent', () => {
  const view = overviewView({ kind: 'overview', tournamentName: 'Aiea <Taikai>', overall: { completed: 1, total: 6, remaining: 5, variable: false }, courts: [] });
  assert.deepEqual(view, { tournamentName: 'Aiea <Taikai>', count: '1 / 6 Matches', remaining: '5 Remaining', barWidth: '17%', courts: [] });
});

test('overviewView: no matches at all is 0 / 0 with a 0% bar', () => {
  const view = overviewView({ kind: 'overview', tournamentName: 'T', overall: { completed: 0, total: 0, remaining: 0, variable: false }, courts: [] });
  assert.equal(view.count, '0 / 0 Matches');
  assert.equal(view.barWidth, '0%');
});

test('overviewView: a kachinuki division makes the overall line variable (its known bouts in the total, F15)', () => {
  // tournamentSummary(): 3 fixed-format matches + 18 kachinuki bouts known so far, 18 completed.
  const view = overviewView({ kind: 'overview', tournamentName: 'T', overall: { completed: 18, total: 21, remaining: 3, variable: true }, courts: [] });
  assert.equal(view.count, '18 / 21 Matches so far');
  assert.equal(view.remaining, 'Kachinuki totals vary by result');
  // The bar follows completed / total and so stays within 100% (it went to 600% before F15).
  assert.equal(view.barWidth, '86%');
});

test('overviewCourtView: a fixed-format court card with its bar as the template printed it', () => {
  assert.deepEqual(overviewCourtView(court()), {
    title: 'Court A', division: 'Open', round: 'Pool A', progress: '1 / 6 Matches', remaining: '5 Remaining', barStyle: 'width:17%',
    rows: [
      { label: 'Current', match: { white: 'P 1', red: 'P 2' } },
      { label: 'On Deck', match: { white: 'P 3', red: '—' } },
      { label: 'Following', match: null },
    ],
  });
});

test('overviewCourtView: no active division (0 / 0, a 0% bar)', () => {
  const view = overviewCourtView(court({ court: 'B', division: 'No active division', round: '', completed: 0, total: 0, remaining: 0, current: null, onDeck: null }));
  assert.equal(view.title, 'Court B');
  assert.equal(view.progress, '0 / 0 Matches');
  assert.equal(view.remaining, '0 Remaining');
  assert.equal(view.barStyle, 'width:0%');
  assert.deepEqual(view.rows.map(r => r.match), [null, null, null]);
});

test('overviewCourtView: a kachinuki court has no bar and no fixed total', () => {
  const view = overviewCourtView(court({ completed: 4, total: null, remaining: null, variable: true }));
  assert.equal(view.progress, '4 Matches Completed');
  assert.equal(view.remaining, 'Total varies by wins and ties');
  assert.equal(view.barStyle, null);
});

test('overviewView: the courts in the published order', () => {
  const view = overviewView({ kind: 'overview', tournamentName: 'T', overall: { completed: 0, total: 0, remaining: 0, variable: false }, courts: [court(), court({ court: 'B' })] });
  assert.deepEqual(view.courts.map(c => c.title), ['Court A', 'Court B']);
});
