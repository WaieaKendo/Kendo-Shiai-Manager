// The Redux Toolkit store (#15 step 2.8, decision of 2026-10-18). app.js imports it (window.KSMStore); no `state` field
// is in it yet: docs/STORE.md is the migration plan.
// No RTK Query, no thunks: the sync adapter stays our own code, and reducers stay thin (they call app/engine).
import { combineReducers, configureStore, type Reducer, type UnknownAction } from '@reduxjs/toolkit';
import { applyStoreWrites, legacyFieldAssigned, legacyStateAssigned, legacyStateReplaced } from './legacy.ts';
import { deviceSlice } from './slices/device.ts';
import { tournamentSlice } from './slices/tournament.ts';

const slicesReducer = combineReducers({
  tournament: tournamentSlice.reducer,
  device: deviceSlice.reducer,
});

export type RootState = ReturnType<typeof slicesReducer>;

/**
 * The slices, plus the legacy writes (app/store/legacy.ts): replaceState() / assignState() of app/modules/app-state.js
 * and a stray assignment in production put a value at a path, whichever slice it is in.
 */
export const rootReducer: Reducer<RootState, UnknownAction, Partial<RootState>> = (state, action) => {
  const next = slicesReducer(state, action);
  if (legacyFieldAssigned.match(action)) return applyStoreWrites(next, [{ path: action.payload.path, value: action.payload.value }]);
  if (legacyStateReplaced.match(action) || legacyStateAssigned.match(action)) return applyStoreWrites(next, action.payload.writes);
  return next;
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
