import test from 'node:test';
import assert from 'node:assert/strict';
import { ksmRenderTv, ksmTvDisplayInput, startTvInput } from '../../app/react/features/tv/publish.ts';
import { fakeSettingsStore } from './settings-store-fake.mjs';

// A fake `window` and `document` with the legacy functions publish.ts reads through shared/legacy.ts.
// `vm` is buildTV3ViewModel()'s answer; `nextDivision` is ksmNextCourtDivision()'s.
function fake({
  state = {}, vm, between = { reason: null, upNext: null }, nextDivision = null, redSide = null, tvLive = true, daihyosen = false, court = 'A',
} = {}) {
  const listeners = new Map();
  const classes = new Set();
  const log = { calls: [] };
  const s = { allMatches: {}, ...state };
  const selects = { court1TvRedSide: redSide, court2TvRedSide: redSide };
  const win = {
    // The audience sides come from the store (tournament.settings, #15 PR 8), no longer from the selects.
    KSMStore: fakeSettingsStore(key => selects[key] ?? undefined),
    ksmLegacyState: () => s,
    ksmText: x => String(x || ''),
    ksmDivisionName: id => (id === 'open' ? 'Open Division' : id),
    buildTV3ViewModel: c => { log.calls.push(`vm ${c}`); return vm; },
    ksmBetweenMatches: () => between,
    isValidMatchObject: m => !!m,
    matchBelongsToCourt: () => true,
    ksmNextCourtDivision: () => nextDivision,
    ksmDivisionCompleteInput: (div, done) => ({ complete: done, placements: [{ place: '1st', name: `win ${div}`, tier: 'gold' }] }),
    ksmIsRoundRobinDaihyosen: () => daihyosen,
    ksmDaihyosenLabel: () => 'Daihyosen — first point wins',
    activeScoreArrays: m => ({ W: m.wp || [], R: m.rp || [] }),
    ksmHansokuCounts: m => ({ W: m.wt || 0, R: m.rt || 0 }),
    tvIndividualSideLabel: (m, side) => m[side] || 'TBD',
    teamPairSummary: () => ({ wWins: 2, wPts: 3, rWins: 1, rPts: 1 }),
    tvAssignedCourt: () => court,
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    dispatch: type => listeners.get(type)?.(),
  };
  if (tvLive) win.tvLive = {};
  globalThis.window = win;
  globalThis.document = {
    body: { classList: { toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); log.calls.push(`toggle ${c} ${on}`); } } },
    getElementById: id => (id in selects && selects[id] !== null ? { value: selects[id] } : null),
  };
  return { win, log, classes };
}

const card = (left, right) => ({ left, right, leftSub: 'sub', rightSub: '' , round: '' });
const individual = { division: 'open', white: 'Ann <A>', red: 'Bo', wdojo: 'Aiea', rdojo: 'Hilo', wp: ['M', null], rp: [], wt: 1 };

test('an empty court that waits: "next match" with the reason, and the plain upcoming cards', () => {
  fake({
    state: { allMatches: { open: [{ done: false }] } }, between: { reason: 'Final waits for the semifinal on Court B', upNext: null },
    vm: { court: 'A', empty: true, division: 'open', upcoming: [card('Cy', 'Di'), null] },
  });
  assert.deepEqual(ksmTvDisplayInput('A'), {
    kind: 'tv', court: 'A', division: 'Open Division', meta: '',
    body: { kind: 'idle', waiting: { next: 'match', reason: 'Final waits for the semifinal on Court B' } },
    upcoming: [{ white: 'Cy', red: 'Di', whiteSub: 'sub', redSub: '' }, null],
  });
});

test('an empty court with an up-next division: waiting for the next division, the cards are its matches', () => {
  const upNext = { division: 'Kids', matches: [{ white: 'X', red: 'Y' }] };
  fake({ between: { reason: null, upNext }, vm: { court: 'B', empty: true, division: null, upcoming: [null, null] } });
  assert.deepEqual(ksmTvDisplayInput('B'), {
    kind: 'tv', court: 'B', division: 'No active match', meta: '',
    body: { kind: 'idle', waiting: { next: 'division', reason: null } },
    upcoming: [{ white: 'X', red: 'Y', whiteSub: '', redSub: '' }, null], upNext: 'Kids',
  });
});

test('an empty court with nothing to say is plain idle', () => {
  fake({ vm: { court: 'A', empty: true, division: null, upcoming: [null, null] } });
  assert.deepEqual(ksmTvDisplayInput('A').body, { kind: 'idle' });
});

test('Final Results: the placements and the court\'s next division, no upcoming cards', () => {
  fake({
    nextDivision: 'Kids',
    vm: { court: 'A', empty: false, division: 'open', format: 'results', meta: { division: 'open', line: 'Final Results' }, upcoming: [null, null] },
  });
  assert.deepEqual(ksmTvDisplayInput('A'), {
    kind: 'tv', court: 'A', division: 'Open Division', meta: 'Final Results',
    body: { kind: 'results', complete: { complete: true, placements: [{ place: '1st', name: 'win open', tier: 'gold' }] } },
    upcoming: [], nextDivision: 'Kids',
  });
  fake({ vm: { court: 'A', empty: false, division: 'open', format: 'results', meta: { division: 'open', line: 'Final Results' }, upcoming: [null, null] } });
  assert.equal('nextDivision' in ksmTvDisplayInput('A'), false);
});

test('an individual match: side labels, dojos, points as letters, hansoku; the header carries the next division once upcoming runs out', () => {
  fake({
    nextDivision: 'Kids',
    vm: { court: 'A', empty: false, division: 'open', format: 'individual', match: individual, meta: { division: 'open', line: 'Pool A' }, upcoming: [card('Cy', 'Di'), null] },
  });
  assert.deepEqual(ksmTvDisplayInput('A'), {
    kind: 'tv', court: 'A', division: 'Open Division', meta: 'Pool A', nextDivision: 'Kids',
    upcoming: [{ white: 'Cy', red: 'Di', whiteSub: 'sub', redSub: '' }, null],
    body: {
      kind: 'individual', white: { name: 'Ann <A>', sub: 'Aiea' }, red: { name: 'Bo', sub: 'Hilo' },
      points: { W: ['M', ''], R: [] }, hansoku: { W: 1, R: 0 },
    },
  });
});

test('an individual match with full upcoming has no next division in the header', () => {
  fake({
    nextDivision: 'Kids',
    vm: { court: 'A', empty: false, division: 'open', format: 'individual', match: individual, meta: { division: 'open', line: 'Pool A' }, upcoming: [card('a', 'b'), card('c', 'd')] },
  });
  assert.equal('nextDivision' in ksmTvDisplayInput('A'), false);
});

test('a team match: the pairing\'s bouts with the current one marked, and the summary printed as it is', () => {
  const bout1 = { division: 'Team', type: 'teamPosition', teamPair: 'p1', teamWhite: 'WT', teamRed: 'RT', white: 'A1', red: 'B1', wp: ['K'], rp: [] };
  const bout2 = { ...bout1, white: 'A2', red: 'B2', wp: [], rp: ['M'], rt: 2 };
  const other = { ...bout1, teamPair: 'p2', white: 'zz' };
  fake({
    state: { allMatches: { Team: [bout1, bout2, other] } },
    vm: { court: 'A', empty: false, division: 'Team', format: 'team', match: bout2, meta: { division: 'Team', line: 'Chuken' }, upcoming: [null, null] },
  });
  const body = ksmTvDisplayInput('A').body;
  assert.deepEqual(body, {
    kind: 'team', teamWhite: 'WT', teamRed: 'RT',
    rows: [
      { white: 'A1', red: 'B1', points: { W: ['K'], R: [] }, hansoku: { W: 0, R: 0 }, active: false },
      { white: 'A2', red: 'B2', points: { W: [], R: ['M'] }, hansoku: { W: 0, R: 2 }, active: true },
    ],
    summary: { wWins: '2', wPts: '3', rWins: '1', rPts: '1' },
  });
});

test('a team match not in the division list still shows itself', () => {
  const bout = { division: 'Team', type: 'teamPosition', teamPair: 'p1', teamWhite: 'WT', white: '', red: '', wp: [], rp: [] };
  fake({ vm: { court: 'A', empty: false, division: 'Team', format: 'team', match: bout, meta: { division: 'Team', line: '' }, upcoming: [null, null] } });
  const body = ksmTvDisplayInput('A').body;
  assert.equal(body.teamRed, 'Red Team');
  assert.deepEqual(body.rows.map(r => [r.white, r.red, r.active]), [['TBD', 'TBD', true]]);
});

test('a kachinuki match: both lineups padded to three, the current fighters\' indexes; a daihyosen labels the header', () => {
  const k = {
    division: 'Team', type: 'kachinuki', white: 'A1', red: '', teamWhite: 'WT', lineupW: ['A1', 'A2', 'A3', 'A4'], lineupR: ['B1'], wIndex: 1, rIndex: undefined, wp: [], rp: [],
  };
  fake({ daihyosen: true, vm: { court: 'A', empty: false, division: 'Team', format: 'kachinuki', match: k, meta: { division: 'Team', line: 'Kachinuki' }, upcoming: [null, null] } });
  const input = ksmTvDisplayInput('A');
  assert.equal(input.meta, 'Daihyosen — first point wins');
  assert.deepEqual(input.body, {
    kind: 'kachinuki', white: 'A1', red: '—', points: { W: [], R: [] }, hansoku: { W: 0, R: 0 },
    teamWhite: 'WT', teamRed: 'Red Team', lineupW: ['A1', 'A2', 'A3'], lineupR: ['B1', '—', '—'], wIndex: 1, rIndex: 0,
  });
});

test('the red-left class follows the court\'s red-side select, first, every time the input is computed', () => {
  const vm = { court: 'A', empty: true, division: null, upcoming: [null, null] };
  let f = fake({ vm, redSide: 'left' });
  ksmTvDisplayInput('A');
  assert.ok(f.classes.has('ksm-tv-red-left'));
  assert.equal(f.log.calls[0], 'toggle ksm-tv-red-left true', 'before the view model is built');
  f = fake({ vm, redSide: 'right' });
  f.classes.add('ksm-tv-red-left');
  ksmTvDisplayInput('A');
  assert.ok(!f.classes.has('ksm-tv-red-left'));
  // Court B reads its own select; a missing select is "not left".
  f = fake({ vm, redSide: null });
  ksmTvDisplayInput('B');
  assert.deepEqual(f.log.calls, ['toggle ksm-tv-red-left false', 'vm B']);
});

test('ksmRenderTv publishes the assigned court\'s input; without #tvLive nothing happens', () => {
  const vm = { court: 'B', empty: true, division: null, upcoming: [null, null] };
  let f = fake({ vm, court: 'B' });
  ksmRenderTv();
  assert.equal(f.win.ksmTvInput.kind, 'tv');
  assert.equal(f.win.ksmTvInput.court, 'B');
  f = fake({ vm, tvLive: false, redSide: 'left' });
  ksmRenderTv();
  assert.equal(f.win.ksmTvInput, undefined);
  assert.deepEqual(f.log.calls, [], 'not even the red-left class is touched');
});

test('a missing legacy function is a clear error', () => {
  globalThis.window = { tvLive: {} };
  assert.throws(() => ksmRenderTv(), /tvAssignedCourt\(\) is not defined/);
});

test('startTvInput: computes on each event, and on start only after an earlier signal', () => {
  const vm = { court: 'A', empty: true, division: null, upcoming: [null, null] };
  let { win } = fake({ vm });
  startTvInput();
  assert.equal(win.ksmTvInput, undefined, 'no signal yet: nothing computed');
  win.dispatch('ksm:tv');
  assert.equal(win.ksmTvInput.kind, 'tv');

  ({ win } = fake({ vm }));
  win.ksmTvRequested = true;
  startTvInput();
  assert.equal(win.ksmTvInput.kind, 'tv', 'a signal before the module ran: computed on start');
});
