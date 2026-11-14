import test from 'node:test';
import assert from 'node:assert/strict';
import { ksmSetupDivisionsData, ksmSetupHeaderData, startSetupInput } from '../../app/react/features/setup/publish.ts';
import { fakeSettingsStore } from './settings-store-fake.mjs';

// A fake `window` with the legacy functions publish.ts reads through shared/legacy.ts.
const PRESETS = ['Yonenbu', 'Shonenbu', 'Seinenbu'];
function fakeWindow({ state = {}, presets = PRESETS, name, drawn = {} } = {}) {
  const listeners = new Map();
  const s = { divisions: [...PRESETS], divisionTypes: {}, divisionCourts: {}, allMatches: drawn, ...state };
  for (const p of presets) { s.divisionTypes[p] ??= 'Round Robin'; s.divisionCourts[p] ??= 'A'; }
  const win = {
    ksmLegacyState: () => s,
    ksmText: x => String(x || ''),
    ksmDivisionPresetNames: () => presets,
    ksmDivisionRemoveBlocked: d => ((s.allMatches?.[d] || []).length ? `${d} is drawn: it can no longer be removed.` : null),
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    dispatch: type => listeners.get(type)?.(),
  };
  // The Setup name (the store's tournament.settings.tName); `win.tName.value` stands for the field.
  if (name !== undefined) win.tName = { value: name };
  win.KSMStore = fakeSettingsStore(key => (key === 'tName' ? win.tName?.value : undefined));
  globalThis.window = win;
  return win;
}

const names = input => input.rows.map(r => r.name);

test('enabled divisions in running order, move up/down false at the ends', () => {
  fakeWindow();
  const input = ksmSetupDivisionsData();
  assert.deepEqual(names(input), PRESETS);
  assert.deepEqual(input.rows.map(r => r.move), [{ up: false, down: true }, { up: true, down: true }, { up: true, down: false }]);
  assert.ok(input.rows.every(r => r.enabled && !r.custom && r.removable && r.removeBlocked === null));
  assert.equal(input.hiddenPresets, 0);
  assert.deepEqual(input.rows[0], {
    division: 'Yonenbu', name: 'Yonenbu', enabled: true, custom: false, format: 'Round Robin', court: 'A',
    move: { up: false, down: true }, removable: true, removeBlocked: null,
  });
});

test('a single enabled division cannot move either way; the running order is state.divisions', () => {
  fakeWindow({ state: { divisions: ['Seinenbu'] } });
  const input = ksmSetupDivisionsData();
  assert.deepEqual(input.rows[0].move, { up: false, down: false });
  fakeWindow({ state: { divisions: ['Seinenbu', 'Yonenbu', 'Shonenbu'] } });
  assert.deepEqual(names(ksmSetupDivisionsData()), ['Seinenbu', 'Yonenbu', 'Shonenbu']);
});

test('a switched-off preset follows the enabled ones, with no move buttons', () => {
  fakeWindow({ state: { divisions: ['Yonenbu', 'Seinenbu'] } });
  const input = ksmSetupDivisionsData();
  assert.deepEqual(names(input), ['Yonenbu', 'Seinenbu', 'Shonenbu']);
  assert.deepEqual(input.rows[2], {
    division: 'Shonenbu', name: 'Shonenbu', enabled: false, custom: false, format: 'Round Robin', court: 'A',
    move: null, removable: true, removeBlocked: null,
  });
});

test('a hidden preset is not listed and is counted in hiddenPresets (unless it is enabled)', () => {
  fakeWindow({ state: { divisions: ['Yonenbu', 'Shonenbu'], hiddenPresets: ['Seinenbu', 'Shonenbu'] } });
  const input = ksmSetupDivisionsData();
  assert.deepEqual(names(input), ['Yonenbu', 'Shonenbu']);
  assert.equal(input.hiddenPresets, 1);
});

test('decision 12: a switched-off custom division is listed after the presets, unchecked; team and exhibitions are not', () => {
  fakeWindow({ state: {
    divisions: ['Yonenbu', 'My Custom'],
    divisionTypes: { 'My Custom': 'Single Elimination', 'Off Custom': 'Round Robin', 'Team Tournament': 'Round Robin', 'Exhibition Matches': 'Round Robin' },
    divisionCourts: { 'Off Custom': 'split' },
  } });
  const input = ksmSetupDivisionsData();
  assert.deepEqual(names(input), ['Yonenbu', 'My Custom', 'Shonenbu', 'Seinenbu', 'Off Custom']);
  assert.equal(input.rows[1].custom, true);
  assert.equal(input.rows[1].format, 'Single Elimination');
  assert.deepEqual(input.rows[4], {
    division: 'Off Custom', name: 'Off Custom', enabled: false, custom: true, format: 'Round Robin', court: 'split',
    move: null, removable: true, removeBlocked: null,
  });
});

test('a renamed preset is still a preset (not custom) and its old name is not listed', () => {
  fakeWindow({ presets: ['Under 12', 'Shonenbu', 'Seinenbu'], state: {
    divisions: ['Under 12', 'Shonenbu', 'Seinenbu'],
    divisionTypes: { 'Under 12': 'Round Robin' },
  } });
  const input = ksmSetupDivisionsData();
  assert.deepEqual(names(input), ['Under 12', 'Shonenbu', 'Seinenbu']);
  assert.ok(input.rows.every(r => !r.custom));
  // switched off, it is listed among the presets under its new name, not as a custom division
  fakeWindow({ presets: ['Under 12', 'Shonenbu', 'Seinenbu'], state: {
    divisions: ['Shonenbu', 'Seinenbu'],
    divisionTypes: { 'Under 12': 'Round Robin' },
  } });
  const off = ksmSetupDivisionsData();
  assert.deepEqual(off.rows.map(r => [r.name, r.custom, r.enabled]), [['Shonenbu', false, true], ['Seinenbu', false, true], ['Under 12', false, false]]);
});

test('a drawn division says why it cannot be removed', () => {
  fakeWindow({ drawn: { Shonenbu: [{}] } });
  const rows = ksmSetupDivisionsData().rows;
  assert.equal(rows[1].removeBlocked, 'Shonenbu is drawn: it can no longer be removed.');
  assert.equal(rows[1].removable, true);
  assert.equal(rows[0].removeBlocked, null);
});

test('text is what esc() showed (empty for null) and a division is what jsArg() passed', () => {
  fakeWindow({ state: { divisions: ['Open <&>'], divisionTypes: { 'Open <&>': 'Round Robin' } } });
  const row = ksmSetupDivisionsData().rows[0];
  assert.equal(row.name, 'Open <&>');
  assert.equal(row.division, 'Open <&>');
  assert.equal(row.court, 'A');
});

test('the header: the name field value, or empty without the field', () => {
  fakeWindow({ name: 'Aiea <Taikai>' });
  assert.deepEqual(ksmSetupHeaderData(), { name: 'Aiea <Taikai>' });
  fakeWindow({ name: '' });
  assert.deepEqual(ksmSetupHeaderData(), { name: '' });
  fakeWindow();
  assert.deepEqual(ksmSetupHeaderData(), { name: '' });
});

test('start-up with no earlier signal computes nothing until an event comes', () => {
  const win = fakeWindow({ name: 'A' });
  startSetupInput();
  assert.equal(win.ksmSetupDivisionsInput, undefined);
  assert.equal(win.ksmSetupHeaderInput, undefined);
  win.dispatch('ksm:setup-divisions');
  assert.equal(win.ksmSetupDivisionsInput.rows.length, 3);
  assert.equal(win.ksmSetupHeaderInput, undefined);
  win.tName.value = 'B';
  win.dispatch('ksm:setup-header');
  assert.deepEqual(win.ksmSetupHeaderInput, { name: 'B' });
});

test('start-up with an earlier signal computes the input once, at once', () => {
  const win = fakeWindow({ name: 'Early' });
  win.ksmSetupDivisionsRequested = true;
  win.ksmSetupHeaderRequested = true;
  startSetupInput();
  assert.equal(win.ksmSetupDivisionsInput.rows.length, 3);
  assert.deepEqual(win.ksmSetupHeaderInput, { name: 'Early' });
});

test('start-up with only one earlier signal computes only that input', () => {
  const win = fakeWindow({ name: 'Only' });
  win.ksmSetupHeaderRequested = true;
  startSetupInput();
  assert.equal(win.ksmSetupDivisionsInput, undefined);
  assert.deepEqual(win.ksmSetupHeaderInput, { name: 'Only' });
});
