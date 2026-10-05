// The Setup screen (#setup): two React islands in the legacy page (index.html, loaded with the
// other screens by app/react/main.tsx; the build lists its files in the service worker's
// APP_SHELL, so an offline device has them): the rows of the Individual Divisions table
// (#divisionSetupRows) and the tournament name in the hero (#setupTournamentName). The legacy
// code computes what is shown; renderDivisionSetup() and syncSetupHeader() publish it
// (app/js/42-react-setup.js) and never write these elements (M.13). Every Setup field stays legacy
// markup (read and written by id). If this module does not load, the legacy code shows a
// "Divisions could not load" notice in place of the divisions table (42-react-setup.js, on
// DOMContentLoaded).
import { mountIsland } from '../island.tsx';
import { SetupDivisionRows, SetupHeader } from './Setup.tsx';

interface LegacyWindow {
  /** Set here once the islands are mounted; the legacy code checks it. */
  ksmSetupMounted?: boolean;
}

const rows = document.querySelector('#setup #divisionSetupRows');
if (!rows) throw new Error('KSM Setup: #setup #divisionSetupRows is missing');
const header = document.querySelector('#setup #setupTournamentName');
if (!header) throw new Error('KSM Setup: #setup #setupTournamentName is missing');

// renderDivisionSetup() and syncSetupHeader() have published since app.js started (boot); the
// islands start from the last publish.
mountIsland(rows, <SetupDivisionRows />);
mountIsland(header, <SetupHeader />);
(window as unknown as LegacyWindow).ksmSetupMounted = true;
