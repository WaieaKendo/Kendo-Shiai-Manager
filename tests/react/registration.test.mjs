import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PLAYERS, EMPTY_STATUS, PLAYER_HEADERS, REMOVE_TEXT, STATUS_TITLE,
  statusClass, statusText, statusView,
} from '../../app/react/features/registration/registration-model.ts';

const row = (over = {}) => ({ index: 0, name: 'Ann', dojo: 'Aiea', seed: '', status: 'Registered', checked: false, noShow: false, selected: [0], ...over });
const status = (over = {}) => ({ valid: true, competitors: 0, divisions: 0, courts: '2', errors: 0, ...over });

test('legacy texts of renderReg() and renderTournamentStatus()', () => {
  assert.deepEqual([...PLAYER_HEADERS], ['Name', 'Dojo', 'Division', 'Seed', 'Status', '']);
  assert.equal(REMOVE_TEXT, '×');
  assert.equal(STATUS_TITLE, 'Tournament Status');
});

test('nothing published yet: an empty table, an empty card', () => {
  assert.deepEqual(EMPTY_PLAYERS, { divisions: [], rows: [] });
  assert.equal(EMPTY_STATUS, null);
});

test('the status chip: text from the status, class with the stored status as is', () => {
  assert.equal(statusText(row({ checked: true, status: 'Checked' })), '● Checked In');
  assert.equal(statusText(row({ noShow: true, status: 'NoShow' })), '● No Show');
  assert.equal(statusText(row()), '○ Registered');
  // Any other stored status (e.g. pasted) shows Registered and keeps its word in the class.
  assert.equal(statusText(row({ status: 'Late' })), '○ Registered');
  assert.equal(statusClass(row({ status: 'Late' })), 'status Late');
  assert.equal(statusClass(row({ status: 'NoShow' })), 'status NoShow');
  assert.equal(statusClass(row({ status: 'undefined' })), 'status undefined');
});

test('the status card: verdict, counts (singular for 1) and the issue line', () => {
  assert.deepEqual(statusView(status()), {
    verdict: 'Ready to Generate', counts: '0 competitors • 0 divisions • 2 courts', message: 'No blocking validation issues.',
  });
  assert.deepEqual(statusView(status({ valid: false, competitors: 1, divisions: 1, courts: '3', errors: 1 })), {
    verdict: 'Needs Attention', counts: '1 competitor • 1 division • 3 courts', message: '1 validation issue(s). Generate Tournament to review.',
  });
});

test('owner decision 15: a division no longer offered is an extra "(not offered)" option', async () => {
  const { notOfferedLabel } = await import('../../app/react/features/registration/registration-model.ts');
  assert.equal(notOfferedLabel('Women’s Open'), 'Women’s Open (not offered)');
});
