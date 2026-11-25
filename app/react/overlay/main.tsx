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
async function start() {
  const route=resolved.route;
  if (route.slug && route.screen !== 'home' && route.screen !== 'invalid') {
    const response=await fetch('/api/slugs/'+encodeURIComponent(route.slug), {cache:'no-store'});
    if (!response.ok) throw new Error('Tournament short name could not be resolved');
    const info=await response.json() as {id:string};
    route.id=info.id;
  }
  if (root) mountIsland(root, <Overlay params={parseOverlayParams(legacyQuery(route, location.search))} />);
}
void start().catch(() => { if(root)root.textContent='Tournament could not be opened. Check the link and connection.'; });
