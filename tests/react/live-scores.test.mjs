import test from 'node:test';
import assert from 'node:assert/strict';
import { alignedRow } from '../../app/react/court/rows-model.ts';
import {
  COMPLETE_LINE, EMPTY_LIVE_SCORES, IDLE_META, IDLE_TEXT, LIVE_SCORES_HEADING, NO_NEXT_TEXT, liveCourtView, liveScoresView, pointText,
} from '../../app/react/live-scores/live-scores-model.ts';

const meta = { division: 'Open', line: 'Pool A' };

test('liveScoresView: nothing published yet is the empty static markup', () => {
  assert.deepEqual(liveScoresView(EMPTY_LIVE_SCORES), { kind: 'empty' });
});

test('legacy texts: heading, idle court, no next match', () => {
  assert.deepEqual(LIVE_SCORES_HEADING, { eyebrow: 'Live Tournament', title: 'Live Scores' });
  assert.equal(IDLE_META, 'No active match');
  assert.equal(IDLE_TEXT, 'Waiting for the next division');
  assert.equal(NO_NEXT_TEXT, 'No match queued');
});

test('pointText: letters with spaces, a dash before the first point (liveScorePoints())', () => {
  assert.equal(pointText([]), '—');
  assert.equal(pointText(['M']), 'M');
  assert.equal(pointText(['K', 'H']), 'K H');
  assert.equal(pointText(['', '']), ' ', 'as Array.join() prints them');
});

test('liveCourtView: an idle court has its title, "No active match" and no Next line', () => {
  assert.deepEqual(liveCourtView({ court: 'B', kind: 'idle' }), {
    testId: 'live-court-B', className: 'live-court-card', title: 'Court B', meta: 'No active match', body: { kind: 'idle' }, next: null,
  });
});

test('liveCourtView: an individual match (names, dojos, point strings, the next match)', () => {
  const view = liveCourtView({
    court: 'A', kind: 'individual', meta,
    white: { name: 'P 1', dojo: 'Dojo 1' }, red: { name: 'P 2', dojo: '' },
    points: { W: ['M'], R: [] }, next: { white: 'P 3', red: 'TBD' },
  });
  assert.equal(view.testId, 'live-court-A');
  assert.equal(view.className, 'live-court-card');
  assert.equal(view.title, 'Court A');
  assert.equal(view.meta, 'Open • Pool A', 'one text, as the legacy template wrote it');
  assert.deepEqual(view.body, { kind: 'individual', white: { name: 'P 1', dojo: 'Dojo 1' }, red: { name: 'P 2', dojo: '' }, whitePoints: 'M', redPoints: '—' });
  assert.deepEqual(view.next, { match: { white: 'P 3', red: 'TBD' } });
});

test('liveCourtView: no next match shows the Next line with "No match queued" (next.match null)', () => {
  const view = liveCourtView({ court: 'A', kind: 'individual', meta, white: { name: 'A', dojo: '' }, red: { name: 'B', dojo: '' }, points: { W: [], R: [] }, next: null });
  assert.deepEqual(view.next, { match: null });
});

test('liveCourtView: a team match draws the court screen\'s bout sheet', () => {
  const sheet = { teamWhite: 'Team A', teamRed: 'Team B', rows: [alignedRow({ white: 'A1', red: 'B1', status: 'NOW', current: true })], totals: { wWins: '0', wPts: '0', rWins: '0', rPts: '0' } };
  const view = liveCourtView({ court: 'B', kind: 'team', meta: { division: 'Team Tournament', line: 'Senpo' }, sheet, next: { white: 'Team C', red: 'Team D' } });
  assert.equal(view.className, 'live-court-card live-team-card');
  assert.equal(view.meta, 'Team Tournament • Senpo');
  assert.equal(view.body.kind, 'team');
  assert.equal(view.body.sheet.teamWhite, 'Team A');
  assert.equal(view.body.sheet.rows[0].className, 'aligned-match-row current  ');
  assert.deepEqual(view.body.sheet.totals, sheet.totals);
});

test('liveCourtView: a kachinuki match draws the court screen\'s kachinuki sheet', () => {
  const sheet = { teamWhite: 'Team A', teamRed: 'Team B', current: alignedRow({ status: 'NOW', current: true }), white: { lineup: ['A1', 'A2'], index: 1 }, red: { lineup: ['B1'], index: 0 } };
  const view = liveCourtView({ court: 'A', kind: 'kachinuki', meta: { division: 'Team Tournament', line: 'Kachinuki' }, sheet, next: null });
  assert.equal(view.className, 'live-court-card live-team-card');
  assert.equal(view.body.kind, 'kachinuki');
  assert.deepEqual(view.body.sheet.white.map(l => l.state), ['eliminated', 'active']);
  assert.deepEqual(view.next, { match: null });
});

test('liveScoresView: both courts in the published order', () => {
  const view = liveScoresView({ kind: 'courts', courts: [{ court: 'A', kind: 'idle' }, { court: 'B', kind: 'idle' }] });
  assert.equal(view.kind, 'courts');
  assert.deepEqual(view.courts.map(c => c.testId), ['live-court-A', 'live-court-B']);
});

test('liveScoresView: a complete division shows its placements (the court\'s division-complete panel)', () => {
  const view = liveScoresView({ kind: 'complete', complete: { complete: true, placements: [{ place: '1st', name: 'P 2', tier: 'gold' }] } });
  assert.deepEqual(view, { kind: 'complete', complete: { complete: true, rows: [{ place: '1st', name: 'P 2', placeClass: 'gold' }] } });
  assert.deepEqual(liveScoresView({ kind: 'complete', complete: { complete: true, placements: [] } }).complete, { complete: true, rows: null });
});

test('liveCourtView: a court whose division is complete shows its placements in its card (F16)', () => {
  const view = liveCourtView({ court: 'B', kind: 'complete', division: 'Women', complete: { complete: true, placements: [{ place: '1st', name: 'W 2', tier: 'gold' }] } });
  assert.deepEqual(view, {
    testId: 'live-court-B', className: 'live-court-card', title: 'Court B', meta: 'Women • Final Results',
    body: { kind: 'complete', complete: { complete: true, rows: [{ place: '1st', name: 'W 2', placeClass: 'gold' }] } }, next: null,
  });
  assert.equal(COMPLETE_LINE, 'Final Results');
});
