// The Live Scores screen (#public): one React island in the legacy page (index.html, loaded with
// the court screen by app/react/main.tsx; the build lists its files in the service worker's
// APP_SHELL, so an offline device has it). The legacy code chooses each court's match and
// computes what is shown; renderPublic() publishes it (app/js/36-react-live-scores.js) and
// never writes #publicLive itself (M.13). If this module does not load, the legacy code shows a
// "Live Scores could not load" notice instead (36-react-live-scores.js, on DOMContentLoaded).
import { mountIsland } from '../island.tsx';
import { LiveScores } from './LiveScores.tsx';

interface LegacyWindow {
  /** Set here once the island is mounted; the legacy fallback notice checks it. */
  ksmLiveScoresMounted?: boolean;
}

const live = document.querySelector('#public #publicLive');
if (!live) throw new Error('KSM Live Scores: #public #publicLive is missing');

// renderPublic() has published since app.js started; the island starts from the last publish.
mountIsland(live, <LiveScores />);
(window as unknown as LegacyWindow).ksmLiveScoresMounted = true;
