// The one module that reads app.js globals (the classic scripts in app/js). app.js is a classic
// script that runs before the React module, and its top-level `function` declarations are
// `window` properties; top-level `let`/`const` (e.g. `state`) are not, so they are reached through
// a function (ksmLegacyState, app/js/00-react-bridge.js).
//
// LegacyGlobals is the inventory of what React features still call in app.js: every name here
// must be a top-level `function` in app/js. When a legacy function moves into app/react or
// app/engine, its entry is replaced by an import and removed here.

import type { TournamentSettings } from '../../engine/settings.ts';
import type { ResultPoolInput } from '../features/results/results-model.ts';
import type { HansokuCounts, UpNextInput } from '../features/live-scores/live-scores-model.ts';
import type { CourtCompleteInput } from './ui/complete-model.ts';
import type { BracketInput, KachinukiSheetInput, TeamSheetInput } from './ui/context-model.ts';

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

/** buildTV3ViewModel(court) (app/js/26-tv-display.js): what the TV court shows, before it is turned into data. */
export interface LegacyTvViewModel {
  court: Court;
  empty: boolean;
  division: string | null;
  /** Absent when the court is empty. */
  format?: 'results' | 'individual' | 'team' | 'kachinuki';
  match?: Match;
  meta?: { division: string; line: string };
  /** Up to two cards, null for an empty one (left/right: the sides' names, the subs: dojos or the round). */
  upcoming: Array<{ left: string; right: string; leftSub: string; rightSub: string; round: string } | null>;
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
  /** 27-results-screen.js: a completed division's places (the engine's rule); [] while it is running. */
  resultPlacements: (div: string) => Array<{ place: string; name: string; tier: string }>;
  /** 13-engine-standings-and-tiebreaks.js. */
  isTeamRoundRobinDivision: (div: string) => boolean;
  teamRoundRobinProgress: (div?: string) => { complete: number; total: number };
  /** 01-grand-champion.js: a grand champion row by id, or null. */
  ksmGrandChampion: (id: string) => GrandChampion | null;
  ksmGrandChampions: () => GrandChampion[];
  /** 09-results-and-awards.js. */
  divisionComplete: (div: string) => boolean;
  /** 01-team-divisions.js. */
  ksmTeamDivisions: () => TeamDivision[];
  /** 04-engine-pools.js. */
  eligibleTeams: (div: string) => Team[];
  eligibleIndividuals: (div: string) => Competitor[];
  isTeamDivision: (div: string) => boolean;
  /** 20-cloud-session-and-autosave.js (33-staff-session-and-library.js defines isReadOnlySession too; the later one wins). */
  tournamentSettings: () => TournamentSettings;
  isReadOnlySession: () => boolean;
  /** 35-react-court.js: the court screen's bracket data, reused by the Results modal. */
  ksmBracket: (div: string) => BracketInput;
  ksmTeamResults: (div: string) => BracketInput;
  ksmPoolStandingRows: (div: string, poolLabel: string) => { note: string; rows: ResultPoolInput['standings'] };
  /** 11-court-queue-and-views.js: the court's current match (moving the court on, as before) and the next one on it. */
  courtCurrentMatch: (court: Court) => { division: string; match: Match; next: Match | undefined } | null;
  /** 11-court-queue-and-views.js: a match's points, live for the match this device is scoring. */
  activeScoreArrays: (m: Match) => { W: PointLetter[]; R: PointLetter[] };
  /** 25-live-scores.js (the TV shares audienceMeta()). */
  audienceMeta: (m: Match | null | undefined) => { division: string; line: string };
  /** 25-live-scores.js: up to two upcoming matches (in team mode also bracket nodes not drawn yet). */
  tvUpcomingMatches: (court: Court, current: Match, teamMode?: boolean) => Array<Partial<Match>>;
  tvAssignedCourt: () => Court;
  tvIndividualSideLabel: (match: Match, side: 'white' | 'red') => string;
  /** 26-tv-display.js. */
  buildTV3ViewModel: (court: Court) => LegacyTvViewModel;
  renderTvDisplay: () => void;
  /** 36-react-live-scores.js (stays classic: classic 35-react-court.js calls ksmUpNext()). */
  ksmBetweenMatches: (court: Court, own: string | null | undefined) => { reason: string | null; upNext: UpNextInput | null };
  /** 35-react-court.js. */
  ksmTeamSheet: (div: string, pair: string | undefined, current: Match) => TeamSheetInput;
  ksmKachinukiSheet: (m: Match) => KachinukiSheetInput;
  ksmHansokuCounts: (m: Match | null | undefined) => HansokuCounts;
  ksmDivisionCompleteInput: (div: string, complete: boolean) => CourtCompleteInput;
  ksmIsRoundRobinDaihyosen: (m: Match | null | undefined) => boolean;
  ksmDaihyosenLabel: () => string;
  ksmNextCourtDivision: (court: Court, current: string | null) => string | null;
  /** 18-sync-state-and-rebase.js. */
  isValidMatchObject: (m: unknown) => boolean;
  /** 08-engine-generation.js. */
  matchBelongsToCourt: (m: Match | null | undefined, court: Court) => boolean;
  /** 13-engine-standings-and-tiebreaks.js. */
  teamPairSummary: (div: string, pair: string) => { wWins: number; wPts: number; rWins: number; rPts: number };
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

/** The Live Scores element (#publicLive, reached as window.publicLive by element id), if any. */
export function legacyPublicLive(): Element | null {
  return (window as unknown as { publicLive?: Element }).publicLive ?? null;
}

/** The TV display element (#tvLive, reached as window.tvLive by element id), if any. */
export function legacyTvLive(): Element | null {
  return (window as unknown as { tvLive?: Element }).tvLive ?? null;
}
