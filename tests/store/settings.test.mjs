// #15 PR 8 (docs/STORE.md section 3 item 8): the Setup form in the store's `tournament.settings`. The slice's defaults
// and select options are the page's (app/index.html); tournament/settingsLoaded sets the fields an object names and keeps
// the rest, as applySetupSnapshot() did with the inputs; tournament/settingChanged sets one; the snapshot's `setup`
// keeps its keys, order and values; and no app code reads a Setup value from an input any more.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createKsmStore, initialSettings, tournamentSlice, TOURNAMENT_SLICE_VERSION } from '../../app/store/index.ts';
import { SETUP_KEYS, SETUP_SELECT_OPTIONS, normalizeSetup, normalizeSetupValue } from '../../app/engine/index.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const { settingsLoaded, settingChanged } = tournamentSlice.actions;
const html = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');

// The page's own field: its tag, the opening tag's attributes and (select, textarea) its content.
function field(id) {
  const m = new RegExp(`<(input|select|textarea)\\b([^>]*\\bid="${id}"[^>]*)>`).exec(html);
  assert.ok(m, `#${id} is in app/index.html`);
  const [, tag, attrs] = m;
  const rest = html.slice(m.index + m[0].length);
  const body = tag === 'input' ? '' : rest.slice(0, rest.indexOf(`</${tag}>`));
  return { tag, attrs, body };
}
const attr = (attrs, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
function options(body) {
  return [...body.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map(([, a, text]) => ({
    value: attr(a, 'value') ?? text.trim().replace(/\s+/g, ' '), selected: /\bselected\b/.test(a),
  }));
}
function pageDefault(id) {
  const { tag, attrs, body } = field(id);
  if (tag === 'select') { const o = options(body); return (o.find(x => x.selected) ?? o[0]).value; }
  if (tag === 'textarea') return body;
  return attr(attrs, 'value') ?? '';
}

test('the Setup fields: the snapshot order, the page\'s defaults and select options', () => {
  assert.deepEqual(Object.keys(initialSettings), [...SETUP_KEYS], 'the slice\'s keys in the order of payload.setup');
  for (const id of SETUP_KEYS) assert.equal(initialSettings[id], pageDefault(id), `the default of #${id}`);
  for (const id of SETUP_KEYS) {
    const { tag, body } = field(id);
    if (tag === 'select') assert.deepEqual(SETUP_SELECT_OPTIONS[id], options(body).map(o => o.value), `the options of #${id}`);
    else assert.equal(SETUP_SELECT_OPTIONS[id], undefined, `#${id} is not a select`);
  }
  // The order getSetupSnapshot() read the inputs in before PR 8.
  const before = fs.readFileSync(path.join(ROOT, 'tests/store/fixtures/setup-snapshot-ids-before.json'), 'utf8');
  assert.deepEqual(JSON.parse(before), [...SETUP_KEYS]);
  const s = createKsmStore();
  assert.deepEqual(s.getState().tournament, { sliceVersion: TOURNAMENT_SLICE_VERSION, settings: initialSettings });
});

test('settingsLoaded: a full object sets every field, a partial one only the fields it names, an empty one none', () => {
  const s = createKsmStore();
  const full = Object.fromEntries(SETUP_KEYS.map((k, i) => [k, SETUP_SELECT_OPTIONS[k]?.at(-1) ?? `v${i}`]));
  const action = settingsLoaded(full, { device: 'c-1/t-1' });
  assert.equal(action.type, 'tournament/settingsLoaded');
  assert.deepEqual({ ...action.meta, when: '' }, { who: '', when: '', device: 'c-1/t-1', court: null });
  s.dispatch(action);
  assert.deepEqual(s.getState().tournament.settings, full);
  assert.deepEqual(Object.keys(s.getState().tournament.settings), [...SETUP_KEYS], 'the key order is kept');

  s.dispatch(settingsLoaded({ tName: 'Partial Cup', court2RedSide: 'right' }));
  assert.deepEqual(s.getState().tournament.settings, { ...full, tName: 'Partial Cup', court2RedSide: 'right' });

  const before = s.getState().tournament;
  s.dispatch(settingsLoaded({}));
  assert.equal(s.getState().tournament, before, 'an empty Setup changes nothing');
  s.dispatch(settingsLoaded({ tType: 'Individual', tName: 7, court1Refs: null }));
  assert.equal(s.getState().tournament, before, 'unknown keys and values that are not text are ignored (the adapter normalizes first)');
});

test('settingChanged sets one field; the same value leaves the state object as it was', () => {
  const s = createKsmStore();
  const action = settingChanged({ key: 'tHost', value: 'Aiea Taiheiji' });
  assert.equal(action.type, 'tournament/settingChanged');
  assert.equal(action.meta.court, null);
  s.dispatch(action);
  assert.equal(s.getState().tournament.settings.tHost, 'Aiea Taiheiji');
  const before = s.getState().tournament;
  s.dispatch(settingChanged({ key: 'tHost', value: 'Aiea Taiheiji' }));
  assert.equal(s.getState().tournament, before, 'Immer keeps the object for an equal value (ksmSetSetting() does not even dispatch)');
  s.dispatch(settingChanged({ key: 'nope', value: 'x' }));
  assert.equal(s.getState().tournament, before);
  assert.ok(Object.isFrozen(s.getState().tournament.settings), 'store data is frozen (strict)');
});

test('normalizeSetupValue: what each kind of Setup input holds once set (browser parity: setup-settings-store-test.py)', () => {
  const cases = [
    ['tName', 'Aiea\nCup\r', 'AieaCup'], ['tName', null, ''], ['tName', undefined, 'undefined'], ['tName', 12, '12'],
    ['court1Refs', 'A\r\nB\rC\nD', 'A\nB\nC\nD'], ['court2Refs', null, ''],
    ['tDate', '2026-11-14', '2026-11-14'], ['tDate', '2026-02-29', ''], ['tDate', '2024-02-29', '2024-02-29'], ['tDate', '11/14/2026', ''],
    ['tCourts', '3', '3'], ['tCourts', 2, '2'], ['tCourts', ' 2', ''], ['tCourts', '2.', ''], ['tCourts', '.5', '.5'], ['tCourts', '1e400', ''], ['tCourts', 'two', ''],
    ['teamCourt', 'Both', 'Both'], ['teamCourt', 'split', ''], ['teamCourt', null, ''], ['teamAwardMode', 'dual3', 'dual3'],
    ['court1TvRedSide', 'left', 'left'], ['court1TvRedSide', 'Left', ''], ['timeRegular', '3:00', '3:00'],
  ];
  for (const [key, value, want] of cases) assert.equal(normalizeSetupValue(key, value), want, `${key} = ${JSON.stringify(value)}`);
  assert.deepEqual(normalizeSetup({ tType: 'x', tName: 'Cup', teamCourt: 'C' }), { tName: 'Cup', teamCourt: '' });
  assert.deepEqual(normalizeSetup(null), {});
});

// Saved Setups: the goldens' snapshots (written by getSetupSnapshot() from the inputs), a 4.0 device's save, and an old
// save without the timer and audience fields. A Setup read from the inputs is unchanged by the normalization, so a
// load gives back the same `setup` text.
function savedSetups() {
  const found = [];
  const walk = o => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      // A whole Setup as getSetupSnapshot() wrote it (a golden step may hold only a diff of one).
      for (const v of Object.values(o)) if (v && typeof v === 'object' && !Array.isArray(v) && 'tName' in v && Object.values(v).every(x => typeof x === 'string') && Object.keys(v).length === SETUP_KEYS.length) found.push(v);
      Object.values(o).forEach(walk);
    }
  };
  for (const dir of ['setup', 'shell', 'registration', 'library']) {
    for (const f of fs.readdirSync(path.join(ROOT, 'tests/golden', dir))) walk(JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden', dir, f), 'utf8')));
  }
  return found;
}

test('the snapshot setup is byte-identical through the store for saved tournaments (goldens, a 4.0 save)', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/store/fixtures/setup-4.0-save.json'), 'utf8'));
  const setups = [...savedSetups(), fixture.setup];
  assert.ok(setups.length >= 5, `saved Setups found: ${setups.length}`);
  for (const setup of setups) {
    const s = createKsmStore();
    s.dispatch(settingsLoaded(normalizeSetup(setup)));
    assert.equal(JSON.stringify({ ...s.getState().tournament.settings }), JSON.stringify(setup));
  }
});

test('an old save without some fields keeps the open values for them, as the inputs did', () => {
  const s = createKsmStore();
  s.dispatch(settingsLoaded({ tHost: 'Before' }));
  s.dispatch(settingsLoaded(normalizeSetup({ tName: 'Old Cup', tType: 'Individual', teamCourt: 'A' })));
  assert.deepEqual(s.getState().tournament.settings, { ...initialSettings, tHost: 'Before', tName: 'Old Cup', teamCourt: 'A' });
});

// Every Setup value is read from the store. The only reads of a Setup input's value left are the store's own: the
// one read at load (initSetupSettings(), the values the page opened with), the edit listener (onSetupInput()) and
// the render (renderSetupInputs(), which compares before writing). index.html's inline handlers read their own
// element (`this.value`), which the edit listener has put into the store already.
test('no app code reads a Setup value from an input (source check)', () => {
  const ids = SETUP_KEYS.join('|');
  const patterns = [
    new RegExp(`(?<![.\\w'"])(${ids})\\??\\.(value|selectedIndex)\\b`),
    new RegExp(`getElementById\\([^)]*['"](${ids})['"][^)]*\\)\\)?\\s*\\??\\.value\\b`),
    new RegExp(`querySelector(All)?\\([^)]*#(${ids})\\b`),
    /legacyTournamentNameInput|legacyInput\('(teamTournamentFormat|tCourts)'\)/,
  ];
  const files = [];
  const walk = dir => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs|ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) files.push(p);
    }
  };
  walk('app/modules'); walk('app/react'); walk('app/engine'); files.push('app/main.js');
  // The print renderer reads a saved snapshot, never the page: its tName / tDate / tLocation are {value} objects made
  // from payload.setup (checked below).
  files.splice(files.indexOf(path.join('app/modules/results/print.js')), 1);
  const found = [];
  for (const file of files) {
    fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\/?\*)/.test(line)) return;
      if (patterns.some(p => p.test(line))) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(found, []);
  const print = fs.readFileSync(path.join(ROOT, 'app/modules/results/print.js'), 'utf8');
  assert.match(print, /const tName=\{value:setup\.tName\},tDate=\{value:setup\.tDate\},tLocation=\{value:setup\.tLocation\}/);
  // The three reads the store owns, in the adapter.
  const adapter = fs.readFileSync(path.join(ROOT, 'app/modules/sync/cloud-session-and-autosave.js'), 'utf8');
  const reads = adapter.split('\n').filter(l => /\bel\.value\b/.test(l) && !/^\s*(\/\/|\*)/.test(l)).length;
  assert.equal(reads, 3, 'initSetupSettings(), onSetupInput() and renderSetupInputs() read el.value; nothing else in the adapter');
});
