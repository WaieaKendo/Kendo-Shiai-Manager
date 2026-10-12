// Entry of the stream overlay page (app/overlay.html): /t/<id>/overlay/a|b, or the old
// /overlay?tournament=<id>&court=A|B, which becomes that path first (M.9, app/engine/routes.ts).
// The options (red, pos, y, band, debug) stay query parameters.
import { mountIsland } from '../island.tsx';
import { legacyQuery, resolveUrl } from '../../engine/routes.ts';
import { Overlay } from './Overlay.tsx';
import { parseOverlayParams } from './overlay-model.ts';
import './overlay.css';

const resolved = resolveUrl(location.pathname, location.search);
if (resolved.redirect !== null && resolved.route.screen === 'overlay') history.replaceState(history.state, '', resolved.redirect + location.hash);
const root = document.getElementById('overlay-root');
if (root) mountIsland(root, <Overlay params={parseOverlayParams(legacyQuery(resolved.route, location.search))} />);
