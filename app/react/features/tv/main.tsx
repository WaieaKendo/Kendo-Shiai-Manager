// The TV display (#tv #tvLive, shown on a ?view=tv device): one React island in the legacy page
// (index.html, loaded with the court screen and Live Scores by app/react/main.tsx; the build lists
// its files in the service worker's APP_SHELL, so an offline TV has it). The legacy code chooses
// the TV court's match; renderTvDisplay() only signals (ksm:tv, app/js/37-react-tv.js), publish.ts
// computes what is shown, and #tvLive is never written by legacy (M.13). If this module does not
// load, the legacy code shows a "TV display could not load" notice instead (37-react-tv.js, on
// DOMContentLoaded).
import { mountIsland } from '../../shared/lib/island.tsx';
import { startTvInput } from './publish.ts';
import { Tv } from './Tv.tsx';

interface LegacyWindow {
  /** Set here once the island is mounted; the legacy fallback notice checks it. */
  ksmTvMounted?: boolean;
}

const live = document.querySelector('#tv #tvLive');
if (!live) throw new Error('KSM TV display: #tv #tvLive is missing');

// Pull: the input is computed from the legacy app on every ksm:tv signal (and now, for one sent
// before this module ran); started before mounting so it runs ahead of the island's own listener.
// The island starts from the last input.
startTvInput();
mountIsland(live, <Tv />);
(window as unknown as LegacyWindow).ksmTvMounted = true;
