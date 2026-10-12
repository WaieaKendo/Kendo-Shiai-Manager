// Globals the type-checked app files use that no app file declares.
//
// App functions and `state` are declared in app/js/*.js; all of those files share one
// global scope (one classic script), so a checked file sees them with the types from
// their JSDoc. Only elements the app reaches through their id (the browser's named
// element globals, e.g. `teamFormat.value`) need declaring here.

/** Setup → team event format select. */
declare var teamFormat: HTMLSelectElement;
/** Setup → team tournament format select (Single Elimination / Round Robin). */
declare var teamTournamentFormat: HTMLSelectElement;

/** The pure engine modules (app/engine/index.ts), loaded as a classic script before app.js. */
declare var KSMEngine: typeof import('../engine/index.ts');
