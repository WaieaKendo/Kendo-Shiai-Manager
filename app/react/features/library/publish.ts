// The library's input, computed here from what the classic code signalled (was ksmRenderLibrary(),
// ksmLibraryCard() and ksmLocalDraftSummary() in app/js/40-react-library.js). Classic keeps the
// draft reading and the staff tokens; its ksmRenderLibrary(list, message) only records the request
// (window.ksmLibraryRequested) and dispatches ksm:library. Same output as the classic publisher
// gave, which tests/golden/library/*.json pin. Legacy is read only through shared/legacy.ts.
import { legacy } from '../../shared/legacy.ts';
import { LIBRARY_EVENT, type LibraryCardInput, type LibraryInput } from './library-model.ts';

/** What ksmRenderLibrary(list, message) asked for. */
export interface LibraryRequest {
  list: unknown;
  message: unknown;
}

interface LibraryPublishWindow {
  /** The input as last computed (the island and the golden test read it here). */
  ksmLibraryInput?: LibraryInput;
  /** Set by the classic signal stub; possibly from before this module ran (boot code signals first). */
  ksmLibraryRequested?: LibraryRequest;
  /** The error the last computation threw; the stub rethrows it to its caller (a listener's exception would be swallowed). */
  ksmLibraryError?: unknown;
}

const libraryWindow = (): LibraryPublishWindow => window as unknown as LibraryPublishWindow;

/** A cached or cloud library row (a cloud reply can hold anything). */
type LibraryRow = { id?: unknown; name?: unknown };

/** libraryCardMarkup(x) as data. */
export function ksmLibraryCard(x: LibraryRow): LibraryCardInput {
  return { id: String(x.id ?? ''), name: legacy('ksmText')(x.name) };
}

/** The local draft the library offers to restore or discard, or null. */
export function ksmLocalDraftSummary(): { name: string; saved: string } | null {
  const payload = legacy('ksmReadLocalDraft')();
  return payload ? { name: payload.setup?.tName || 'Untitled tournament', saved: payload.savedAt ? new Date(payload.savedAt).toLocaleString() : 'unknown time' } : null;
}

/**
 * paintHomeTournamentLibrary(list, message) as data: the cards, or the message when there are none.
 * It reads in the order the legacy renderer did (list.length, then each row's id and name), so a
 * reply that is not a list throws where it threw before.
 */
export function ksmLibraryInput(list: unknown, message: unknown): LibraryInput {
  const rows = list as LibraryRow[];
  const cards = rows.length ? rows.map(ksmLibraryCard) : [];
  const readOnly = legacy('isReadOnlySession');
  const activeId = legacy('ksmLegacyCloudSession')()?.tournamentId || '';
  return {
    kind: 'library', cards, message: legacy('ksmText')(message), draft: ksmLocalDraftSummary(), canManage: !readOnly(), activeId,
    hasActive: (!readOnly() || legacy('ksmKeepStaffOutbox')()) && !!(activeId || legacy('v316StaffPassword')()),
    authorizedIds: legacy('ksmLibraryAuthorizedIds')(),
  };
}

/**
 * Computes the input for the last request. The account hook (ksmDecorateLibraryInput(), which
 * 54-auth0-access.js reassigns) is looked up on this call. A failure is stored in ksmLibraryError and
 * the previous input stays, as when the classic code threw before it published.
 */
function refresh(): void {
  const w = libraryWindow();
  const request = w.ksmLibraryRequested;
  if (!request) return;
  try {
    w.ksmLibraryInput = legacy('ksmDecorateLibraryInput')(ksmLibraryInput(request.list, request.message));
  } catch (error) {
    w.ksmLibraryError = error;
  }
}

/**
 * Pull: computes the input on each ksm:library event, and once now when classic asked for it before
 * this module ran (the app boots to the library first). Call it before mounting, so it runs ahead of
 * the island's own listener (it redraws on the same event); it dispatches nothing, so there is no loop.
 */
export function startLibraryInput(): void {
  window.addEventListener(LIBRARY_EVENT, refresh);
  refresh();
}
