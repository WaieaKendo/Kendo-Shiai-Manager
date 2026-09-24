// Court screen islands in the legacy app (index.html; the build adds this module after
// app.js). The React court screen (M.8) replaces the legacy court screen piece by piece.
// When this module does not load (e.g. an offline device whose cache predates it) the
// legacy renderer keeps drawing everything.
import { mountIsland } from '../island.tsx';
import { CourtScoreboard } from './CourtScoreboard.tsx';

interface LegacyWindow {
  ksmReactScoreboard?: boolean;
  renderScore?: () => void;
}

const legacy = window as unknown as LegacyWindow;
const scoreboard = document.querySelector('#score .scoreboard-match');
if (scoreboard && typeof legacy.renderScore === 'function') {
  // From now on renderScore() publishes the scoreboard instead of writing its elements;
  // run it once so the island starts with the current match.
  legacy.ksmReactScoreboard = true;
  legacy.renderScore();
  mountIsland(scoreboard, <CourtScoreboard />);
}
