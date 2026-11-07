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

// Elements the court modules (app/modules/court) reach by id, as the browser's named element globals.
/** Pools screen division select. */
declare var poolDiv: HTMLSelectElement;
/** Pools screen output. */
declare var poolOutput: HTMLElement;
/** Court screen division select and the court context panel (their React islands mount into them). */
declare var scoreDiv: HTMLSelectElement;
declare var courtContext: HTMLElement;
/** The requests the court modules make of the React court screen (35-react-court.js). */
interface Window {
  ksmCourtQueueRequested?: boolean;
  ksmCourtContextRequested?: boolean;
  ksmCourtCompleteRequested?: { div: string; complete: boolean };
}
/** Live Scores title. */
declare var publicTitle: HTMLElement;
/** Setup tournament name input. */
declare var tName: HTMLInputElement;
/** Search tab: name and dojo inputs, their result lists and the profile panel. */
declare var searchName: HTMLInputElement;
declare var searchDojo: HTMLInputElement;
declare var nameResults: HTMLElement;
declare var dojoResults: HTMLElement;
declare var profile: HTMLElement;

// Elements the registration and setup modules (app/modules/registration, app/modules/setup) reach by id.
/** Registration filters, Setup's custom division controls and team court / awards fields, the validation card. */
declare var regFilter: HTMLInputElement;
declare var teamFilter: HTMLInputElement;
declare var teamEnabled: HTMLSelectElement;
declare var teamCourt: HTMLSelectElement;
declare var teamAwardMode: HTMLSelectElement;
declare var customDivName: HTMLInputElement;
declare var customDivFormat: HTMLSelectElement;
declare var customDivCourt: HTMLSelectElement;
declare var newDiv: HTMLSelectElement;
declare var newDivType: HTMLSelectElement;
declare var tournamentStatusCard: HTMLElement;
declare var divisionSetupRows: HTMLElement;

/** The pure engine modules (app/engine/index.ts), loaded as a classic script before app.js. */
declare var KSMEngine: typeof import('../engine/index.ts');
