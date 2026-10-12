// Entry of /overlay (app/overlay.html).
import { mountIsland } from '../island.tsx';
import { Overlay } from './Overlay.tsx';
import { parseOverlayParams } from './overlay-model.ts';
import './overlay.css';

const root = document.getElementById('overlay-root');
if (root) mountIsland(root, <Overlay params={parseOverlayParams(location.search)} />);
