// The Pools view (Registration -> Pools): one React island in the legacy page (index.html, loaded
// with the other screens by app/react/main.tsx; the build lists its files in the service worker's
// APP_SHELL, so an offline device has them): the contents of #poolOutput. The legacy code computes
// what is shown; renderPools() and toggleEditPools() publish it (app/js/41-react-pools.js) and
// never write these elements (M.13). The division select, Regenerate and #poolOutput's class stay
// legacy. If this module does not load, the legacy code shows a "Pools could not load" notice
// instead (41-react-pools.js, on DOMContentLoaded).
import { mountIsland } from '../island.tsx';
import { PoolOutput } from './Pools.tsx';

interface LegacyWindow {
  /** Set here once the island is mounted; the legacy fallback notice checks it. */
  ksmPoolsMounted?: boolean;
}

const output = document.querySelector('#poolsReg #poolOutput');
if (!output) throw new Error('KSM Pools: #poolsReg #poolOutput is missing');

// renderPools() has published since app.js started (renderAll() at boot); the island starts from
// the last publish.
mountIsland(output, <PoolOutput />);
(window as unknown as LegacyWindow).ksmPoolsMounted = true;
