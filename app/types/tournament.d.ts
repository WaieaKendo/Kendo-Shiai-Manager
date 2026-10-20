// Tournament data as the app keeps it in `state` and saves it (tournamentPayload()),
// derived from real payloads of every format (pools, single elimination, 3/5-person
// teams, kachinuki, round robins, tiebreaks). Global (no import/export) because the
// app is classic scripts sharing one scope; JS files use these names in JSDoc.
//
// Divisions, pool labels, people and teams are identified by name (see ROADMAP 2.4).

type Court = 'A' | 'B';
/** Setup court choice: one court, both courts (teams), or pools/bracket split over A and B. */
type CourtMode = Court | 'Both' | 'split';
type DivisionFormat = 'Round Robin' | 'Single Elimination' | string;
type TeamFormat = '3-Person Team' | '5-Person Team' | 'Kachinuki';
type EntryStatus = 'Registered' | 'Checked' | 'NoShow';
type TeamPosition = 'senpo' | 'jiho' | 'chuken' | 'fukusho' | 'taisho';
/** A scored point: Men, Kote, Do, Tsuki, Hansoku (two hansoku give the opponent a point), Fusen-gachi. */
type PointLetter = 'M' | 'K' | 'D' | 'T' | 'H' | 'F';
type RoundName = 'Round of 32' | 'Round of 16' | 'Quarterfinal' | 'Semifinal' | 'Final' | 'Play-in' | string;
type MatchType = 'individual' | 'teamPosition' | 'teamPlayoff' | 'kachinuki' | 'exhibition';
type MatchOrigin = 'TEMPLATE' | 'TEMPLATE_CONTINUATION' | 'TIEBREAK' | string;
type DynamicMatchType =
  | 'INDIVIDUAL_POOL_TIEBREAK'
  | 'TEAM_3_PERSON_REPRESENTATIVE' | 'TEAM_5_PERSON_REPRESENTATIVE' | 'KACHINUKI_REPRESENTATIVE'
  | 'TEAM_3_PERSON_ROUND_ROBIN_TIEBREAK' | 'TEAM_5_PERSON_ROUND_ROBIN_TIEBREAK' | 'KACHINUKI_ROUND_ROBIN_TIEBREAK';
/** Per-division lookup (key: division name, e.g. 'Open' or 'Team Tournament'). */
type ByDivision<T> = Record<string, T>;
type ByCourt<T> = Record<Court, T>;

/** Registration row for an individual. */
interface Competitor {
  name: string;
  dojo: string;
  division: string;
  /** '' or a number as text ('1' = top seed). */
  seed: string;
  status: EntryStatus;
}

/** Registration row for a team; member names by position (3-person teams leave jiho/fukusho out). */
type TeamDivision = import('../engine/team-divisions.ts').TeamDivision;
interface Team extends Partial<Record<TeamPosition, string>> {
  id?: string;
  teamDivisionId?: string;
  team: string;
  type?: TeamFormat | string;
  status: EntryStatus;
  division?: string;
  dojo?: string;
}

/** A person (or, in team pools, a team) placed in a pool. */
interface PoolPlayer extends Partial<Competitor> {
  name: string;
  dojo: string;
  /** Fixed A/B/C/D slot letter shown on sheets; set when the pool is built or edited. */
  poolSlot?: string;
  poolSlotIndex?: number;
  /** Team round-robin pools list teams. */
  team?: boolean;
  /** The Exhibition pool lists its matches ('White vs Red'). */
  exhibition?: boolean;
}

interface Pool {
  /** 'A', 'B', ... */
  label: string;
  size: number;
  players: PoolPlayer[];
  court?: Court;
}

/** Final score of a completed match, kept so a result can be checked and repaired after sync. */
interface CompletedResult {
  winner: string;
  wp: PointLetter[];
  rp: PointLetter[];
  wt: number;
  rt: number;
  recordedAt: string;
}

/**
 * One scoreable bout ("Match Object"). White is shown on the left by default.
 * Which optional fields are set depends on the match kind:
 * - pool bout: pool (label), poolOrder, poolTemplateOrder, whitePoolSlot/redPoolSlot
 * - pool tiebreak: tiebreak, tiebreakSeries, tiebreakIndex, dynamicType, requiresWinner
 * - championship (after pools): championship, champNodeId, bracketSlot, seedWhite/seedRed, pool = round
 * - single elimination: singleElim, elimNodeId, templateNode, ready
 * - team bout: teamWhite/teamRed, teamPair, teamNodeId, wIndex/rIndex, lineupW/lineupR (kachinuki),
 *   parentTeamMatch; representative playoff: type 'teamPlayoff'
 */
interface Match {
  division: string;
  type: MatchType;
  white: string;
  red: string;
  wdojo: string;
  rdojo: string;
  /** Points scored by White / Red, in order. */
  wp: PointLetter[];
  rp: PointLetter[];
  /** Hansoku counts. */
  wt?: number;
  rt?: number;
  done: boolean;
  court?: Court;
  origin?: MatchOrigin;
  completedResult?: CompletedResult;
  /** Pool label; for championship matches the round name ('Championship' in older data). */
  pool?: string;
  /** Round name for championship/elimination bouts, position name ('Senpo', ...) for team bouts. */
  position?: string;
  poolOrder?: number;
  poolTemplateOrder?: number;
  whitePoolSlot?: string;
  redPoolSlot?: string;
  // Tiebreaks and other approved dynamic matches
  tiebreak?: boolean;
  tiebreakSeries?: number;
  tiebreakIndex?: number;
  dynamicType?: DynamicMatchType;
  requiresWinner?: boolean;
  // Championship bracket after pools
  championship?: boolean;
  champNodeId?: string;
  bracketSlot?: number;
  seedWhite?: string | null;
  seedRed?: string | null;
  // Direct single elimination
  singleElim?: boolean;
  elimNodeId?: string;
  templateNode?: boolean;
  ready?: boolean;
  // Teams and kachinuki
  teamWhite?: string;
  teamRed?: string;
  teamPair?: string;
  teamNodeId?: string;
  wIndex?: number;
  rIndex?: number;
  lineupW?: string[];
  lineupR?: string[];
  parentTeamMatch?: boolean;
  /** A team round robin's daihyosen (F27): a one-point representative bout between teams level for 1st–3rd. */
  roundRobinTiebreak?: boolean;
}

/** Where a bracket side comes from: a pool seed ('A1'), an earlier node's winner, or a team number. */
interface BracketSource {
  seed?: string;
  ref?: string;
  team?: number;
}

/** Championship bracket node after pools (frozen template). */
interface ChampionshipNode {
  id: string;
  round: RoundName;
  slot: number;
  court: Court;
  left: BracketSource;
  right: BracketSource;
}

/** Direct single-elimination node; a null side is a bye. */
interface SingleElimNode {
  id: string;
  round: RoundName;
  slot: number;
  court: Court;
  left: BracketSource | null;
  right: BracketSource | null;
  winner?: { name: string; dojo: string } | null;
}

/** Team single-elimination node; `winner` is the team name once decided. */
interface TeamBracketNode {
  id: string;
  round: RoundName;
  slot: number;
  court: Court;
  left: BracketSource | null;
  right: BracketSource | null;
  winner?: string | null;
}

/** A court's position: the division it is running and the index of its current match. */
interface CourtState {
  division: string | null;
  index: number;
}

/** Score of the match on the court screen (mirrors the current Match's wp/rp/wt/rt). */
interface ActiveScore {
  W: PointLetter[];
  R: PointLetter[];
  WT: number;
  RT: number;
}

/** A value that did not exist before (or after) a court action. */
interface HistoryMissing { __ksmMissing: true }

/** One changed value in `state`, addressed by its path (e.g. ['allMatches', 'Open', 0, 'wp']). */
interface HistoryPatch {
  path: (string | number)[];
  before: unknown | HistoryMissing;
  after: unknown | HistoryMissing;
  /** Identity of the match the path points into, so undo still finds it after a reorder. */
  matchIdentity?: string;
}

/** One undoable court action (a point, Next Match, ...), stored per court. */
interface CourtAction {
  format: 'patch-v1';
  label: string;
  court: Court;
  clientId: string;
  revision: number;
  when: string;
  patches: HistoryPatch[];
}

interface Award { award: string; name: string; dojo: string }
interface Exhibition { white: string; red: string; division: string; status: EntryStatus }

/** All tournament data plus some per-device view state (see KSM_LOCAL_VIEW_STATE_KEYS). */
type GrandChampion = import('../engine/grand-champion.ts').GrandChampion;
interface TournamentState {
  teamDivisions?: TeamDivision[];
  /** #86: grand champion rows; each row's draw is the division keyed by its id ('gc:<hex>'). */
  grandChampions?: GrandChampion[];
  divisions: string[];
  divisionTypes: ByDivision<DivisionFormat>;
  divisionCourts: ByDivision<CourtMode>;
  competitors: Competitor[];
  teams: Team[];
  exhibitions: Exhibition[];
  awards: Award[];
  teamAwardMode: 'top2' | string;
  generated: boolean;
  /** Bumped by structural edits (regenerate, pool edits). */
  managementRevision: number;

  pools: ByDivision<Pool[]>;
  teamPools: ByDivision<Pool[]>;
  allMatches: ByDivision<Match[]>;
  /** Championship template per division: first-round pairs of seed labels, e.g. [['A1','B2'], ...]. */
  brackets: ByDivision<string[][]>;
  championshipNodes: ByDivision<ChampionshipNode[]>;
  singleElimNodes: ByDivision<SingleElimNode[]>;
  singleElimComps?: ByDivision<Competitor[]>;
  byeWinners?: ByDivision<{ slot: number; obj: { name: string; dojo: string } }[]>;
  teamBracketNodes: ByDivision<TeamBracketNode[]>;
  teamBracketState: ByDivision<unknown>;
  teamElimTeams: ByDivision<Team[]>;

  courtState: ByCourt<CourtState>;
  courtActiveDivision: ByCourt<string | null>;
  currentByDivision: ByDivision<number>;
  courtActionHistory: ByCourt<CourtAction[]>;
  courtRedoHistory: ByCourt<CourtAction[]>;

  // View state of this device (not merged from other devices)
  currentCourt: Court;
  publicCourt: Court;
  currentDivision: string;
  poolViewDivision: string;
  /** The current court's matches: state.allMatches[state.currentDivision]. */
  matches: Match[];
  /** Index of the current match in `matches`. */
  current: number;
  score: ActiveScore;
  /** Legacy (pre patch-v1) undo stack, kept empty. */
  history: unknown[];
  regMode: 'individual' | 'team' | 'exhibition' | 'pools';
  contextMode: 'pool' | string;
}

/** Values of the Setup form (element id -> value), saved alongside the state. */
interface SetupSnapshot {
  court1TimerEnabled?: 'On' | 'Off'; court2TimerEnabled?: 'On' | 'Off';
  court1TimerSound?: 'whistle01' | 'whistle02'; court2TimerSound?: 'whistle01' | 'whistle02';
  timeRegular?: string; timeQuarterfinal?: string; timeSemifinal?: string; timeFinal?: string; timeEncho?: string;
  tName?: string; tHost?: string; tDate?: string; tLocation?: string; tCourts?: string; tType?: string;
  teamEnabled?: 'Enabled' | 'Disabled'; teamFormat?: TeamFormat; teamTournamentFormat?: 'Single Elimination' | 'Round Robin';
  teamCourt?: CourtMode; teamAwardMode?: string; exhibitionEnabled?: 'Enabled' | 'Disabled';
  court1Refs?: string; court2Refs?: string; court1RedSide?: 'left' | 'right'; court2RedSide?: 'left' | 'right'; court1TvRedSide?: 'left' | 'right'; court2TvRedSide?: 'left' | 'right';
}

/** A saved tournament: autosave, file export and the cloud record's payload. */
interface TournamentPayload {
  schemaVersion: string;
  /** Frozen at '3.12.9' (see version-consistency-test). */
  engineVersion: string;
  templateVersion?: string;
  savedAt: string;
  setup: SetupSnapshot;
  state: TournamentState;
}

/** What a device sends to PUT /api/tournaments/:id. */
interface CloudEnvelope {
  schemaVersion: string;
  tournamentId: string | null;
  engineVersion: string;
  /** The server revision this save is based on (409 if the server moved on). */
  revision: number;
  payload: TournamentPayload;
}

/** The server copy of a tournament (GET /api/tournaments/:id, WebSocket snapshots). */
interface CloudRecord {
  schemaVersion: string;
  tournamentId: string;
  engineVersion: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy?: { role: string; clientId: string; name: string; court: string };
  payload: TournamentPayload;
}

type SessionRole = 'local' | 'staff' | 'spectator' | string;

/** This device's link to a cloud tournament (localStorage 'ksm.cloud.session.v3_15'). */
interface CloudSession {
  tournamentId?: string;
  revision?: number;
  updatedAt?: string;
  court?: Court | '';
  clientId?: string;
  clientName?: string;
  credentials?: Record<string, string>;
  directorKey?: string;
  presence?: unknown;
}

/** Unsynced staff work queued for the cloud (localStorage 'ksm.cloud.outbox.v3_15'). */
interface CloudOutbox {
  schemaVersion: string;
  tournamentId: string;
  assignedCourt: string;
  role: SessionRole;
  baseRevision: number;
  payload: TournamentPayload;
  actions: { type: 'snapshot'; reason: string; createdAt: string }[];
  queuedAt: string;
}

// ---- Engine results (computed, not stored) ----

/** A pool standings row. Tied rows that went to a tiebreak also carry the tiebreak record. */
interface PoolStandingRow {
  name: string;
  dojo: string;
  /** Pool record (tiebreak bouts excluded). */
  wins: number;
  pts: number;
  tbWins?: number;
  tbPts?: number;
  /** Placed by a completed tiebreak. */
  seedLocked?: boolean;
}

/** Tiebreak-series record of tied players; base* is their pool record. */
interface TiebreakStatsRow { name: string; dojo: string; wins: number; pts: number; baseWins: number; basePts: number }

/** Players tied on the same pool record, occupying places start..end (1-based). */
interface TiedGroup { start: number; end: number; players: PoolStandingRow[] }

/** Seeds of a pool once it is finished: place (1-based) -> row; complete when every needed place is decided. */
interface SeedResolution { complete: boolean; seeds: Record<number, PoolStandingRow>; rows: PoolStandingRow[] }

interface TeamStandingRow {
  name: string; played: number; wins: number; losses: number; matchWins: number; pts: number;
  rank?: number;
  /** Tied with another team on wins and points: the order falls back to the name. */
  nameFallback?: boolean;
}

/** Summary of one team pairing's bouts (White team vs Red team). */
interface TeamPairSummary {
  teamWhite: string; teamRed: string;
  wWins: number; rWins: number; wPts: number; rPts: number;
  done: number; total: number; matches: Match[];
}
