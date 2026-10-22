// The React screens of the app page (index.html): the build adds this module after app.js and
// lists its files in the service worker's APP_SHELL, so an offline device has them (see
// vite.config.js). Each screen, and the shell (navigation, header, dialogs), mounts its islands
// into the legacy page's markup.
import './features/court/main.tsx';
import './features/live-scores/main.tsx';
import './features/tv/main.tsx';
import './features/results/main.tsx';
import './features/overview/main.tsx';
import './features/library/main.tsx';
import './features/pools/main.tsx';
import './features/setup/main.tsx';
import './features/registration/main.tsx';
import './features/shell/main.tsx';
