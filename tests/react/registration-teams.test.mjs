import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_EXHIBITIONS, EMPTY_TABS, EMPTY_TEAMS, EXHIBITION_HEADERS, TAB_BUTTONS, TEAM_NAME_LABEL,
  tabButtonClass, teamFormatLine,
} from '../../app/react/registration/teams-model.ts';

test('legacy texts of renderTeams() and renderExhibitions()', () => {
  assert.equal(TEAM_NAME_LABEL, 'Team Name');
  assert.deepEqual([...EXHIBITION_HEADERS], ['White Player', 'Red Player', 'Status', '']);
});

test('nothing published yet: the static markup (empty team table, empty exhibition table, Individual Players)', () => {
  assert.equal(EMPTY_TEAMS, null);
  assert.equal(EMPTY_EXHIBITIONS, null);
  assert.deepEqual(EMPTY_TABS, { mode: 'individual' });
});

test('the card format line: team format, then tournament format', () => {
  assert.equal(teamFormatLine({ format: 'Kachinuki', tournamentFormat: 'Round Robin' }), 'Kachinuki • Round Robin');
  assert.equal(teamFormatLine({ format: '5-Person Team', tournamentFormat: 'Single Elimination' }), '5-Person Team • Single Elimination');
});

test('the tab bar: ids, test IDs, labels and order of the static markup', () => {
  assert.deepEqual(TAB_BUTTONS.map(b => [b.id, b.testId, b.label]), [
    ['indTab', 'reg-tab-individual', 'Individual Players'],
    ['teamTab', 'reg-tab-team', 'Team Registration'],
    ['exhibitionTab', 'reg-tab-exhibition', 'Exhibition'],
    ['poolsTab', 'reg-tab-pools', 'Pools'],
    ['generateBtn', 'generate-button', 'Generate Tournament'],
    ['regenerateDivisionBtn', 'regenerate-division-button', 'Regenerate Single Division'],
  ]);
});

test('the tab classes as regTab() toggled them; the action buttons keep theirs', () => {
  const [ind, team, , pools, generate, regenerate] = TAB_BUTTONS;
  assert.equal(tabButtonClass(ind, 'individual'), 'tab active');
  assert.equal(tabButtonClass(team, 'individual'), 'tab');
  assert.equal(tabButtonClass(pools, 'pools'), 'tab active');
  // An unknown tab marks none.
  assert.ok(TAB_BUTTONS.filter(b => b.mode).every(b => tabButtonClass(b, 'bogus') === 'tab'));
  assert.equal(tabButtonClass(generate, 'team'), 'primary');
  assert.equal(tabButtonClass(regenerate, 'team'), undefined);
});

test('owner decision 19: the Exhibition tab only while exhibitions are enabled', async () => {
  const { visibleTabButtons, TAB_BUTTONS } = await import('../../app/react/registration/teams-model.ts');
  assert.deepEqual(visibleTabButtons({ mode: 'individual', exhibitions: true }), TAB_BUTTONS);
  assert.deepEqual(visibleTabButtons({ mode: 'individual' }), TAB_BUTTONS, 'nothing published about it: as before');
  assert.deepEqual(visibleTabButtons({ mode: 'individual', exhibitions: false }).map(b => b.testId),
    ['reg-tab-individual', 'reg-tab-team', 'reg-tab-pools', 'generate-button', 'regenerate-division-button']);
});
