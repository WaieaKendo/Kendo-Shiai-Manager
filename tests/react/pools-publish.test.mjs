import test from 'node:test';
import assert from 'node:assert/strict';
import { ksmPoolEditorInput, ksmPoolsViewInput, startPoolsInput } from '../../app/react/features/pools/publish.ts';

// A fake `window` with the legacy functions publish.ts reads through shared/legacy.ts.
const BRACKET = { kind: 'message', text: 'bracket' };
function fakeWindow({ state = {}, teamDivisions = [], teamRoundRobin = [], editCopy = {} } = {}) {
  const listeners = new Map();
  const s = { pools: {}, allMatches: {}, divisionTypes: {}, ...state };
  const win = {
    ksmLegacyState: () => s,
    ksmText: x => String(x || ''),
    isTeamDivision: d => teamDivisions.includes(d),
    isTeamRoundRobinDivision: d => teamRoundRobin.includes(d),
    poolPlayerSlot: (x, i) => x.slot ?? 'ABCDEFGH'[i],
    poolPlayerSlotLetter: i => 'ABCDEFGH'[i],
    ksmBracket: d => ({ ...BRACKET, text: `bracket ${d}` }),
    ksmPoolEditPools: d => (editCopy[d] ??= JSON.parse(JSON.stringify(s.pools[d] || []))),
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    dispatch: type => listeners.get(type)?.(),
  };
  globalThis.window = win;
  return win;
}

const player = (name, dojo = `${name} Dojo`, slot) => ({ name, dojo, ...(slot ? { slot } : {}) });
const pool = (label, names) => ({ label, size: names.length, players: names.map(n => player(n)) });

test('the view: pools with slots, titles and the labels as they are', () => {
  fakeWindow({ state: { pools: { Open: [pool('A', ['Ann', 'Bo']), pool('B', ['Cy'])] } } });
  const input = ksmPoolsViewInput('Open');
  assert.equal(input.kind, 'pools');
  assert.equal(input.message, null);
  assert.equal(input.edit, true);
  assert.equal(input.rightTitle, 'Championship Preview');
  assert.deepEqual(input.bracket, { kind: 'message', text: 'bracket Open' });
  assert.deepEqual(input.pools[0], {
    label: 'A', title: 'Pool A',
    players: [{ slot: 'A', name: 'Ann', dojo: 'Ann Dojo' }, { slot: 'B', name: 'Bo', dojo: 'Bo Dojo' }],
  });
  assert.equal(input.pools[1].title, 'Pool B');
});

test('the view: text is what esc() showed (empty for null) and slots come from poolPlayerSlot()', () => {
  fakeWindow({ state: { pools: { Open: [{ label: 'A', size: 1, players: [{ name: 'X <&>', dojo: null, slot: 'C' }] }] } } });
  const [p] = ksmPoolsViewInput('Open').pools;
  assert.deepEqual(p.players, [{ slot: 'C', name: 'X <&>', dojo: '' }]);
});

test('the view: a team division says Team Pool', () => {
  fakeWindow({ state: { pools: { Teams: [pool('A', ['T1', 'T2'])] } }, teamDivisions: ['Teams'] });
  assert.equal(ksmPoolsViewInput('Teams').pools[0].title, 'Team Pool A');
});

test('the view: a team round robin has no Edit Pool and shows Team Standings', () => {
  fakeWindow({ state: { pools: { Teams: [pool('A', ['T1', 'T2'])] } }, teamDivisions: ['Teams'], teamRoundRobin: ['Teams'] });
  const input = ksmPoolsViewInput('Teams');
  assert.equal(input.edit, false);
  assert.equal(input.rightTitle, 'Team Standings');
  assert.equal(input.message, null);
});

test('the view: each message branch when there are no pools', () => {
  fakeWindow({
    state: {
      allMatches: { Teams: [{}], Single: [{}], Played: [] },
      divisionTypes: { Single: 'Single Elimination', Played: 'Single Elimination', Open: 'Round Robin' },
    },
    teamDivisions: ['Teams'],
  });
  const msg = d => ksmPoolsViewInput(d).message;
  assert.equal(msg('Teams'), 'Single-elimination team bracket created. Team position matches are available in the Court queue.');
  assert.equal(msg('Single'), 'Single-elimination bracket created. Matches are available in the Court queue.');
  assert.equal(msg('Played'), 'No pools generated yet.');
  assert.equal(msg('Open'), 'No pools generated yet.');
  assert.equal(msg('Nothing'), 'No pools generated yet.');
  assert.equal(ksmPoolsViewInput('Open').edit, false);
  assert.deepEqual(ksmPoolsViewInput('Open').pools, []);
});

test('the view: a team division with matches but pools shows no message', () => {
  fakeWindow({ state: { pools: { Teams: [pool('A', ['T1'])] }, allMatches: { Teams: [{}] } }, teamDivisions: ['Teams'] });
  assert.equal(ksmPoolsViewInput('Teams').message, null);
});

test('the editor: slot letters by position, from the edit copy (not state.pools)', () => {
  const win = fakeWindow({ state: { pools: { Open: [pool('A', ['Ann', 'Bo']), pool('B', ['Cy'])] } } });
  // Classic created the copy and moved a player in it before signalling.
  const copy = win.ksmPoolEditPools('Open');
  copy[1].players.push(copy[0].players.splice(0, 1)[0]);
  const input = ksmPoolEditorInput('Open');
  assert.equal(input.kind, 'editor');
  assert.deepEqual(input.pools.map(p => p.players.map(x => `${x.slot}:${x.name}`)), [['A:Bo'], ['A:Cy', 'B:Ann']]);
  assert.deepEqual(input.pools.map(p => p.title), ['Pool A', 'Pool B']);
  assert.deepEqual(input.pools.map(p => p.label), ['A', 'B']);
  assert.deepEqual(input.bracket, { kind: 'message', text: 'bracket Open' });
  // state.pools is untouched.
  assert.equal(win.ksmLegacyState().pools.Open[0].players.length, 2);
});

test('the editor: a missing dojo is empty', () => {
  fakeWindow({ state: { pools: { Open: [{ label: 'A', size: 1, players: [{ name: 'Ann' }] }] } } });
  assert.deepEqual(ksmPoolEditorInput('Open').pools[0].players, [{ slot: 'A', name: 'Ann', dojo: '' }]);
});

test('start-up with no earlier request computes nothing until an event comes', () => {
  const win = fakeWindow({ state: { pools: { Open: [pool('A', ['Ann'])] } } });
  startPoolsInput();
  assert.equal(win.ksmPoolsInput, undefined);
  win.ksmPoolsRequested = { kind: 'pools', div: 'Open' };
  win.dispatch('ksm:pools');
  assert.equal(win.ksmPoolsInput.kind, 'pools');
});

test('start-up with an earlier request computes it once, at once', () => {
  const win = fakeWindow({ state: { pools: { Open: [pool('A', ['Ann'])] } } });
  win.ksmPoolsRequested = { kind: 'editor', div: 'Open' };
  startPoolsInput();
  assert.equal(win.ksmPoolsInput.kind, 'editor');
  assert.equal(win.ksmPoolsInput.pools[0].players[0].name, 'Ann');
});

test('the last request wins: the view after the editor and the editor after the view', () => {
  const win = fakeWindow({ state: { pools: { Open: [pool('A', ['Ann'])], Other: [pool('A', ['Zed'])] } } });
  startPoolsInput();
  win.ksmPoolsRequested = { kind: 'editor', div: 'Open' };
  win.dispatch('ksm:pools');
  assert.equal(win.ksmPoolsInput.kind, 'editor');
  win.ksmPoolsRequested = { kind: 'pools', div: 'Other' };
  win.dispatch('ksm:pools');
  assert.equal(win.ksmPoolsInput.kind, 'pools');
  assert.equal(win.ksmPoolsInput.pools[0].players[0].name, 'Zed');
  win.ksmPoolsRequested = { kind: 'editor', div: 'Other' };
  win.dispatch('ksm:pools');
  assert.equal(win.ksmPoolsInput.kind, 'editor');
  assert.equal(win.ksmPoolsInput.pools[0].players[0].name, 'Zed');
});

test('start-up with both kinds earlier computes only the last one', () => {
  const win = fakeWindow({ state: { pools: { Open: [pool('A', ['Ann'])] } } });
  // Classic overwrites the request, so only the last kind is ever left to compute.
  win.ksmPoolsRequested = { kind: 'editor', div: 'Open' };
  win.ksmPoolsRequested = { kind: 'pools', div: 'Open' };
  startPoolsInput();
  assert.equal(win.ksmPoolsInput.kind, 'pools');
});
