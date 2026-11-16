// #15 PR 11 (docs/STORE.md section 3 item 11): `awards` and `grandChampions` are the `tournament` slice's. `state` reads
// them through enumerable getters (the snapshot keeps every key, value, type and row order); each write is one
// tournament/… action (app/modules/results/awards-store.js); rows are store data, so an in-place edit throws in tests and
// is applied in production; a division rename rewrites the grand champions' sources in its one tournament/divisionRenamed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createKsmStore, dispatch, getState, setStoreStrict, tournamentSlice } from '../../app/store/index.ts';
import { assignState, replaceState, setStrayStoreWriteReporter, state, storeFieldPath } from '../../app/modules/app-state.js';
import * as KSMEngine from '../../app/engine/index.ts';

const A = tournamentSlice.actions;
const meta = { device: 'test' };
const fresh = () => createKsmStore();
const t = s => s.getState().tournament;
const json = v => JSON.parse(JSON.stringify(v));
const read = file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const award = (name, extra = {}) => ({ award: 'Fighting Spirit', name, dojo: '', ...extra });
const gc = (id, order, extra = {}) => ({ id, name: `GC ${id}`, sources: ['Open', 'Women'], format: 'Single Elimination', court: 'A', awardMode: 'top2', order, ...extra });

test('the two fields are enumerable store getters; no awards, no grand champions until one is added', () => {
  for (const key of ['awards', 'grandChampions']) {
    assert.deepEqual(storeFieldPath(key), ['tournament', key]);
    const d = Object.getOwnPropertyDescriptor(state, key);
    assert.ok(d.enumerable && !d.configurable && d.get && d.set, key);
  }
  assert.deepEqual(state.awards, []);
  assert.equal(state.grandChampions, undefined);
  const snap = json(state);
  assert.deepEqual(snap.awards, []);
  assert.ok(!('grandChampions' in snap), 'absent from the snapshot until set, as before');
});

test('a unit test per award action: each sets the list the app computed from the current rows', () => {
  const s = fresh();
  const run = (type, awards) => { const before = t(s); s.dispatch(A[type]({ awards }, meta)); return before; };
  run('awardAdded', [award('a')]);
  run('awardAdded', [...t(s).awards, award('b')]);
  run('awardAdded', [...t(s).awards, award('c')]);
  assert.deepEqual(t(s).awards.map(r => r.name), ['a', 'b', 'c']);
  // awardSet: untouched rows keep their identity
  let before = run('awardSet', t(s).awards.map((r, i) => i === 1 ? { ...r, dojo: 'Hilo', award: 'Best Kote' } : r));
  assert.deepEqual(t(s).awards[1], { award: 'Best Kote', name: 'b', dojo: 'Hilo' });
  assert.equal(t(s).awards[0], before.awards[0]);
  assert.notEqual(t(s).awards[1], before.awards[1]);
  assert.ok(Object.isFrozen(before.awards[1]), 'the old row was never written');
  // a field the row lacks is added at its end, as an assignment did
  run('awardSet', t(s).awards.map((r, i) => i === 0 ? { ...r, note: 'x' } : r));
  assert.deepEqual(Object.keys(t(s).awards[0]), ['award', 'name', 'dojo', 'note']);
  run('awardRemoved', t(s).awards.filter((_, i) => i !== 1));
  assert.deepEqual(t(s).awards.map(r => r.name), ['a', 'c']);
  // awardsLoaded: the whole list; a list that was never set is created by the next awardAdded
  run('awardsLoaded', [award('z')]);
  assert.deepEqual(t(s).awards, [award('z')]);
  const a = A.awardAdded({ awards: [award('a')] }, meta);
  assert.equal(a.type, 'tournament/awardAdded');
  assert.equal(a.meta.device, 'test');
});

test('a unit test per grand champion action: each sets the rows the app computed, in its order', () => {
  const s = fresh();
  const run = (type, rows) => { const before = t(s); s.dispatch(A[type]({ grandChampions: rows }, meta)); return before; };
  assert.equal(t(s).grandChampions, undefined);
  run('grandChampionAdded', [gc('gc:a', 0)]);
  run('grandChampionAdded', [gc('gc:a', 0), gc('gc:b', 1)]);
  assert.deepEqual(t(s).grandChampions.map(g => g.id), ['gc:a', 'gc:b']);
  let before = run('grandChampionUpdated', t(s).grandChampions.map(g => g.id === 'gc:b' ? { ...g, name: 'Renamed', keep: 'sig' } : g));
  assert.equal(t(s).grandChampions[0], before.grandChampions[0], 'the untouched row keeps its object');
  assert.deepEqual(t(s).grandChampions[1], { ...gc('gc:b', 1), name: 'Renamed', keep: 'sig' });
  assert.ok(Object.isFrozen(before.grandChampions[1]), 'the old row was never written');
  run('grandChampionMoved', [...t(s).grandChampions].reverse().map((g, i) => ({ ...g, order: i })));
  assert.deepEqual(t(s).grandChampions.map(g => [g.id, g.order]), [['gc:b', 0], ['gc:a', 1]]);
  run('grandChampionRemoved', t(s).grandChampions.filter(g => g.id !== 'gc:b'));
  assert.deepEqual(t(s).grandChampions.map(g => g.id), ['gc:a']);
  // The awards are untouched by any of them.
  assert.deepEqual(t(s).awards, []);
  assert.equal(A.grandChampionAdded({ grandChampions: [] }, meta).type, 'tournament/grandChampionAdded');
});

test('a division rename carries the grand champions: one action, the players and the sources together', () => {
  // The app's list of what a rename's action carries (divisions-store.js, which needs a browser to load).
  assert.match(read('app/modules/setup/divisions-store.js'), /KSM_RENAMED_STATE_KEYS=Object\.freeze\(\[\.\.\.KSM_DIVISION_STATE_KEYS,'competitors','grandChampions'\]\);/);
  const KSM_RENAMED_STATE_KEYS = ['divisions', 'divisionTypes', 'divisionCourts', 'hiddenPresets', 'divisionRenames', 'competitors', 'grandChampions'];
  const s = fresh();
  s.dispatch(A.peopleLoaded({ competitors: [{ name: 'A', division: 'Open' }] }, meta));
  s.dispatch(A.grandChampionAdded({ grandChampions: [gc('gc:a', 0)] }, meta));
  const renamed = KSMEngine.renamedDivisionState(json(s.getState().tournament), 'Open', 'Open 2', { id: 'r1', from: 'Open', to: 'Open 2' });
  const changed = Object.fromEntries(KSM_RENAMED_STATE_KEYS.filter(k => Object.hasOwn(renamed, k)).map(k => [k, renamed[k]]));
  let heard = 0;
  s.subscribe(() => { heard++; });
  s.dispatch(A.divisionRenamed(changed, meta));
  assert.equal(heard, 1, 'one notification');
  assert.deepEqual(t(s).grandChampions[0].sources, ['Open 2', 'Women']);
  assert.equal(t(s).competitors[0].division, 'Open 2');
});

test('strict mode: an award or a grand champion edited in place, or its list written, throws', () => {
  replaceState({ ...json(state), awards: [award('a')], grandChampions: [gc('gc:a', 0), gc('gc:b', 1)] });
  try {
    for (const write of [() => { state.awards = []; }, () => { state.grandChampions = []; }, () => { state.awards.push({}); },
      () => { state.awards[0].name = 'x'; }, () => { state.grandChampions[0].name = 'x'; }, () => { state.grandChampions[0].order = 5; },
      () => { state.grandChampions.sort(); }, () => { delete state.awards[0].dojo; }]) {
      assert.throws(write, TypeError, String(write));
    }
    assert.deepEqual(json(state).awards, [award('a')]);
  } finally {
    const { grandChampions, ...rest } = json(state);
    replaceState({ ...rest, awards: [] });
  }
});

test('production: a stray assignment is logged and applied', () => {
  const logged = [];
  setStrayStoreWriteReporter(w => logged.push(w));
  setStoreStrict(false);
  try {
    dispatch(A.awardsLoaded({ awards: [award('a')] }, meta));
    state.awards = [award('b')];
    assert.deepEqual(getState().tournament.awards.map(c => c.name), ['b']);
    assert.equal(logged.at(-1).field, 'awards');
    assert.equal(logged.at(-1).path, 'tournament.awards');
    state.grandChampions = [gc('gc:x', 0)];
    assert.deepEqual(getState().tournament.grandChampions.map(g => g.id), ['gc:x']);
    assert.equal(logged.at(-1).field, 'grandChampions');
  } finally {
    setStoreStrict(true);
    setStrayStoreWriteReporter(w => console.warn(w));
    const { grandChampions, ...rest } = json(state);
    replaceState({ ...rest, awards: [] });
  }
});

test('replaceState() / assignState() put the two fields in the store with their rows in order', () => {
  const saved = json(state);
  const loaded = { ...saved, awards: [award('z'), award('a', { award: 'Kantosho' })], grandChampions: [gc('gc:b', 1), gc('gc:a', 0)] };
  replaceState(loaded);
  const snap = json(state);
  assert.deepEqual(snap.awards, loaded.awards);
  assert.deepEqual(snap.grandChampions, loaded.grandChampions, 'the stored order, not the sorted one');
  // A 4.0 save without grand champions: undefined, not in the snapshot.
  const { grandChampions, ...old } = loaded;
  replaceState(old);
  assert.ok(!('grandChampions' in json(state)));
  assignState({ grandChampions: loaded.grandChampions });
  assert.deepEqual(json(state).grandChampions, loaded.grandChampions);
  replaceState(saved);
  assert.deepEqual(json(state), saved);
});

test('source: every write to the two fields is an action (no assignment, list method or row edit in app code)', () => {
  const files = ['app/main.js', ...fs.readdirSync(new URL('../../app/modules', import.meta.url), { recursive: true })
    .filter(f => f.endsWith('.js')).map(f => `app/modules/${f}`)];
  const bad = [];
  const write = /state\.(awards|grandChampions)\b(\[[^\]]*\](\.\w+|\[[^\]]*\])?)?\s*(=(?!=)|\+\+|\+=)|state\.(awards|grandChampions)\.(push|splice|sort|reverse|unshift|pop|shift|fill|copyWithin)\(|Object\.assign\((gc|a|g|row),/;
  for (const file of files.filter(f => f !== 'app/modules/app-state.js')) {
    read(file).split('\n').forEach((line, i) => { if (write.test(line)) bad.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`); });
  }
  assert.deepEqual(bad, []);
  // The old in-place writes, by name (each became an action): a grand champion's decision, its order and its fields.
  const gcSrc = read('app/modules/registration/grand-champion.js');
  assert.doesNotMatch(gcSrc, /\bgc\.(standIns|keep|rebuild)=(?!=)|\br\.order=(?!=)/);
  // Only awards-store.js dispatches the awards and grand champion actions.
  for (const file of files.filter(f => f !== 'app/modules/results/awards-store.js')) {
    assert.doesNotMatch(read(file), /\baward(Added|Set|Removed|sLoaded)\(|grandChampion(Added|Updated|Moved|Removed)\(/, file);
  }
});
