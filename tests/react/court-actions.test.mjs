import test from 'node:test';
import assert from 'node:assert/strict';
import { FUSEN_LABEL, STATIC_ACTIONS, courtActionsView, fusenButtonView, scoreButtons } from '../../app/react/court/actions-model.ts';
import { DEFAULT_COURT_ACTION_ICONS } from '../../app/react/court/branding.ts';

test('scoreButtons: each panel in the legacy order, test IDs and labels', () => {
  assert.deepEqual(scoreButtons('W'), [
    { testId: 'point-white-M', side: 'W', kind: 'point', letter: 'M', name: 'Men' },
    { testId: 'point-white-K', side: 'W', kind: 'point', letter: 'K', name: 'Kote' },
    { testId: 'point-white-D', side: 'W', kind: 'point', letter: 'D', name: 'Do' },
    { testId: 'point-white-T', side: 'W', kind: 'point', letter: 'T', name: 'Tsuki' },
    { testId: 'hansoku-white', side: 'W', kind: 'hansoku', letter: 'H', name: 'Hansoku' },
  ]);
  assert.deepEqual(scoreButtons('R').map(b => b.testId), ['point-red-M', 'point-red-K', 'point-red-D', 'point-red-T', 'hansoku-red']);
  assert.ok(scoreButtons('R').every(b => b.side === 'R'));
});

test('scoreButtons: every test ID once across both panels', () => {
  const ids = [...scoreButtons('W'), ...scoreButtons('R')].map(b => b.testId);
  assert.equal(new Set(ids).size, 10);
});

test('STATIC_ACTIONS: the static markup (Undo enabled, Redo disabled)', () => {
  assert.deepEqual(courtActionsView(STATIC_ACTIONS), { undo: { disabled: false, label: 'Undo' }, redo: { disabled: true, label: 'Redo' } });
});

test('courtActionsView: shows what updateUndoButton() published', () => {
  const input = { undo: { disabled: true, label: 'Undo' }, redo: { disabled: false, label: 'Redo' } };
  assert.deepEqual(courtActionsView(input), input);
  const view = courtActionsView(input);
  view.undo.disabled = false;
  assert.equal(input.undo.disabled, true, 'does not share the published object');
});

test('default action icons: the legacy undo arrow (64x64, two paths, first one round-joined)', () => {
  const { undo, fusen, next } = DEFAULT_COURT_ACTION_ICONS;
  assert.equal(undo.viewBox, '0 0 64 64');
  assert.deepEqual(undo.paths.map(p => p.round), [true, false]);
  assert.equal(undo.paths[0].d, 'M24 14H10v14');
  assert.equal(fusen, '⚑');
  assert.equal(next, '»');
});

test('fusenButtonView: "Fusen-sho", disabled while the court has no match (owner decision 4)', () => {
  assert.equal(FUSEN_LABEL, 'Fusen-sho');
  assert.deepEqual(fusenButtonView(true), { disabled: false, label: 'Fusen-sho' });
  assert.deepEqual(fusenButtonView(false), { disabled: true, label: 'Fusen-sho' });
});
