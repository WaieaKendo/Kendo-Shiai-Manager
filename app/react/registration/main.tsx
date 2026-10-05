// Registration part 1 (#registration): two React islands in the legacy page (index.html, loaded
// with the other screens by app/react/main.tsx; the build lists its files in the service worker's
// APP_SHELL, so an offline device has them): the individual players table (#regTable) and the
// contents of the tournament status card (#tournamentStatusCard). The legacy code computes what is
// shown; renderReg() and renderTournamentStatus() publish it (app/js/43-react-registration.js).
// The tab bar, the toolbars, the filter field and the team, exhibition and Pools cards stay legacy
// markup.
import { mountIsland } from '../island.tsx';
import { PlayersTable, TournamentStatus } from './Registration.tsx';

interface LegacyWindow {
  /** Set here once the islands are mounted; the legacy code checks it. */
  ksmRegistrationMounted?: boolean;
}

const table = document.querySelector('#indReg #regTable');
if (!table) throw new Error('KSM Registration: #indReg #regTable is missing');
const status = document.querySelector('#registration #tournamentStatusCard');
if (!status) throw new Error('KSM Registration: #registration #tournamentStatusCard is missing');

// renderReg() and renderTournamentStatus() have published since app.js started (boot); the
// islands start from the last publish.
mountIsland(table, <PlayersTable />);
mountIsland(status, <TournamentStatus />);
(window as unknown as LegacyWindow).ksmRegistrationMounted = true;
