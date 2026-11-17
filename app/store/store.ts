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
 * The slices, plus the store writes (app/store/legacy.ts): replaceState() / assignState() of app/modules/app-state.js and a
 * stray assignment in production put a value at a path, whichever slice it is in; so do an Undo/Redo's store-owned keys
 * (#15 PR 13b: court/undo, court/redo, whose `writes` land in the same dispatch as the history move the slice makes). An
 * action carries `payload.writes` only for this (legacy/stateReplaced, legacy/stateAssigned, court/undo, court/redo:
 * tests/store/court-history.test.mjs checks the action types that do). Last, the one derived value the tournament slice
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
  return configureStore({
    reducer: rootReducer,
    middleware: getDefaultMiddleware => getDefaultMiddleware({
      thunk: false,
      serializableCheck: developmentChecks,
      immutableCheck: developmentChecks,
    }),
    devTools: false,
    ...(preloadedState ? { preloadedState } : {}),
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
