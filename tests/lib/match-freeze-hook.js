// #15 PR 13c-1 (docs/STORE.md section 3 item 13): the page as PR 13c-2 will leave it, with `allMatches` still plain.
// Evaluated in a page (page.evaluate(source)) after the app loaded: from then on the map, every division's list and every
// match are frozen copies (new objects, the same values), replaced by new frozen copies at every point where 13c-2
// dispatches: every write through app/modules/court/match-writes.js (the helpers call globalThis.KSMTestMatchWrite: at
// 'before' the matches are thawed into new unfrozen copies, the helper writes them, at 'after' they are copied and frozen
// again), every store notification (a load's legacy/stateReplaced brings a new plain map), every app event
// (window.dispatchEvent: the render signals) and just before a court action's body (KSMTestBeforeCourtAction).
// So:
//   - a write that does not go through the helpers (an assignment to the map, a list method on a division's list, a field
//     written on a held match) throws a TypeError (the app's modules are strict), as it will on the store's frozen data;
//   - an object read before a write keeps its old values (it is frozen, the write went to new objects): code that holds a
//     match, a list or the map across a write and reads it after sees what 13c-2 will show it. The tests compare such a
//     page with one without the hook.
// window.__matchWrites counts the helpers' writes, window.__matchCopies every copy.
() => {
  const st = KSMTest.app.state;
  const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) freeze(v[k]); } return v; };
  const copyMap = () => {
    const all = st.allMatches;
    if (!all || typeof all !== 'object') return null;
    const next = {};
    for (const d of Object.keys(all)) next[d] = Array.isArray(all[d]) ? all[d].map(m => (m && typeof m === 'object' ? structuredClone(m) : m)) : structuredClone(all[d]);
    return next;
  };
  let writing = 0;
  const frozen = () => { if (writing) return; const next = copyMap(); if (next) st.allMatches = freeze(next); window.__matchCopies = (window.__matchCopies || 0) + 1; };
  window.__freezeMatches = frozen;
  window.KSMTestMatchWrite = where => {
    if (where === 'before') { writing++; if (writing === 1) { const next = copyMap(); if (next) st.allMatches = next; } return; }
    writing--;
    window.__matchWrites = (window.__matchWrites || 0) + 1;
    frozen();
  };
  window.KSMTestBeforeCourtAction = () => frozen();
  window.KSMStore.subscribe(frozen);
  const dispatch = window.dispatchEvent;
  window.dispatchEvent = function (event) { frozen(); return dispatch.call(this, event); };
  frozen();
}
