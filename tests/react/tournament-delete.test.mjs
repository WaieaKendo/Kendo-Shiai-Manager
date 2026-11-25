// Delete tournament (issue #26): the confirmation dialog's rules (app/react/features/shell/dialogs-model.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELETE_TEXTS, deleteDevicesText, deleteEnabled, deleteNameMatches, deleteRequiredName,
} from '../../app/react/features/shell/dialogs-model.ts';

test('the name to type is the tournament name without spaces around it', () => {
  assert.equal(deleteRequiredName('  Summer Cup '), 'Summer Cup');
  assert.equal(deleteRequiredName(''), DELETE_TEXTS.untitled);
  assert.equal(deleteRequiredName('   '), DELETE_TEXTS.untitled);
});

test('the typed name must match exactly: case-sensitive, spaces around it ignored', () => {
  assert.equal(deleteNameMatches('Summer Cup', 'Summer Cup'), true);
  assert.equal(deleteNameMatches('Summer Cup', '  Summer Cup\t'), true);
  assert.equal(deleteNameMatches(' Summer Cup ', 'Summer Cup'), true);
  for (const wrong of ['', ' ', 'summer cup', 'SUMMER CUP', 'Summer', 'Summer Cup 2', 'Summer  Cup', 'Summer Cup.']) {
    assert.equal(deleteNameMatches('Summer Cup', wrong), false, JSON.stringify(wrong));
  }
});

test('a tournament without a name needs its placeholder typed, never nothing', () => {
  assert.equal(deleteNameMatches('', ''), false);
  assert.equal(deleteNameMatches('  ', '  '), false);
  assert.equal(deleteNameMatches('', DELETE_TEXTS.untitled), true);
});

test('Delete is enabled only with the name typed and no request on its way', () => {
  assert.equal(deleteEnabled('Summer Cup', '', false), false);
  assert.equal(deleteEnabled('Summer Cup', 'summer cup', false), false);
  assert.equal(deleteEnabled('Summer Cup', 'Summer Cup', false), true);
  assert.equal(deleteEnabled('Summer Cup', 'Summer Cup', true), false);
});

test('the devices connected right now', () => {
  assert.equal(deleteDevicesText(0), 'No other device is connected right now.');
  assert.equal(deleteDevicesText(1), 'No other device is connected right now.');
  assert.equal(deleteDevicesText(2), '2 devices are connected right now, this one included.');
  assert.equal(deleteDevicesText(12), '12 devices are connected right now, this one included.');
});
