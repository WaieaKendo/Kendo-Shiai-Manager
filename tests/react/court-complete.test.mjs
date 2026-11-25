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

test('continueBoxView: the division-complete box on the court screen (owner decision 7, #31)', async () => {
  const { continueBoxView, continueLabel, keptKey, CONTINUE_TEXTS } = await import('../../app/react/court/complete-model.ts');
  const base = { complete: true, placements: [], court: 'A', division: 'Kids' };
  const message = 'Kids is complete. Final results are showing on the Court A TV.';
  assert.equal(continueLabel('Masters'), 'Continue to Masters →');
  assert.deepEqual(CONTINUE_TEXTS, { keep: 'Keep showing results', close: 'Close TV results' });
  assert.deepEqual(continueBoxView({ ...base, next: 'Masters' }, false), { kind: 'offer', message, next: 'Masters', continueLabel: 'Continue to Masters →' });
  assert.deepEqual(continueBoxView({ ...base, next: 'Masters' }, true), { kind: 'kept', message, next: 'Masters' });
  assert.deepEqual(continueBoxView({ ...base, next: null }, false), { kind: 'done', message, doneText: 'All divisions on Court A are done.' });
  assert.deepEqual(continueBoxView({ ...base, next: null }, true), { kind: 'done', message, doneText: 'All divisions on Court A are done.' });
  assert.equal(continueBoxView({ complete: false, placements: [] }, false), null, 'not complete');
  assert.equal(continueBoxView({ complete: true, placements: [] }, false), null, 'Live Scores / TV: no court, no box');
  assert.equal(keptKey(base), 'A|Kids');
});

test('team division Continue labels and kept results use persisted identity separately from names', async()=>{
  const {continueBoxView,keptKey}=await import('../../app/react/court/complete-model.ts');
  const input={complete:true,placements:[],court:'A',division:'Kids',divisionId:'team-kids',next:'team-adults',nextName:'Adult Open'};
  const box=continueBoxView(input,false);
  assert.equal(box.continueLabel,'Continue to Adult Open →');
  assert.equal(box.next,'team-adults');
  assert.equal(keptKey(input),keptKey({...input,division:'Kids renamed'}));
});
