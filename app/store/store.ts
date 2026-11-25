// The Redux Toolkit store (#15 step 2.8, decision of 2026-10-18). app.js imports it (window.KSMStore); no `state` field
// is in it yet: docs/STORE.md is the migration plan.
// No RTK Query, no thunks: the sync adapter stays our own code, and reducers stay thin (they call app/engine).
import { combineReducers, configureStore, type Reducer, type UnknownAction } from '@reduxjs/toolkit';
import { applyStoreWrites, legacyFieldAssigned, type StoreWrite } from './legacy.ts';
import { deviceSlice } from './slices/device.ts';
import { tournamentSlice, withTeamCourt } from './slices/tournament.ts';

const slicesReducer = combineReducers({
  tournament: tournamentSlice.reducer,
  device: deviceSlice.reducer,
});

export type RootState = ReturnType<typeof slicesReducer>;

/**
 * The slices, plus the store writes (app/store/legacy.ts: applyStoreWrites()): a load (tournament/loaded, #15 item 14a)
 * and a stray assignment in production put a value at a path, whichever slice it is in; so do the court history and
 * match actions and an Undo/Redo's store-owned keys (#15 PR 13b: court/undo, court/redo, whose `writes` land in the same
 * dispatch as the history move). An action carries `payload.writes` only for this (tests/store/court-history.test.mjs
 * checks the action types that do). Last, the one derived value the tournament slice
 * keeps in place: `divisionCourts['Team Tournament']` is `settings.teamCourt` (withTeamCourt()).
 */
export const rootReducer: Reducer<RootState, UnknownAction, Partial<RootState>> = (state, action) => {
  let next = slicesReducer(state, action);
  const writes = (action as { payload?: { writes?: StoreWrite[] } }).payload?.writes;
  if (legacyFieldAssigned.match(action)) next = applyStoreWrites(next, [{ path: action.payload.path, value: action.payload.value }]);
  else if (writes) next = applyStoreWrites(next, writes);
  const tournament = withTeamCourt(next.tournament);
  return tournament === next.tournament ? next : { ...next, tournament };
};

/** Options of createKsmStore(). */
export interface KsmStoreOptions {
  /**
   * RTK's development checks (the immutability and serializable-action checks). Default: on. They exist only where
   * NODE_ENV is not 'production' (the Node tests); app.js bundles the store built with NODE_ENV 'production', which
   * leaves them out whatever this says (docs/STORE.md section 5). `false` gives a Node test the store app.js has.
   */
  developmentChecks?: boolean;
}

/**
 * A new store. The app uses the one `store` below; tests make their own.
 * The default middleware is RTK's development checks only: thunks are off, and the immutability and
 * serializable-action checks run where NODE_ENV is not 'production' (the Node tests; app.js bundles the store built
 * with NODE_ENV 'production', which leaves the checks out, see docs/STORE.md section 5).
 */
export function createKsmStore(preloadedState?: Partial<RootState>, { developmentChecks = true }: KsmStoreOptions = {}) {
  const base = configureStore({
    reducer: rootReducer,
    middleware: getDefaultMiddleware => getDefaultMiddleware({
      thunk: false,
      serializableCheck: developmentChecks,
      immutableCheck: developmentChecks,
    }),
    devTools: false,
    ...(preloadedState ? { preloadedState } : {}),
  });
  // The subscribers, notified after each dispatch as Redux does, except inside hold() (#15 PR 13c-2): there a listener
  // only notes that it was skipped, and the end of the outermost hold() runs each listener once (no action: the last
  // action a listener saw dispatched is the step's own last one).
  let held = 0, missed = false;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) listener(); };
  base.subscribe(() => { if (held) missed = true; else notify(); });
  return Object.assign(base, {
    subscribe(listener: () => void): () => void {
      const own = () => listener();
      listeners.add(own);
      return () => { listeners.delete(own); };
    },
    /**
     * Runs `fn`; the dispatches inside it change the state at once (getState() is new right after each), but the
     * subscribers are notified once, when the outermost hold() ends, if anything was dispatched (also when `fn`
     * throws). A court action, an Undo/Redo and a structural step (a division's draw, a No Show, a grand champion's
     * draw cleared) run inside one, so no subscriber sees a bout finished whose bracket node has not got its winner yet,
     * a pointer on a bout that the same step is about to move off, or a division half drawn (docs/STORE.md section 3
     * item 13, PR 13c-2). Nested holds notify once, at the outermost end; a hold with no dispatch notifies nothing. When
     * `fn` throws, its error is the one thrown: a listener that throws in that flush is reported on its own (an
     * unhandled rejection), never in place of it. Since #15 item 14a the islands' "state changed" ping is
     * this subscription (it replaced the `ksm:state-changed` window event), so a held step re-renders them once.
     */
    hold<T>(fn: () => T): T {
      held++;
      let ok = false;
      try { const out = fn(); ok = true; return out; } finally {
        // (After a throw in `fn`, a listener's own error is reported as an unhandled rejection, not thrown over `fn`'s.)
        if (!--held && missed) { missed = false; try { notify(); } catch (error) { if (ok) throw error; void Promise.reject(error); } }
      }
    },
  });
}

export type KsmStore = ReturnType<typeof createKsmStore>;
export type AppDispatch = KsmStore['dispatch'];

/** The app's one store (app.js). The React islands are a separate bundle and reach it through window.KSMStore. */
export const store: KsmStore = createKsmStore();

// For legacy code (app/modules): plain functions, so a call site needs no `store.` and the methods can be passed around.
export const dispatch: AppDispatch = action => store.dispatch(action);
export const getState = (): RootState => store.getState();
export const subscribe = (listener: () => void): (() => void) => store.subscribe(listener);
/** store.hold(): `fn`'s dispatches notify the subscribers once, at its end. */
export const holdNotifications = <T>(fn: () => T): T => store.hold(fn);
