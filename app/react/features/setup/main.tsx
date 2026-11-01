// The Setup screen (#setup): two React islands in the legacy page (index.html, loaded with the
// other screens by app/react/main.tsx; the build lists its files in the service worker's
// APP_SHELL, so an offline device has them): the rows of the Individual Divisions table
// (#divisionSetupRows) and the tournament name in the hero (#setupTournamentName). The legacy
// code only signals (renderDivisionSetup() and syncSetupHeader(), app/js/42-react-setup.js);
// publish.ts computes what is shown and these elements are never written by legacy (M.13). Every Setup field stays legacy
// markup (read and written by id). If this module does not load, the legacy code shows a
// "Divisions could not load" notice in place of the divisions table (42-react-setup.js, on
// DOMContentLoaded).
import { mountIsland } from '../../shared/lib/island.tsx';
import { startSetupInput } from './publish.ts';
import { SetupDivisionRows, SetupHeader } from './Setup.tsx';
import { GrandChampionSetup } from './GrandChampions.tsx';

interface LegacyWindow {
  /** Set here once the islands are mounted; the legacy code checks it. */
  ksmSetupMounted?: boolean;
}

const rows = document.querySelector('#setup #divisionSetupRows');
if (!rows) throw new Error('KSM Setup: #setup #divisionSetupRows is missing');
const header = document.querySelector('#setup #setupTournamentName');
if (!header) throw new Error('KSM Setup: #setup #setupTournamentName is missing');

// Pull: the input is computed from the legacy app on every ksm:setup-divisions / ksm:setup-header
// signal (and now, for one sent before this module ran: renderDivisionSetup() and
// syncSetupHeader() have signalled since app.js started); started before mounting so it runs
// ahead of the islands' own listeners. The islands start from the last input.
startSetupInput();
mountIsland(rows, <SetupDivisionRows />);
mountIsland(header, <SetupHeader />);
// #86: the Grand Champion section (ksmRenderGrandChampionSetup(), app/js/01-grand-champion.js).
const grandChampions = document.querySelector('#setup #grandChampionSetup');
if (!grandChampions) throw new Error('KSM Setup: #setup #grandChampionSetup is missing');
mountIsland(grandChampions, <GrandChampionSetup />);
(window as unknown as LegacyWindow).ksmSetupMounted = true;
