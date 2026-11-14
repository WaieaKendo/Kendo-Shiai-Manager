// #15 PR 8b (docs/STORE.md section 3): state.teamAwardMode is a getter over the Setup field settings.teamAwardMode.
// One value: the snapshot still carries the top-level copy (4.0 devices read it) with the same value; it is written
// through tournament/settingChanged; a load does not write it through replaceState() (applySetupSnapshot() sets it with
// the Setup's precedence, tests/team-settings-store-test.py); a stray assignment throws in tests, and is logged and
// applied in production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, getState, setStoreStrict, tournamentSlice } from '../../app/store/index.ts';
import { assignState, replaceState, setStrayStoreWriteReporter, state, storeFieldPath } from '../../app/modules/app-state.js';

const set = value => dispatch(tournamentSlice.actions.settingChanged({ key: 'teamAwardMode', value }, { device: 'test' }));
const setting = () => getState().tournament.settings.teamAwardMode;

test('state.teamAwardMode is an enumerable store getter over settings.teamAwardMode', () => {
  assert.deepEqual(storeFieldPath('teamAwardMode'), ['tournament', 'settings', 'teamAwardMode']);
  const d = Object.getOwnPropertyDescriptor(state, 'teamAwardMode');
  assert.ok(d.enumerable && !d.configurable && d.get && d.set);
  assert.equal(state.teamAwardMode, 'top2', 'the Setup default');
  set('dual3');
  assert.equal(state.teamAwardMode, 'dual3');
  assert.equal(JSON.parse(JSON.stringify(state)).teamAwardMode, 'dual3', 'the snapshot carries the same value');
  assert.ok(Object.keys(state).includes('teamAwardMode'));
  set('top2');
});

test('strict: assigning it throws and changes nothing', () => {
  set('top1');
  assert.throws(() => { state.teamAwardMode = 'dual3'; }, /state\.teamAwardMode is in the store \(tournament\.settings\.teamAwardMode\)/);
  assert.equal(setting(), 'top1');
  set('top2');
});

test('production: a stray assignment is logged and applied to the Setup field', () => {
  const logged = [];
  setStrayStoreWriteReporter(w => logged.push(w));
  setStoreStrict(false);
  try {
    state.teamAwardMode = 'dual3';
    assert.equal(setting(), 'dual3');
    assert.equal(state.teamAwardMode, 'dual3');
    assert.equal(logged.length, 1);
    assert.equal(logged[0].field, 'teamAwardMode');
    assert.equal(logged[0].path, 'tournament.settings.teamAwardMode');
  } finally {
    setStoreStrict(true);
    setStrayStoreWriteReporter(w => console.warn(w));
    set('top2');
  }
});

test('a load (replaceState) leaves the Setup field to applySetupSnapshot(): a payload value or a missing key does not write it', () => {
  set('top1');
  const before = JSON.parse(JSON.stringify(state));
  replaceState({ ...before, teamAwardMode: 'dual3' });
  assert.equal(setting(), 'top1', 'a payload\'s top-level copy is not written by replaceState()');
  const { teamAwardMode, ...without } = before;
  replaceState(without);
  assert.equal(setting(), 'top1', 'a payload without the key does not clear the Setup field');
  assert.equal(typeof getState().tournament.settings.teamAwardMode, 'string');
  replaceState(before);
  set('top2');
});

test('assignState() writes a text and skips a missing value (the Setup field always holds a text)', () => {
  assignState({ teamAwardMode: 'dual3' });
  assert.equal(setting(), 'dual3');
  assignState({ teamAwardMode: undefined });
  assert.equal(setting(), 'dual3');
  assignState({ teamAwardMode: 'top2' });
  assert.equal(setting(), 'top2');
});

test('source: no app code assigns either copy; the team court entry is written only by ksmSetTeamCourt()', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = new URL('../../app/', import.meta.url).pathname;
  const files = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'dist' && e.name !== 'node_modules') walk(p); } else if (/\.(js|ts|tsx|html)$/.test(e.name)) files.push(p);
  } };
  walk(root);
  const bad = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (/state\.teamAwardMode\s*=[^=]/.test(text)) bad.push(`${file}: state.teamAwardMode =`);
    for (const m of text.matchAll(/divisionCourts\s*\[\s*(['"])Team Tournament\1\s*\]\s*=[^=]|divisionCourts\s*\[\s*(?:KSMEngine\.)?LEGACY_TEAM_DIVISION_ID\s*\]\s*=[^=]/g)) {
      const before = text.slice(0, m.index), fn = before.lastIndexOf('function ksmSetTeamCourt(');
      const inHelper = fn >= 0 && !/\n}\n/.test(text.slice(fn, m.index));
      // app-state.js: the initial value of the empty state (= the Setup field's default), before any code runs.
      if (!inHelper && !file.endsWith('app-state.js')) bad.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, []);
});
