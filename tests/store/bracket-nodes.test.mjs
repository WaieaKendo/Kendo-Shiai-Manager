// #15 PR 12b (docs/STORE.md section 3 item 12): the bracket nodes (`championshipNodes`, `singleElimNodes`,
// `teamBracketNodes`) and a team bracket's teams (`teamElimTeams`) are the `tournament` slice's. `state` reads them through
// enumerable getters (the snapshot keeps every key, value, type and order); a division's nodes are written with the rest of
// its draw, and the winners a scored bout advances are one tournament/advancementApplied (app/modules/engine/structure-store.js).
// The nodes are store data, so an in-place edit throws in tests and is applied in production. The browser half (every
// bracket drawn and played through, Undo/Redo of advancing bouts, No Shows, the grand champion's stand-in and clear, loads,
// the three save conflicts and the undo-regenerate restore against the code before this PR) is
// tests/bracket-nodes-store-test.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createKsmStore, getState, setStoreStrict, tournamentSlice } from '../../app/store/index.ts';
import { replaceState, setStrayStoreWriteReporter, state, storeFieldPath } from '../../app/modules/app-state.js';
import { drawHelpers } from '../lib/draw-helpers.mjs';

const A = tournamentSlice.actions;
const meta = { device: 'test' };
const t = s => s.getState().tournament;
const json = v => JSON.parse(JSON.stringify(v));
const plain = v => JSON.parse(JSON.stringify(v));
const read = file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const NODE_KEYS = ['championshipNodes', 'singleElimNodes', 'teamBracketNodes', 'teamElimTeams'];
const node = (id, left, right, extra = {}) => ({ id, round: id.startsWith('F') ? 'Final' : 'Semifinal', slot: 0, left, right, ...extra });

function helpers(st) {
  const ctx = vm.createContext({ state: st });
  vm.runInContext(drawHelpers, ctx);
  return ctx;
}

test('the four fields are enumerable store getters at the literal\'s places, {} until drawn', () => {
  for (const key of NODE_KEYS) {
    assert.deepEqual(storeFieldPath(key), ['tournament', key]);
    const d = Object.getOwnPropertyDescriptor(state, key);
    assert.ok(d.enumerable && !d.configurable && d.get && d.set, key);
  }
  const snap = json(state);
  assert.deepEqual(NODE_KEYS.map(k => snap[k]), [{}, {}, {}, {}]);
  const keys = Object.keys(state);
  // The literal's order (app-state.js): brackets, championshipNodes, teamBracketState, teamBracketNodes, singleElimNodes, …, teamElimTeams.
  assert.deepEqual(keys.slice(0, 5), ['brackets', 'championshipNodes', 'teamBracketState', 'teamBracketNodes', 'singleElimNodes']);
  assert.ok(keys.indexOf('generated') < keys.indexOf('teamElimTeams') && keys.indexOf('teamElimTeams') < keys.indexOf('managementRevision'));
});

test('a unit test per action that writes nodes: the draw actions carry them, advancementApplied sets the lists it is given', () => {
  const s = createKsmStore();
  const run = (type, lists) => { const before = t(s); s.dispatch(A[type](lists, meta)); return before; };
  assert.equal(A.advancementApplied({}, meta).type, 'tournament/advancementApplied');
  const team = { team: 'Team A', senpo: 'a' }, teamB = { team: 'Team B', senpo: 'b' };
  const se = [node('SF1', { team: 1 }, { team: 2 }, { winner: null }), node('F', { ref: 'SF1' }, { team: 3 }, { winner: null })];
  // divisionGenerated: a division's nodes with its draw (one action)
  run('divisionGenerated', { singleElimNodes: { SE: se }, pools: { SE: [] }, singleElimComps: { SE: [{ name: 'x' }, { name: 'y' }, { name: 'z' }] } });
  run('divisionGenerated', { teamElimTeams: { T: [team, teamB] }, teamBracketNodes: { T: [node('F', { team: 1 }, { team: 2 })] } });
  run('divisionGenerated', { championshipNodes: { RR: [node('C-Final-0', { seed: 'A1' }, { seed: 'B1' })] }, pools: { ...t(s).pools, RR: [] } });
  assert.equal(t(s).teamElimTeams.T[0], team, 'a team row is kept as it is (Registration\'s follow finds it by identity)');
  // advancementApplied: a new winner, the other nodes and maps untouched
  let before = run('advancementApplied', { singleElimNodes: { SE: [{ ...se[0], winner: { name: 'x', dojo: '' } }, se[1]] } });
  assert.deepEqual(t(s).singleElimNodes.SE[0].winner, { name: 'x', dojo: '' });
  assert.equal(t(s).singleElimNodes.SE[1], before.singleElimNodes.SE[1], 'an untouched node keeps its object');
  assert.equal(t(s).teamBracketNodes, before.teamBracketNodes);
  assert.equal(before.singleElimNodes.SE[0].winner, null, 'the old state was never written');
  // drawEntriesUpdated: a team's No Show (the team's place empty, the nodes again)
  run('drawEntriesUpdated', { teamElimTeams: { T: [null, teamB] }, teamBracketNodes: { T: [node('F', { team: 1 }, { team: 2 }, { winner: 'Team B' })] }, managementRevision: 2 });
  assert.deepEqual([t(s).teamElimTeams.T[0], t(s).teamBracketNodes.T[0].winner, t(s).managementRevision], [null, 'Team B', 2]);
  // divisionCleared / divisionRegenerated: entries out with the draw
  run('divisionCleared', { singleElimNodes: {}, singleElimComps: {} });
  assert.deepEqual(t(s).singleElimNodes, {});
  // drawReset: every map empty
  run('drawReset', { pools: {}, teamPools: {}, singleElimComps: {}, brackets: {}, byeWinners: {}, teamBracketNodes: {}, singleElimNodes: {}, teamElimTeams: {}, championshipNodes: {} });
  assert.deepEqual(NODE_KEYS.map(k => t(s)[k]), [{}, {}, {}, {}]);
});

test('ksmNodesWithWinners(): a new node per winner (key order of an assignment), the same list when none', () => {
  const h = helpers({});
  const nodes = [{ id: 'SF1', left: null, right: null }, { id: 'F', winner: null, left: null }];
  assert.equal(h.ksmNodesWithWinners(nodes, []), nodes);
  const w = { name: 'a', dojo: 'd' };
  const next = h.ksmNodesWithWinners(nodes, [{ index: 0, winner: w }, { index: 1, winner: 'Team A' }]);
  assert.notEqual(next, nodes);
  assert.equal(next[0].winner, w, 'the plan\'s winner value itself');
  assert.equal(JSON.stringify(next), JSON.stringify([{ id: 'SF1', left: null, right: null, winner: w }, { id: 'F', winner: 'Team A', left: null }]));
  assert.deepEqual(plain(nodes), [{ id: 'SF1', left: null, right: null }, { id: 'F', winner: null, left: null }], 'the old nodes untouched');
});

test('ksmAdvanceBracket(): one action for new winners, none for none; a missing map is created empty, as the sync did', () => {
  const nodes = [{ id: 'F', winner: null }];
  const st = { singleElimNodes: { B: [], A: nodes } };
  const h = helpers(st);
  h.ksmAdvanceBracket('A', 'singleElimNodes', nodes, nodes);
  assert.equal(st.singleElimNodes.A, nodes, 'nothing new: nothing written');
  const next = [{ id: 'F', winner: { name: 'x' } }];
  h.ksmAdvanceBracket('A', 'singleElimNodes', nodes, next);
  assert.deepEqual(Object.keys(st.singleElimNodes), ['B', 'A'], 'the entry keeps its place');
  assert.equal(st.singleElimNodes.A, next);
  const empty = {};
  const none = [];
  helpers(empty).ksmAdvanceBracket('X', 'teamBracketNodes', none, none);
  assert.deepEqual(plain(empty), { teamBracketNodes: {} });
});

test('strict mode: a map, an entry, a node or a team row written in place throws', () => {
  const row = { team: 'Team A' };
  replaceState({ ...json(state), singleElimNodes: { SE: [{ id: 'F', winner: null }] }, teamBracketNodes: { T: [{ id: 'F' }] },
    championshipNodes: { RR: [{ id: 'C' }] }, teamElimTeams: { T: [row] } });
  try {
    for (const write of [() => { state.singleElimNodes = {}; }, () => { state.singleElimNodes.SE = []; }, () => { delete state.singleElimNodes.SE; },
      () => { state.singleElimNodes.SE[0].winner = { name: 'x' }; }, () => { state.teamBracketNodes.T[0].winner = 'Team A'; },
      () => { state.teamBracketNodes.T.push({}); }, () => { state.championshipNodes.RR[0].court = 'B'; }, () => { state.teamElimTeams.T[0] = null; },
      () => { state.teamElimTeams.T[0].team = 'x'; }, () => { state.teamElimTeams = {}; }]) {
      assert.throws(write, TypeError, String(write));
    }
    assert.deepEqual(json(state).singleElimNodes, { SE: [{ id: 'F', winner: null }] });
  } finally {
    replaceState({ ...json(state), singleElimNodes: {}, teamBracketNodes: {}, championshipNodes: {}, teamElimTeams: {} });
  }
});

test('production: a stray assignment is logged and applied', () => {
  const logged = [];
  setStrayStoreWriteReporter(w => logged.push(w));
  setStoreStrict(false);
  try {
    state.singleElimNodes = { X: [] };
    assert.deepEqual(getState().tournament.singleElimNodes, { X: [] });
    assert.deepEqual([logged.at(-1).field, logged.at(-1).path], ['singleElimNodes', 'tournament.singleElimNodes']);
    state.teamElimTeams = { T: [null] };
    assert.deepEqual(getState().tournament.teamElimTeams, { T: [null] });
  } finally {
    setStoreStrict(true);
    setStrayStoreWriteReporter(w => console.warn(w));
    replaceState({ ...json(state), singleElimNodes: {}, teamElimTeams: {} });
  }
});

test('replaceState() puts the nodes in the store; a 4.0 save without teamElimTeams leaves it undefined (the load adds {} on its copy first)', () => {
  const saved = json(state);
  const loaded = { ...saved, singleElimNodes: { B: [{ id: 'F', winner: { name: 'b', dojo: '' } }], A: [] }, teamElimTeams: { T: [{ team: 'Team A' }, null] } };
  replaceState(loaded);
  assert.deepEqual(json(state).singleElimNodes, loaded.singleElimNodes);
  assert.deepEqual(Object.keys(state.singleElimNodes), ['B', 'A']);
  const { teamElimTeams, ...old } = loaded;
  replaceState(old);
  assert.ok(!('teamElimTeams' in json(state)));
  assert.match(read('app/modules/sync/cloud-realtime-save-and-load.js'), /loaded\.teamElimTeams=loaded\.teamElimTeams\|\|\{\}/);
  replaceState(saved);
  assert.deepEqual(json(state), saved);
});

test('source: every write to the nodes is an action (no assignment, delete, list method or known in-place edit in app code)', () => {
  const files = ['app/main.js', ...fs.readdirSync(new URL('../../app/modules', import.meta.url), { recursive: true })
    .filter(f => f.endsWith('.js')).map(f => `app/modules/${f}`)];
  const F = '(championshipNodes|singleElimNodes|teamBracketNodes|teamElimTeams)';
  const write = new RegExp(`(?<![\\w.])state\\.${F}\\b(\\??\\.?\\[[^\\]]*\\](\\.\\w+|\\[[^\\]]*\\])?)?\\s*(=(?!=)|\\+\\+|\\+=)|delete\\s+state\\.${F}\\b|(?<![\\w.])state\\.${F}(\\?\\.)?(\\[[^\\]]*\\])?\\.(push|splice|sort|reverse|unshift|pop|shift|fill|copyWithin)\\(`);
  const bad = [];
  for (const file of files.filter(f => f !== 'app/modules/app-state.js')) {
    read(file).split('\n').forEach((line, i) => {
      if (write.test(line) || /\.winner\s*=(?!=)/.test(line)) bad.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(bad, []);
  // The old in-place writes, by name: the syncs' winners, a team's No Show, the load's repair, the dead builders.
  assert.doesNotMatch(read('app/modules/engine/engine-generation.js'), /teams\[idx\]=null|nodes\.forEach\(n=>n\.winner/);
  assert.doesNotMatch(read('app/modules/court/split-court-templates.js'), /nodes\[w\.index\]|syncSingleElimNodeWinnerFromMatch/);
  assert.doesNotMatch(read('app/modules/engine/engine-team-matches.js'), /nodes\[w\.index\]|function buildTeamMatches/);
  assert.doesNotMatch(read('app/modules/sync/cloud-realtime-save-and-load.js'), /forEach\(node=>\{node\.winner=null\}\)/);
  assert.doesNotMatch(read('app/modules/registration/people-store.js'), /list\[i\]=to/);
  // Only structure-store.js dispatches advancementApplied (through ksmSetDraw()).
  for (const file of files.filter(f => f !== 'app/modules/engine/structure-store.js')) {
    assert.doesNotMatch(read(file), /\.advancementApplied\(/, file);
  }
});
