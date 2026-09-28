// The TV display (#tv #tvLive, shown on a ?view=tv device): one React island in the legacy page
// (index.html, loaded with the court screen and Live Scores by app/react/main.tsx; the build lists
// its files in the service worker's APP_SHELL, so an offline TV has it). The legacy code chooses
// the TV court's match and what is shown; renderTvDisplay() publishes it
// (app/js/37-react-tv.js) instead of writing #tvLive (M.13).
import { mountIsland } from '../island.tsx';
import { Tv } from './Tv.tsx';

interface LegacyWindow {
  /** Set here once the island is mounted; renderTvDisplay() publishes to it from then on. */
  ksmTvMounted?: boolean;
  renderTvDisplay?: () => void;
}

const legacy = window as unknown as LegacyWindow;
const live = document.querySelector('#tv #tvLive');
if (!live) throw new Error('KSM TV display: #tv #tvLive is missing');

// A TV draws only after its tournament has loaded (after this module ran); if the legacy
// renderer drew before, take its markup out and publish the TV once more.
const drawn = live.firstChild !== null;
live.replaceChildren();
mountIsland(live, <Tv />);
legacy.ksmTvMounted = true;
if (drawn) legacy.renderTvDisplay?.();
