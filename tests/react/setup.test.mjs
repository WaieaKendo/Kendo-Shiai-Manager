import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURT_OPTIONS, CUSTOM_TEXT, EMPTY_SETUP_DIVISIONS, EMPTY_SETUP_HEADER, FORMAT_OPTIONS, REMOVE_TEXT, SETUP_HEADER_FALLBACK,
  setupDivisionRowView, setupHeaderText,
} from '../../app/react/setup/setup-model.ts';

const row = (over = {}) => ({ division: 'Open', name: 'Open', enabled: true, custom: false, format: 'Round Robin', court: 'A', ...over });

test("legacy texts and options of divisionSetupRow() and syncSetupHeader()", () => {
  assert.equal(SETUP_HEADER_FALLBACK, 'Kendo Tournament');
  assert.equal(CUSTOM_TEXT, 'custom');
  assert.equal(REMOVE_TEXT, '×');
  assert.deepEqual([...FORMAT_OPTIONS], ['Round Robin', 'Single Elimination']);
  assert.deepEqual(COURT_OPTIONS.map(c => [c.value, c.label]), [['A', 'Court A'], ['B', 'Court B'], ['split', 'Split Between Courts']]);
});

test('nothing published yet: no rows, the static "Kendo Tournament"', () => {
  assert.deepEqual(EMPTY_SETUP_DIVISIONS, { rows: [] });
  assert.equal(setupHeaderText(EMPTY_SETUP_HEADER), 'Kendo Tournament');
});

test('the hero: the name as typed, the fallback only when empty', () => {
  assert.equal(setupHeaderText({ name: 'Spring <Cup> & "Co"' }), 'Spring <Cup> & "Co"');
  assert.equal(setupHeaderText({ name: ' ' }), ' ');
  assert.equal(setupHeaderText({ name: '' }), 'Kendo Tournament');
});

test('a row selects the option equal to its format and court, none otherwise', () => {
  assert.equal(setupDivisionRowView(row()).formatSelected, 'Round Robin');
  assert.equal(setupDivisionRowView(row({ format: 'Single Elimination' })).formatSelected, 'Single Elimination');
  assert.equal(setupDivisionRowView(row({ format: null })).formatSelected, null);
  assert.equal(setupDivisionRowView(row({ format: 'round robin' })).formatSelected, null);
  for (const court of ['A', 'B', 'split']) assert.equal(setupDivisionRowView(row({ court })).courtSelected, court);
  // 'Both' is the team court's value; a division with it (legacy files) shows no court selected.
  assert.equal(setupDivisionRowView(row({ court: 'Both' })).courtSelected, null);
});

test('a row keeps its input (division, name, enabled, custom)', () => {
  const view = setupDivisionRowView(row({ division: "O'ahu", name: "O'ahu", enabled: false, custom: true }));
  assert.equal(view.division, "O'ahu");
  assert.equal(view.enabled, false);
  assert.equal(view.custom, true);
});

test('#31: the move buttons (symbols, accessible names) and a row keeps its move flags', async () => {
  const { MOVE_TEXTS, moveLabel } = await import('../../app/react/setup/setup-model.ts');
  assert.deepEqual(MOVE_TEXTS, { up: '↑', down: '↓' });
  assert.equal(moveLabel('Kids', 'up'), 'Move Kids up');
  assert.equal(moveLabel('Kids', 'down'), 'Move Kids down');
  assert.deepEqual(setupDivisionRowView(row({ move: { up: false, down: true } })).move, { up: false, down: true });
  assert.equal(setupDivisionRowView(row({ enabled: false, move: null })).move, null);
});
