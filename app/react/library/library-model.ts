// The Tournament Library, the home page the app boots to (#home, body.ksm-home): the KSM brand,
// "Your Tournaments" with ＋ New Tournament, and a card per tournament (a 🏆 card and the name
// below it, both opening the tournament in Spectator mode), or one line saying why there are none
// ("Loading tournaments…", "No tournaments yet.", the error and offline lines).
//
// The legacy app decides what is shown and when: renderHomeTournamentLibrary()
// (app/js/33-staff-session-and-library.js) shows the device's cache, then asks the cloud (the
// list, or discover with the cached IDs), and paintHomeTournamentLibrary() publishes a
// LibraryInput (ksm:library, app/js/40-react-library.js) wherever it painted before. The legacy
// renderer (paintHomeTournamentLibrary()'s DOM writing, libraryCardMarkup()) is mirrored here: its
// elements, classes and texts, which tests/golden/library (recorded from it) pins.

// ------------------------------------------------------------------------------ input

/** A cached or cloud library row as its card showed it. */
export interface LibraryCardInput {
  /** The tournament ID the card opens (String(x.id ?? ''), what jsArg() passed). */
  id: string;
  /** The name as esc() showed it (String(x.name || '')). */
  name: string;
}

export type LibraryInput =
  /** Nothing published yet: the static markup (an empty grid). */
  | { kind: 'empty' }
  | {
    kind: 'library';
    draft?: { name: string; saved: string } | null;
    /** The rows, in the order given; with none the message is shown instead. */
    cards: LibraryCardInput[];
    /** paintHomeTournamentLibrary()'s message, as esc() showed it. */
    message: string;
  };

// ------------------------------------------------------------------------------- view

export const EMPTY_LIBRARY: LibraryInput = { kind: 'empty' };

/** The static texts of the home page (app/index.html), which the island draws. */
export const HOME_TITLE = 'Kendo Shiai Manager';
export const HOME_SUBTITLE = 'Tournament Library';
export const LIBRARY_HEADING = 'Your Tournaments';
export const LIBRARY_INTRO = 'Create a new tournament or open an existing tournament in Spectator mode.';
export const NEW_TOURNAMENT_TEXT = '＋ New Tournament';

export interface LibraryCardView {
  id: string;
  name: string;
  /** The card button's aria-label ("Open <name>"). */
  label: string;
}

export interface LibraryView {
  cards: LibraryCardView[];
  /** The line shown instead of cards; null: the cards (or, before the first publish, an empty grid). */
  message: string | null;
}

/** A card's name when the tournament has none (the legacy card showed nothing, label "Open "; quirk pass). */
export const UNTITLED_NAME = 'Untitled tournament';

/** paintHomeTournamentLibrary(list, message): the cards, or the message when there are none. */
export function libraryView(input: LibraryInput): LibraryView {
  if (input.kind === 'empty') return { cards: [], message: null };
  if (!input.cards.length) return { cards: [], message: input.message };
  return {
    cards: input.cards.map(card => { const name = card.name.trim() ? card.name : UNTITLED_NAME; return { id: card.id, name, label: `Open ${name}` }; }),
    message: null,
  };
}
