// #15 PR 7 (docs/STORE.md section 3 item 7): in the app, state.matches is a read-only getter derived from
// allMatches[currentDivision] (the live list, never a copy; [] while that division has none), state.current and
// state.score are written through ksmShowMatch() / ksmSetScore(). The vm tests run the app's functions on a plain
// `state`: these give that object the same derived `matches` and stand in for the helpers.

/** Makes `st.matches` the derived getter (an assignment is ignored, as the production path does). Returns `st`. */
export function deriveMatches(st) {
  const d = Object.getOwnPropertyDescriptor(st, 'matches');
  if (d && d.get) return st;
  // The getter keeps the key's place (as the app's does in its literal): the keys after it are re-added after it.
  const keys = Object.keys(st), at = keys.indexOf('matches');
  const later = at < 0 ? [] : keys.slice(at + 1).map(k => [k, st[k]]);
  delete st.matches;
  for (const [k] of later) delete st[k];
  Object.defineProperty(st, 'matches', {
    enumerable: true, configurable: true, set() {},
    get() { const list = st.currentDivision != null ? st.allMatches?.[st.currentDivision] : undefined; return Array.isArray(list) ? list : []; },
  });
  for (const [k, v] of later) st[k] = v;
  return st;
}
/** The PR 7 helpers for a vm context whose `state` is `context.state`. */
export function viewHelpers(context) {
  return {
    ksmShowMatch(i) { context.state.current = i; },
    ksmEmptyScore: () => ({ W: [], R: [], WT: 0, RT: 0 }),
    ksmSetScore(s) { context.state.score = { W: [...(s?.W || [])], R: [...(s?.R || [])], WT: s?.WT || 0, RT: s?.RT || 0 }; },
    ksmResetCourtPads() { context.state.current = 0; context.state.score = { W: [], R: [], WT: 0, RT: 0 }; },
  };
}
