import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANCEL_TEXT, EDITOR_HELP, EDITOR_RIGHT_TITLE, EDIT_POOL_TEXT, EMPTY_POOLS, POOLS_HEADING, SAVE_POOLS_TEXT,
  editorRows, poolsView,
} from '../../app/react/features/pools/pools-model.ts';

const MESSAGE = { kind: 'message', text: 'Championship bracket will appear after pools are generated.' };
const pool = (label, names) => ({ label, title: `Pool ${label}`, players: names.map((name, i) => ({ slot: 'ABCD'[i] ?? 'E', name, dojo: `${name} Dojo` })) });

test('legacy texts of renderPools() and toggleEditPools()', () => {
  assert.equal(POOLS_HEADING, 'Pools');
  assert.equal(EDIT_POOL_TEXT, 'Edit Pool');
  assert.equal(SAVE_POOLS_TEXT, 'Save Pool Changes');
  assert.equal(CANCEL_TEXT, 'Cancel');
  assert.equal(EDITOR_HELP, 'Drag players between pools or drop between names to insert into that position. Top-to-bottom order is always A, B, C, D.');
  assert.equal(EDITOR_RIGHT_TITLE, 'Championship Preview');
});

test('nothing published yet: the static markup (an empty #poolOutput)', () => {
  assert.deepEqual(poolsView(EMPTY_POOLS), { kind: 'empty' });
});

test('editor rows: a drop zone first, then each player followed by a drop zone (insert positions 0..n)', () => {
  assert.deepEqual(editorRows(pool('A', [])), [{ kind: 'drop', index: 0 }]);
  const rows = editorRows(pool('B', ['P1', 'P2']));
  assert.deepEqual(rows.map(r => `${r.kind}${r.index}`), ['drop0', 'player0', 'drop1', 'player1', 'drop2']);
  assert.equal(rows[3].kind === 'player' && rows[3].player.name, 'P2');
});

test('pools: the cards, no message; the message only without pools', () => {
  const pools = [pool('A', ['P1', 'P2', 'P3'])];
  const view = poolsView({ kind: 'pools', pools, message: null, edit: true, rightTitle: 'Championship Preview', bracket: MESSAGE });
  assert.equal(view.kind, 'pools');
  assert.equal(view.message, null);
  assert.deepEqual(view.pools, pools);
  assert.equal(view.edit, true);
  assert.deepEqual(view.bracket, MESSAGE);
  const none = poolsView({ kind: 'pools', pools: [], message: 'No pools generated yet.', edit: false, rightTitle: 'Championship Preview', bracket: MESSAGE });
  assert.equal(none.message, 'No pools generated yet.');
});

test('editor: every pool with its rows, the Championship Preview (also for a team division)', () => {
  const view = poolsView({ kind: 'editor', pools: [pool('A', ['P1']), pool('B', [])], bracket: MESSAGE });
  assert.equal(view.kind, 'editor');
  assert.equal(view.rightTitle, 'Championship Preview');
  assert.deepEqual(view.pools.map(p => p.rows.length), [3, 1]);
  assert.deepEqual(view.bracket, MESSAGE);
});

test('the bracket goes through the court screen\'s bracketView() (round cards get their row classes)', () => {
  const bracket = { kind: 'cards', cards: [{ round: 'Final', rows: [{ kind: 'aligned', white: 'W', red: 'R', wp: ['M', ''], rp: [], status: 'DONE', current: false, compact: true }] }] };
  const view = poolsView({ kind: 'pools', pools: [], message: 'x', edit: false, rightTitle: 'Championship Preview', bracket });
  assert.equal(view.bracket.kind, 'cards');
  assert.match(view.bracket.cards[0].rows[0].className, /^aligned-match-row/);
});
