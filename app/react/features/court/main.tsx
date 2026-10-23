// The court (scorekeeper) screen: React islands in the legacy page (index.html; the build adds
// this module after app.js and lists its files in the service worker's APP_SHELL, so an offline
// device has it). The legacy code chooses the court's match and division, computes what is shown
// and runs the actions; it publishes plain data for each island (app/js/35-react-court.js) and
// never writes the court screen itself (M.8). The static court markup in index.html only holds
// the mount points until this module runs. If this module does not load, the legacy code shows
// a "court screen not loaded" notice instead (35-react-court.js, on DOMContentLoaded).
import { mountIsland } from '../../shared/lib/island.tsx';
import { CourtActions, CourtScoreButtons } from './CourtActions.tsx';
import { CourtComplete } from '../../shared/ui/CourtComplete.tsx';
import { CourtContext } from '../../shared/ui/CourtContext.tsx';
import { CourtHeader } from './CourtHeader.tsx';
import { CourtQueue } from './CourtQueue.tsx';
import { CourtScoreboard } from './CourtScoreboard.tsx';

interface LegacyWindow {
  /** Set here once the islands are mounted; the legacy fallback notice checks it. */
  ksmCourtScreenMounted?: boolean;
  renderDivisions?: () => void;
  renderQueue?: () => void;
  renderContext?: () => void;
  renderScore?: () => void;
  updateUndoButton?: () => void;
}

const legacy = window as unknown as LegacyWindow;
const required = <T,>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) throw new Error(`KSM court screen: ${what} is missing`);
  return value;
};
const el = (selector: string) => required(document.querySelector(selector), selector);
const fn = (f: (() => void) | undefined, name: string) => required(f, `${name}()`);

const card = el('#score .scoreboard-card');
const header = el('#score .scoreboard-header');
const scoreboard = el('#score .scoreboard-match');
const controls = el('#score .score-controls-grid');
const actions = el('#score .bottom-action-row');
const context = el('#score #courtContext');
const queue = el('#score #queue');

// The legacy writers have published since app.js started (the islands read the last published
// data when they mount); run them once more, in the order the islands used to take over, so
// every island starts from the current court.
fn(legacy.renderDivisions, 'renderDivisions')();
fn(legacy.renderScore, 'renderScore')();
fn(legacy.updateUndoButton, 'updateUndoButton')();
fn(legacy.renderQueue, 'renderQueue')();
fn(legacy.renderContext, 'renderContext')();

// The division-complete panel is a portal into the scoreboard card (see CourtComplete), so this
// island's own container stays out of the page.
mountIsland(document.createElement('div'), <CourtComplete card={card} />);
mountIsland(header, <CourtHeader />);
mountIsland(scoreboard, <CourtScoreboard />);
mountIsland(controls, <CourtScoreButtons />);
mountIsland(actions, <CourtActions />);
mountIsland(context, <CourtContext />);
mountIsland(queue, <CourtQueue />);
legacy.ksmCourtScreenMounted = true;
