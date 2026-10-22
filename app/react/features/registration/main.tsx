// Registration (#registration): React islands in the legacy page (index.html, loaded with the
// other screens by app/react/main.tsx; the build lists its files in the service worker's
// APP_SHELL, so an offline device has them). Part 1: the individual players table (#regTable) and
// the contents of the tournament status card (#tournamentStatusCard). Part 2: the team cards (the
// wrapper of #teamTable in Team Registration), the exhibition table (#exhibitionTable) and the tab
// bar (the first row of the toolbar card: the four tabs, Generate Tournament, Regenerate Single
// Division). The legacy code computes what is shown; renderReg(), renderTournamentStatus(),
// renderTeams(), renderExhibitions() and regTab() publish it (app/js/43-react-registration.js).
// The toolbars and their buttons, the filter fields, the cards themselves (which regTab() shows
// and hides) and Pools' select stay legacy markup.
import { mountIsland } from '../island.tsx';
import { PlayersTable, TournamentStatus } from './Registration.tsx';
import { ExhibitionTable, RegistrationTabs, TeamCards } from './RegistrationTeams.tsx';

interface LegacyWindow {
  /** Set here once the part 1 islands are mounted; the legacy code checks it. */
  ksmRegistrationMounted?: boolean;
  /** Set here once the part 2 islands are mounted; the legacy code checks it. */
  ksmRegistrationTeamsMounted?: boolean;
}

function find(selector: string): Element {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`KSM Registration: ${selector} is missing`);
  return el;
}

const table = find('#indReg #regTable');
const status = find('#registration #tournamentStatusCard');
// The team cards replace #teamTable itself (the legacy renderer wrote its outerHTML: a <table>
// in the static markup, a <div class="team-cards"> once drawn), so the island is its wrapper.
const teams = find('#teamReg #teamTable').parentElement;
if (!teams) throw new Error('KSM Registration: #teamTable has no wrapper');
const exhibitions = find('#exhibitionReg #exhibitionTable');
const tabs = find('#registration > .card:first-child > .toolbar > .row:first-child');
if (!tabs.querySelector('#indTab')) throw new Error('KSM Registration: the tab bar is missing');

// The legacy code has published since app.js started (boot); the islands start from the last
// publish.
mountIsland(table, <PlayersTable />);
mountIsland(status, <TournamentStatus />);
(window as unknown as LegacyWindow).ksmRegistrationMounted = true;
mountIsland(teams, <TeamCards />);
mountIsland(exhibitions, <ExhibitionTable />);
mountIsland(tabs, <RegistrationTabs />);
(window as unknown as LegacyWindow).ksmRegistrationTeamsMounted = true;
