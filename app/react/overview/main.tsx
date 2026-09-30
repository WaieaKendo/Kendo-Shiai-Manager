// The Overview screen (#director, nav "Overview"): one React island in the legacy page
// (index.html, loaded with the court screen, Live Scores, the TV and Results by
// app/react/main.tsx; the build lists its files in the service worker's APP_SHELL, so an offline
// device has them): the contents of #director .director-dashboard. The legacy code computes what
// is shown; renderDirector() publishes it (app/js/39-react-overview.js) and, while this island is
// mounted, never writes these elements (M.13).
import { mountIsland } from '../island.tsx';
import { Overview } from './Overview.tsx';

interface LegacyWindow {
  /** Set here once the island is mounted; renderDirector() hands over to it. */
  ksmOverviewMounted?: boolean;
}

const dashboard = document.querySelector('#director .director-dashboard');
if (!dashboard) throw new Error('KSM Overview: #director .director-dashboard is missing');

// renderDirector() may have published already (the island starts from the last publish);
// otherwise it draws the static markup.
mountIsland(dashboard, <Overview />);
(window as unknown as LegacyWindow).ksmOverviewMounted = true;
