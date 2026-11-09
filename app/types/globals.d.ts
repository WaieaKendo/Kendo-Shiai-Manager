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
  /** What the React court screen shows (35-react-court.js), read by the tie flash (app/modules/sync). */
  ksmCourtScoreboardInput?: any;
  ksmCourtHeaderInput?: any;
  /** Called through window by the grand champion module (its rebase helpers also run outside the page). */
  writeCloudDiagnosticsState?: typeof import('../modules/sync/cloud-diagnostics.js').writeCloudDiagnosticsState;
  showKsmToast?: typeof import('../modules/sync/cloud-realtime-save-and-load.js').showKsmToast;
  /** Set when 34-bootstrap.js's first load settles (read by app/modules/session). */
  ksmBootstrapReady?: boolean;
  /** The account module (app/react/features/account/auth0.tsx) and the bridge app/modules/auth/auth0-access.js gives it. */
  ksmAuthBridge?: any;
  ksmResolveAuthReady?: () => void;
  ksmRefreshAccount?: (id?: string) => Promise<void>;
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

// Elements the results modules (app/modules/results) reach by id.
/** Print / PDF Export: the division select and the preview area. */
declare var printDivSelect: HTMLSelectElement;
declare var printBody: HTMLElement;
/** Results screen: the React island mount (renderResultsDashboard only publishes when it exists). */
declare var resultsBody: HTMLElement;

// The React bridges (app/modules/react-bridges, step 3d of #136): the requests they put on window for the React islands
// (app/react) and the flags the islands set, read through `window.NAME`.
interface Window {
  ksmStateVersion?: number;
  ksmStateChangeReasons?: any[] | null;
  ksmCourtScoreboardRequested?: any;
  ksmCourtHeaderRequested?: any;
  ksmCourtActionsRequested?: any;
  ksmCourtScreenMounted?: boolean;
  ksmLiveScoresRequested?: boolean;
  ksmLiveScoresMounted?: boolean;
  ksmTvRequested?: boolean;
  ksmTvMounted?: boolean;
  ksmResultsRequested?: boolean;
  ksmResultsBracketRequested?: any;
  ksmResultsMounted?: boolean;
  ksmOverviewRequested?: boolean;
  ksmOverviewMounted?: boolean;
  ksmLibraryRequested?: any;
  ksmLibraryInput?: any;
  ksmLibraryError?: any;
  ksmLibraryMounted?: boolean;
  ksmPoolsRequested?: any;
  ksmPoolsMounted?: boolean;
  ksmSetupDivisionsRequested?: boolean;
  ksmSetupHeaderRequested?: boolean;
  ksmSetupMounted?: boolean;
  ksmRegistrationPlayersRequested?: boolean;
  ksmRegistrationStatusRequested?: any;
  ksmRegistrationTeamsRequested?: boolean;
  ksmRegistrationExhibitionsRequested?: boolean;
  ksmRegistrationTabRequested?: any;
  ksmRegistrationTabInput?: any;
  ksmRegistrationMounted?: boolean;
  ksmRegistrationTeamsMounted?: boolean;
  ksmShellNavRequested?: boolean;
  ksmShellHeaderRequested?: boolean;
  ksmShellDialogsRequested?: boolean;
  ksmShellMounted?: boolean;
  /** Elements reached through their id (the browser's named element globals). */
  directorCourtGrid?: HTMLElement;
  exhibitionEnabled?: HTMLSelectElement;
  exhibitionTable?: HTMLElement;
}
/** Registration -> Exhibition Matches enable select (Setup). */
declare var exhibitionEnabled: HTMLSelectElement;

/** The pure engine modules (app/engine/index.ts), loaded as a classic script before app.js. */
declare var KSMEngine: typeof import('../engine/index.ts');
