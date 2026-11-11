// Legacy `state` and the store side by side (#15, docs/STORE.md section 2): the strict / production switch for writes
// that miss the conversion (point 8), and the three actions through which `state` writes reach the store before a
// field group has its own actions: replaceState() / assignState() (point 3) and a stray assignment (point 8). The
// helpers that dispatch them are in app/modules/app-state.js.
import { createAction, createNextState } from '@reduxjs/toolkit';
import { setAutoFreeze } from 'immer';

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
/** replaceState(): the store-owned keys of a whole-state replace (a load, a remote apply, the tournament switch). */
export const legacyStateReplaced = createAction<{ writes: StoreWrite[] }>('legacy/stateReplaced');
/** assignState(): the store-owned keys of a partial assign (a division rename, the team-division migration). */
export const legacyStateAssigned = createAction<{ writes: StoreWrite[] }>('legacy/stateAssigned');

/** `root` with each write's value at its path (missing objects on the way are created), as one Immer update. */
export function applyStoreWrites<S>(root: S, writes: readonly StoreWrite[]): S {
  if (!writes.length) return root;
  return createNextState(root, draft => {
    for (const { path, value } of writes) {
      if (!path.length) throw new Error('A store write needs a path');
      let target = draft as Record<string, unknown>;
      for (const key of path.slice(0, -1)) {
        const next = target[key];
        target = (next && typeof next === 'object' ? next : (target[key] = {})) as Record<string, unknown>;
      }
      target[path[path.length - 1] as string] = value;
    }
  });
}
