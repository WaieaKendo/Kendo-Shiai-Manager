// app/js/00-react-bridge.js (classic script): ksmNotifyStateChanged() coalesces a burst of
// changes into one 'ksm:state-changed' event, and does nothing without a window.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../app/js/00-react-bridge.js', import.meta.url), 'utf8');

function load(withWindow) {
  const events = [];
  const context = { queueMicrotask, state: { marker: 1 } };
  if (withWindow) {
    context.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };
    context.window = { dispatchEvent: e => events.push(e) };
  }
  vm.createContext(context);
  vm.runInContext(`${source};this.api={ksmNotifyStateChanged,ksmLegacyState,ksmLegacyStateVersion}`, context);
  return { ...context.api, events, window: context.window };
}

test('one event per task, carrying every reason and the new version', async () => {
  const b = load(true);
  b.ksmNotifyStateChanged('court action');
  b.ksmNotifyStateChanged('render');
  assert.equal(b.events.length, 0, 'dispatched after the current task');
  await Promise.resolve();
  assert.equal(b.events.length, 1);
  assert.equal(b.events[0].type, 'ksm:state-changed');
  assert.deepEqual(JSON.parse(JSON.stringify(b.events[0].detail)), { version: 2, reasons: ['court action', 'render'] });
  assert.equal(b.ksmLegacyStateVersion(), 2);
  b.ksmNotifyStateChanged('render');
  await Promise.resolve();
  assert.equal(b.events.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(b.events[1].detail)), { version: 3, reasons: ['render'] });
  assert.equal(b.ksmLegacyState().marker, 1);
});

test('no window (extracted-function tests): a no-op', async () => {
  const b = load(false);
  b.ksmNotifyStateChanged('render');
  await Promise.resolve();
  assert.equal(b.ksmLegacyStateVersion(), 0);
});
