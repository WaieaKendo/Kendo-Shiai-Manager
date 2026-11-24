// #15 PR 12a (docs/STORE.md section 3 item 12): the draw structure (`pools`, `teamPools`, `brackets`, `singleElimComps`,
// `byeWinners`, `generated`, `managementRevision`) is the `tournament` slice's. `state` reads it through enumerable getters
// (the snapshot keeps every key, value, type and order); each write is one tournament/… action
// (app/modules/engine/structure-store.js); the draw is store data, so an in-place edit throws in tests and is applied in
// production. The browser half (every generator, regenerate, Edit Pool, No Shows, grand champion draws, loads, the three
// save conflicts and the undo-regenerate restore against the code before this PR) is tests/structure-store-test.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createKsmStore, dispatch, getState, setStoreStrict, tournamentSlice } from '../../app/store/index.ts';
import { ksmLoadTournamentState, setStrayStoreWriteReporter, state, storeFieldPath } from '../../app/modules/app-state.js';
import { assignStoreKeys } from '../lib/store-keys.mjs';
import { drawHelpers } from '../lib/draw-helpers.mjs';
import { vmStore } from '../lib/vm-store.mjs';

const A = tournamentSlice.actions;
const meta = { device: 'test' };
const fresh = () => createKsmStore();
const t = s => s.getState().tournament;
const json = v => JSON.parse(JSON.stringify(v));
const read = file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const KEYS = ['pools', 'teamPools', 'brackets', 'singleElimComps', 'byeWinners', 'generated', 'managementRevision'];
const ACTIONS = ['drawReset', 'divisionGenerated', 'tournamentGenerated', 'divisionRegenerated', 'divisionCleared', 'poolsEdited', 'drawEntriesUpdated'];
const DRAW_KEYS = ['pools', 'teamPools', 'brackets', 'singleElimComps', 'byeWinners']; // structure-store.js's KSM_DRAW_KEYS of PR 12a
const pool = (label, ...names) => ({ label, size: names.length, players: names.map(name => ({ name, dojo: 'D' })) });

/** structure-store.js's own helpers (they read `state`) over a real store holding `st`, as the vm tests run them. */
function helpers(st) {
  const ctx = {};
  vmStore(ctx, st); // a real store holding `st` (tests/lib/vm-store.mjs): ksmSetDraw() dispatches the draw action
  vm.createContext(ctx);
  vm.runInContext(drawHelpers, ctx);
  return ctx;
}
/** A vm result as plain JSON of this realm (deepStrictEqual compares prototypes; JSON keeps the key order). */
const plain = v => JSON.parse(JSON.stringify(v));

test('the seven fields are enumerable store getters at their places; singleElimComps and byeWinners absent until generated', () => {
  for (const key of KEYS) {
    assert.deepEqual(storeFieldPath(key), ['tournament', key]);
    const d = Object.getOwnPropertyDescriptor(state, key);
    assert.ok(d.enumerable && !d.configurable && d.get && d.set, key);
  }
  const snap = json(state);
  assert.deepEqual([snap.pools, snap.teamPools, snap.brackets, snap.generated, snap.managementRevision], [{}, {}, {}, false, 0]);
  assert.ok(!('singleElimComps' in snap) && !('byeWinners' in snap), 'absent from the snapshot until set, as before');
  // The literal's order: brackets first, pools / teamPools / generated / managementRevision where they were.
  const keys = Object.keys(state);
  assert.equal(keys[0], 'brackets');
  assert.ok(keys.indexOf('pools') < keys.indexOf('teamPools') && keys.indexOf('teamPools') < keys.indexOf('generated') && keys.indexOf('generated') < keys.indexOf('managementRevision'));
});

test('a unit test per action: each sets the maps the app computed, nothing else changes', () => {
  const s = fresh();
  const run = (type, lists) => { const before = t(s); s.dispatch(A[type](lists, meta)); return before; };
  assert.deepEqual(Object.keys(A).filter(k => ACTIONS.includes(k)).sort(), [...ACTIONS].sort());
  for (const type of ACTIONS) assert.equal(A[type]({}, meta).type, `tournament/${type}`);
  // drawReset: the five maps empty
  let before = run('drawReset', { pools: {}, teamPools: {}, singleElimComps: {}, brackets: {}, byeWinners: {} });
  assert.deepEqual(KEYS.map(k => t(s)[k]), [{}, {}, {}, {}, {}, false, 0]);
  assert.equal(t(s).settings, before.settings, 'the Setup is untouched');
  // divisionGenerated: one division's entries
  const rr = [pool('A', 'a', 'b', 'c'), pool('B', 'd', 'e', 'f')];
  run('divisionGenerated', { pools: { Open: rr }, brackets: { Open: [['A1', 'B2'], ['B1', 'A2']] } });
  run('divisionGenerated', { pools: { ...t(s).pools, Kids: [] }, singleElimComps: { Kids: [{ name: 'k' }, null] } });
  assert.deepEqual(Object.keys(t(s).pools), ['Open', 'Kids']);
  assert.deepEqual(t(s).singleElimComps.Kids, [{ name: 'k' }, null]);
  // tournamentGenerated: the flag and the bump
  run('tournamentGenerated', { generated: true, managementRevision: 1 });
  assert.deepEqual([t(s).generated, t(s).managementRevision], [true, 1]);
  // divisionRegenerated: the old entry out, the new one at the end, the bump
  const kids = t(s).pools.Kids;
  before = run('divisionRegenerated', { pools: { Kids: kids, Open: [pool('A', 'a', 'b')] }, managementRevision: 2 });
  assert.deepEqual(Object.keys(t(s).pools), ['Kids', 'Open']);
  assert.equal(t(s).pools.Kids, before.pools.Kids, 'an untouched entry keeps its object');
  assert.ok(Object.isFrozen(before.pools.Open[0].players[0]), 'the old draw was never written');
  // poolsEdited, drawEntriesUpdated, divisionCleared
  run('poolsEdited', { pools: { ...t(s).pools, Open: [pool('A', 'b', 'a')] }, managementRevision: 3 });
  assert.deepEqual(t(s).pools.Open[0].players.map(p => p.name), ['b', 'a']);
  run('drawEntriesUpdated', { singleElimComps: { Kids: [null, null] }, managementRevision: 4 });
  run('divisionCleared', { pools: { Open: t(s).pools.Open } });
  assert.deepEqual(Object.keys(t(s).pools), ['Open']);
  assert.equal(t(s).managementRevision, 4);
  assert.deepEqual(t(s).competitors, [], 'the people are untouched');
});

test('ksmDrawWith(): an entry set in place, removed, or removed and put at the end (a regenerate); missing maps', () => {
  const st = { pools: { A: [1], B: [2], C: [3] }, teamPools: {}, brackets: { A: ['x'] } };
  const h = helpers(st);
  assert.deepEqual(Object.keys(h.ksmDrawWith('B', { pools: [9] }).pools), ['A', 'B', 'C'], 'in place');
  assert.equal(JSON.stringify(h.ksmDrawWith('B', { pools: [9] }, DRAW_KEYS)), JSON.stringify({ pools: { A: [1], C: [3], B: [9] } }), 'removed first: at the end');
  assert.deepEqual(plain(h.ksmDrawWith('A', {}, DRAW_KEYS)), { pools: { B: [2], C: [3] }, brackets: {} }, 'only the maps that had the entry');
  assert.deepEqual(plain(h.ksmDrawWith('A', { singleElimComps: [null] })), { singleElimComps: { A: [null] } }, 'a missing map is created');
  assert.ok(!('singleElimComps' in json(h.ksmDrawWith('A', {}, ['singleElimComps']))), 'and never created by a removal');
  assert.deepEqual(st.pools, { A: [1], B: [2], C: [3] }, 'the current maps are never written');
});

test('ksmEditedPools(): a pool edited in both maps; a list both maps share stays one list', () => {
  const shared = [pool('A', 't1', 't2', 't3')];
  const st = { pools: { T: shared, O: [pool('A', 'a', 'b')] }, teamPools: { T: shared } };
  const h = helpers(st);
  const first = shared[0];
  const out = h.ksmEditedPools('T', p => p === first ? { ...p, players: p.players.filter(x => x.name !== 't2') } : p);
  assert.equal(out.pools.T, out.teamPools.T, 'one list, as the team round robin had');
  assert.deepEqual(plain(out.pools.T[0].players.map(p => p.name)), ['t1', 't3']);
  assert.equal(out.pools.O, st.pools.O);
  // After a load the two are copies: each is edited where it holds the pool, never the other.
  const copy = { pools: { T: [pool('A', 'x')] }, teamPools: { T: [pool('A', 'x')] } };
  const hc = helpers(copy), target = copy.pools.T[0];
  const out2 = hc.ksmEditedPools('T', p => p === target ? { ...p, players: [] } : p);
  assert.deepEqual(plain(Object.keys(out2)), ['pools']);
  assert.deepEqual(plain(helpers(copy).ksmEditedPools('T', p => p)), {}, 'nothing changed: no maps');
  assert.equal(h.ksmNextManagementRevision(), 1);
});

test('strict mode: a map, an entry or a row of the draw written in place throws', () => {
  ksmLoadTournamentState({ ...json(state), pools: { Open: [pool('A', 'a', 'b')] }, brackets: { Open: [['A1', 'B2']] }, singleElimComps: { Kids: [{ name: 'k' }] }, generated: true, managementRevision: 3 });
  try {
    for (const write of [() => { state.pools = {}; }, () => { state.pools.Open = []; }, () => { delete state.pools.Open; },
      () => { state.pools.Open[0].players = []; }, () => { state.pools.Open[0].players[0].name = 'x'; }, () => { delete state.pools.Open[0].court; state.pools.Open[0].size = 9; },
      () => { state.brackets.Open.push([]); }, () => { state.singleElimComps.Kids[0] = null; }, () => { state.teamPools = {}; },
      () => { state.byeWinners = {}; }, () => { state.generated = false; }, () => { state.managementRevision++; }]) {
      assert.throws(write, TypeError, String(write));
    }
    assert.deepEqual(json(state).pools, { Open: [pool('A', 'a', 'b')] });
    assert.equal(state.managementRevision, 3);
  } finally {
    const { singleElimComps, ...rest } = json(state);
    ksmLoadTournamentState({ ...rest, pools: {}, brackets: {}, generated: false, managementRevision: 0 });
  }
});

test('production: a stray assignment is logged and applied', () => {
  const logged = [];
  setStrayStoreWriteReporter(w => logged.push(w));
  setStoreStrict(false);
  try {
    state.managementRevision = 5;
    assert.equal(getState().tournament.managementRevision, 5);
    assert.deepEqual([logged.at(-1).field, logged.at(-1).path], ['managementRevision', 'tournament.managementRevision']);
    state.pools = { X: [] };
    assert.deepEqual(getState().tournament.pools, { X: [] });
    dispatch(A.tournamentGenerated({ generated: false, managementRevision: 0 }, meta));
  } finally {
    setStoreStrict(true);
    setStrayStoreWriteReporter(w => console.warn(w));
    ksmLoadTournamentState({ ...json(state), pools: {}, generated: false, managementRevision: 0 });
  }
});

test('ksmLoadTournamentState() / assignStoreKeys() put the draw in the store; a 4.0 save without some maps leaves them undefined', () => {
  const saved = json(state);
  const loaded = { ...saved, pools: { B: [pool('A', 'b')], A: [pool('A', 'a')] }, teamPools: { T: [] }, brackets: { A: [['A1', 'B2']] },
    singleElimComps: { S: [{ name: 's' }, null] }, byeWinners: { A: [{ slot: 1, obj: { name: 'a', dojo: '' } }] }, generated: true, managementRevision: 7 };
  ksmLoadTournamentState(loaded);
  const snap = json(state);
  for (const key of KEYS) assert.deepEqual(snap[key], loaded[key], key);
  assert.deepEqual(Object.keys(snap.pools), ['B', 'A'], 'the stored order');
  const { singleElimComps, byeWinners, teamPools, ...old } = loaded;
  ksmLoadTournamentState(old);
  assert.ok(!('singleElimComps' in json(state)) && !('byeWinners' in json(state)) && !('teamPools' in json(state)));
  assignStoreKeys({ managementRevision: 9 });
  assert.equal(state.managementRevision, 9);
  ksmLoadTournamentState(saved);
  assert.deepEqual(json(state), saved);
});

test('source: every write to the draw is an action (no assignment, delete, list method or known in-place edit in app code)', () => {
  const files = ['app/main.js', ...fs.readdirSync(new URL('../../app/modules', import.meta.url), { recursive: true })
    .filter(f => f.endsWith('.js')).map(f => `app/modules/${f}`)];
  const F = '(pools|teamPools|brackets|singleElimComps|byeWinners|generated|managementRevision)';
  const write = new RegExp(`(?<![\\w.])state\\.${F}\\b(\\??\\.?\\[[^\\]]*\\](\\.\\w+|\\[[^\\]]*\\])?)?\\s*(=(?!=)|\\+\\+|\\+=)|delete\\s+state\\.${F}\\b|(?<![\\w.])state\\.${F}(\\?\\.)?(\\[[^\\]]*\\])?\\.(push|splice|sort|reverse|unshift|pop|shift|fill|copyWithin)\\(`);
  const bad = [];
  for (const file of files.filter(f => f !== 'app/modules/app-state.js')) {
    read(file).split('\n').forEach((line, i) => { if (write.test(line)) bad.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`); });
  }
  assert.deepEqual(bad, []);
  // The old in-place writes, by name (each became an action): a No Show's pool and entrant, Edit Pool's map, the court
  // change's pool courts, the grand champion's stand-in, Registration's follow into the entrants, the load's default.
  const gen = read('app/modules/engine/engine-generation.js');
  assert.doesNotMatch(gen, /pool\.players=|pool\.size=|comps\[idx\]=null|state\.pools\[div\]=|state\.brackets\[div\]=/);
  assert.doesNotMatch(read('app/modules/setup/division-setup.js'), /delete p\.court/);
  assert.doesNotMatch(read('app/modules/engine/engine-pools.js'), /if\(pool\)pool\.court=court/);
  assert.doesNotMatch(read('app/modules/registration/grand-champion.js'), /forEach\(c=>swap\(c|forEach\(x=>swap\(x/);
  // (PR 12b: `teamElimTeams` is store data too, so the follow builds new lists for both maps; tests/store/bracket-nodes.test.mjs.)
  assert.doesNotMatch(read('app/modules/registration/people-store.js'), /list\[i\]=to/);
  assert.doesNotMatch(read('app/modules/court/court-context-and-pool-editing.js'), /state\.brackets=state\.brackets\|\|\{\}/);
  // Only structure-store.js dispatches the draw actions (through ksmSetDraw()).
  for (const file of files.filter(f => f !== 'app/modules/engine/structure-store.js')) {
    assert.doesNotMatch(read(file), new RegExp(`\\.(${ACTIONS.join('|')})\\(`), file);
  }
});
