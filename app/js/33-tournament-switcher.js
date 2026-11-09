// Switching tournaments lives in app/modules/session/tournament-switcher.js (step 3d of #136). Its load-time side
// effects (the open tournament's address, the popstate listener) run here, where this file used to load.
initTournamentSwitcher();
