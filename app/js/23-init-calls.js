// The load-time side effects of the modules that used to be classic files 23- to 34-, in their old order (step 4a of #136).
// Each runs here, where its file used to load, so every listener, timer and read keeps its place among the app's others.

// Navigation (app/modules/navigation.js; was 23-navigation.js).
initNavigation();
// The TV's assigned court, read from the address (app/modules/results/live-scores.js; was 25-live-scores.js).
initTvAssignedCourt();
// The Results screen's Escape key (app/modules/results/results-screen.js; was 27-results-screen.js).
initResultsScreen();
// The setup name listener and the Overview timer's visibility listener (was 30-setup-header-and-director.js).
initSetupHeader();
initDirectorRefresh();
// The empty setup, then the first render of the page (was the end of 32-split-court-templates.js).
initEmptySetup();
initFirstRender();
// Friendly links (the tournament short name, the cached records) live in app/modules/links/friendly-links.js and
// the stream overlay links in app/modules/links/stream-overlay-links.js; staff sessions, the role and the Tournament
// Library in app/modules/session/staff-session-and-library.js (step 3d of #136). The pending short name is read
// from sessionStorage here, where this file used to load.
initFriendlyLinks();
// Switching tournaments lives in app/modules/session/tournament-switcher.js (step 3d of #136). Its load-time side
// effects (the open tournament's address, the popstate listener) run here, where this file used to load.
initTournamentSwitcher();
// Boot (app/modules/boot.js) and the React bridges (app/modules/react-bridges/) load here (step 3d of #136):
// the bootstrap first, then each bridge's load-time listeners, in the order their files used to load (35- to 44-).
initBootstrap();
initReactBridges();
