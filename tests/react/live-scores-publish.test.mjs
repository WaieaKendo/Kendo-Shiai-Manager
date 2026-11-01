import test from 'node:test';
import assert from 'node:assert/strict';
import { ksmLiveScoresCourt, ksmLiveScoresFinishedDivision, ksmRenderLiveScores, startLiveScoresInput } from '../../app/react/features/live-scores/publish.ts';

// A fake `window` and `document` with the legacy functions publish.ts reads through shared/legacy.ts.
// `current` maps a court to courtCurrentMatch()'s answer; `complete` lists finished divisions.
function fake({
  state = {}, current = {}, complete = [], between = {}, tv = false, publicLive = true, daihyosen = false,
} = {}) {
  const listeners = new Map();
  const log = { tvRedraws: 0, calls: [] };
  const s = {
    publicCourt: 'A', courtActiveDivision: {}, courtState: {}, currentDivision: '', allMatches: {}, ...state,
  };
  const win = {
    ksmLegacyState: () => s,
    ksmText: x => String(x || ''),
    ksmDivisionName: id => (id === 'open' ? 'Open Division' : id),
    courtCurrentMatch: court => { log.calls.push(`current ${court}`); return current[court] ?? null; },
    divisionComplete: div => complete.includes(div),
    isValidMatchObject: m => !!m,
    matchBelongsToCourt: (m, court) => (m.court ?? 'A') === court,
    ksmDivisionCompleteInput: (div, done) => ({ complete: done, placements: [{ place: '1st', name: `win ${div}`, tier: 'gold' }] }),
    ksmBetweenMatches: (court, own) => between[court] ?? { reason: null, upNext: null },
    audienceMeta: m => ({ division: m.division, line: m.pool ? `Pool ${m.pool}` : (m.position || '') }),
    ksmIsRoundRobinDaihyosen: () => daihyosen,
    ksmDaihyosenLabel: () => 'Daihyosen — first point wins',
    tvUpcomingMatches: (court, m) => [{ teamWhite: 'Next W', teamRed: 'Next R' }],
    ksmTeamSheet: (div, pair) => ({ sheet: 'team', div, pair }),
    ksmKachinukiSheet: m => ({ sheet: 'kachinuki', m: m.teamWhite }),
    ksmHansokuCounts: () => ({ W: 1, R: 0 }),
    activeScoreArrays: () => ({ W: ['M', null], R: [] }),
    renderTvDisplay: () => { log.tvRedraws++; },
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    dispatch: type => listeners.get(type)?.(),
  };
  if (publicLive) win.publicLive = {};
  globalThis.window = win;
  globalThis.document = { body: { classList: { contains: c => tv && c === 'ksm-tv' } } };
  return { win, log, s };
}

const individual = { division: 'open', type: 'individual', white: 'Ann <A>', red: null, wdojo: 'Aiea', rdojo: '', pool: 'A', court: 'A' };

test('two playing courts are published side by side, text as esc() showed it', () => {
  const { win } = fake({ current: {
    A: { match: individual, next: { white: 'Cy', red: '' } },
    B: { match: { ...individual, court: 'B', white: 'Di', red: 'Ed' }, next: undefined },
  } });
  ksmRenderLiveScores();
  const input = win.ksmLiveScoresInput;
  assert.equal(input.kind, 'courts');
  assert.deepEqual(input.courts[0], {
    court: 'A', meta: { division: 'Open Division', line: 'Pool A' }, kind: 'individual',
    white: { name: 'Ann <A>', dojo: 'Aiea' }, red: { name: 'TBD', dojo: '' },
    points: { W: ['M', ''], R: [] }, hansoku: { W: 1, R: 0 }, next: { white: 'Cy', red: 'TBD' },
  });
  assert.equal(input.courts[1].court, 'B');
  assert.equal(input.courts[1].next, null);
});

test('a team match shows the sheet, the court\'s next pairing and the bout hansoku; a daihyosen is labelled', () => {
  const team = { division: 'Team', type: 'teamPosition', teamPair: 'p1', teamWhite: 'W', teamRed: 'R', position: 'Senpo' };
  const { win } = fake({ current: { A: { match: team }, B: null }, daihyosen: true });
  ksmRenderLiveScores();
  assert.deepEqual(win.ksmLiveScoresInput.courts[0], {
    court: 'A', meta: { division: 'Team', line: 'Daihyosen — first point wins' }, kind: 'team',
    sheet: { sheet: 'team', div: 'Team', pair: 'p1' }, next: { white: 'Next W', red: 'Next R' }, hansoku: { W: 1, R: 0 },
  });
});

test('a kachinuki match shows its sheet', () => {
  const k = { division: 'Team', type: 'kachinuki', teamWhite: 'W', teamRed: 'R' };
  fake({ current: { A: { match: k } } });
  assert.equal(ksmLiveScoresCourt('A').kind, 'kachinuki');
  assert.deepEqual(ksmLiveScoresCourt('A').sheet, { sheet: 'kachinuki', m: 'W' });
});

test('an idle court: waiting with its reason when its division has an unplayed match here; up next', () => {
  const upNext = { division: 'Kids', matches: [{ white: 'X', red: 'Y' }] };
  const { win } = fake({
    state: { courtActiveDivision: { A: 'open', B: 'open' }, allMatches: { open: [{ court: 'A', done: false }] } },
    between: { A: { reason: 'Final waits for the semifinal on Court B', upNext }, B: { reason: 'ignored', upNext: null } },
  });
  ksmRenderLiveScores();
  assert.deepEqual(win.ksmLiveScoresInput.courts[0], { court: 'A', kind: 'idle', waiting: true, reason: 'Final waits for the semifinal on Court B', upNext });
  // Court B has no unplayed match of its own: not waiting, and the reason does not apply.
  assert.deepEqual(win.ksmLiveScoresInput.courts[1], { court: 'B', kind: 'idle' });
});

test('an idle court with nothing to say is just idle', () => {
  const { win } = fake();
  ksmRenderLiveScores();
  assert.deepEqual(win.ksmLiveScoresInput, { kind: 'courts', courts: [{ court: 'A', kind: 'idle' }, { court: 'B', kind: 'idle' }] });
});

test('a finished division is the court\'s only when a match of it was played on that court', () => {
  fake({
    state: { courtActiveDivision: { B: 'open' }, allMatches: { open: [{ court: 'A' }] } }, complete: ['open'],
  });
  assert.equal(ksmLiveScoresFinishedDivision('B'), null, 'played only on the other court');
  fake({ state: { courtActiveDivision: { A: 'open' }, allMatches: { open: [{ court: 'A' }] } }, complete: ['open'] });
  assert.equal(ksmLiveScoresFinishedDivision('A'), 'open');
  // The Live Scores court also falls back to this device's current division.
  fake({ state: { currentDivision: 'open', allMatches: { open: [{ court: 'A' }] } }, complete: ['open'] });
  assert.equal(ksmLiveScoresFinishedDivision('A'), 'open');
  assert.equal(ksmLiveScoresFinishedDivision('B'), null);
});

test('a finished division of the Live Scores court fills the screen; the TV is not redrawn', () => {
  const { win, log } = fake({
    state: { currentDivision: 'open', allMatches: { open: [{ court: 'A' }] } }, complete: ['open'], tv: true,
  });
  ksmRenderLiveScores();
  assert.deepEqual(win.ksmLiveScoresInput, { kind: 'complete', complete: { complete: true, placements: [{ place: '1st', name: 'win open', tier: 'gold' }] } });
  assert.equal(log.tvRedraws, 0);
});

test('a finished division of the other court fills the screen, and a TV device is redrawn', () => {
  const { win, log } = fake({
    state: { courtActiveDivision: { B: 'open' }, allMatches: { open: [{ court: 'B' }] } }, complete: ['open'], tv: true,
  });
  ksmRenderLiveScores();
  assert.equal(win.ksmLiveScoresInput.kind, 'complete');
  assert.equal(log.tvRedraws, 1);
});

test('a finished division stays in its court\'s card while the other court has a match (the TV redraws after the courts)', () => {
  const { win, log } = fake({
    state: { courtActiveDivision: { B: 'open' }, allMatches: { open: [{ court: 'B' }] } }, complete: ['open'], tv: true,
    current: { A: { match: individual } },
  });
  ksmRenderLiveScores();
  assert.equal(win.ksmLiveScoresInput.kind, 'courts');
  assert.deepEqual(win.ksmLiveScoresInput.courts[1], {
    court: 'B', kind: 'complete', division: 'Open Division', complete: { complete: true, placements: [{ place: '1st', name: 'win open', tier: 'gold' }] },
  });
  assert.equal(log.tvRedraws, 1);
});

test('the TV is redrawn only on a TV device', () => {
  const { log } = fake({ tv: false });
  ksmRenderLiveScores();
  assert.equal(log.tvRedraws, 0);
});

test('without #publicLive nothing is published and the TV is not redrawn (courts branch)', () => {
  const { win, log } = fake({ publicLive: false, tv: true });
  ksmRenderLiveScores();
  assert.equal(win.ksmLiveScoresInput, undefined);
  assert.equal(log.tvRedraws, 0);
  assert.deepEqual(log.calls, ['current A', 'current B'], 'the courts were still chosen (courtCurrentMatch() moves a court on)');
});

test('without #publicLive a finished division still publishes (the guard is only in the courts branch)', () => {
  const { win } = fake({
    publicLive: false, state: { currentDivision: 'open', allMatches: { open: [{ court: 'A' }] } }, complete: ['open'],
  });
  ksmRenderLiveScores();
  assert.equal(win.ksmLiveScoresInput.kind, 'complete');
});

test('a missing legacy function is a clear error', () => {
  globalThis.window = {};
  assert.throws(() => ksmRenderLiveScores(), /ksmLegacyState\(\) is not defined/);
});

test('startLiveScoresInput: computes on each event, and on start only after an earlier signal', () => {
  let { win } = fake();
  startLiveScoresInput();
  assert.equal(win.ksmLiveScoresInput, undefined, 'no signal yet: nothing computed');
  win.dispatch('ksm:live-scores');
  assert.equal(win.ksmLiveScoresInput.kind, 'courts');

  ({ win } = fake());
  win.ksmLiveScoresRequested = true;
  startLiveScoresInput();
  assert.equal(win.ksmLiveScoresInput.kind, 'courts', 'a signal before the module ran: computed on start');
});
