// Legacy `state` and the store side by side (#15, docs/STORE.md section 2): the strict / production switch for writes
// that miss the conversion (point 8), and the action a stray assignment to a store getter dispatches in production
// (point 8; moveToStore() in app/modules/app-state.js). Every field group has its own actions since #15 item 14a, which
// retired replaceState() / assignState() and their legacy/stateReplaced / legacy/stateAssigned (a load is
// tournament/loaded, app/store/slices/tournament.ts).
import { createAction } from '@reduxjs/toolkit';
import { freeze, setAutoFreeze } from 'immer';

// Node defines `process`; app.js's build replaces `process.env.NODE_ENV` with "production" (scripts/app-sources.mjs).
declare const process: { env: { NODE_ENV?: string } };

/** True in app.js (the production build); false in the Node tests. */
export const PRODUCTION_BUILD: boolean = process.env.NODE_ENV === 'production';

let strict = !PRODUCTION_BUILD;
/**
 * Strict (Node tests, and the browser tests through `window.KSM_STRICT_STORE`, set by tests/lib/ksm-test-api.js): a
 * write the conversion missed throws (Immer deep-freezes what the store holds; moveToStore()'s setter throws).
 * Production (app.js for users): it is applied instead, never a crash during a tournament (docs/STORE.md point 8).
 */
export function storeIsStrict(): boolean { return strict; }
/** Switches strict mode and Immer's auto-freeze together (once at load: app/main.js; and in the tests). */
export function setStoreStrict(on: boolean): void {
  strict = on;
  setAutoFreeze(on);
}
setStoreStrict(strict);

/** One write into the store: the value at a path such as ['device', 'regMode']. */
export interface StoreWrite { path: string[]; value: unknown }

/**
 * A stray assignment to a moved field (`state.regMode = x`) in production, logged to the cloud diagnostics. Only
 * moveToStore()'s setter dispatches it (tests/store/legacy.test.mjs checks): it is a fallback, never a way to write.
 */
export const legacyFieldAssigned = createAction<{ key: string } & StoreWrite>('legacy/fieldAssigned');

/**
 * `root` with each write's value at its path (missing objects on the way are created), copying only the objects on the
 * written paths (structural sharing, as Immer's update did; a write of the value already there changes nothing). Not an
 * Immer update since #15 PR 13b: Immer walks every new value deeply when it finalizes (a load's whole history, a point's
 * list of 100 entries), which a path copy does not. In strict mode (the tests) the new values and the copied objects are
 * deep-frozen as Immer froze them; in production nothing is frozen, as with Immer's auto-freeze off.
 */
export function applyStoreWrites<S>(root: S, writes: readonly StoreWrite[]): S {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- plain JSON objects along a path
  type Obj = any;
  const copies = new Set<Obj>();
  const own = (o: Obj): Obj => copies.has(o) ? o : (o = Array.isArray(o) ? [...o] : { ...o }, copies.add(o), o);
  let out: Obj = root;
  for (const { path, value } of writes) {
    const last = path.length - 1, key = path[last];
    if (key === undefined) throw new Error('A store write needs a path');
    let at: Obj = out;
    for (let i = 0; i < last; i++) at = at && typeof at === 'object' ? at[path[i]!] : undefined;
    if (at && typeof at === 'object' && Object.hasOwn(at, key) && at[key] === value) continue;
    let target: Obj = out = own(out);
    for (let i = 0; i < last; i++) { const next = target[path[i]!]; target = target[path[i]!] = own(next && typeof next === 'object' ? next : {}); }
    target[key] = value;
  }
  if (strict) copies.forEach(copy => freeze(copy, true));
  return out;
}
