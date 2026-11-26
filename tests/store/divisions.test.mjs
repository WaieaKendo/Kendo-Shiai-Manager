// #15 PR 9 (docs/STORE.md section 3 item 9): the division lists (`divisions`, `divisionTypes`, `divisionCourts`,
// `hiddenPresets`, `divisionRenames`) are the `tournament` slice's. `state` reads them through enumerable getters (the
// snapshot keeps every key, value and type); each edit is pure engine code (app/engine/division-lists.ts) whose result is
// one tournament/division… action; a rename is one action with its divisionRenames record; the team court's entry
// `divisionCourts['Team Tournament']` is derived from settings.teamCourt; a stray write throws in tests and is logged and
// applied in production.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createKsmStore, dispatch, getState, setStoreStrict, tournamentLoaded, tournamentSlice, withTeamCourt } from '../../app/store/index.ts';
import { ksmLoadTournamentState, setStrayStoreWriteReporter, state, storeFieldPath } from '../../app/modules/app-state.js';
import { assignStoreKeys } from '../lib/store-keys.mjs';
import * as KSMEngine from '../../app/engine/index.ts';

const A = tournamentSlice.actions;
const KEYS = ['divisions', 'divisionTypes', 'divisionCourts', 'hiddenPresets', 'divisionRenames'];
const TT = 'Team Tournament';
const meta = { device: 'test' };
const lists = st => ({ divisions: st.divisions, divisionTypes: st.divisionTypes, divisionCourts: st.divisionCourts, hiddenPresets: st.hiddenPresets, divisionRenames: st.divisionRenames });
const fresh = () => createKsmStore();
const t = s => s.getState().tournament;
const json = v => JSON.parse(JSON.stringify(v));

test('the five fields are enumerable store getters; the initial value is the standard divisions', () => {
  for (const key of KEYS) {
    assert.deepEqual(storeFieldPath(key), ['tournament', key]);
    const d = Object.getOwnPropertyDescriptor(state, key);
    assert.ok(d.enumerable && !d.configurable && d.get && d.set, key);
  }
  const presets = KSMEngine.DIVISION_PRESETS;
  assert.deepEqual(state.divisions, presets.map(p => p[0]));
  assert.deepEqual(state.divisionTypes, Object.fromEntries(presets.map(p => [p[0], p[1]])));
  // The same key order as the old literal: the presets, then the team court's entry.
  assert.deepEqual(Object.entries(state.divisionCourts), [...presets.map(p => [p[0], p[2]]), [TT, 'Both']]);
  assert.equal(state.hiddenPresets, undefined);
  assert.equal(state.divisionRenames, undefined);
  const snap = json(state);
  assert.ok(!('hiddenPresets' in snap) && !('divisionRenames' in snap), 'absent from the snapshot until set, as before');
});

test('a unit test per action: each dispatches the lists its engine edit computed, nothing else changes', () => {
  const s = fresh();
  const run = (action, changed) => { const before = t(s); s.dispatch(A[action](changed, meta)); return before; };
  // divisionAdded
  let before = run('divisionAdded', KSMEngine.addedDivision(t(s), 'Kids', 'Single Elimination', 'split'));
  assert.deepEqual(t(s).divisions.at(-1), 'Kids');
  assert.equal(t(s).divisionTypes.Kids, 'Single Elimination');
  assert.equal(t(s).divisionCourts.Kids, 'split');
  assert.equal(t(s).settings, before.settings, 'the Setup is untouched');
  assert.deepEqual(KSMEngine.addedDivision(t(s), 'Kids', 'Round Robin', 'A'), {}, 'adding it again changes nothing');
  // divisionMoved
  run('divisionMoved', KSMEngine.movedDivision(t(s), 'Kids', 'up'));
  assert.deepEqual(t(s).divisions.slice(-2), ['Kids', 'Masters Open (50+ years old)']);
  assert.deepEqual(KSMEngine.movedDivision(t(s), t(s).divisions[0], 'up'), {}, 'the first cannot move up');
  // divisionFormatChanged
  run('divisionFormatChanged', { divisionTypes: { ...t(s).divisionTypes, Kids: 'Round Robin' } });
  assert.equal(t(s).divisionTypes.Kids, 'Round Robin');
  // divisionCourtChanged (one court; one forgotten; the defaults)
  run('divisionCourtChanged', { divisionCourts: KSMEngine.withDivisionCourts(t(s).divisionCourts, { Kids: 'B', 'gc:1': 'A' }) });
  assert.equal(t(s).divisionCourts.Kids, 'B');
  run('divisionCourtChanged', { divisionCourts: KSMEngine.withDivisionCourts(t(s).divisionCourts, { 'gc:1': null }) });
  assert.ok(!Object.hasOwn(t(s).divisionCourts, 'gc:1'));
  run('divisionAdded', { divisions: [...t(s).divisions, 'Orphan'] });
  run('divisionCourtChanged', KSMEngine.defaultedDivisionCourts(t(s), t(s).divisions, 'A'));
  assert.equal(t(s).divisionCourts.Orphan, 'A');
  assert.deepEqual(KSMEngine.defaultedDivisionCourts(t(s), t(s).divisions, 'A'), {}, 'none lacks one now');
  // divisionRemoved: switched off (kept settings), removed (forgotten), by a negative index (removeDivision(-1))
  run('divisionRemoved', KSMEngine.removedDivision(t(s), 'Kids', { keepSettings: true }));
  assert.ok(!t(s).divisions.includes('Kids'));
  assert.equal(t(s).divisionTypes.Kids, 'Round Robin');
  assert.equal(t(s).divisionCourts.Kids, 'B');
  run('divisionRemoved', KSMEngine.removedDivision(t(s), 'Kids'));
  assert.ok(!Object.hasOwn(t(s).divisionTypes, 'Kids') && !Object.hasOwn(t(s).divisionCourts, 'Kids'));
  const last = t(s).divisions.at(-1);
  run('divisionRemoved', KSMEngine.removedDivision(t(s), undefined, { index: -1 }));
  assert.ok(!t(s).divisions.includes(last), 'splice(-1, 1) as the old code did');
  // presetHidden / presetsRestored
  run('presetHidden', { hiddenPresets: ['Women’s Open'] });
  assert.deepEqual(t(s).hiddenPresets, ['Women’s Open']);
  run('presetsRestored', { hiddenPresets: [] });
  assert.deepEqual(t(s).hiddenPresets, []);
  // divisionsReplaced (the sample tournament)
  run('divisionsReplaced', { divisions: ['X'], divisionTypes: { X: 'Round Robin' }, divisionCourts: { X: 'A' } });
  assert.deepEqual(t(s).divisions, ['X']);
  assert.deepEqual(t(s).divisionCourts, { X: 'A', [TT]: 'Both' }, 'the team court\'s entry comes back after the others');
  // Every action carries meta and its own type.
  const a = A.divisionAdded({ divisions: [] }, meta);
  assert.equal(a.type, 'tournament/divisionAdded');
  assert.equal(a.meta.device, 'test');
  // (The draw's division actions, PR 12a, are tests/store/structure.test.mjs's.)
  assert.deepEqual(Object.keys(A).filter(k => (k.startsWith('division') && !/^division(Generated|Regenerated|Cleared)$/.test(k)) || k.startsWith('preset')).sort(), [
    'divisionAdded', 'divisionCourtChanged', 'divisionFormatChanged', 'divisionMoved', 'divisionRemoved', 'divisionRenamed', 'divisionsReplaced',
    'presetHidden', 'presetsRestored',
  ]);
});

test('a rename and its divisionRenames record are one dispatch, with the engine\'s result', () => {
  const s = fresh();
  s.dispatch(A.divisionAdded(KSMEngine.addedDivision(t(s), 'Kids', 'Single Elimination', 'split'), meta));
  const from = 'Kids', to = 'Under 12', record = { id: 'c:1:x', from, to };
  const st = { ...lists(t(s)), competitors: [{ name: 'A', division: from }], courtState: { A: { division: from, index: 0 } } };
  const renamed = KSMEngine.renamedDivisionState(st, from, to, record);
  // Since PR 10 the renamed players are in the same action (tests/store/people.test.mjs).
  const changed = Object.fromEntries(Object.entries(renamed).filter(([k]) => [...KEYS, 'competitors', 'grandChampions'].includes(k)));
  let notified = 0;
  const off = s.subscribe(() => notified++);
  s.dispatch(A.divisionRenamed(changed, meta));
  off();
  assert.equal(notified, 1, 'one action');
  const now = t(s);
  assert.equal(now.divisions.indexOf(to), st.divisions.indexOf(from), 'the running order keeps the place');
  assert.equal(now.divisionTypes[to], 'Single Elimination');
  assert.equal(now.divisionCourts[to], 'split');
  assert.deepEqual(Object.keys(now.divisionCourts), Object.keys(st.divisionCourts).map(k => (k === from ? to : k)), 'the court keeps its key\'s place');
  assert.deepEqual(now.divisionRenames, [record]);
  // The engine's whole rename (the rebase replays it on payloads) gives the same lists.
  for (const key of ['divisions', 'divisionTypes', 'divisionCourts', 'divisionRenames']) assert.deepEqual(now[key], renamed[key], key);
  assert.deepEqual(now.competitors, [{ name: 'A', division: to }], 'the players move with it (PR 10)');
  // What the store does not hold yet is the caller's: the courts' divisions (PR 13).
  assert.deepEqual(renamed.courtState.A, { division: to, index: 0 });
});

test('the team court: divisionCourts[\'Team Tournament\'] is settings.teamCourt after every action', () => {
  const s = fresh();
  assert.equal(t(s).divisionCourts[TT], 'Both');
  s.dispatch(A.settingChanged({ key: 'teamCourt', value: 'B' }, meta));
  assert.equal(t(s).divisionCourts[TT], 'B', 'tournament/settingChanged alone moves it');
  // A division action cannot write it: the engine skips the key, and the store puts the Setup's value back anyway.
  assert.deepEqual(KSMEngine.withDivisionCourts(t(s).divisionCourts, { [TT]: 'A' }), t(s).divisionCourts);
  s.dispatch(A.divisionCourtChanged({ divisionCourts: { ...t(s).divisionCourts, [TT]: 'A' } }, meta));
  assert.equal(t(s).divisionCourts[TT], 'B');
  s.dispatch(A.divisionRemoved(KSMEngine.removedDivision(t(s), TT), meta));
  assert.equal(t(s).divisionCourts[TT], 'B', 'removing a division of that name keeps the team court');
  // A load (tournament/loaded) with another value or none: the Setup's value, at the payload's place when it names it.
  s.dispatch(tournamentLoaded({ writes: [{ path: ['tournament', 'divisionCourts'], value: { [TT]: 'A', Open: 'B' } }] }));
  assert.deepEqual(Object.entries(t(s).divisionCourts), [[TT, 'B'], ['Open', 'B']]);
  s.dispatch(tournamentLoaded({ writes: [{ path: ['tournament', 'divisionCourts'], value: undefined }] }));
  assert.deepEqual(t(s).divisionCourts, { [TT]: 'B' });
  // withTeamCourt keeps the object when it already agrees (no new state, no re-render).
  const now = t(s);
  assert.equal(withTeamCourt(now), now);
});

test('L1 (#185 review): "Team Tournament" (and "Exhibition Matches") cannot be added as an individual division', () => {
  for (const name of ['Team Tournament', ' team tournament ', 'TEAM TOURNAMENT', 'Exhibition Matches', 'exhibition matches']) {
    assert.match(KSMEngine.divisionAddError(name), /is reserved for .*; choose another name\.$/, name);
  }
  assert.equal(KSMEngine.divisionAddError('Kids'), null);
  assert.equal(KSMEngine.divisionAddError('Team Kids'), null);
  assert.equal(KSMEngine.divisionAddError('  '), KSMEngine.RENAME_EMPTY_MESSAGE);
  // The rename already refused both (unchanged).
  const st = { divisions: ['Kids'], divisionTypes: { Kids: 'Round Robin' }, divisionCourts: { Kids: 'A', [TT]: 'B' } };
  assert.match(KSMEngine.divisionRenameError(st, [], 'Kids', 'team tournament'), /reserved for the team event/);
  // The app's add paths ask the engine first: Add division (a toast, nothing added) and a Registration row's division.
  const setup = fs.readFileSync(new URL('../../app/modules/setup/division-setup.js', import.meta.url), 'utf8');
  assert.match(setup, /const refused=KSMEngine\.divisionAddError\(v\);if\(refused\)\{showKsmToast\(refused\);return false\}/);
  assert.match(setup, /function toggleDivision\(d,on\)\{if\(on&&!selectDivisions\(getState\(\)\)\.includes\(d\)\)\{const refused=KSMEngine\.divisionAddError\(d\);if\(refused\)\{showKsmToast\(refused\);renderDivisionSetup\(\);return\}/, 'toggleDivision(d, true) asks too');
  const reg = fs.readFileSync(new URL('../../app/modules/registration/registration.js', import.meta.url), 'utf8');
  assert.match(reg, /!KSMEngine\.divisionAddError\(v\)\)\{ksmOfferDivision\(v\)/);
});

test('the load keeps divisionCourts as before: {} when missing, an individual 4.0 \'Both\' as \'split\'', () => {
  const st = {
    divisionCourts: { Open: 'Both', Kids: 'A', [TT]: 'Both', 'team:1': 'Both', Kachi: 'Both', Exhibition: 'B' },
    divisionTypes: { Kachi: 'Kachinuki Team', Open: 'Round Robin' }, teamDivisions: [{ id: 'team:1' }],
  };
  assert.deepEqual(KSMEngine.loadedDivisionCourts(st), { Open: 'split', Kids: 'A', [TT]: 'Both', 'team:1': 'Both', Kachi: 'Both', Exhibition: 'B' });
  const same = { divisionCourts: { Kids: 'A' } };
  assert.equal(KSMEngine.loadedDivisionCourts(same), same.divisionCourts, 'the same object when nothing changes');
  assert.deepEqual(KSMEngine.loadedDivisionCourts({}), {});
  assert.deepEqual(KSMEngine.loadedDivisionCourts({ divisionCourts: null }), {});
});

test('strict: assigning a field or writing into its frozen value throws and changes nothing', () => {
  const before = json(lists(state));
  assert.throws(() => { state.divisions = ['X']; }, /state\.divisions is in the store \(tournament\.divisions\)/);
  assert.throws(() => { state.hiddenPresets = ['X']; }, /state\.hiddenPresets is in the store/);
  assert.throws(() => { state.divisions.push('X'); }, TypeError);
  assert.throws(() => { state.divisionTypes.X = 'Round Robin'; }, TypeError);
  assert.throws(() => { state.divisionCourts[TT] = 'A'; }, TypeError);
  assert.throws(() => { delete state.divisionCourts['Women’s Open']; }, TypeError);
  assert.deepEqual(json(lists(state)), before);
});

test('production: a stray assignment is logged and applied', () => {
  const logged = [], before = getState().tournament;
  setStrayStoreWriteReporter(w => logged.push(w));
  setStoreStrict(false);
  try {
    // A fresh value (the store's own is frozen from the strict run).
    dispatch(A.divisionsReplaced({ divisions: [...state.divisions], divisionTypes: { ...state.divisionTypes }, divisionCourts: { ...state.divisionCourts } }, meta));
    state.hiddenPresets = ['Women’s Open'];
    assert.deepEqual(getState().tournament.hiddenPresets, ['Women’s Open']);
    assert.equal(logged.at(-1).field, 'hiddenPresets');
    assert.equal(logged.at(-1).path, 'tournament.hiddenPresets');
    assert.equal(json(state).hiddenPresets[0], 'Women’s Open', 'the next snapshot carries it');
    // A nested write (state.divisionTypes[d] = …) goes into the store's unfrozen object in production, as for every moved
    // field (tests/store/legacy.test.mjs; this app store runs RTK's immutability check, which would report it here).
  } finally {
    setStoreStrict(true);
    setStrayStoreWriteReporter(w => console.warn(w));
    ksmLoadTournamentState({ ...json(state), divisions: before.divisions, divisionTypes: before.divisionTypes, divisionCourts: before.divisionCourts, hiddenPresets: before.hiddenPresets, divisionRenames: before.divisionRenames });
  }
});

test('ksmLoadTournamentState() / assignStoreKeys() put the five fields in the store; the snapshot keeps every value and type', () => {
  const saved = json(state);
  const loaded = {
    ...saved,
    divisions: ['Open', 'Kids'], divisionTypes: { Open: 'Round Robin', Kids: 'Single Elimination' },
    divisionCourts: { Open: 'B', [TT]: 'A', Kids: 'split' }, hiddenPresets: ['Women’s Open'],
    divisionRenames: [{ id: 'c:1', from: 'Kids 1', to: 'Kids' }],
  };
  ksmLoadTournamentState(loaded);
  const snap = json(state);
  for (const key of KEYS) assert.deepEqual(snap[key], key === 'divisionCourts' ? { ...loaded.divisionCourts, [TT]: getState().tournament.settings.teamCourt } : loaded[key], key);
  assert.deepEqual(Object.keys(snap.divisionCourts), ['Open', TT, 'Kids'], 'the team court keeps the payload\'s place');
  assignStoreKeys({ hiddenPresets: undefined, divisionRenames: undefined });
  assert.ok(!('hiddenPresets' in json(state)), 'undefined again: not in the snapshot');
  ksmLoadTournamentState(saved);
  assert.deepEqual(json(state), saved);
});
