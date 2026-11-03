import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ksmLibraryCard, ksmLibraryInput, ksmLocalDraftSummary, startLibraryInput } from '../../app/react/features/library/publish.ts';

// The classic signal stub, hook and discard (app/js/40-react-library.js), run as they are against the fake window.
const classic = readFileSync(new URL('../../app/js/40-react-library.js', import.meta.url), 'utf8');
function source(name) {
  const start = classic.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is missing from 40-react-library.js`);
  const lineEnd = classic.indexOf('\n', start);
  if (!classic.slice(start, lineEnd).endsWith('{')) return classic.slice(start, lineEnd + 1);
  return classic.slice(start, classic.indexOf('\n}\n', start) + 3);
}
const NAMES = ['ksmSignalLibrary', 'ksmRenderLibrary', 'ksmDecorateLibraryInput', 'ksmDiscardLocalDraft'];

// A fake `window` with the classic functions publish.ts reads through shared/legacy.ts.
function fake({ draft = null, readOnly = false, outbox = false, password = '', tournamentId = null, tokens = [] } = {}) {
  const listeners = new Map();
  const log = { events: [], removed: [] };
  const state = { draft };
  const win = {
    addEventListener: (type, fn) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    dispatchEvent: event => { log.events.push(event.type); (listeners.get(event.type) ?? []).forEach(fn => fn(event)); return true; },
    ksmText: s => String(s || ''),
    isReadOnlySession: () => readOnly,
    ksmKeepStaffOutbox: () => outbox,
    v316StaffPassword: () => password,
    ksmReadLocalDraft: () => state.draft,
    ksmLegacyCloudSession: () => ({ tournamentId }),
    ksmLibraryAuthorizedIds: () => tokens,
  };
  globalThis.window = win;
  const context = vm.createContext({
    window: win,
    CustomEvent: class { constructor(type) { this.type = type; } },
    KSM_DETACHED_DRAFT_KEY: 'detached',
    localStorage: { getItem: () => null, removeItem: key => { log.removed.push(key); state.draft = null; } },
    ksmClearAutosave: () => { log.removed.push('autosave'); state.draft = null; },
    ksmReadLocalDraft: () => state.draft,
  });
  vm.runInContext(NAMES.map(source).join('\n'), context);
  for (const name of NAMES) win[name] = context[name];
  return { win, log, state };
}

const published = win => win.ksmLibraryInput;

// ------------------------------------------------------------------------------- the builders

test('a card: the ID as a string, the name as ksmText() showed it', () => {
  fake();
  assert.deepEqual(ksmLibraryCard({ id: 7, name: 'Cup' }), { id: '7', name: 'Cup' });
  assert.deepEqual(ksmLibraryCard({}), { id: '', name: '' });
  assert.deepEqual(ksmLibraryCard({ id: null, name: null }), { id: '', name: '' });
});

test('cards and the message: an empty list gives no cards, a non-empty one a card per row in order', () => {
  fake();
  const empty = ksmLibraryInput([], 'No tournaments yet.');
  assert.equal(empty.kind, 'library');
  assert.deepEqual(empty.cards, []);
  assert.equal(empty.message, 'No tournaments yet.');
  const some = ksmLibraryInput([{ id: 'a', name: 'A' }, { id: 'b' }], undefined);
  assert.deepEqual(some.cards, [{ id: 'a', name: 'A' }, { id: 'b', name: '' }]);
  assert.equal(some.message, '');
});

test('it reads in the legacy order: list.length, then each row\'s id and name', () => {
  fake();
  const reads = [];
  const row = tag => ({ get id() { reads.push(`${tag}.id`); return tag; }, get name() { reads.push(`${tag}.name`); return tag; } });
  const list = { get length() { reads.push('length'); return 2; }, map: fn => [row('x'), row('y')].map(fn) };
  ksmLibraryInput(list, 'm');
  assert.deepEqual(reads, ['length', 'x.id', 'x.name', 'y.id', 'y.name']);
});

test('the draft summary: none, a draft with a time, one without a name or time', () => {
  const { state } = fake();
  assert.equal(ksmLocalDraftSummary(), null);
  state.draft = { setup: { tName: 'Aiea Cup' }, savedAt: '2026-10-01T09:00:00.000Z' };
  assert.deepEqual(ksmLocalDraftSummary(), { name: 'Aiea Cup', saved: new Date('2026-10-01T09:00:00.000Z').toLocaleString() });
  state.draft = { setup: {} };
  assert.deepEqual(ksmLocalDraftSummary(), { name: 'Untitled tournament', saved: 'unknown time' });
});

test('canManage, activeId, hasActive and the authorized IDs', () => {
  const pick = ({ canManage, activeId, hasActive, authorizedIds }) => ({ canManage, activeId, hasActive, authorizedIds });
  fake({ readOnly: true, tournamentId: 'cup', tokens: ['a', 'b'] });
  assert.deepEqual(pick(ksmLibraryInput([], '')), { canManage: false, activeId: 'cup', hasActive: false, authorizedIds: ['a', 'b'] });
  fake({ readOnly: true, outbox: true, tournamentId: 'cup' });
  assert.equal(ksmLibraryInput([], '').hasActive, true);
  fake({ readOnly: false, password: 'pw' });
  assert.deepEqual(pick(ksmLibraryInput([], '')), { canManage: true, activeId: '', hasActive: true, authorizedIds: [] });
  fake({ readOnly: false });
  assert.equal(ksmLibraryInput([], '').hasActive, false);
});

// ------------------------------------------------------------------------------- signal, errors and hook

test('the classic stub records the request and dispatches; the module publishes on the event', () => {
  const { win, log } = fake();
  startLibraryInput();
  assert.equal(published(win), undefined);
  const list = [{ id: 'a', name: 'A' }];
  win.ksmRenderLibrary(list, 'm');
  assert.deepEqual(log.events, ['ksm:library']);
  assert.equal(win.ksmLibraryRequested.list, list);
  assert.equal(win.ksmLibraryRequested.message, 'm');
  assert.deepEqual(published(win).cards, [{ id: 'a', name: 'A' }]);
  assert.equal(win.ksmLibraryError, null);
});

test('a reply that is not a list: the stub rethrows at its caller and the input stays', () => {
  const { win } = fake();
  startLibraryInput();
  win.ksmRenderLibrary([{ id: 'a', name: 'A' }], 'm');
  const before = published(win);
  assert.throws(() => win.ksmRenderLibrary(null, 'm'), TypeError);
  assert.equal(published(win), before);
  assert.equal(win.ksmLibraryError, null);
  assert.throws(() => win.ksmRenderLibrary('abc', 'm'), TypeError);
  assert.equal(published(win), before);
  win.ksmRenderLibrary([], 'fine again');
  assert.equal(published(win).message, 'fine again');
});

test('without the module a bad reply does not throw and nothing is published', () => {
  const { win } = fake();
  win.ksmRenderLibrary(null, 'm');
  assert.equal(published(win), undefined);
});

test('the decorate hook is applied to the built input and looked up on every call', () => {
  const { win } = fake();
  startLibraryInput();
  win.ksmRenderLibrary([], 'm');
  assert.equal(published(win).authEnabled, undefined);
  const seen = [];
  win.ksmDecorateLibraryInput = input => { seen.push(input.kind); return { ...input, authEnabled: true }; };
  win.ksmRenderLibrary([], 'm');
  assert.equal(published(win).authEnabled, true);
  win.ksmDecorateLibraryInput = input => ({ ...input, authEnabled: false, accountEmail: 'x@y.z' });
  win.ksmRenderLibrary([], 'm');
  assert.deepEqual([published(win).authEnabled, published(win).accountEmail], [false, 'x@y.z']);
  assert.deepEqual(seen, ['library']);
});

test('an error in the hook is rethrown like one in the build', () => {
  const { win } = fake();
  startLibraryInput();
  win.ksmDecorateLibraryInput = () => { throw new RangeError('hook'); };
  assert.throws(() => win.ksmRenderLibrary([], 'm'), RangeError);
  assert.equal(published(win), undefined);
});

test('discard removes the draft and re-signals the same request, recomputing the input', () => {
  const { win, log } = fake({ draft: { setup: { tName: 'Draft' }, savedAt: 1 }, readOnly: true });
  startLibraryInput();
  const list = [{ id: 'a', name: 'A' }];
  win.ksmRenderLibrary(list, 'm');
  assert.equal(published(win).draft.name, 'Draft');
  log.events.length = 0;
  win.ksmDiscardLocalDraft();
  assert.deepEqual(log.removed, ['autosave']);
  assert.deepEqual(log.events, ['ksm:library']);
  assert.equal(win.ksmLibraryRequested.list, list);
  assert.equal(win.ksmLibraryRequested.message, 'm');
  assert.equal(published(win).draft, null);
  assert.deepEqual(published(win).cards, [{ id: 'a', name: 'A' }]);
  win.ksmDiscardLocalDraft();
  assert.equal(log.events.length, 1);
});

test('discard with no earlier request publishes nothing', () => {
  const { win, log } = fake({ draft: { setup: {}, savedAt: 1 } });
  startLibraryInput();
  win.ksmDiscardLocalDraft();
  assert.deepEqual(log.events, []);
  assert.equal(published(win), undefined);
});

test('start-up computes a request signalled before the module ran, dispatching nothing', () => {
  const { win, log } = fake({ tournamentId: 'cup' });
  win.ksmRenderLibrary([{ id: 'a', name: 'A' }], 'm');
  assert.equal(published(win), undefined);
  log.events.length = 0;
  startLibraryInput();
  assert.deepEqual(log.events, []);
  assert.equal(published(win).activeId, 'cup');
  assert.deepEqual(published(win).cards, [{ id: 'a', name: 'A' }]);
});

test('start-up with a bad earlier request stores the error and publishes nothing', () => {
  const { win } = fake();
  win.ksmRenderLibrary(null, 'm');
  startLibraryInput();
  assert.equal(published(win), undefined);
  assert.ok(win.ksmLibraryError instanceof TypeError);
});
