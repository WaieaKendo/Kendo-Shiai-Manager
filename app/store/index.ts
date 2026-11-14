// The store's public API for app code (app/main.js, app/modules). Never re-export react.ts here: app.js does not
// bundle React, and the islands import react.ts directly.
export { createKsmStore, dispatch, getState, rootReducer, store, subscribe } from './store.ts';
export type { AppDispatch, KsmStore, KsmStoreOptions, RootState } from './store.ts';
export { deviceSlice, DEVICE_SLICE_VERSION } from './slices/device.ts';
export type { ActiveScore, DeviceSliceState, LocalCourtDivisions, RegistrationTab } from './slices/device.ts';
export { tournamentSlice, TOURNAMENT_SLICE_VERSION } from './slices/tournament.ts';
export type { TournamentSliceState } from './slices/tournament.ts';
export {
  PRODUCTION_BUILD, applyStoreWrites, legacyFieldAssigned, legacyStateAssigned, legacyStateReplaced, setStoreStrict, storeIsStrict,
} from './legacy.ts';
export type { StoreWrite } from './legacy.ts';
export { actionMeta, metaCourt, withMeta } from './meta.ts';
export type { ActionMeta, ActionMetaInput, StoreCourt } from './meta.ts';
