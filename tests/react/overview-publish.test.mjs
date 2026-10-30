import test from 'node:test';
import assert from 'node:assert/strict';
import { ksmOverviewInputData, ksmOverviewMatch, startOverviewInput } from '../../app/react/features/overview/publish.ts';

// A fake `window` with the legacy functions publish.ts reads through shared/legacy.ts.
function fakeWindow({ courts = {}, summary, name } = {}) {
  const listeners = new Map();
  const win = {
    ksmText: s => String(s || ''),
    ksmDivisionName: id => (id === 'open' ? 'Open Division' : id),
    tournamentSummary: () => summary ?? { completed: 0, total: 0, remaining: 0, variable: false },
    courtSummaryFor: c => courts[c] ?? { court: c, division: null, round: '', completed: 0, total: 0, remaining: 0, variable: false, current: null, onDeck: null, following: null },
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    dispatch: type => listeners.get(type)?.(),
  };
  if (name !== undefined) win.tName = { value: name };
  globalThis.window = win;
  return win;
}

test('empty tournament: default name, zero progress, two courts without a division or matches', () => {
  fakeWindow();
  assert.deepEqual(ksmOverviewInputData(), {
    kind: 'overview', tournamentName: 'Kendo Tournament',
    overall: { completed: 0, total: 0, remaining: 0, variable: false },
    courts: ['A', 'B'].map(court => ({
      court, division: 'No active division', round: '', completed: 0, total: 0, remaining: 0, variable: false,
      current: null, onDeck: null, following: null,
    })),
  });
});

test('a court with no active division reads "No active division"; the other shows its division', () => {
  fakeWindow({
    name: 'Aiea <Taikai>',
    courts: { B: { court: 'B', division: 'open', round: 'Pool A', completed: 1, total: 6, remaining: 5, variable: false, current: { white: 'P 1', red: 'P 2' }, onDeck: null, following: null } },
  });
  const input = ksmOverviewInputData();
  assert.equal(input.tournamentName, 'Aiea <Taikai>');
  assert.equal(input.courts[0].division, 'No active division');
  assert.equal(input.courts[1].division, 'Open Division');
  assert.equal(input.courts[1].round, 'Pool A');
  assert.deepEqual(input.courts[1].current, { white: 'P 1', red: 'P 2' });
});

test('current / onDeck / following: missing names are "—", no match is null', () => {
  fakeWindow({
    summary: { completed: 2, total: 9, remaining: 7, variable: true },
    courts: { A: { court: 'A', division: 'open', round: '', completed: 2, total: null, remaining: null, variable: true,
      current: { white: '', red: 'R' }, onDeck: { white: 'W', red: '' }, following: null } },
  });
  const input = ksmOverviewInputData();
  assert.deepEqual(input.overall, { completed: 2, total: 9, remaining: 7, variable: true });
  const a = input.courts[0];
  assert.deepEqual(a.current, { white: '—', red: 'R' });
  assert.deepEqual(a.onDeck, { white: 'W', red: '—' });
  assert.equal(a.following, null);
  assert.deepEqual([a.total, a.remaining, a.variable], [null, null, true]);
  assert.equal(ksmOverviewMatch(null), null);
});

test('a missing legacy function is a clear error', () => {
  globalThis.window = {};
  assert.throws(() => ksmOverviewInputData(), /tournamentSummary\(\) is not defined/);
});

test('startOverviewInput: computes on each ksm:overview event, and on start only after an earlier signal', () => {
  let win = fakeWindow();
  startOverviewInput();
  assert.equal(win.ksmOverviewInput, undefined, 'no signal yet: nothing computed');
  win.dispatch('ksm:overview');
  assert.equal(win.ksmOverviewInput.kind, 'overview');

  win = fakeWindow();
  win.ksmOverviewRequested = true;
  startOverviewInput();
  assert.equal(win.ksmOverviewInput.kind, 'overview', 'a signal before the module ran: computed on start');
});
