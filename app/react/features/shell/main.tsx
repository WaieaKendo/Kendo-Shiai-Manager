// The app shell (M.13's last step): React islands in the legacy page (index.html, loaded with the
// other screens by app/react/main.tsx; the build lists its files in the service worker's
// APP_SHELL, so an offline device has them). The navigation bar (the contents of
// header.ksm-topbar nav.minimal-nav), the header's status row (the contents of .cloud-status-wrap),
// the Fusen-gachi dialog (#fusenDialog), the generation check (#validationModal), Regenerate Single
// Division (#regenerateModal) and the cloud modal (#ksmCloudModal, a portal into <body>, from a
// root of its own outside the page). The legacy code computes what is shown;
// app/js/44-react-shell.js publishes it (the legacy shell renderer was removed in M.13; without this
// module the header says "Menus and dialogs could not load"). The brand, the spectator banner (a
// <body>-level element before the header, see 44-) and the toast stay legacy.
import { mountIsland } from '../../shared/lib/island.tsx';
import { CloudModal, FusenDialog, RegenerateDialog, ValidationDialog } from './Dialogs.tsx';
import { Nav, StatusRow, TournamentChip } from './Shell.tsx';
import { shellWindow, withoutPointingListeners } from './shell-dom.ts';

function find(selector: string): Element {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`KSM shell: ${selector} is missing`);
  return el;
}

const nav = find('header.ksm-topbar nav.minimal-nav');
nav.id = 'tournamentNavigation';
const heading = find('#tournamentHeading');
const status = find('header.ksm-topbar .cloud-status-wrap');
const fusen = find('#score #fusenDialog');
const validation = find('#validationModal');
const regenerate = find('#regenerateModal');

// The legacy code has published since app.js started (boot); the islands start from the last
// publish.
// The header islands' controls listen to their own clicks; their roots take none (see
// withoutPointingListeners()).
withoutPointingListeners(nav, () => mountIsland(nav, <Nav />));
withoutPointingListeners(heading, () => mountIsland(heading, <TournamentChip />));
withoutPointingListeners(status, () => mountIsland(status, <StatusRow />));
mountIsland(fusen, <FusenDialog root={fusen} />);
mountIsland(validation, <ValidationDialog root={validation} />);
mountIsland(regenerate, <RegenerateDialog root={regenerate} />);
// The cloud modal is a portal into <body>; its root is an element outside the page.
mountIsland(document.createElement('div'), <CloudModal />);
shellWindow().ksmShellMounted = true;
