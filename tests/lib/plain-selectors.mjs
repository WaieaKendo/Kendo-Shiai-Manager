// A vm test that runs app code on a plain object standing in for `state` (the tests of the 4.0 / pre-move code): the
// selectors a module reads through (app/modules/selectors.js) and a `getState()` over that object, flat as it is: it is the
// `tournament` slice, and its device keys (current, score) are the `device` slice's (#15 item 14c). A test that runs the
// app's code on a real store uses vmStore() (tests/lib/vm-store.mjs) instead.
import * as storeApi from '../../app/store/index.ts';
import * as selectorApi from '../../app/modules/selectors.js';

/** @param {object} context a vm context object (before or after vm.createContext()) with a `state` key @returns the context */
export function plainSelectors(context) {
  const view = () => {
    const st = context.state || {};
    return {
      tournament: st,
      device: { currentCourt: st.currentCourt, currentDivision: st.currentDivision, poolViewDivision: st.poolViewDivision, regMode: st.regMode,
        currentMatchIndex: st.current, activeScore: { [st.currentCourt || 'A']: st.score } },
    };
  };
  Object.assign(context, selectorApi, { selectDevice: storeApi.selectDevice, selectTournament: storeApi.selectTournament, getState: view });
  return context;
}
