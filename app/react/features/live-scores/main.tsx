// The Live Scores screen (#public): one React island in the legacy page (index.html, loaded with
// the court screen by app/react/main.tsx; the build lists its files in the service worker's
// APP_SHELL, so an offline device has it). The legacy code only signals (renderPublic() ->
// ksm:live-scores, app/js/36-react-live-scores.js); publish.ts chooses each court's match and
// computes what is shown, and #publicLive is never written by legacy (M.13). If this module does
// not load, the legacy code shows a "Live Scores could not load" notice instead
// (36-react-live-scores.js, on DOMContentLoaded).
import { mountIsland } from '../../shared/lib/island.tsx';
import { startLiveScoresInput } from './publish.ts';
import { LiveScores } from './LiveScores.tsx';

interface LegacyWindow {
  /** Set here once the island is mounted; the legacy fallback notice checks it. */
  ksmLiveScoresMounted?: boolean;
}

const live = document.querySelector('#public #publicLive');
if (!live) throw new Error('KSM Live Scores: #public #publicLive is missing');

// Pull: the input is computed from the legacy app on every ksm:live-scores signal (and now, for
// one sent before this module ran); started before mounting so it runs ahead of the island's own
// listener. The island starts from the last input.
startLiveScoresInput();
mountIsland(live, <LiveScores />);
(window as unknown as LegacyWindow).ksmLiveScoresMounted = true;
