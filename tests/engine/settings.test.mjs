// app/engine/settings.ts readSettings: defaults for missing/empty values, passthrough of
// saved setup values, and parity with the legacy tournamentSettings() accessor.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readSettings, DEFAULT_SETTINGS } from '../../app/engine/settings.ts';
import { html, withDependencies, extractFunction } from '../lib/ksm-source.mjs';

test('missing, null, non-object or empty values fall back to the engine defaults', () => {
  for (const setup of [undefined, null, 'x', {}, {teamFormat: '', teamEnabled: null}]) assert.deepEqual(readSettings(setup), DEFAULT_SETTINGS);
  assert.deepEqual(DEFAULT_SETTINGS, {teamEnabled: 'Enabled', teamFormat: '5-Person Team', teamTournamentFormat: 'Single Elimination', teamCourt: 'Both', teamAwardMode: 'top2', exhibitionEnabled: 'Disabled'});
});

test('saved setup values pass through; unrelated setup keys are dropped', () => {
  const setup = {tName: 'Cup', teamEnabled: 'Disabled', teamFormat: '3-Person Team', teamTournamentFormat: 'Round Robin', teamCourt: 'B', teamAwardMode: 'dual3', exhibitionEnabled: 'Enabled'};
  const {tName, ...expected} = setup;
  assert.deepEqual(readSettings(setup), expected);
});

test('returns a new object each call', () => {
  const a = readSettings({}); a.teamFormat = 'Kachinuki';
  assert.equal(readSettings({}).teamFormat, '5-Person Team');
});

test('legacy tournamentSettings() delegates to KSMEngine.readSettings', () => {
  const ctx = vm.createContext({});
  vm.runInContext(withDependencies(html, extractFunction(html, 'tournamentSettings'), {exclude: ['getSetupSnapshot']}), ctx);
  const setup = {teamFormat: 'Kachinuki', teamEnabled: 'Disabled'};
  assert.deepEqual({...ctx.tournamentSettings(setup)}, readSettings(setup));
});
