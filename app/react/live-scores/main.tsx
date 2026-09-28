// The Live Scores screen (#public): one React island in the legacy page (index.html, loaded with
// the court screen by app/react/main.tsx). The legacy code chooses each court's match and
// computes what is shown; renderPublic() publishes it (app/js/36-react-live-scores.js) and never
// writes #publicLive while this island is mounted (roadmap M.13).
import { mountIsland } from '../island.tsx';
import { LiveScores } from './LiveScores.tsx';

interface LegacyWindow {
  /** Set here once the island is mounted: renderPublic() then publishes instead of drawing. */
  ksmLiveScoresMounted?: boolean;
  renderPublic?: () => void;
}

const legacy = window as unknown as LegacyWindow;
const live = document.querySelector('#public #publicLive');
if (!live) throw new Error('KSM Live Scores: #public #publicLive is missing');
if (!legacy.renderPublic) throw new Error('KSM Live Scores: renderPublic() is missing');

mountIsland(live, <LiveScores />);
legacy.ksmLiveScoresMounted = true;
// Publish the current screen once: until now the legacy renderer drew it.
legacy.renderPublic();
