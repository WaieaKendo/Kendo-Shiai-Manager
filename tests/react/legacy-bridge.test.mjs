// app/modules/react-bridges/state-bridge.js: the islands' publishers read the legacy `state` and the cloud session through
// it. Its 'ksm:state-changed' event is gone since #15 item 14a: an island that re-renders on a tournament change subscribes
// to the store (window.KSMStore; MatchTimer, the only listener the event had).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
// A module now: run as a classic script, without its import lines and `export`s (what the app's classic transform does).
const source = read('app/modules/react-bridges/state-bridge.js').replace(/^import .*\n/gm, '').replace(/^export (?=function)/gm, '');

test('the bridge hands out the legacy state and the cloud session', () => {
  const context = { state: { marker: 1 }, cloudSession: { court: 'A' } };
  vm.createContext(context);
  vm.runInContext(`${source};this.api={ksmLegacyState,ksmLegacyCloudSession}`, context);
  assert.equal(context.api.ksmLegacyState().marker, 1);
  assert.equal(context.api.ksmLegacyCloudSession().court, 'A');
});

test('no ksm:state-changed event: the islands subscribe to the store', () => {
  const files = ['app/main.js', 'app/modules', 'app/react'].flatMap(p => {
    const full = path.join(ROOT, p);
    return fs.statSync(full).isDirectory()
      ? fs.readdirSync(full, { recursive: true }).filter(f => /\.(js|ts|tsx)$/.test(f)).map(f => path.join(p, f))
      : [p];
  });
  // (Code lines: a comment may still say what the event was.)
  const code = file => read(file).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  for (const file of files) assert.doesNotMatch(code(file), /ksm:state-changed|ksmNotifyStateChanged|ksmStateVersion|useLegacyState/, file);
  assert.match(read('app/react/features/court/MatchTimer.tsx'), /const unsubscribe = windowStore\(\)\?\.subscribe\(update\);/);
});
