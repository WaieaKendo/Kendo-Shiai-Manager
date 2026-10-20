import test from 'node:test';
import assert from 'node:assert/strict';
import { grandChampionControls, grandChampionSourceOptions, grandChampionStatus } from '../../app/react/setup/grand-champion-model.ts';

const row = (over = {}) => ({
  id: 'gc:1', name: 'Grand Champion', sources: ['Open', 'Women'], format: 'Single Elimination', court: 'B', awardMode: 'top1',
  move: { up: false, down: false }, error: null, waiting: [], duplicates: [], entrants: [null, null],
  drawn: false, started: false, complete: false, champion: null, decide: false, canWithdraw: false, ...over,
});

test('controls: a drawn row locks its structure, name and awards stay; one not drawn yet stays editable; read-only locks all; format from three sources', () => {
  assert.deepEqual(grandChampionControls({ locked: false, readOnly: false }, row()), { name: true, sources: true, format: false, court: true, awards: true, remove: true });
  assert.equal(grandChampionControls({ locked: false, readOnly: false }, row({ sources: ['A', 'B', 'C'] })).format, true);
  assert.deepEqual(grandChampionControls({ locked: true, readOnly: false }, row({ sources: ['A', 'B', 'C'], drawn: true })), { name: true, sources: false, format: false, court: false, awards: true, remove: false });
  // Another row is drawn (the note shows), this one is not: still editable.
  assert.deepEqual(grandChampionControls({ locked: true, readOnly: false }, row({ sources: ['A', 'B', 'C'] })), { name: true, sources: true, format: true, court: true, awards: true, remove: true });
  assert.ok(Object.values(grandChampionControls({ locked: false, readOnly: true }, row())).every(v => v === false));
});

test('source options: the divisions in use, then a chosen one no longer in use (flagged)', () => {
  const options = grandChampionSourceOptions({ divisions: [{ key: 'Open', name: 'Open' }, { key: 'Masters', name: 'Masters' }] }, row());
  assert.deepEqual(options, [
    { key: 'Open', name: 'Open', checked: true, missing: false },
    { key: 'Masters', name: 'Masters', checked: false, missing: false },
    { key: 'Women', name: 'Women', checked: true, missing: true },
  ]);
});

test('status: error, decision, champion, duplicate, playing, waiting', () => {
  assert.deepEqual(grandChampionStatus(row({ error: 'Choose at least two divisions.' })), { tone: 'warn', text: 'Choose at least two divisions.' });
  assert.equal(grandChampionStatus(row({ decide: true, drawn: true })).tone, 'warn');
  assert.deepEqual(grandChampionStatus(row({ complete: true, champion: 'Aki', drawn: true })), { tone: 'done', text: 'Grand Champion: Aki' });
  assert.match(grandChampionStatus(row({ duplicates: ['Women'] })).text, /same person won Women/);
  const entrants = [{ name: 'Ben', via: 'runner-up', source: 'Open' }, { name: 'Cora', via: 'fusen-sho', source: 'Women' }];
  assert.equal(grandChampionStatus(row({ drawn: true, started: true, entrants })).text, 'Playing on Court B: Ben (for Open, runner-up) vs Cora (withdrew: Fusen-sho)');
  assert.equal(grandChampionStatus(row({ waiting: ['Women'], entrants: [{ name: 'Aki', via: 'winner', source: 'Open' }, null] })).text, 'Waiting for Women (so far: Aki from Open)');
});
