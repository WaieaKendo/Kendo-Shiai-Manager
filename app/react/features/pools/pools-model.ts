// The Pools view (Registration -> Pools, #poolsReg): the contents of #poolOutput, either the
// division's pools next to its Championship Preview (or a team round robin's Team Standings), or
// the Edit Pool editor (Save Pool Changes, Cancel, pool cards with drop zones between names, the
// Championship Preview).
//
// The legacy app decides what is shown and computes it: renderPools()
// (app/js/08-engine-generation.js) publishes a PoolsInput of kind 'pools' and toggleEditPools()
// (16-court-context-and-pool-editing.js) one of kind 'editor' (ksm:pools, through
// app/js/41-react-pools.js): the pools with their players' slot letters (the engine's
// poolPlayerSlot() / poolPlayerSlotLetter()), the message when there are none, and the court
// screen's bracket data (ksmBracket(), the legacy bracketHtml()). The legacy renderer (the
// innerHTML of renderPools() and toggleEditPools()) is mirrored here: its texts, classes and
// test IDs (pool, pool-title, pool-slot, pool-player, pool-edit, pool-edit-save,
// pool-edit-pool, pool-edit-player, pool-edit-drop), which tests/golden/pools (recorded from
// it) pin. Drag and drop and the buttons call the legacy functions (dragPoolPlayer(),
// dropPoolPlayer(), insertPoolPlayer(), toggleEditPools(), saveEditedPools(), renderPools()).
import { bracketView, type BracketInput, type BracketView } from '../../shared/ui/context-model.ts';

// ------------------------------------------------------------------------------ input

/** One player of a pool (text as esc() showed it). */
export interface PoolPlayerInput {
  /** The slot letter: poolPlayerSlot() in the view, poolPlayerSlotLetter(index) in the editor. */
  slot: string;
  name: string;
  dojo: string;
}

/** One pool card. */
export interface PoolInput {
  /** The pool's label as the drag-and-drop handlers get it (jsArg(): String(label ?? '')). */
  label: string;
  /** The heading: "Pool A", "Team Pool A". */
  title: string;
  players: PoolPlayerInput[];
}

export type PoolsInput =
  /** Nothing published yet: the static markup (an empty #poolOutput). */
  | { kind: 'empty' }
  /** renderPools(div). */
  | {
    kind: 'pools';
    pools: PoolInput[];
    /** Without pools: what is shown instead (the bracket messages, "No pools generated yet."). */
    message: string | null;
    /** Edit Pool is offered (pools, not a team round robin). */
    edit: boolean;
    /** "Championship Preview" or "Team Standings". */
    rightTitle: string;
    bracket: BracketInput;
  }
  /** toggleEditPools(): the editor. */
  | { kind: 'editor'; pools: PoolInput[]; bracket: BracketInput };

// ------------------------------------------------------------------------------- view

export const EMPTY_POOLS: PoolsInput = { kind: 'empty' };

export const POOLS_HEADING = 'Pools';
export const EDIT_POOL_TEXT = 'Edit Pool';
export const SAVE_POOLS_TEXT = 'Save Pool Changes';
export const CANCEL_TEXT = 'Cancel';
export const EDITOR_HELP = 'Drag players between pools or drop between names to insert into that position. Top-to-bottom order is always A, B, C, D.';
export const EDITOR_RIGHT_TITLE = 'Championship Preview';

/** One row of an editor pool card: a drop zone (insert at `index`) or a player (at `index`). */
export type EditorRow =
  | { kind: 'drop'; index: number }
  | { kind: 'player'; index: number; player: PoolPlayerInput };

/** An editor pool card: a drop zone first, then each player followed by a drop zone. */
export function editorRows(pool: PoolInput): EditorRow[] {
  const rows: EditorRow[] = [{ kind: 'drop', index: 0 }];
  pool.players.forEach((player, index) => rows.push({ kind: 'player', index, player }, { kind: 'drop', index: index + 1 }));
  return rows;
}

export type PoolsView =
  | { kind: 'empty' }
  | { kind: 'pools'; pools: PoolInput[]; message: string | null; edit: boolean; rightTitle: string; bracket: BracketView }
  | { kind: 'editor'; pools: Array<PoolInput & { rows: EditorRow[] }>; rightTitle: string; bracket: BracketView };

export function poolsView(input: PoolsInput): PoolsView {
  switch (input.kind) {
    case 'empty': return input;
    case 'pools': return {
      kind: 'pools', pools: input.pools, message: input.pools.length ? null : input.message ?? '',
      edit: input.edit, rightTitle: input.rightTitle, bracket: bracketView(input.bracket),
    };
    case 'editor': return {
      kind: 'editor', pools: input.pools.map(p => ({ ...p, rows: editorRows(p) })),
      rightTitle: EDITOR_RIGHT_TITLE, bracket: bracketView(input.bracket),
    };
  }
}
