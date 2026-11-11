// How the React islands read the store (#15 step 2.8): useSyncExternalStore + a selector, no Provider. Each island is
// its own root, and the islands are a separate bundle from app.js, so they must use app.js's one store instance:
// window.KSMStore (set by app/main.js). Importing store.ts here would create a second, empty store.
// This file imports only React and types, never the store itself.
import { useMemo, useSyncExternalStore } from 'react';
import type { RootState } from './store.ts';

/** The part of a Redux store a selector subscription needs. */
export interface StoreLike<S> {
  getState(): S;
  subscribe(listener: () => void): () => void;
}

/** The app's store, as app/main.js puts it on window; undefined on pages without app.js (the overlay). */
export function windowStore(): StoreLike<RootState> | undefined {
  return (globalThis as { KSMStore?: StoreLike<RootState> }).KSMStore;
}

/**
 * A getSnapshot for useSyncExternalStore that runs `selector` only when the store's state object changed, and
 * returns the previous result when the new one is `isEqual` to it, so an unrelated dispatch does not re-render.
 */
export function selectionSnapshot<S, T>(
  getState: () => S,
  selector: (state: S) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): () => T {
  let has = false;
  let lastState: S;
  let lastSelection: T;
  return () => {
    const state = getState();
    if (has && Object.is(state, lastState)) return lastSelection;
    const next = selector(state);
    lastState = state;
    if (has && isEqual(lastSelection, next)) return lastSelection;
    has = true;
    lastSelection = next;
    return next;
  };
}

/**
 * Reads the store through `selector` and re-renders when its result changes. Keep the selector stable (a
 * module-level function, or useCallback): a new selector function starts a new subscription snapshot.
 * The result is frozen store data: read it, never change it; change it only by dispatching an action.
 */
export function useStoreSelector<T>(
  selector: (state: RootState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
  store: StoreLike<RootState> | undefined = windowStore(),
): T {
  if (!store) throw new Error('useStoreSelector: no store (window.KSMStore is set by app.js)');
  const getSnapshot = useMemo(() => selectionSnapshot(() => store.getState(), selector, isEqual), [store, selector, isEqual]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
