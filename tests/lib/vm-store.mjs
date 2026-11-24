// A real store for a vm test (#15 item 14b). A vm test runs the app's own functions (cut out by tests/lib/ksm-source.mjs)
// in a context whose globals it supplies; since the app's `state` is a set of getters over the store, the context gets
// the same: a store of its own (createKsmStore()), a `state` built from the app's literal and wired to it exactly as
// app-state.js wires the app's (wireState()), the store's `dispatch` / `getState` / `holdNotifications` and its action
// creators as globals. The match writes, the court pointers and history helpers, `historyKeyOrder()` and the rest are the
// app's own source (withDependencies() finds them), so a write lands in the store as in the app, and a write the
// conversion missed throws (strict mode). Nothing here is shared between contexts: each call makes a new store.
import * as storeApi from '../../app/store/index.ts';
import {
  freshState, ksmLoadTournamentState, stateFieldIsDerived, storeFieldPath, storeWrites, wireState,
} from '../../app/modules/app-state.js';
import { assignStoreKeys } from './store-keys.mjs';

// The store API names a vm context sees as globals (the bound ones are set below, per store).
const BOUND = new Set(['createKsmStore', 'dispatch', 'getState', 'holdNotifications', 'subscribe', 'store']);

/**
 * Gives `context` a real store and a `state` over it. `initial`: a tournament (a saved snapshot's keys) loaded into it as
 * a load does (ksmLoadTournamentState(): store keys to the store in one tournament/loaded, the plain ones assigned in
 * the payload's order). `developmentChecks: false` is the production store (no immutability check: a test of legacy code that
 * writes in place runs strict mode off too). Returns { store, state, load }: `load(payload)` loads another one into the same store.
 * The names it defines on the context are `vmStoreNames(context)`: a test passes them to withDependencies()'s `exclude`
 * (they are the context's own, not app functions to cut out of the source).
 */
export function vmStore(context, initial = null, { developmentChecks = true } = {}) {
  const store = storeApi.createKsmStore(undefined, { developmentChecks });
  const state = freshState();
  wireState(state, store);
  const load = payload => ksmLoadTournamentState(payload, state);
  const own = {
    state,
    dispatch: action => store.dispatch(action),
    getState: () => store.getState(),
    holdNotifications: fn => store.hold(fn),
    subscribe: listener => store.subscribe(listener),
    // The app's own helpers over this `state` (the app's source for them would read the app's module-level one).
    storeFieldPath: (key, target = state) => storeFieldPath(key, target),
    stateFieldIsDerived: (key, target = state) => stateFieldIsDerived(key, target),
    storeWrites: (partial, target = state) => storeWrites(partial, target),
    ksmLoadTournamentState: (loaded, target = state) => ksmLoadTournamentState(loaded, target),
    assignStoreKeys: (partial, target = state) => assignStoreKeys(partial, target),
    // No cloud session in a vm test: the action meta carries no device.
    settingsMeta: () => ({ device: '' }),
  };
  for (const [name, value] of Object.entries(storeApi)) if (!BOUND.has(name) && !(name in own)) own[name] = value;
  Object.assign(context, own);
  /**
   * Changes the tournament as a test's setup would have by writing into `state`: `mutate` edits a copy of the saved
   * snapshot, which is then loaded (the changed store keys go in one tournament/loaded; the device keys are not touched).
   * The store's data is frozen here, as in the app's tests: a write into `state` itself throws.
   */
  const edit = mutate => { const draft = JSON.parse(JSON.stringify(state)); mutate(draft); load(draft); };
  if (initial) {
    load(initial);
    // A device's own view (a load never sets these): set the way the app does, through the device actions.
    const d = storeApi.deviceSlice.actions;
    const views = [['currentCourt', d.courtChosen], ['publicCourt', d.publicCourtChanged], ['currentDivision', d.divisionShown], ['poolViewDivision', d.poolViewDivisionChanged],
      ['regMode', d.registrationTabChanged], ['current', d.matchShown]];
    for (const [key, action] of views) if (initial[key] !== undefined && initial[key] !== state[key]) store.dispatch(action(initial[key]));
    if (initial.score && JSON.stringify(initial.score) !== JSON.stringify(state.score)) store.dispatch(d.scoreChanged({ court: state.currentCourt || 'A', score: initial.score }));
  }
  return { store, state, load, edit };
}
