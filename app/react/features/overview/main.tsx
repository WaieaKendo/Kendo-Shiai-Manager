// The Overview screen (#director, nav "Overview"): one React island in the legacy page
// (index.html, loaded with the court screen, Live Scores, the TV and Results by
// app/react/main.tsx; the build lists its files in the service worker's APP_SHELL, so an offline
// device has them): the contents of #director .director-dashboard. The legacy code only signals
// (renderDirector() -> ksmRenderOverview() dispatches ksm:overview, app/js/39-react-overview.js);
// publish.ts computes what is shown and these elements are never written by legacy (M.13). If this module does not load, the legacy code shows an "Overview could not
// load" notice instead (39-react-overview.js, on DOMContentLoaded).
import { mountIsland } from '../../shared/lib/island.tsx';
import { Overview } from './Overview.tsx';
import { startOverviewInput } from './publish.ts';

interface LegacyWindow {
  /** Set here once the island is mounted; the legacy fallback notice checks it. */
  ksmOverviewMounted?: boolean;
}

const dashboard = document.querySelector('#director .director-dashboard');
if (!dashboard) throw new Error('KSM Overview: #director .director-dashboard is missing');

// Pull: the island computes its input from the legacy app on every ksm:overview signal (and now,
// if renderDirector() signalled before this module ran); otherwise it draws the static markup.
startOverviewInput();
mountIsland(dashboard, <Overview />);
(window as unknown as LegacyWindow).ksmOverviewMounted = true;
