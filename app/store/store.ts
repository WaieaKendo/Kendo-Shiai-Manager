// The Redux Toolkit store (#15 step 2.8, decision of 2026-10-18). No consumers yet: docs/STORE.md is the migration plan.
// No RTK Query, no thunks: the sync adapter stays our own code, and reducers stay thin (they call app/engine).
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { deviceSlice } from './slices/device.ts';
import { tournamentSlice } from './slices/tournament.ts';

export const rootReducer = combineReducers({
  tournament: tournamentSlice.reducer,
  device: deviceSlice.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/**
 * A new store. The app uses the one `store` below; tests make their own.
 * The default middleware is RTK's development checks only: thunks are off, and the immutability and
 * serializable-action checks run where NODE_ENV is not 'production' (the Node tests; app.js bundles RTK's
 * browser build, which leaves the checks out, see docs/STORE.md).
 */
export function createKsmStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    middleware: getDefaultMiddleware => getDefaultMiddleware({
      thunk: false,
      serializableCheck: true,
      immutableCheck: true,
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
