// A test's direct write of `state` keys (#15 item 14a): what assignState() did before the app retired it. Store-owned
// keys go to the store in one dispatch (their values at their store paths, as storeWrites() gives them: the Setup's
// text rule included); a derived key (state.matches) is ignored; a plain key is assigned to `target`. The action type is
// the tests' own: the root reducer applies any action's `payload.writes` (app/store/store.ts), the app never sends it.
import { dispatch } from '../../app/store/index.ts';
import { state, stateFieldIsDerived, storeFieldPath, storeWrites } from '../../app/modules/app-state.js';

export const TEST_KEYS_ASSIGNED = 'test/storeKeysAssigned';

/** Assigns `partial`'s keys to `target` (default: the app's `state`). */
export function assignStoreKeys(partial, target = state) {
  const writes = storeWrites(partial, target);
  for (const [key, value] of Object.entries(partial)) if (!storeFieldPath(key, target) && !stateFieldIsDerived(key, target)) target[key] = value;
  if (writes.length) dispatch({ type: TEST_KEYS_ASSIGNED, payload: { writes } });
}
