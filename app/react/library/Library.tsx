// The Tournament Library's island: the contents of #home .home-shell (the brand, the heading with
// ＋ New Tournament, and #homeTournamentLibrary with the cards or the message), with the same
// elements, ids, classes and test IDs (home-new-tournament, home-tournament, home-tournament-name)
// as the static markup and the legacy renderer (paintHomeTournamentLibrary(), libraryCardMarkup())
// drew, so the library CSS and every test apply unchanged; tests/golden/library pins them.
// renderHomeTournamentLibrary() (app/js) publishes what to show (ksm:library). The buttons call the
// legacy functions the inline handlers called: createNewTournament() (its prompts are kept) and
// openTournamentFromHome(id). No colors of its own (the library CSS and theme tokens); the logo
// and the card mark come from the branding module.
import { useState, useSyncExternalStore } from 'react';
import { DEFAULT_HOME_LOGO_SRC, DEFAULT_LIBRARY_CARD_MARK } from '../court/branding.ts';
import {
  EMPTY_LIBRARY, HOME_SUBTITLE, HOME_TITLE, LIBRARY_HEADING, LIBRARY_INTRO, NEW_TOURNAMENT_TEXT,
  libraryView, type LibraryCardView, type LibraryInput,
} from './library-model.ts';

export const LIBRARY_EVENT = 'ksm:library';

interface LibraryWindow {
  /** The library as paintHomeTournamentLibrary() last published it. */
  ksmLibraryInput?: LibraryInput;
  ksmAuthMessage?: string;
  ksmAuthorizeLibraryTournament?: (id: string) => unknown;
  triggerLoadTournament?: () => void;
  ksmReturnFromLibrary?: () => void;
  ksmExportLibraryTournament?: (id: string, kind: string) => unknown;
  ksmDeleteLibraryTournament?: (id: string) => unknown;
  ksmOpenLocalDraft?: () => void;
  ksmDiscardLocalDraft?: () => void;
  createNewTournament?: () => unknown;
  openTournamentFromHome?: (id: string) => unknown;
}

const libraryWindow = (): LibraryWindow => window as unknown as LibraryWindow;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(LIBRARY_EVENT, onChange);
  return () => window.removeEventListener(LIBRARY_EVENT, onChange);
}
const snapshot = (): LibraryInput => libraryWindow().ksmLibraryInput ?? EMPTY_LIBRARY;

const authMessage = () => libraryWindow().ksmAuthMessage || '';
const subscribeAuthMessage = (listener: () => void) => {
  window.addEventListener('ksm:auth-message', listener);
  return () => window.removeEventListener('ksm:auth-message', listener);
};

/** libraryCardMarkup(x): the card and the name below it, both opening the tournament. */
function LibraryCard({ card, canManage, canDelete = true, accounts = false }: { card: LibraryCardView; canManage: boolean; canDelete?: boolean; accounts?: boolean }) {
  const open = () => { libraryWindow().openTournamentFromHome?.(card.id); };
  return (
    <div className="home-tournament-item" data-testid="home-tournament">
      <button className="home-tournament-card" type="button" onClick={open} aria-label={card.label}>
        <span className="home-card-placeholder" aria-hidden="true">{DEFAULT_LIBRARY_CARD_MARK}</span>
      </button>
      <button className="home-card-name-below" type="button" onClick={open} data-testid="home-tournament-name">{card.name}</button>
      {!canManage && !accounts && <button type="button" data-testid="library-staff-actions" onClick={() => libraryWindow().ksmAuthorizeLibraryTournament?.(card.id)}>Staff actions</button>}
      {canManage && <div className="home-card-actions">
        {accounts && <button type="button" data-testid="library-manage" onClick={open}>Manage</button>}
        <details data-testid="library-export"><summary>Export</summary><div className="actions">
          <button type="button" data-testid="library-export-brackets" onClick={() => libraryWindow().ksmExportLibraryTournament?.(card.id, 'brackets')}>Tournament Brackets</button>
          <button type="button" data-testid="library-export-results" onClick={() => libraryWindow().ksmExportLibraryTournament?.(card.id, 'results')}>Results &amp; Awards</button>
          <button type="button" data-testid="library-export-file" onClick={() => libraryWindow().ksmExportLibraryTournament?.(card.id, 'file')}>Tournament File / Archive (server copy)</button>
        </div></details>
        {canDelete && <button type="button" data-testid="library-delete" onClick={() => libraryWindow().ksmDeleteLibraryTournament?.(card.id)}>Delete</button>}
      </div>}
    </div>
  );
}

/** The contents of #home .home-shell. */
export function Library() {
  const input = useSyncExternalStore(subscribe, snapshot, () => EMPTY_LIBRARY);
  const view = libraryView(input);
  const signInError = useSyncExternalStore(subscribeAuthMessage, authMessage, () => '');
  const canManage = input.kind === 'library' && !!input.canManage;
  const activeId = input.kind === 'library' ? input.activeId ?? '' : '';
  const accounts = input.kind === 'library' && input.authEnabled;
  const admin = input.kind !== 'library' || input.canCreate !== false;
  const draft = input.kind === 'library' ? input.draft : null;
  const [discarding, setDiscarding] = useState(false);
  return (
    <>
      <div className="home-brand">
        <img src={DEFAULT_HOME_LOGO_SRC} alt="" />
        <div><h1 id="homeTitle">{HOME_TITLE}</h1><p>{HOME_SUBTITLE}</p></div>
        {accounts && <button type="button" data-testid="library-sign-in" onClick={() => window.dispatchEvent(new CustomEvent(input.accountEmail ? 'ksm:sign-out' : 'ksm:sign-in'))}>{input.accountEmail ? 'Sign out' : 'Sign in'}</button>}
      </div>
      {accounts && signInError && <p className="sub" role="alert" data-testid="auth0-error">Sign-in failed: {signInError}</p>}
      <div className="home-head">
        <div><h2>{accounts ? (input.kind === 'library' && input.accountEmail ? 'My tournaments & public tournaments' : 'Tournaments') : LIBRARY_HEADING}</h2><p>{accounts ? 'Open a public tournament to watch, or sign in to manage your tournaments.' : LIBRARY_INTRO}</p></div>
        <div className="actions">
        {input.kind === 'library' && input.hasActive && <button type="button" data-testid="library-return" onClick={() => libraryWindow().ksmReturnFromLibrary?.()}>Back to tournament</button>}
        {admin && <button type="button" data-testid="library-load-file" onClick={() => libraryWindow().triggerLoadTournament?.()}>Load Tournament File</button>}
        {admin && <button className="home-new-button" type="button" data-testid="home-new-tournament" onClick={() => { libraryWindow().createNewTournament?.(); }}>{NEW_TOURNAMENT_TEXT}</button>}
        </div>
      </div>
      {draft && <div className="home-empty" data-testid="local-draft">
        <b>Draft on this device: {draft.name}, saved {draft.saved}</b>
        <div className="actions">
          <button type="button" onClick={() => libraryWindow().ksmOpenLocalDraft?.()}>Open</button>
          {discarding ? <>
            <span>Discard this draft?</span>
            <button type="button" onClick={() => { libraryWindow().ksmDiscardLocalDraft?.(); setDiscarding(false); }}>Discard draft</button>
            <button type="button" onClick={() => setDiscarding(false)}>Cancel</button>
          </> : <button type="button" onClick={() => setDiscarding(true)}>Discard</button>}
        </div>
      </div>}
      <div id="homeTournamentLibrary" className="home-library-grid">
        {view.message !== null
          ? <div className="home-empty"><b>{view.message}</b></div>
          // The rows' order is the key: IDs may repeat (the cache and the cloud are not checked).
          : view.cards.map((card, i) => <LibraryCard key={i} card={card} accounts={!!accounts} canDelete={input.kind !== 'library' || input.canDelete !== false} canManage={(canManage && activeId === card.id) || (input.kind === 'library' && !!input.authorizedIds?.includes(card.id))} />)}
      </div>
    </>
  );
}
