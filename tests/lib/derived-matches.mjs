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
    ...pointerHelpers(context),
    ...historyHelpers(context),
  };
}
/**
 * #15 PR 13a: the court pointers are store data in the app, written through ksmMoveCourtPointers()
 * (app/modules/court/court-pointers-store.js). In a vm test whose `state` is `context.state` it sets the entries the
 * same way the reducer does (a missing map is created; each named entry is set; the others stay). Exclude
 * 'ksmMoveCourtPointers' from withDependencies(); ksmCourtPointer() / ksmResolveCourts() can be the app's own.
 */
export function pointerHelpers(context) {
  return {
    ksmMoveCourtPointers(type, pointers) {
      (context.pointerActions ||= []).push(type);
      for (const key of ['currentByDivision', 'courtState', 'courtActiveDivision']) if (pointers[key]) Object.assign(context.state[key] ||= {}, pointers[key]);
    },
  };
}
/**
 * #15 PR 13b: the court history is store data in the app, written through app/modules/court/court-history-store.js. In a
 * vm test whose `state` is `context.state` these do what those actions do to it (the same lists, the same limits); the
 * store-owned keys an Undo/Redo changed go through `context.assignStoreKeys` when there are any (a test that makes a
 * key a getter gives it tests/lib/store-keys.mjs; the app sends them in its court/undo or court/redo). Exclude 'ksmRecordCourtAction', 'ksmMoveCourtHistory', 'ksmSetCourtHistories' from
 * withDependencies() (HISTORY_HELPERS).
 */
export const HISTORY_HELPERS = ['ksmRecordCourtAction', 'ksmMoveCourtHistory', 'ksmSetCourtHistories'];
export function historyHelpers(context) {
  const map = key => (context.state[key] ||= { A: [], B: [] });
  const list = (key, court) => { const m = map(key); return Array.isArray(m[court]) ? m[court] : (m[court] = []); };
  const push = (key, court, entry, limit) => { const l = list(key, court); l.push(entry); if (l.length > limit) l.splice(0, l.length - limit); };
  return {
    ksmRecordCourtAction(court, entry) { push('courtActionHistory', court, entry, 100); map('courtRedoHistory')[court] = []; },
    ksmMoveCourtHistory(kind, court, log, values) {
      const [from, to] = kind === 'undo' ? ['courtActionHistory', 'courtRedoHistory'] : ['courtRedoHistory', 'courtActionHistory'];
      const action = list(from, court).pop();
      if (action) push(to, court, action, 100);
      push('courtUndoLog', court, log, 40);
      if (Object.keys(values).length) context.assignStoreKeys(values, context.state);
    },
    ksmSetCourtHistories(type, lists) { Object.assign(context.state, lists); },
  };
}
