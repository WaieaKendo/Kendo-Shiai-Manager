// The Pools view's island: the contents of #poolOutput (Registration -> Pools), with the same
// elements, classes and test IDs as the legacy renderPools() / toggleEditPools() drew, so the
// pool CSS and every test apply unchanged; tests/golden/pools pins them. renderPools() and
// toggleEditPools() (app/js) publish what to show (ksm:pools); #poolOutput's class
// ('pools-layout'), the division select and Regenerate stay legacy (outside the island).
//
// Drag and drop and the buttons call the legacy functions the inline handlers called, with
// React's event (it has dataTransfer, preventDefault() and stopPropagation(), all they use):
// a player's dragstart dragPoolPlayer(event, label, index); a pool's dragover adds the
// drop-target class, its dragleave removes it, its drop calls dropPoolPlayer(event, label) when
// the pool itself is the target and removes the class; a drop zone's drop calls
// insertPoolPlayer(event, label, index); Edit Pool toggleEditPools(), Save Pool Changes
// saveEditedPools(), Cancel renderPools(). Every publish draws fresh elements (keyed by the
// publish), as the legacy innerHTML did, so no drop-target class set during a drag outlives it.
// No colors of its own (the pool CSS and theme tokens).
import { Fragment, useSyncExternalStore, type DragEvent } from 'react';
import { Bracket } from '../../shared/ui/CourtContext.tsx';
import {
  CANCEL_TEXT, EDITOR_HELP, EDIT_POOL_TEXT, EMPTY_POOLS, POOLS_HEADING, SAVE_POOLS_TEXT,
  poolsView, type EditorRow, type PoolInput, type PoolPlayerInput, type PoolsInput,
} from './pools-model.ts';

export const POOLS_EVENT = 'ksm:pools';

interface PoolsWindow {
  /** The view as renderPools() / toggleEditPools() last published it. */
  ksmPoolsInput?: PoolsInput;
  dragPoolPlayer?: (event: DragEvent, label: string, index: number) => unknown;
  dropPoolPlayer?: (event: DragEvent, label: string) => unknown;
  insertPoolPlayer?: (event: DragEvent, label: string, index: number) => unknown;
  toggleEditPools?: () => unknown;
  saveEditedPools?: () => unknown;
  renderPools?: () => unknown;
}

const poolsWindow = (): PoolsWindow => window as unknown as PoolsWindow;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(POOLS_EVENT, onChange);
  return () => window.removeEventListener(POOLS_EVENT, onChange);
}
const snapshot = (): PoolsInput => poolsWindow().ksmPoolsInput ?? EMPTY_POOLS;

// One key per publish: a new publish draws new elements.
const publishKeys = new WeakMap<object, number>();
let lastKey = 0;
function keyOf(input: object): number {
  let key = publishKeys.get(input);
  if (key === undefined) {
    key = ++lastKey;
    publishKeys.set(input, key);
  }
  return key;
}

/** The dojo, floated right: style="float:right" as the template printed it (React's style prop
 * would write "float: right;"). */
function Dojo({ text }: { text: string }) {
  return <span className="small" ref={el => { if (el && el.getAttribute('style') !== 'float:right') el.setAttribute('style', 'float:right'); }}>{text}</span>;
}

/** A pool card's drop handling (the inline ondragover/ondragleave/ondrop of both templates). */
function poolDropProps(label: string) {
  return {
    onDragOver: (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.currentTarget.classList.add('drop-target'); },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => { e.currentTarget.classList.remove('drop-target'); },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      const pool = e.currentTarget;
      if (e.target === pool) poolsWindow().dropPoolPlayer?.(e, label);
      pool.classList.remove('drop-target');
    },
  };
}

const dragStart = (label: string, index: number) => (e: DragEvent<HTMLDivElement>) => { poolsWindow().dragPoolPlayer?.(e, label, index); };

/** renderPools()'s pool card. */
function ViewPool({ pool }: { pool: PoolInput }) {
  return (
    <div className="pool" data-testid="pool" {...poolDropProps(pool.label)}>
      <h3 data-testid="pool-title">{pool.title}</h3>
      {pool.players.map((x: PoolPlayerInput, i) => (
        <div key={i} className="drag-player" draggable="true" onDragStart={dragStart(pool.label, i)}>
          <span className="pool-slot-badge" data-testid="pool-slot">{x.slot}</span><b data-testid="pool-player">{x.name}</b><Dojo text={x.dojo} />
        </div>
      ))}
    </div>
  );
}

/** toggleEditPools()'s pool card: drop zones between the players. */
function EditorPool({ pool, rows }: { pool: PoolInput; rows: EditorRow[] }) {
  return (
    <div className="pool" data-testid="pool-edit-pool" {...poolDropProps(pool.label)}>
      <h3>{pool.title}</h3>
      {rows.map(row => (row.kind === 'drop'
        ? <div key={`d${row.index}`} className="drop-zone" data-testid="pool-edit-drop" onDragOver={e => e.preventDefault()}
          onDrop={e => { poolsWindow().insertPoolPlayer?.(e, pool.label, row.index); }}></div>
        : (
          <div key={`p${row.index}`} className="drag-player" draggable="true" data-testid="pool-edit-player" onDragStart={dragStart(pool.label, row.index)}>
            <span className="pool-slot-badge">{row.player.slot}</span><b>{row.player.name}</b><Dojo text={row.player.dojo} />
          </div>
        )))}
    </div>
  );
}

/** The contents of #poolOutput. */
export function PoolOutput() {
  const input = useSyncExternalStore(subscribe, snapshot, () => EMPTY_POOLS);
  const view = poolsView(input);
  if (view.kind === 'empty') return null;
  const w = poolsWindow();
  if (view.kind === 'editor') {
    return (
      <Fragment key={keyOf(input)}>
        <div>
          <div className="toolbar">
            <button className="primary" onClick={() => { w.saveEditedPools?.(); }} data-testid="pool-edit-save">{SAVE_POOLS_TEXT}</button>
            <button onClick={() => { w.renderPools?.(); }} data-testid="pool-edit-cancel">{CANCEL_TEXT}</button>
          </div>
          <p className="sub">{EDITOR_HELP}</p>
          <div className="pool-list">{view.pools.map((p, i) => <EditorPool key={i} pool={p} rows={p.rows} />)}</div>
        </div>
        <div><h2>{view.rightTitle}</h2><Bracket bracket={view.bracket} /></div>
      </Fragment>
    );
  }
  return (
    <Fragment key={keyOf(input)}>
      <div>
        <h2>{POOLS_HEADING}</h2>
        {view.edit && <div className="toolbar"><button onClick={() => { w.toggleEditPools?.(); }} data-testid="pool-edit">{EDIT_POOL_TEXT}</button></div>}
        <div className="pool-list">
          {view.message === null ? view.pools.map((p, i) => <ViewPool key={i} pool={p} />) : <div className="muted-card">{view.message}</div>}
        </div>
      </div>
      <div><h2>{view.rightTitle}</h2><Bracket bracket={view.bracket} /></div>
    </Fragment>
  );
}
