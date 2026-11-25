import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ksmNavLinks, ksmShellDialogsInput, ksmShellHeaderInput, ksmShellNavInput, startShellInput } from '../../app/react/features/shell/publish.ts';

// The classic state and signal stubs (app/modules/react-bridges/shell.js), run as they are against the fake window.
const classic = readFileSync(new URL('../../app/modules/react-bridges/shell.js', import.meta.url), 'utf8');
function source(name) {
  const start = classic.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is missing from react-bridges/shell.js`);
  const end = classic.indexOf('\n}\n', start);
  return classic.slice(start, end + 3);
}
const NAMES = ['ksmPublishNav', 'ksmShellHeaderState', 'ksmPublishHeader', 'ksmShellDialogsState', 'ksmPublishDialogs'];
const stubSource = 'var ksmShellHeader, ksmShellDialogs;\n' + NAMES.map(source).join('\n');

// A fake `window` with the classic functions publish.ts reads through shared/legacy.ts.
function fake({ tournamentId = null, tv = true } = {}) {
  const listeners = new Map();
  const log = { events: [] };
  const win = {
    addEventListener: (type, fn) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    dispatchEvent: event => { log.events.push(event.type); (listeners.get(event.type) ?? []).forEach(fn => fn(event)); return true; },
    ksmLegacyCloudSession: () => ({ tournamentId }),
    ksmLinkUrl: route => `https://ksm.test/t/${route.id}/${route.screen}/${(route.court ?? '').toLowerCase()}`,
    tvLink: court => (tv ? `https://ksm.test/t/${tournamentId}/tv/${court.toLowerCase()}?key=s` : ''),
  };
  globalThis.window = win;
  const context = vm.createContext({ window: win, CustomEvent: class { constructor(type) { this.type = type; } } });
  vm.runInContext(stubSource, context);
  for (const name of NAMES) win[name] = context[name];
  return { win, log };
}

// ------------------------------------------------------------------------------- nav

test('nav links: none without a tournament ID', () => {
  fake();
  assert.deepEqual(ksmNavLinks(), {});
});

test('nav links: the court pages and the TV pages with a tournament ID', () => {
  fake({ tournamentId: 'cup' });
  assert.deepEqual(ksmNavLinks(), {
    'nav-court-a': 'https://ksm.test/t/cup/court/a',
    'nav-tv-a': 'https://ksm.test/t/cup/tv/a?key=s',
    'nav-court-b': 'https://ksm.test/t/cup/court/b',
    'nav-tv-b': 'https://ksm.test/t/cup/tv/b?key=s',
  });
});

test('nav links: a court without a TV link has only its court page', () => {
  fake({ tournamentId: 'cup', tv: false });
  assert.deepEqual(ksmNavLinks(), { 'nav-court-a': 'https://ksm.test/t/cup/court/a', 'nav-court-b': 'https://ksm.test/t/cup/court/b' });
});

test('nav input: open, style and active, null when unset', () => {
  const { win } = fake();
  assert.deepEqual(ksmShellNavInput(), { open: null, style: null, active: null, links: {} });
  win.ksmNavOpenMenu = 'courtsMenu';
  win.ksmNavMenuStyle = { top: '10px', left: '12px', right: '12px', maxHeight: '300px' };
  win.ksmNavActive = 'Results';
  assert.deepEqual(ksmShellNavInput(), { open: 'courtsMenu', style: { top: '10px', left: '12px', right: '12px', maxHeight: '300px' }, active: 'Results', links: {} });
});

// ------------------------------------------------------------------------------- copies

test('header: a shallow copy; patching the classic state afterwards does not change it', () => {
  const { win } = fake();
  win.ksmPublishHeader({ save: 'Saving', staffLabel: 'Logout' });
  const input = ksmShellHeaderInput();
  assert.equal(input.save, 'Saving');
  assert.notEqual(input, win.ksmShellHeaderState());
  win.ksmPublishHeader({ save: 'Saved' });
  win.ksmShellHeaderState().presence = '3 online';
  assert.equal(input.save, 'Saving');
  assert.equal(input.presence, '');
  assert.equal(ksmShellHeaderInput().save, 'Saved');
});

test('dialogs: a shallow copy; patching the classic state afterwards does not change it', () => {
  const { win } = fake();
  win.ksmPublishDialogs('fusen', { open: true });
  const input = ksmShellDialogsInput();
  assert.deepEqual(input.fusen, { open: true });
  assert.notEqual(input, win.ksmShellDialogsState());
  win.ksmPublishDialogs('fusen', { open: false });
  assert.deepEqual(input.fusen, { open: true });
  assert.deepEqual(ksmShellDialogsInput().fusen, { open: false });
  assert.equal(ksmShellDialogsInput().cloud, null);
});

// ------------------------------------------------------------------------------- signals and start-up

test('the classic stubs set their flag and dispatch their event', () => {
  const { win, log } = fake();
  win.ksmPublishNav();
  win.ksmPublishHeader({ save: 'x' });
  win.ksmPublishDialogs('cloud', null);
  assert.deepEqual(log.events, ['ksm:shell-nav', 'ksm:shell-header', 'ksm:shell-dialogs']);
  assert.deepEqual([win.ksmShellNavRequested, win.ksmShellHeaderRequested, win.ksmShellDialogsRequested], [true, true, true]);
});

test('start-up computes the inputs that were signalled before the module ran, dispatching nothing', () => {
  const { win, log } = fake({ tournamentId: 'cup' });
  win.ksmNavActive = 'Setup';
  win.ksmPublishNav();
  win.ksmPublishHeader({ staffLabel: 'Logout' });
  log.events.length = 0;
  startShellInput();
  assert.equal(win.ksmShellNavInput.active, 'Setup');
  assert.equal(win.ksmShellNavInput.links['nav-court-a'], 'https://ksm.test/t/cup/court/a');
  assert.equal(win.ksmShellHeaderInput.staffLabel, 'Logout');
  assert.equal(win.ksmShellDialogsInput, undefined);
  assert.deepEqual(log.events, []);
});

test('start-up with no earlier signal computes nothing, and a later signal does', () => {
  const { win } = fake();
  startShellInput();
  for (const key of ['Nav', 'Header', 'Dialogs']) assert.equal(win[`ksmShell${key}Input`], undefined);
  win.ksmPublishDialogs('validation', { open: true, key: 1, title: 'T', content: null });
  assert.equal(win.ksmShellDialogsInput.validation.open, true);
  win.ksmNavOpenMenu = 'tvMenu';
  win.ksmPublishNav();
  assert.equal(win.ksmShellNavInput.open, 'tvMenu');
});
