// The React screens of the app page (index.html): the build adds this module after app.js and
// lists its files in the service worker's APP_SHELL, so an offline device has them (see
// vite.config.js). Each screen, and the shell (navigation, header, dialogs), mounts its islands
// into the legacy page's markup.
import './court/main.tsx';
import './live-scores/main.tsx';
import './tv/main.tsx';
import './results/main.tsx';
import './overview/main.tsx';
import './library/main.tsx';
import './pools/main.tsx';
import './setup/main.tsx';
import './registration/main.tsx';
import './shell/main.tsx';
