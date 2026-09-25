import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIVISION_COMPLETE_CLASS, NOT_COMPLETE, NO_PLACEMENTS_TEXT, courtCompleteView,
} from '../../app/react/court/complete-model.ts';

test('courtCompleteView: the static markup before anything was published (no panel)', () => {
  assert.deepEqual(courtCompleteView(NOT_COMPLETE), { complete: false, rows: null });
});

test('courtCompleteView: not complete ignores placements', () => {
  assert.deepEqual(courtCompleteView({ complete: false, placements: [{ place: '1st', name: 'A', tier: 'gold' }] }), { complete: false, rows: null });
});

test('courtCompleteView: placements in order, medal class from the tier', () => {
  const input = {
    complete: true,
    placements: [
      { place: '1st', name: 'P 1', tier: 'gold' },
      { place: '2nd', name: 'P 2', tier: 'silver' },
      { place: '3rd', name: 'P 3', tier: 'bronze' },
      { place: '3rd', name: 'P 4', tier: '' },
    ],
  };
  assert.deepEqual(courtCompleteView(input), {
    complete: true,
    rows: [
      { place: '1st', name: 'P 1', placeClass: 'gold' },
      { place: '2nd', name: 'P 2', placeClass: 'silver' },
      { place: '3rd', name: 'P 3', placeClass: 'bronze' },
      { place: '3rd', name: 'P 4', placeClass: '' },
    ],
  });
});

test('courtCompleteView: a complete division without placements shows the Results message', () => {
  assert.deepEqual(courtCompleteView({ complete: true, placements: [] }), { complete: true, rows: null });
  assert.equal(NO_PLACEMENTS_TEXT, 'Final results are available in Results.');
});

test('courtCompleteView: text is shown as published (esc() already blanked 0 and null)', () => {
  assert.deepEqual(courtCompleteView({ complete: true, placements: [{ place: '1st', name: '', tier: '' }] }).rows,
    [{ place: '1st', name: '', placeClass: '' }]);
});

test('DIVISION_COMPLETE_CLASS: the class the court CSS keys on', () => {
  assert.equal(DIVISION_COMPLETE_CLASS, 'division-complete');
});
