// The Tournament Library, the home page (#home, body.ksm-home): one React island in the legacy page
// (index.html, loaded with the court screen, Live Scores, the TV, Results and the Overview by
// app/react/main.tsx; the build lists its files in the service worker's APP_SHELL, so an offline
// device has them): the contents of #home .home-shell. The legacy code computes what is shown;
// renderHomeTournamentLibrary() signals it through paintHomeTournamentLibrary()
// (app/js/40-react-library.js; publish.ts computes the data) and never writes these elements (M.13). If this module does not
// load, the legacy code shows a "Tournament Library could not load" notice instead
// (40-react-library.js, on DOMContentLoaded).
import { mountIsland } from '../../shared/lib/island.tsx';
import { Library } from './Library.tsx';
import { startLibraryInput } from './publish.ts';

interface LegacyWindow {
  /** Set here once the island is mounted; the legacy code checks it. */
  ksmLibraryMounted?: boolean;
}

const shell = document.querySelector('#home .home-shell');
if (!shell) throw new Error('KSM Tournament Library: #home .home-shell is missing');

// The app boots to the library (showHomePage()) before this module runs, so the input is computed
// from its last request now (startLibraryInput(), before the island mounts so it runs ahead of the
// island's listener) and the island starts from it; otherwise it draws the static markup.
startLibraryInput();
mountIsland(shell, <Library />);
(window as unknown as LegacyWindow).ksmLibraryMounted = true;
