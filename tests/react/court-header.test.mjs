import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_HEADER, courtHeaderView } from '../../app/react/court/header-model.ts';

const input = (extra = {}) => ({
  tournamentName: 'Aloha Taikai', court: 'B', divisions: ['Open', 'Women'], currentDivision: 'Women',
  divisionTitle: 'Women', matchLine: 'Pool A · Match 2', ...extra,
});

test('courtHeaderView: the static markup before any legacy writer ran', () => {
  assert.deepEqual(courtHeaderView(EMPTY_HEADER), {
    tournamentName: 'Kendo Tournament', title: 'Court A', divisions: [], selectValue: null, divisionTitle: '—', matchLine: 'No active match',
  });
});

test('courtHeaderView: shows what the legacy writers published', () => {
  assert.deepEqual(courtHeaderView(input()), {
    tournamentName: 'Aloha Taikai', title: 'Court B', divisions: ['Open', 'Women'], selectValue: 'Women', divisionTitle: 'Women', matchLine: 'Pool A · Match 2',
  });
});

test('courtHeaderView: division selection as the legacy renderDivisions() left it', () => {
  assert.equal(courtHeaderView(input({ currentDivision: '' })).selectValue, null, 'no current division: the first option');
  assert.equal(courtHeaderView(input({ currentDivision: 'Kids' })).selectValue, 'Kids', 'a division that is not an option is still assigned (selects nothing)');
});

test('courtHeaderView: does not share the published option list', () => {
  const published = input();
  const view = courtHeaderView(published);
  view.divisions.push('Extra');
  assert.deepEqual(published.divisions, ['Open', 'Women']);
});
