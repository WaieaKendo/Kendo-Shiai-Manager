// Court screen islands in the legacy app (index.html; the build adds this module after
// app.js). The React court screen (M.8) replaces the legacy court screen piece by piece.
// When this module does not load (e.g. an offline device whose cache predates it) the
// legacy renderer keeps drawing everything.
import { mountIsland } from '../island.tsx';
import { CourtActions, CourtScoreButtons } from './CourtActions.tsx';
import { CourtHeader } from './CourtHeader.tsx';
import { CourtScoreboard } from './CourtScoreboard.tsx';

interface LegacyWindow {
  ksmReactScoreboard?: boolean;
  ksmReactCourtHeader?: boolean;
  ksmReactCourtActions?: boolean;
  renderDivisions?: () => void;
  renderScore?: () => void;
  updateUndoButton?: () => void;
}

const legacy = window as unknown as LegacyWindow;
const header = document.querySelector('#score .scoreboard-header');
const scoreboard = document.querySelector('#score .scoreboard-match');
if (header && scoreboard && typeof legacy.renderScore === 'function' && typeof legacy.renderDivisions === 'function') {
  // From now on renderDivisions() and renderScore() publish the header and scoreboard
  // instead of writing their elements; run them once so the islands start with the current
  // court. (The header starts from what the legacy renderer drew, see ksmPublishCourtHeader.)
  legacy.ksmReactScoreboard = true;
  legacy.ksmReactCourtHeader = true;
  legacy.renderDivisions();
  legacy.renderScore();
  mountIsland(header, <CourtHeader />);
  mountIsland(scoreboard, <CourtScoreboard />);
}
const controls = document.querySelector('#score .score-controls-grid');
const actions = document.querySelector('#score .bottom-action-row');
if (controls && actions && typeof legacy.updateUndoButton === 'function') {
  // The score buttons have no legacy writer. From now on updateUndoButton() publishes Undo and
  // Redo instead of writing #undoBtn/#redoBtn; run it once for the current court's history.
  legacy.ksmReactCourtActions = true;
  legacy.updateUndoButton();
  mountIsland(controls, <CourtScoreButtons />);
  mountIsland(actions, <CourtActions />);
}
