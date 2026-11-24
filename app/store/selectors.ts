// The two slices as selectors (#15 item 14c, docs/STORE.md section 3): every other selector is a function of these two
// and lives with the app code (app/modules/selectors.js), where the bundler mangles the names: an export of the store
// bundle keeps its name, ~14 bytes gzip each, and the store is at its budget (section 5).
import type { RootState } from './store.ts';
export const selectDevice = (s: RootState) => s.device;
export const selectTournament = (s: RootState) => s.tournament;
