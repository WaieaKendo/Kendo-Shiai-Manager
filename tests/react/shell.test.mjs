import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_NAV, NAV_ENTRIES, NAV_FILE_INPUTS, NAV_FILE_STYLE, activeEntryIndex, menuClass, tileClass, tileText,
} from '../../app/react/shell/nav-model.ts';
import { EMPTY_HEADER, STATUS_TITLE } from '../../app/react/shell/header-model.ts';
import {
  EMPTY_DIALOGS, REGENERATE_TEXTS, VALIDATION_TEXTS, regenerateOptionClass, regenerateStatusText,
} from '../../app/react/shell/dialogs-model.ts';
import { DEFAULT_NAV_ICONS } from '../../app/react/court/branding.ts';

const testIds = entries => entries.flatMap(e => e.kind === 'tile' ? [e.testId]
  : [e.trigger.testId, ...e.entries.filter(x => x.kind === 'item').map(x => x.testId ?? `(${x.label})`)]);

test('the bar: tiles and menus in the order and with the test IDs of the markup', () => {
  assert.deepEqual(testIds(NAV_ENTRIES), [
    'nav-overview', 'nav-live-scores',
    'nav-courts', 'nav-court-a', 'nav-court-b',
    'nav-tv', 'nav-tv-a', 'nav-tv-b', 'nav-overlay-a', 'nav-overlay-b',
    'nav-results',
    'nav-export', 'nav-export-brackets', 'nav-export-results', 'nav-export-referees', 'nav-export-archive',
    'nav-save-load', 'nav-new-tournament', 'nav-save-now', 'nav-edit-slug', 'nav-library', 'nav-download-file', 'nav-load-file',
    'nav-download-recovery', 'nav-load-recovery', '(Copy Tournament ID)', 'nav-tournament-access', 'nav-cloud-diagnostics',
    'nav-registration', 'nav-setup',
  ]);
  assert.deepEqual(NAV_ENTRIES.filter(e => e.kind === 'menu').map(e => e.menuId), ['courtsMenu', 'tvMenu', 'exportMenu', 'saveLoadMenu']);
  assert.deepEqual(NAV_FILE_INPUTS.map(f => [f.id, f.testId, f.onChange]), [
    ['ksmLoadFile', 'load-file-input', 'loadTournamentFromFile'], ['ksmRecoveryFile', 'recovery-file-input', 'loadRecoveryFile']]);
  assert.equal(NAV_FILE_STYLE, 'display:none');
});

test('every control calls what its inline handler called', () => {
  const actions = Object.fromEntries(NAV_ENTRIES.flatMap(e => e.kind === 'tile' ? [[e.testId, e.action]]
    : e.entries.filter(x => x.kind === 'item').map(x => [x.testId ?? x.label, x.action])));
  assert.deepEqual(actions['nav-setup'], { fn: 'navigateTo', args: ['setup'] });
  assert.deepEqual(actions['nav-registration'], { fn: 'openRegistrationTab', args: ['individual'] });
  assert.deepEqual(actions['nav-overview'], { fn: 'navigateTo', args: ['director'] });
  assert.deepEqual(actions['nav-court-b'], { fn: 'chooseCourt', args: ['B'] });
  assert.deepEqual(actions['nav-tv-a'], { fn: 'launchTvDisplay', args: ['A'] });
  assert.deepEqual(actions['nav-overlay-b'], { fn: 'copyStreamOverlayLink', args: ['B'] });
  assert.deepEqual(actions['nav-export-brackets'], { fn: 'exportTournamentBrackets', args: [] });
  // The placeholders closed the menus and showed their message.
  assert.deepEqual(actions['nav-export-referees'], { fn: 'alert', args: ['Referee assignment export will be added with the Referee Assignment module.'], close: true });
  // Save / Load closes the menus first.
  assert.deepEqual(actions['nav-save-now'], { fn: 'saveNow', args: [], close: true });
  assert.deepEqual(actions['Copy Tournament ID'], { fn: 'copyTournamentId', args: [], close: true });
  assert.deepEqual(actions['nav-cloud-diagnostics'], { fn: 'cloudDiagnostics', args: [], close: true });
});

test('the tiles\' icons come from the branding module', () => {
  for (const e of NAV_ENTRIES) {
    const icon = e.kind === 'tile' ? e.icon : e.trigger.icon;
    assert.match(DEFAULT_NAV_ICONS[icon], /^\/assets\/nav-icons\/[\w-]+\.svg$/);
  }
  assert.equal(DEFAULT_NAV_ICONS.liveScores, '/assets/nav-icons/live-scores.svg');
});

test('the active tile: the first whose text starts with the screen label (setActiveNavForView())', () => {
  assert.deepEqual(NAV_ENTRIES.map(tileText), ['Overview', 'Live Scores', 'Courts ▾', 'TV ▾', 'Results', 'Export ▾', 'Save / Load ▾', 'Registration', 'Setup']);
  const at = label => { const i = activeEntryIndex(NAV_ENTRIES, label); return i < 0 ? null : tileText(NAV_ENTRIES[i]); };
  assert.equal(at('Courts'), 'Courts ▾');
  assert.equal(at('Export'), 'Export ▾');
  assert.equal(at('Live Scores'), 'Live Scores');
  // Quirk kept: "TV Display" is not the start of "TV ▾", so the TV tile is never marked.
  assert.equal(at('TV Display'), null);
  assert.equal(at(null), null);
  assert.equal(at(''), null);
});

test('classes as the legacy class toggles left them', () => {
  assert.equal(tileClass('nav-tile director-only setup-nav-tile', true), 'nav-tile director-only setup-nav-tile active');
  assert.equal(tileClass('nav-tile', false), 'nav-tile');
  assert.equal(menuClass('nav-dropdown', false), 'nav-dropdown hidden');
  assert.equal(menuClass('nav-dropdown nav-dropdown-wide', true), 'nav-dropdown nav-dropdown-wide is-open');
});

test('nothing published yet: the static markup', () => {
  assert.deepEqual(EMPTY_NAV, { open: null, style: null, active: null });
  assert.deepEqual(EMPTY_HEADER, {
    staffLabel: 'Staff Login', role: { text: 'Spectator', dataRole: null }, connection: { text: 'Local', mode: null, title: null },
    presence: '', save: 'Not saved yet',
  });
  assert.equal(STATUS_TITLE, 'Open Cloud Diagnostics');
  assert.deepEqual(EMPTY_DIALOGS, {
    fusen: { open: false },
    validation: { open: false, key: 0, title: 'Tournament Validation', content: null },
    regenerate: { open: false, key: 0, title: 'Regenerate Division', content: null },
    cloud: null,
  });
});

test('dialog texts and the Regenerate options as the legacy templates printed them', () => {
  assert.equal(VALIDATION_TEXTS.passed, 'Tournament Validation Passed');
  assert.equal(REGENERATE_TEXTS.intro, 'Select one generated division. Other divisions will remain unchanged.');
  assert.deepEqual(['ready', 'started', 'not-generated'].map(regenerateStatusText), ['Ready', 'Matches Started', 'Not Generated']);
  // A ready option keeps the template's trailing space.
  assert.equal(regenerateOptionClass('ready'), 'regenerate-option ');
  assert.equal(regenerateOptionClass('started'), 'regenerate-option disabled');
});

test('Fusen-sho: the dialog title (owner decision 4; display only, stored labels keep Fusen-gachi)', async () => {
  const { FUSEN_TEXTS, fusenSides } = await import('../../app/react/shell/dialogs-model.ts');
  // #38: the dialog asks who won ("Fusen-sho — who won?"); it was "Fusen-sho" / "Which side forfeited?".
  assert.equal(FUSEN_TEXTS.title, 'Fusen-sho — who won?');
  assert.ok(FUSEN_TEXTS.title.startsWith('Fusen-sho'));
  const input = { open: true, white: 'Hana Ito', red: 'Ken Mori' };
  assert.deepEqual(fusenSides(input).map(b => [b.side, b.label, b.name, b.testId]),
    [['W', 'White', 'Hana Ito', 'fusen-white'], ['R', 'Red', 'Ken Mori', 'fusen-red']], 'White first on a default court');
  assert.deepEqual(fusenSides({ ...input, redLeft: true }).map(b => b.side), ['R', 'W'], 'Red first when the court has Red on the left');
  assert.deepEqual(fusenSides(input).map(b => b.className), ['fusen-side fusen-side-white', 'fusen-side fusen-side-red']);
  assert.deepEqual(fusenSides({ open: true }).map(b => b.name), ['', ''], 'no names published: the sides alone');
});

test('owner decision 20: the Developer Tools test tools switch', async () => {
  const { testToolsLabel } = await import('../../app/react/shell/dialogs-model.ts');
  assert.equal(testToolsLabel(false), 'Show test tools');
  assert.equal(testToolsLabel(undefined), 'Show test tools');
  assert.equal(testToolsLabel(true), 'Hide test tools');
});
