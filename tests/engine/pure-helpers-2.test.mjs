// Issue #136 step 1b: a second batch of pure helpers moved from app/js into app/engine/.
// Each must give the same answer as its pre-move legacy declaration in the last single-file
// version (def5010), and app/js must now delegate to KSMEngine.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { isTeamMatch, teamPositionOrder, individualMatchReady, isIndividualPoolTiebreakMatch, directorMatchLabel,
  matchBelongsToCourtInState } from '../../app/engine/match-helpers.ts';
import { formatSnapshotBytes, snapshotValueSummary, normalizeQueueGroupLabel } from '../../app/engine/labels.ts';
import { normalizeCourt, historyValuesEqual, historyEntryIdentity } from '../../app/engine/sync-helpers.ts';
import { html, extractFunction } from '../lib/ksm-source.mjs';
import { gitShow } from '../lib/git-show.mjs';

const MOVED = {
  isTeamMatch, teamPositionOrder, individualMatchReady, isIndividualPoolTiebreakMatch, directorMatchLabel,
  matchBelongsToCourtInState, formatSnapshotBytes, snapshotValueSummary, normalizeQueueGroupLabel,
  normalizeCourt, historyValuesEqual, historyEntryIdentity,
};

const teamBout = { type: 'teamPosition', position: 'Senpo', pool: 'A', division: 'T' };
const MATCHES = [
  null, undefined, {}, { done: true, white: 'a', red: 'b' }, { white: 'a', red: 'b' }, { white: 'a' }, { red: 'b' },
  { white: 'a', red: 'b', templateNode: true }, { white: 'a', red: 'b', templateNode: true, ready: true },
  teamBout, { type: 'teamPlayoff', position: 'Team Playoff' }, { type: 'kachinuki', position: 'Kachinuki Playoff', pool: 'B' },
  { type: 'teamPosition', pool: 'P' }, { type: 'teamPosition' }, { type: 'teamPosition', position: 'TAISHO' },
  { type: 'teamPosition', position: 'unknown' }, { type: 'teamPlayoff', roundRobinTiebreak: true },
  { type: 'individual', pool: 'Championship', position: 'Final' }, { type: 'individual', pool: 'Championship' },
  { type: 'individual', pool: 'A' }, { type: 'individual', pool: '' }, { type: 'individual', tiebreak: true, pool: 'A' },
  { type: 'individual', tiebreak: true, pool: 'A', championship: true }, { type: 'individual', tiebreak: true },
  { type: 'individual', court: 'B', division: 'D' }, { division: 'D' }, { division: 'Split' }, { division: 'Elsewhere' },
];
const STATES = [null, undefined, {}, { divisionCourts: {} }, { divisionCourts: { D: 'B', Split: 'split', X: 'A' } }];
const VALUES = [undefined, null, '', 'a', 'B', 'b', 'Fusen-gachi', 'Final', ' x ', 0, 1, 1023, 1024, 1536, 1048575, 1048576, 5242880,
  '2048', 'abc', NaN, Infinity, -5, true, false, [], [1, 2], {}, { a: 1, b: 2 }, [null], { name: 'x' }];
const ENTRIES = [null, undefined, {}, { clientId: 'c', when: 't', court: 'A', label: 'l', kind: 'k', target: 'g' },
  { clientId: 'c' }, { label: 'l', kind: 'k' }, { court: 0, label: 0 }];
const LABELS = ['', undefined, null, 'Quarterfinal', 'Quarter Final', 'quarterfinals', 'Semifinal', 'semi', 'Final', 'final', 'FINAL MATCH',
  'Round of 32', 'round of 16', 'First Round', 'Pool A', '  Upcoming  ', 'Final Four', 0];
const pair = xs => xs.flatMap(a => xs.map(b => [a, b]));
const CASES = {
  isTeamMatch: MATCHES.map(m => [m]),
  teamPositionOrder: MATCHES.filter(Boolean).map(m => [m]),
  individualMatchReady: MATCHES.map(m => [m]),
  isIndividualPoolTiebreakMatch: MATCHES.map(m => [m]),
  directorMatchLabel: MATCHES.map(m => [m]),
  matchBelongsToCourtInState: STATES.flatMap(s => MATCHES.flatMap(m => ['A', 'B', undefined].map(c => [s, m, c]))),
  formatSnapshotBytes: VALUES.map(v => [v]),
  snapshotValueSummary: VALUES.map(v => [v]),
  normalizeQueueGroupLabel: LABELS.map(v => [v]),
  normalizeCourt: VALUES.map(v => [v]),
  historyValuesEqual: pair(VALUES),
  historyEntryIdentity: ENTRIES.map(e => [e]),
};
// JSON round trip so NaN/undefined compare the way the legacy vm values do; plain strict equality is not enough for them.
const norm = v => (typeof v === 'number' && Number.isNaN(v) ? 'NaN' : v === undefined ? '__undefined__' : JSON.parse(JSON.stringify(v)));

test('app/js delegates each moved helper to KSMEngine', () => {
  for (const name of Object.keys(MOVED)) {
    assert.match(extractFunction(html, name), new RegExp(`KSMEngine\\.${name}\\(`), name);
  }
});

test('every moved helper has a table of cases', () => {
  assert.deepEqual(Object.keys(CASES).sort(), Object.keys(MOVED).sort());
});

test('moved helpers match the pre-move legacy code', t => {
  const old = gitShow('def5010', 'public/index.html');
  if (!old) { t.skip('def5010 not in this clone'); return; }
  const legacy = {};
  for (const name of Object.keys(MOVED)) {
    const text = extractFunction(old, name);
    assert.ok(!/KSMEngine/.test(text), `${name}: old code is pre-move`);
    legacy[name] = text;
  }
  const ctx = vm.createContext({});
  vm.runInContext(Object.values(legacy).join('\n'), ctx);
  for (const [name, fn] of Object.entries(MOVED)) {
    for (const args of CASES[name]) {
      const label = `${name}(${args.map(a => JSON.stringify(a)).join(', ')})`;
      assert.deepEqual(norm(fn(...args)), norm(ctx[name](...args)), label);
    }
  }
});
