import test from 'node:test';
import assert from 'node:assert/strict';
import { gcSwapLabel, grandChampionBracket, grandChampionControls, grandChampionSourceOptions, grandChampionStatus } from '../../app/react/setup/grand-champion-model.ts';

const row = (over = {}) => ({
  id: 'gc:1', name: 'Grand Champion', sources: ['Open', 'Women'], format: 'Single Elimination', court: 'B', awardMode: 'top1',
  move: { up: false, down: false }, error: null, waiting: [], duplicates: [], entrants: [null, null],
  drawn: false, started: false, complete: false, champion: null, decide: false, canWithdraw: false, ...over,
});

test('controls: a drawn row locks its structure, name and awards stay; one not drawn yet stays editable; read-only locks all; format from three sources', () => {
  assert.deepEqual(grandChampionControls({ locked: false, readOnly: false }, row()), { name: true, sources: true, format: false, court: true, awards: true, remove: true });
  assert.equal(grandChampionControls({ locked: false, readOnly: false }, row({ sources: ['A', 'B', 'C'] })).format, true);
  assert.deepEqual(grandChampionControls({ locked: true, readOnly: false }, row({ sources: ['A', 'B', 'C'], drawn: true })), { name: true, sources: false, format: false, court: false, awards: true, remove: false });
  // Another row is drawn (the note shows), this one is not: still editable.
  assert.deepEqual(grandChampionControls({ locked: true, readOnly: false }, row({ sources: ['A', 'B', 'C'] })), { name: true, sources: true, format: true, court: true, awards: true, remove: true });
  assert.ok(Object.values(grandChampionControls({ locked: false, readOnly: true }, row())).every(v => v === false));
});

test('source options: the chosen sources in bracket order (one no longer in use flagged), then the other divisions in use', () => {
  const divisions = [{ key: 'Open', name: 'Open' }, { key: 'Masters', name: 'Masters' }, { key: 'Women', name: 'Women' }];
  assert.deepEqual(grandChampionSourceOptions({ divisions: divisions.slice(0, 2) }, row()), [
    { key: 'Open', name: 'Open', checked: true, missing: false },
    { key: 'Women', name: 'Women', checked: true, missing: true },
    { key: 'Masters', name: 'Masters', checked: false, missing: false },
  ]);
  // Reordered by the director: the chips follow the sources, not the running order.
  assert.deepEqual(grandChampionSourceOptions({ divisions }, row({ sources: ['Women', 'Open'] })).map(o => [o.key, o.checked]), [['Women', true], ['Open', true], ['Masters', false]]);
});

test('status: error, decision, champion, duplicate, playing, waiting', () => {
  assert.deepEqual(grandChampionStatus(row({ error: 'Choose at least two divisions.' })), { tone: 'warn', text: 'Choose at least two divisions.' });
  assert.equal(grandChampionStatus(row({ decide: true, drawn: true })).tone, 'warn');
  assert.deepEqual(grandChampionStatus(row({ complete: true, champion: 'Aki', drawn: true })), { tone: 'done', text: 'Grand Champion: Aki' });
  assert.match(grandChampionStatus(row({ duplicates: ['Women'] })).text, /same person won Women/);
  const entrants = [{ name: 'Ben', via: 'runner-up', source: 'Open' }, { name: 'Cora', via: 'fusen-sho', source: 'Women' }];
  assert.equal(grandChampionStatus(row({ drawn: true, started: true, entrants })).text, 'Playing on Court B: Ben (for Open, runner-up) vs Cora (withdrew: Fusen-sho)');
  assert.equal(grandChampionStatus(row({ waiting: ['Women'], entrants: [{ name: 'Aki', via: 'winner', source: 'Open' }, null] })).text, 'Waiting for Women (so far: Aki from Open)');
});

test('bracket: the draw\'s template filled with the divisions in order (7: the 7th waits for QF3), who plays once known; none for a pool or under three', () => {
  const keys = ['Yonenbu', 'Shonenbu', 'Masters', '1-3 Dan', '4-Dan', 'Seinenbu', 'Womens'];
  const divisions = keys.map(k => ({ key: k, name: k === 'Womens' ? "Women's" : k }));
  const entrants = keys.map((k, i) => i === 0 ? { name: 'Aki', via: 'winner', source: k } : null);
  const rounds = grandChampionBracket({ divisions }, row({ sources: keys, entrants }));
  assert.deepEqual(rounds.map(r => [r.round, r.matches.map(m => m.id)]), [['Quarterfinal', ['QF1', 'QF2', 'QF3']], ['Semifinal', ['SF1', 'SF2']], ['Final', ['F']]]);
  const label = s => s.kind === 'source' ? `${s.index + 1}:${s.name}${s.player ? `(${s.player})` : ''}` : s.kind === 'winner' ? `W ${s.ref}` : 'bye';
  assert.deepEqual(rounds.flatMap(r => r.matches.map(m => m.sides.map(label).join(' vs '))), [
    '1:Yonenbu(Aki) vs 2:Shonenbu', '3:Masters vs 4:1-3 Dan', '5:4-Dan vs 6:Seinenbu', 'W QF1 vs W QF2', "W QF3 vs 7:Women's", 'W SF1 vs W SF2',
  ]);
  // Five: the template's bye shows.
  const five = grandChampionBracket({ divisions }, row({ sources: keys.slice(0, 5), entrants: [] }));
  assert.deepEqual(five[1].matches.map(m => m.sides.map(label).join(' vs ')), ['W QF1 vs bye', 'W QF2 vs 5:4-Dan']);
  assert.equal(grandChampionBracket({ divisions }, row({ sources: keys, format: 'Round Robin' })), null, 'a pool of winners has no bracket');
  assert.equal(grandChampionBracket({ divisions }, row()), null, 'two divisions: one match, nothing to arrange');
});

test('swap labels: pick, swap with the picked one, cancel', () => {
  assert.equal(gcSwapLabel('Masters', null), 'Masters: pick to swap its place');
  assert.equal(gcSwapLabel('Womens', 'Masters'), 'Swap Womens with Masters');
  assert.equal(gcSwapLabel('Masters', 'Masters'), 'Masters: picked (tap again to cancel)');
});
