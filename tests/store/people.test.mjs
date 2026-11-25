// #15 PR 10 (docs/STORE.md section 3 item 10): the people (`competitors`, `teams`, `exhibitions`, `teamDivisions`) are
// the `tournament` slice's. `state` reads them through enumerable getters (the snapshot keeps every key, value, type and
// row order); each write is one tournament/… action (app/modules/registration/people-store.js); a row is named by its
// index; rows are store data, so an in-place edit throws in tests and is applied in production; a rename moves the
// players in its one tournament/divisionRenamed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createKsmStore, dispatch, getState, setStoreStrict, tournamentSlice } from '../../app/store/index.ts';
import { ksmLoadTournamentState, setStrayStoreWriteReporter, state, storeFieldPath } from '../../app/modules/app-state.js';
import { assignStoreKeys } from '../lib/store-keys.mjs';
import * as KSMEngine from '../../app/engine/index.ts';

const A = tournamentSlice.actions;
const KEYS = ['competitors', 'teams', 'exhibitions', 'teamDivisions'];
const meta = { device: 'test' };
const fresh = () => createKsmStore();
const t = s => s.getState().tournament;
const json = v => JSON.parse(JSON.stringify(v));
const read = file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const player = (name, extra = {}) => ({ name, dojo: '', division: 'Open', seed: '', status: 'Registered', ...extra });

test('the four fields are enumerable store getters; no rows, no team divisions until the migration', () => {
  for (const key of KEYS) {
    assert.deepEqual(storeFieldPath(key), ['tournament', key]);
    const d = Object.getOwnPropertyDescriptor(state, key);
    assert.ok(d.enumerable && !d.configurable && d.get && d.set, key);
  }
  assert.deepEqual([state.competitors, state.teams, state.exhibitions], [[], [], []]);
  assert.equal(state.teamDivisions, undefined);
  const snap = json(state);
  assert.deepEqual([snap.competitors, snap.teams, snap.exhibitions], [[], [], []]);
  assert.ok(!('teamDivisions' in snap), 'absent from the snapshot until set, as before');
});

test('a unit test per row action, for each of the three lists', () => {
  for (const [kind, key] of [['competitor', 'competitors'], ['team', 'teams'], ['exhibition', 'exhibitions']]) {
    const s = fresh();
    const run = (action, payload) => { const before = t(s); s.dispatch(A[`${kind}${action}`](payload, meta)); return before; };
    // …Added: rows appended, in order, as given (one action for several rows)
    run('Added', { rows: [player('a'), player('b'), player('c')] });
    assert.deepEqual(t(s)[key].map(r => r.name), ['a', 'b', 'c'], key);
    // …Updated: the fields at the index; untouched rows keep their identity (a bound row still finds them)
    let before = run('Updated', { index: 1, changes: { dojo: 'Hilo', seed: '2' } });
    assert.deepEqual(t(s)[key][1], player('b', { dojo: 'Hilo', seed: '2' }));
    assert.equal(t(s)[key][0], before[key][0], 'row 0 is the same object');
    assert.equal(t(s)[key][2], before[key][2], 'row 2 is the same object');
    assert.notEqual(t(s)[key][1], before[key][1], 'row 1 is a new object');
    assert.ok(Object.isFrozen(before[key][1]), 'the old row was never written');
    // a field the row lacks is added at its end, as an assignment did
    run('Updated', { index: 0, changes: { extra: 'x' } });
    assert.deepEqual(Object.keys(t(s)[key][0]), [...Object.keys(player('a')), 'extra']);
    // …StatusCycled: the engine's statusCycle()
    for (const want of ['Checked', 'NoShow', 'Registered', 'Checked']) {
      run('StatusCycled', { index: 2 });
      assert.equal(t(s)[key][2].status, want);
      assert.equal(KSMEngine.statusCycle(KSMEngine.statusCycle(KSMEngine.statusCycle(want))), want, 'a cycle of three');
    }
    // …Removed
    run('Removed', { index: 1 });
    assert.deepEqual(t(s)[key].map(r => r.name), ['a', 'c']);
    // An index with no row changes nothing (the same state object).
    for (const [action, payload] of [['Updated', { index: 5, changes: { name: 'x' } }], ['Removed', { index: 5 }], ['StatusCycled', { index: -1 }]]) {
      before = run(action, payload);
      assert.equal(t(s), before, `${kind}${action} without a row`);
    }
    // The other lists are untouched.
    for (const other of ['competitors', 'teams', 'exhibitions'].filter(k => k !== key)) assert.deepEqual(t(s)[other], [], other);
    const a = A[`${kind}Added`]({ rows: [] }, meta);
    assert.equal(a.type, `tournament/${kind}Added`);
    assert.equal(a.meta.device, 'test');
  }
  assert.deepEqual(Object.keys(A).filter(k => /^(competitor|team|exhibition|people)/.test(k)).sort(), [
    'competitorAdded', 'competitorRemoved', 'competitorStatusCycled', 'competitorUpdated',
    'exhibitionAdded', 'exhibitionRemoved', 'exhibitionStatusCycled', 'exhibitionUpdated', 'peopleLoaded',
    'teamAdded', 'teamDivisionAdded', 'teamDivisionMoved', 'teamDivisionRemoved', 'teamDivisionUpdated',
    'teamRemoved', 'teamStatusCycled', 'teamUpdated',
  ]);
});

test('the bulk and team division actions set the lists they name; the others keep their value', () => {
  const s = fresh();
  s.dispatch(A.peopleLoaded({ competitors: [player('a')], exhibitions: [{ white: 'W', red: 'R', division: 'Exhibition Matches', status: 'Checked' }] }, meta));
  assert.equal(t(s).competitors.length, 1);
  assert.equal(t(s).exhibitions.length, 1);
  assert.deepEqual(t(s).teams, []);
  // The migration: teamDivisions built, every team given an id and a team division.
  const migrated = KSMEngine.migrateTeamDivisions({ teams: [{ team: 'Old', status: 'Checked' }, { team: 'Old', status: 'Checked' }] }, {});
  s.dispatch(A.peopleLoaded({ teamDivisions: migrated.teamDivisions, teams: migrated.teams }, meta));
  assert.deepEqual(t(s).teamDivisions.map(d => d.id), ['Team Tournament']);
  assert.deepEqual(t(s).teams.map(x => [x.id, x.teamDivisionId]), [['legacy-team:Old:0', 'Team Tournament'], ['legacy-team:Old:1', 'Team Tournament']]);
  const juniors = { id: 'team:j', name: 'Juniors', teamFormat: '3-Person Team', teamTournamentFormat: 'Single Elimination', court: 'Both', awardMode: 'top2', order: 1 };
  s.dispatch(A.teamDivisionAdded({ teamDivisions: [...t(s).teamDivisions, juniors] }, meta));
  s.dispatch(A.teamDivisionUpdated({ teamDivisions: t(s).teamDivisions.map(d => d.id === 'team:j' ? { ...d, teamFormat: '5-Person Team' } : d),
    teams: t(s).teams.map(x => x.teamDivisionId === 'team:j' ? { ...x, type: '5-Person Team' } : x) }, meta));
  assert.equal(t(s).teamDivisions[1].teamFormat, '5-Person Team');
  s.dispatch(A.teamDivisionMoved({ teamDivisions: t(s).teamDivisions.map(d => ({ ...d, order: d.id === 'team:j' ? 0 : 1 })) }, meta));
  assert.deepEqual(t(s).teamDivisions.map(d => [d.id, d.order]), [['Team Tournament', 1], ['team:j', 0]], 'the stored array keeps its order');
  s.dispatch(A.teamDivisionRemoved({ teamDivisions: [juniors], teams: t(s).teams.map(x => ({ ...x, teamDivisionId: 'team:j' })) }, meta));
  assert.deepEqual(t(s).teams.map(x => x.teamDivisionId), ['team:j', 'team:j']);
  s.dispatch(A.peopleLoaded({ teamDivisions: undefined }, meta));
  assert.equal(t(s).teamDivisions, undefined, 'cleared: the app builds it again on its next read');
  assert.equal(t(s).competitors.length, 1, 'untouched');
});

test('the rename is one tournament/divisionRenamed: the players move with the division lists', () => {
  const s = fresh();
  s.dispatch(A.divisionAdded(KSMEngine.addedDivision(t(s), 'Kids', 'Single Elimination', 'split'), meta));
  s.dispatch(A.competitorAdded({ rows: [player('k', { division: 'Kids' }), player('o')] }, meta));
  const before = t(s);
  const renamed = KSMEngine.renamedDivisionState(before, 'Kids', 'Under 12', { id: 'c:1', from: 'Kids', to: 'Under 12' });
  // What ksmRenameDivisionLists() dispatches: KSM_RENAMED_STATE_KEYS (the division lists and competitors).
  const keys = ['divisions', 'divisionTypes', 'divisionCourts', 'hiddenPresets', 'divisionRenames', 'competitors'];
  let notified = 0;
  const off = s.subscribe(() => notified++);
  s.dispatch(A.divisionRenamed(Object.fromEntries(Object.entries(renamed).filter(([k]) => keys.includes(k))), meta));
  off();
  assert.equal(notified, 1, 'one action, one notification: no subscriber sees the players on a division that is gone');
  assert.deepEqual(t(s).competitors.map(c => c.division), ['Under 12', 'Open']);
  assert.equal(t(s).competitors[1], before.competitors[1], 'a player of another division is the same object');
  assert.ok(t(s).divisions.includes('Under 12') && !t(s).divisions.includes('Kids'));
  // The app: the list includes competitors, and since #15 item 14a nothing else of the rename is assigned to `state`.
  const store = read('app/modules/setup/divisions-store.js'), setup = read('app/modules/react-bridges/setup.js');
  assert.match(store, /export const KSM_RENAMED_STATE_KEYS=Object\.freeze\(\[\.\.\.KSM_DIVISION_STATE_KEYS,'competitors','grandChampions','courtState','courtActiveDivision'\]\);/);
  assert.match(store, /for\(const key of KSM_RENAMED_STATE_KEYS\)/);
  // (#15 PR 13c-1: `allMatches` goes through its write module; item 14a: no plain assign, the engine rewrites only these keys.)
  assert.match(setup, /if\(Object\.hasOwn\(rest,'allMatches'\)\)ksmSetAllMatches\([^;]*\);\n\s*ksmRenameDivisionLists\(rest\);/);
  assert.doesNotMatch(setup, /assignState|Object\.assign\(state/);
  const all = KSMEngine.renamedDivisionState({ ...json(state), currentDivision: 'Kids', poolViewDivision: 'Kids', courtState: { A: { division: 'Kids', index: 0 } }, courtActiveDivision: { A: 'Kids' } }, 'Kids', 'Under 12', { id: 'r', from: 'Kids', to: 'Under 12' });
  const KEYS = ['divisions', 'divisionTypes', 'divisionCourts', 'hiddenPresets', 'divisionRenames', 'competitors', 'grandChampions', 'courtState', 'courtActiveDivision'];
  assert.deepEqual(Object.keys(all).filter(k => !KEYS.includes(k)).sort(), ['currentDivision', 'poolViewDivision'], 'a rename rewrites only the action\'s keys and the two device fields');
});

test('strict: assigning a field, a list method or an in-place row edit throws and changes nothing', () => {
  ksmLoadTournamentState({ ...json(state), competitors: [player('a')], teams: [{ id: 't:1', team: 'T', status: 'Checked' }],
    exhibitions: [{ white: 'W', red: 'R', division: 'Exhibition Matches', status: 'Registered' }] });
  const before = json(state);
  assert.throws(() => { state.competitors = []; }, /state\.competitors is in the store \(tournament\.competitors\)/);
  assert.throws(() => { state.teamDivisions = []; }, /state\.teamDivisions is in the store/);
  assert.throws(() => { state.competitors.push(player('x')); }, TypeError);
  assert.throws(() => { state.teams.splice(0, 1); }, TypeError);
  assert.throws(() => { state.competitors[0].status = 'Checked'; }, TypeError, 'a row edited in place');
  assert.throws(() => { state.teams[0].teamDivisionId = 'x'; }, TypeError);
  assert.throws(() => { state.exhibitions[0].white = 'x'; }, TypeError);
  assert.throws(() => { delete state.teamDivisions; }, TypeError, 'the getter cannot be deleted');
  assert.deepEqual(json(state), before);
  ksmLoadTournamentState({ ...json(state), competitors: [], teams: [], exhibitions: [] });
});

test('production: a stray assignment is logged and applied', () => {
  const logged = [];
  setStrayStoreWriteReporter(w => logged.push(w));
  setStoreStrict(false);
  try {
    // Fresh, unfrozen values (the store's own are frozen from the strict runs).
    dispatch(A.peopleLoaded({ competitors: [player('a')], teams: [], exhibitions: [] }, meta));
    state.competitors = [player('b')];
    assert.deepEqual(getState().tournament.competitors.map(c => c.name), ['b']);
    assert.equal(logged.at(-1).field, 'competitors');
    assert.equal(logged.at(-1).path, 'tournament.competitors');
    // A row edited in place (a missed alias write) goes into the store's unfrozen row in production, as every nested
    // write into store data does (tests/store/legacy.test.mjs, production path); this app store runs RTK's immutability
    // check in Node, which would report it at the next dispatch.
  } finally {
    setStoreStrict(true);
    setStrayStoreWriteReporter(w => console.warn(w));
    ksmLoadTournamentState({ ...json(state), competitors: [], teams: [], exhibitions: [] });
  }
});

test('ksmLoadTournamentState() / assignStoreKeys() put the four fields in the store with their rows in order', () => {
  const saved = json(state);
  const loaded = {
    ...saved,
    competitors: [player('z'), player('a', { division: 'Kids' })],
    teams: [{ id: 'team:b', team: 'B', teamDivisionId: 'team:x' }, { id: 'team:a', team: 'A', teamDivisionId: 'Team Tournament' }],
    exhibitions: [{ white: 'W', red: 'R', division: 'Exhibition Matches', status: 'Checked' }],
    teamDivisions: [{ id: 'team:x', name: 'X', teamFormat: '3-Person Team', teamTournamentFormat: 'Round Robin', court: 'A', awardMode: 'top2', order: 0 }],
  };
  ksmLoadTournamentState(loaded);
  const snap = json(state);
  for (const key of KEYS) assert.deepEqual(snap[key], loaded[key], key);
  // A 4.0 save without team divisions: undefined, not in the snapshot (the migration builds them on the next read).
  const { teamDivisions, ...old } = loaded;
  ksmLoadTournamentState(old);
  assert.ok(!('teamDivisions' in json(state)));
  assignStoreKeys({ teamDivisions: loaded.teamDivisions });
  assert.deepEqual(json(state).teamDivisions, loaded.teamDivisions);
  ksmLoadTournamentState(saved);
  assert.deepEqual(json(state), saved);
});

test('source: every write to the four lists is an action (no assignment, list method or row edit in app code)', () => {
  const files = ['app/main.js', ...fs.readdirSync(new URL('../../app/modules', import.meta.url), { recursive: true })
    .filter(f => f.endsWith('.js')).map(f => `app/modules/${f}`)];
  const bad = [];
  const write = /state\.(competitors|teams|exhibitions|teamDivisions)\b(\[[^\]]*\](\.\w+|\[[^\]]*\])?)?\s*(=(?!=)|\+\+|\+=)|state\.(competitors|teams|exhibitions|teamDivisions)\.(push|splice|sort|reverse|unshift|pop|shift|fill|copyWithin)\(|delete\s+state\.(competitors|teams|exhibitions|teamDivisions)\b|Object\.assign\(\s*state\.(competitors|teams|exhibitions|teamDivisions)/;
  for (const file of files) {
    read(file).split('\n').forEach((line, i) => { if (write.test(line)) bad.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`); });
  }
  assert.deepEqual(bad, []);
  // The old alias writes, by name (each became an action): a status cycled, a team moved or given a format, a team
  // division's fields or order.
  const reg = read('app/modules/registration/registration.js'), td = read('app/modules/registration/team-divisions.js'),
    bridge = read('app/modules/react-bridges/registration.js');
  assert.doesNotMatch(reg, /\b[ct]\.status=/);
  assert.doesNotMatch(td, /\b(t|team)\.(teamDivisionId|type)=(?!=)|\bd\.order=(?!=)|Object\.assign\(d,/);
  assert.doesNotMatch(bridge, /\]\.status=|\]\[key\]=value/);
  // Only people-store.js dispatches the people actions.
  for (const file of files.filter(f => f !== 'app/modules/registration/people-store.js')) {
    assert.doesNotMatch(read(file), /(competitor|team|exhibition)(Added|Updated|Removed|StatusCycled)\(|peopleLoaded\(|teamDivision(Added|Updated|Moved|Removed)\(/, file);
  }
});
