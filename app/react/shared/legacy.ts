// The one module that reads app.js globals (the classic scripts in app/js). app.js is a classic
// script that runs before the React module, and its top-level `function` declarations are
// `window` properties; top-level `let`/`const` (e.g. `state`) are not, so they are reached through
// a function (ksmLegacyState, app/js/00-react-bridge.js).
//
// LegacyGlobals is the inventory of what React features still call in app.js: every name here
// must be a top-level `function` in app/js. When a legacy function moves into app/react or
// app/engine, its entry is replaced by an import and removed here.

/** courtSummaryFor(court) (app/js/30-setup-header-and-director.js). */
export interface LegacyCourtSummary {
  court: string;
  division: string | null;
  round: string;
  completed: number;
  total: number | null;
  remaining: number | null;
  variable: boolean;
  current: Match | null;
  onDeck: Match | null;
  following: Match | null;
}

/** tournamentSummary() (app/js/30-setup-header-and-director.js). */
export interface LegacyTournamentSummary {
  completed: number;
  total: number;
  remaining: number;
  variable: boolean;
}

export interface LegacyGlobals {
  /** 00-react-bridge.js: the legacy `state` (a top-level `let`, so not on window itself). */
  ksmLegacyState: () => TournamentState;
  /** 35-react-court.js: String(s || ''). */
  ksmText: (s: unknown) => string;
  /** 01-team-divisions.js: a division id's display name. */
  ksmDivisionName: (id: string) => string;
  /** 30-setup-header-and-director.js. */
  tournamentSummary: () => LegacyTournamentSummary;
  courtSummaryFor: (court: string) => LegacyCourtSummary;
}

/** A legacy function, read from `window` at call time; throws when app.js does not define it. */
export function legacy<K extends keyof LegacyGlobals>(name: K): LegacyGlobals[K] {
  const fn = (window as unknown as Partial<LegacyGlobals>)[name];
  if (typeof fn !== 'function') throw new Error(`KSM: the legacy function ${name}() is not defined on window`);
  return fn as LegacyGlobals[K];
}

/** The Setup tournament name input (#tName, reached as window.tName by element id), if any. */
export function legacyTournamentNameInput(): { value: string } | null {
  return (window as unknown as { tName?: { value: string } }).tName ?? null;
}
