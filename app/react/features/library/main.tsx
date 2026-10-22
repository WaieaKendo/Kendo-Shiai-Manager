// The Tournament Library, the home page (#home, body.ksm-home): one React island in the legacy page
// (index.html, loaded with the court screen, Live Scores, the TV, Results and the Overview by
// app/react/main.tsx; the build lists its files in the service worker's APP_SHELL, so an offline
// device has them): the contents of #home .home-shell. The legacy code computes what is shown;
// renderHomeTournamentLibrary() publishes it through paintHomeTournamentLibrary()
// (app/js/40-react-library.js) and never writes these elements (M.13). If this module does not
// load, the legacy code shows a "Tournament Library could not load" notice instead
// (40-react-library.js, on DOMContentLoaded).
import { mountIsland } from '../island.tsx';
import { Library } from './Library.tsx';

interface LegacyWindow {
  /** Set here once the island is mounted; the legacy code checks it. */
  ksmLibraryMounted?: boolean;
}

const shell = document.querySelector('#home .home-shell');
if (!shell) throw new Error('KSM Tournament Library: #home .home-shell is missing');

// The app boots to the library (showHomePage()) before this module runs, so the island starts
// from the last publish; otherwise it draws the static markup.
mountIsland(shell, <Library />);
(window as unknown as LegacyWindow).ksmLibraryMounted = true;
