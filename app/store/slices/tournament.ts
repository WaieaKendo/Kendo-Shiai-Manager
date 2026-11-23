// Tournament data (#15 step 2.8): shared between devices, synced, saved in the cloud snapshot, the autosave and the
// .ksm file. docs/STORE.md lists the `state` fields that move here and in which order. PR 8 moved the Setup form
// (`payload.setup`, which the DOM inputs held) into `settings`; PR 9 the divisions (`divisions`, `divisionTypes`,
// `divisionCourts`, `hiddenPresets`, `divisionRenames`); PR 10 the people (`competitors`, `teams`, `exhibitions`,
// `teamDivisions`); PR 11 the awards and the grand champions (`awards`, `grandChampions`); PR 12a the draw structure (`pools`,
// `teamPools`, `brackets`, `singleElimComps`, `byeWinners`, `generated`, `managementRevision`); PR 12b the bracket nodes
// (`championshipNodes`, `singleElimNodes`, `teamBracketNodes`, `teamElimTeams`); PR 13a the court pointers (`courtState`,
// `courtActiveDivision`, `currentByDivision`); PR 13b the court history (`courtActionHistory`, `courtRedoHistory`,
// `courtUndoLog`); PR 13c-2 the bouts (`allMatches`). `state` reads them through getters (app/modules/app-state.js).
import { createAction, createNextState, createSlice, type ActionCreatorWithPreparedPayload, type PayloadAction } from '@reduxjs/toolkit';
import { DIVISION_PRESETS, TEAM_COURT_KEY, type DivisionRename } from '../../engine/division-lists.ts';
import { statusCycle } from '../../engine/registration.ts';
import type { GrandChampion } from '../../engine/grand-champion.ts';
import type { TeamDivision } from '../../engine/team-divisions.ts';
import type { StoreWrite } from '../legacy.ts';
import { withMeta, type ActionMeta, type ActionMetaInput } from '../meta.ts';

/** Bumped when the shape of this slice changes in a way saved data must be migrated for. */
export const TOURNAMENT_SLICE_VERSION = 10;

/**
 * TEAM_COURT_KEY: the legacy team division's key ('Team Tournament', KSMEngine.LEGACY_TEAM_DIVISION_ID). Its
 * `divisionCourts` entry is not a division's court: it is derived from the Setup field `settings.teamCourt`
 * (withTeamCourt(), after every action), so the snapshot keeps the key 4.0 devices read; no division action writes it.
 */
export { TEAM_COURT_KEY };

/**
 * The Setup form as `payload.setup` has it: one text per field, keyed by the id of its Setup input (app/index.html),
 * in the order getSetupSnapshot() has always written them (the saved snapshot's key order).
 */
export interface TournamentSetup {
  tName: string; tHost: string; tDate: string; tLocation: string; tCourts: string;
  teamEnabled: string; teamFormat: string; teamTournamentFormat: string; teamCourt: string; teamAwardMode: string;
  exhibitionEnabled: string; court1Refs: string; court2Refs: string; court1RedSide: string; court2RedSide: string;
  timeRegular: string; timeQuarterfinal: string; timeSemifinal: string; timeFinal: string; timeEncho: string;
  court1TimerSound: string; court2TimerSound: string; court1TimerEnabled: string; court2TimerEnabled: string;
  court1TvRedSide: string; court2TvRedSide: string;
}

export type SetupKey = keyof TournamentSetup;

/**
 * The values the Setup inputs have when the page opens (app/index.html), in the snapshot's key order.
 * tests/store/settings.test.mjs checks them against the page; app/engine/settings.ts (SETUP_KEYS) against this order.
 */
export const initialSettings: TournamentSetup = {
  tName: 'Aiea Taiheiji Kendo Tournament', tHost: '', tDate: '', tLocation: '', tCourts: '2',
  teamEnabled: 'Enabled', teamFormat: '3-Person Team', teamTournamentFormat: 'Single Elimination', teamCourt: 'Both',
  teamAwardMode: 'top2', exhibitionEnabled: 'Disabled', court1Refs: '', court2Refs: '',
  court1RedSide: 'right', court2RedSide: 'right', timeRegular: '3:00', timeQuarterfinal: '', timeSemifinal: '',
  timeFinal: '', timeEncho: '3:00', court1TimerSound: 'whistle01', court2TimerSound: 'whistle02',
  court1TimerEnabled: 'On', court2TimerEnabled: 'On', court1TvRedSide: 'right', court2TvRedSide: 'right',
};

export interface TournamentSliceState {
  sliceVersion: number;
  /** The Setup form (`payload.setup`). */
  settings: TournamentSetup;
  /** The individual divisions in running order (`state.divisions`). A load may leave any of these five undefined. */
  divisions: string[];
  /** Each division's format (`state.divisionTypes`). */
  divisionTypes: Record<string, string>;
  /** Each division's court ('A', 'B', 'split'; team divisions and grand champions too). 'Team Tournament' = settings.teamCourt. */
  divisionCourts: Record<string, string>;
  /** Standard divisions removed from this tournament (`state.hiddenPresets`); absent until one is. */
  hiddenPresets?: string[] | undefined;
  /** The rename log the save-conflict replay uses (#25, #36); absent until a rename. */
  divisionRenames?: DivisionRename[] | undefined;
  /** Registration's players, in the order they were added (`state.competitors`): `{name, dojo, division, seed, status}`. */
  competitors: PersonRow[];
  /** Registration's teams (`state.teams`): `{team, id, teamDivisionId, type, senpo, …, status}`; merged by id on save conflicts (#95). */
  teams: PersonRow[];
  /** Exhibition matches (`state.exhibitions`): `{white, red, division, status}`. */
  exhibitions: PersonRow[];
  /** The team divisions (`state.teamDivisions`), in the order they were added; absent until the load-time migration builds them. */
  teamDivisions?: TeamDivision[] | undefined;
  /** Results' special awards in the order they were added (`state.awards`): `{award, name, dojo}`; merged three-way on save conflicts. */
  awards: AwardRow[];
  /** The grand champion rows (#86) in running order (`state.grandChampions`); absent until one is added; merged by id on save conflicts. */
  grandChampions?: GrandChampion[] | undefined;
  // The draw (PR 12a), each a map by division (an individual division, a team division's id, 'Exhibition Matches', a
  // grand champion's id). Replayed per division on save conflicts (KSM_STRUCTURAL_DIVISION_KEYS). A load may leave any
  // of them undefined; `singleElimComps` and `byeWinners` are absent until the first whole-tournament generate.
  /** Each division's pools (`state.pools`): `{label, size, players: [{name, dojo, poolSlot?, …}], court?}`. */
  pools?: Record<string, DrawRow[]> | undefined;
  /** A team round robin's pools (`state.teamPools`). */
  teamPools?: Record<string, DrawRow[]> | undefined;
  /** A pool division's championship template (`state.brackets`): the seed labels of its first round. */
  brackets?: Record<string, unknown[]> | undefined;
  /** An individual single elimination's entrants in bracket order (`state.singleElimComps`): Registration's rows themselves, `null` for a No Show. */
  singleElimComps?: Record<string, (DrawRow | null)[]> | undefined;
  /** First-round bye winners of a championship (`state.byeWinners`); no code writes an entry today, a load may carry them. */
  byeWinners?: Record<string, DrawRow[]> | undefined;
  /** Whether the tournament was generated (`state.generated`). */
  generated?: boolean | undefined;
  /** Bumped by each structural edit (`state.managementRevision`); the save-conflict rebase compares it. */
  managementRevision?: number | undefined;
  // The bracket nodes (PR 12b), maps by division like the draw: a node's `winner` advances while bouts are scored
  // (tournament/advancementApplied). Replayed per division on save conflicts with the draw.
  /** A pool division's championship nodes (`state.championshipNodes`): `{id, round, slot, left, right, …}`. */
  championshipNodes?: Record<string, DrawRow[]> | undefined;
  /** An individual single elimination's nodes (`state.singleElimNodes`): `{id, round, slot, left, right, winner: {name, dojo} | null}`. */
  singleElimNodes?: Record<string, DrawRow[]> | undefined;
  /** A team bracket's nodes (`state.teamBracketNodes`): `{id, round, court, slot, left, right, winner?: team name}`. */
  teamBracketNodes?: Record<string, DrawRow[]> | undefined;
  /** A team division's teams in bracket order (`state.teamElimTeams`): Registration's team rows themselves, `null` for a No Show. */
  teamElimTeams?: Record<string, (DrawRow | null)[]> | undefined;
  // The court pointers (PR 13a): what each court is running. Written by that court's own actions (court/…, `meta.court`),
  // with a division's draw (its queue position) and by a structural edit re-resolving the courts. A load may leave any
  // of them undefined.
  /** Each division's queue position (`state.currentByDivision`): the index the division's court screen was last on. */
  currentByDivision?: Record<string, number | undefined> | undefined;
  /** What each court runs (`state.courtState`): `{division, index}` into `allMatches[division]` ('A', 'B'). */
  courtState?: Record<string, CourtPointer | null | undefined> | undefined;
  /** Each court's division (`state.courtActiveDivision`): `courtState[c].division` kept twice (4.0 reads both). */
  courtActiveDivision?: Record<string, string | null | undefined> | undefined;
  // The court history (PR 13b), per court ('A', 'B'): saved so a replacement tablet can still undo, replayed by the
  // save-conflict rebase, read by 4.0 devices. Entries are the app's plain JSON (`patch-v1`, `history-op-v1`), never
  // edited once recorded. A load may leave any of them undefined; `courtUndoLog` is absent until the first Undo/Redo.
  /** Each court's Undo list, oldest first (`state.courtActionHistory`): the court actions' `patch-v1` entries. */
  courtActionHistory?: CourtHistories | undefined;
  /** Each court's Redo list (`state.courtRedoHistory`), the last undone last. */
  courtRedoHistory?: CourtHistories | undefined;
  /** Each court's F30 Undo log (`state.courtUndoLog`): every Undo/Redo, which the rebase replays in time order. */
  courtUndoLog?: CourtHistories | undefined;
  /**
   * The bouts (PR 13c-2), by division (`state.allMatches`): each division's list in running order, plain JSON the app
   * built. Written only by app/modules/court/match-writes.js (matchActions), a load and an Undo/Redo. A load may leave it
   * undefined.
   */
  allMatches?: Record<string, MatchRow[]> | undefined;
}

/** A bout (`allMatches[division][i]`): plain JSON the app built (`white`, `red`, `wp`, `rp`, `done`, …). */
export type MatchRow = Record<string, unknown>;

/** A court history entry: plain JSON the app built (app/modules/court/court-scoring-and-history.js). */
export type CourtHistoryEntry = Record<string, unknown>;
/** One history map: each court's list. */
export type CourtHistories = Record<string, CourtHistoryEntry[]>;

/** A court's pointer: the division it runs and the index of its bout in that division's match list. */
export type CourtPointer = { division: string | null; index: number } & Record<string, unknown>;

/** A row of the draw (a pool, a pool player, an entrant): plain JSON the engine built. */
export type DrawRow = Record<string, unknown>;

/** A special award as Results' editor holds it. Rows have no id: an award action names its row by its index. */
export type AwardRow = Record<string, unknown>;

/**
 * A Registration row (a player, a team, an exhibition match). Rows have no common id (players and exhibition matches
 * have none; old teams neither): a row action names it by its index in the list, which the app resolves from the row the
 * screen showed right before the dispatch (app/modules/registration/people-store.js).
 */
export type PersonRow = Record<string, unknown>;
/** The three lists of rows, by key. */
export type PeopleKey = 'competitors' | 'teams' | 'exhibitions';

const presetsBy = (i: 1 | 2): Record<string, string> => Object.fromEntries(DIVISION_PRESETS.map(p => [p[0], p[i]]));

export const initialTournamentState: TournamentSliceState = {
  sliceVersion: TOURNAMENT_SLICE_VERSION,
  settings: { ...initialSettings },
  divisions: DIVISION_PRESETS.map(p => p[0]),
  divisionTypes: presetsBy(1),
  // The team court's entry ('Team Tournament': settings.teamCourt) follows: withTeamCourt() adds it on the store's first action.
  divisionCourts: presetsBy(2),
  competitors: [],
  teams: [],
  exhibitions: [],
  awards: [],
  // Where the literal of app/modules/app-state.js had them: `singleElimComps` and `byeWinners` stay absent.
  pools: {},
  teamPools: {},
  brackets: {},
  generated: false,
  managementRevision: 0,
  championshipNodes: {},
  singleElimNodes: {},
  teamBracketNodes: {},
  teamElimTeams: {},
  // Where the literal of app/modules/app-state.js had them.
  currentByDivision: {},
  courtState: { A: { division: null, index: 0 }, B: { division: null, index: 0 } },
  courtActiveDivision: { A: null, B: null },
  courtActionHistory: { A: [], B: [] },
  courtRedoHistory: { A: [], B: [] },
  allMatches: {},
};

/**
 * The tournament slice with its one derived entry in place: `divisionCourts['Team Tournament']` is `settings.teamCourt`
 * (created, with `divisionCourts` itself, when missing). The same object when it already is. The root reducer runs it
 * after every action (the slices' and the legacy writes), so no write anywhere can make the two differ.
 */
export function withTeamCourt(s: TournamentSliceState): TournamentSliceState {
  const court = s.settings?.teamCourt;
  return court === undefined || s.divisionCourts?.[TEAM_COURT_KEY] === court ? s : createNextState(s, draft => {
    (draft.divisionCourts ||= {})[TEAM_COURT_KEY] = court;
  });
}

/**
 * The division lists a division action sets: each key it names gets that value (the five `state` fields of PR 9; a
 * rename's `competitors` too, PR 10; its `grandChampions`, PR 11; the courts' divisions, PR 13a).
 */
export type DivisionLists = Partial<Pick<TournamentSliceState, 'divisions' | 'divisionTypes' | 'divisionCourts' | 'hiddenPresets' | 'divisionRenames' | 'competitors' | 'grandChampions'
  | 'courtState' | 'courtActiveDivision'>>;
/** The people lists a bulk or team division action sets (PR 10): each key it names gets that value. */
export type PeopleLists = Partial<Pick<TournamentSliceState, PeopleKey | 'teamDivisions'>>;
/** The lists an awards / grand champion action sets (PR 11): each key it names gets that value. */
export type AwardLists = Partial<Pick<TournamentSliceState, 'awards' | 'grandChampions'>>;

/** The court pointer maps (PR 13a). */
export type PointerKey = 'currentByDivision' | 'courtState' | 'courtActiveDivision';
/**
 * The draw lists a structure action sets (PR 12a; the bracket nodes since PR 12b; a division's queue position since PR
 * 13a, and whole pointer maps for the test API): each key it names gets that value.
 */
export type DrawLists = Partial<Pick<TournamentSliceState, 'pools' | 'teamPools' | 'brackets' | 'singleElimComps' | 'byeWinners' | 'generated' | 'managementRevision'
  | 'championshipNodes' | 'singleElimNodes' | 'teamBracketNodes' | 'teamElimTeams' | PointerKey>>;
/**
 * A court action's pointer entries (PR 13a): each entry it names is set in its map (a court's pointer, its division, a
 * division's queue position), as `state.courtState[c] = cs` did; the other entries stay. A missing map is created.
 */
export type CourtPointers = Partial<Pick<TournamentSliceState, PointerKey>>;

/** The court history maps (PR 13b). */
export type HistoryKey = 'courtActionHistory' | 'courtRedoHistory' | 'courtUndoLog';
/**
 * A court history action's payload (PR 13b): `writes`, each value at its store path, applied by the root reducer
 * (app/store/store.ts) like the legacy writes: a court's new list (['tournament', 'courtActionHistory', 'A']), a whole
 * map, and for an Undo/Redo every store-owned key its patches changed (bracket nodes, pointers, …), all in one dispatch.
 * Not an Immer reducer on purpose: a draft given a new list of 100 entries walks all of them (and their patches) when it
 * finalizes, on every point (docs/STORE.md section 3 item 13, PR 13b's measurements); a path write copies only the path.
 * app/modules/court/court-history-store.js computes the lists from the store's right before the dispatch.
 */
export interface HistoryWrites { writes: StoreWrite[] }

const courtAction = <P = CourtPointers>(type: string) => createAction(`court/${type}`, withMeta<P>());
/**
 * The court pointer actions (PR 13a), typed `court/…`, each with `meta.court` (the court whose pointer moves; null for a
 * structural edit). One reducer: the entries the payload names are set (app/modules/court/court-pointers-store.js
 * computes them, right before the dispatch).
 */
export const courtActions = {
  /** Court c's scorekeeper picks a division on its court screen (a court opened, a division chosen). */
  divisionSelected: courtAction('divisionSelected'),
  /** Court c's pointer moves on: Next Match, a render's self-heal, the catch-up after Staff Login, a load's reconciliation. */
  pointerMoved: courtAction('pointerMoved'),
  /** Courts re-resolved by a structural edit (generation, Edit Pool, a division's court, a grand champion, a tiebreak reorder). */
  pointersResolved: courtAction('pointersResolved'),
};
/** The court history actions (PR 13b), each with `meta.court` (the court whose history it is; null for both courts'). */
export const courtHistoryActions = {
  /** A court action's entry: pushed on the court's Undo list (its oldest dropped beyond 100), the court's Redo list cleared. */
  actionRecorded: courtAction<HistoryWrites>('actionRecorded'),
  /** The court's last action undone: moved to its Redo list, the Undo logged (F30), its store-owned keys written. */
  undo: courtAction<HistoryWrites>('undo'),
  /** The court's last undone action redone: moved back to its Undo list, the Redo logged, its store-owned keys written. */
  redo: courtAction<HistoryWrites>('redo'),
  /** The Undo / Redo maps created where missing and pre-`patch-v1` entries dropped (ensureCourtHistory()). */
  historyNormalized: courtAction<HistoryWrites>('historyNormalized'),
  /** A grand champion's draw gone: its bouts' patches dropped from both courts' lists (an entry left empty with them). */
  historyForgotten: courtAction<HistoryWrites>('historyForgotten'),
};
/** The match actions' keys (each `tournament/<key>`, except matchUpdated: `court/matchUpdated`). */
type MatchActionKey = 'matchUpdated' | 'allMatchesSet' | 'divisionMatchesSet' | 'matchesUpdated' | 'matchesAdded' | 'matchesRemoved' | 'matchesSorted' | 'matchesPatched';
/**
 * The bouts (PR 13c-2): every write of `allMatches` is one of these, one per call of a helper of
 * app/modules/court/match-writes.js. Like the history actions, the payload is `writes` (the new map at
 * ['tournament', 'allMatches'], whose copied lists and bouts are the only new objects), applied by the root reducer as a
 * path copy: never an Immer reducer over a whole list. court/… is a court's own write (`meta.court`); tournament/… the
 * rest (draws, syncs, repairs, the test API). An Undo/Redo writes its bouts in its own court/undo or court/redo.
 *   - matchUpdated: one bout's fields (ksmUpdateMatch()): a point, a result, a representative, a grand champion's
 *     Fusen-sho, a repair;
 *   - allMatchesSet: the whole map (ksmSetAllMatches()): Generate Tournament's reset, a division renamed;
 *   - divisionMatchesSet: a division's list replaced or taken out (ksmSetDivisionMatches(), ksmDeleteDivisionMatches()):
 *     a draw, a rebuild, a dedupe;
 *   - matchesUpdated: several bouts' fields (ksmUpdateMatches()): an engine sync's plan, a division's courts, a
 *     substitution, a repair;
 *   - matchesAdded: bouts added (ksmInsertMatches(), ksmAppendMatches()): a tiebreak, a playoff, kachinuki's next bout, a
 *     template's missing bouts;
 *   - matchesRemoved: bouts taken out (ksmRemoveMatches());
 *   - matchesSorted: a division's bouts reordered (ksmSortDivisionMatches());
 *   - matchesPatched: path writes, one or a batch (ksmWriteMatchPath(), ksmWriteMatchPaths()).
 * (Built from the names, so the eight cost one copy of the code in the store bundle, docs/STORE.md section 5.)
 */
export const matchActions = Object.fromEntries((['matchUpdated', 'allMatchesSet', 'divisionMatchesSet', 'matchesUpdated', 'matchesAdded', 'matchesRemoved',
  'matchesSorted', 'matchesPatched'] as const).map(key => [key, createAction(`${key === 'matchUpdated' ? 'court' : 'tournament'}/${key}`, withMeta<HistoryWrites>())])) as
  unknown as Record<MatchActionKey, ActionCreatorWithPreparedPayload<[HistoryWrites, ActionMetaInput?], HistoryWrites, string, never, ActionMeta>>;
/**
 * A tournament loaded (#15 item 14a; docs/STORE.md section 2 point 4): a load, a remote apply, a rebase's result, the
 * tournament switch's empty state. One action for the whole payload, as its migrated, repaired copy has it: `writes` holds
 * each store-owned tournament key's value at its path (['tournament', key]; a key the payload lacks as undefined), applied
 * by the root reducer as a path copy like the history and match actions (no Immer walk over a whole loaded tournament).
 * Never the device fields (this device's view, point 4) nor the Setup fields (applySetupSnapshot() sets those with the
 * Setup's precedence). Built by ksmLoadTournamentState() (app/modules/app-state.js), which replaced replaceState().
 */
export const tournamentLoaded = createAction<HistoryWrites>('tournament/loaded');
function setCourtPointers(state: TournamentSliceState, { payload }: { payload: CourtPointers }) {
  for (const key of ['currentByDivision', 'courtState', 'courtActiveDivision'] as const) {
    const entries = payload[key];
    if (entries) Object.assign((state[key] ||= {}) as object, entries);
  }
}

/**
 * Every division action has this one reducer: it sets the lists its payload names. What an edit does to them is pure
 * engine code (app/engine/divisions.ts: addedDivision(), removedDivision(), movedDivision(), renamedDivisionState(), …),
 * run by the app's helper (app/modules/setup/division-setup.js) on the store's current lists right before the dispatch,
 * not here: the store is bundled on its own into app.js under a gzip budget (docs/STORE.md section 5), and ten reducers
 * repeating the engine's rules did not fit. The team court's entry is never a division's: withTeamCourt() puts the Setup
 * field back after every action, so a payload cannot change it.
 */
const setDivisionLists = {
  reducer(state: TournamentSliceState, action: PayloadAction<DivisionLists, string, ActionMeta>) {
    Object.assign(state, action.payload);
  },
  prepare: withMeta<DivisionLists>(),
};
/** The same reducer for the people lists (PR 10): the bulk writes and the team divisions' edits. */
const setPeopleLists = setDivisionLists as unknown as {
  reducer(state: TournamentSliceState, action: PayloadAction<PeopleLists, string, ActionMeta>): void;
  prepare: ReturnType<typeof withMeta<PeopleLists>>;
};

/** The same reducer for the awards and grand champion lists (PR 11). */
const setAwardLists = setDivisionLists as unknown as {
  reducer(state: TournamentSliceState, action: PayloadAction<AwardLists, string, ActionMeta>): void;
  prepare: ReturnType<typeof withMeta<AwardLists>>;
};

/** The same reducer for the draw (PR 12a): the app computes each map with one division's entries changed. */
const setDrawLists = setDivisionLists as unknown as {
  reducer(state: TournamentSliceState, action: PayloadAction<DrawLists, string, ActionMeta>): void;
  prepare: ReturnType<typeof withMeta<DrawLists>>;
};

/** Rows appended to a list (one action for Add 3 rows). */
export interface RowsAdded { rows: PersonRow[] }
/** A row's fields: `changes` assigned to the row at `index` (a field the row lacks is added at its end, as an assignment did). */
export interface RowUpdated { index: number; changes: PersonRow }
/** The row at `index`. */
export interface RowAt { index: number }
type RowReducer<P> = { reducer(state: TournamentSliceState, action: PayloadAction<P, string, ActionMeta>): void; prepare: ReturnType<typeof withMeta<P>> };
/** The four row actions of one list; an index with no row changes nothing. */
type RowReducers<N extends string> = Record<`${N}Added`, RowReducer<RowsAdded>> & Record<`${N}Updated`, RowReducer<RowUpdated>>
  & Record<`${N}Removed`, RowReducer<RowAt>> & Record<`${N}StatusCycled`, RowReducer<RowAt>>;
/**
 * `competitorAdded`, `…Updated`, `…Removed`, `…StatusCycled` (the engine's statusCycle(): Registered → Checked → NoShow →
 * Registered) for one list. Built from the name, so the three lists cost one copy of the code in the store bundle.
 */
function rowReducers<N extends string>(name: N, key: PeopleKey): RowReducers<N> {
  const row = (s: TournamentSliceState, i: number): PersonRow | undefined => s[key][i];
  const r = <P>(reducer: (s: TournamentSliceState, p: P) => void): RowReducer<P> =>
    ({ reducer: (s, a) => reducer(s, a.payload), prepare: withMeta<P>() });
  return {
    [`${name}Added`]: r<RowsAdded>((s, p) => { s[key].push(...p.rows); }),
    [`${name}Updated`]: r<RowUpdated>((s, p) => { const x = row(s, p.index); if (x) Object.assign(x, p.changes); }),
    [`${name}Removed`]: r<RowAt>((s, p) => { if (row(s, p.index)) s[key].splice(p.index, 1); }),
    [`${name}StatusCycled`]: r<RowAt>((s, p) => { const x = row(s, p.index); if (x) x['status'] = statusCycle(x['status'] as string); }),
  } as RowReducers<N>;
}

// Values arrive normalized as the field's input would hold them (KSMEngine.normalizeSetup / normalizeSetupValue, called
// by the app's adapters in cloud-session-and-autosave.js); the reducers take a text for a Setup field, nothing else.
function put(settings: TournamentSetup, key: string, value: unknown): void {
  if (Object.hasOwn(settings, key) && typeof value === 'string') settings[key as SetupKey] = value;
}

export const tournamentSlice = createSlice({
  name: 'tournament',
  initialState: initialTournamentState,
  reducers: {
    /**
     * A tournament's Setup was loaded (a load, a remote apply, a rebase result, a file, the tournament switch, the
     * reset, the page opening): applySetupSnapshot(). As that function did with the inputs, each Setup field the object
     * names is set and a field it does not name keeps its value.
     */
    settingsLoaded: {
      reducer(state, action: PayloadAction<Partial<TournamentSetup>, string, ActionMeta>) {
        for (const [key, value] of Object.entries(action.payload)) put(state.settings, key, value);
      },
      prepare: withMeta<Partial<TournamentSetup>>(),
    },
    /** One Setup field edited: the user in its input, or the app (ksmSetSetting()). */
    settingChanged: {
      reducer(state, action: PayloadAction<{ key: SetupKey; value: string }, string, ActionMeta>) {
        put(state.settings, action.payload.key, action.payload.value);
      },
      prepare: withMeta<{ key: SetupKey; value: string }>(),
    },
    // The division actions (#15 PR 9), one reducer (setDivisionLists above); the name says which edit it was.
    /** An individual division added (Add division, a preset switched on, a Registration row's division). */
    divisionAdded: setDivisionLists,
    /** A division taken out of the running order (removed, or a preset switched off), with or without its format and court. */
    divisionRemoved: setDivisionLists,
    /** A division moved one place up or down in the running order (#31). */
    divisionMoved: setDivisionLists,
    /**
     * A division renamed (#25), as one action: the running order, formats and courts renamedDivisionState() rewrote and
     * `divisionRenames` with the record appended, the players and grand champions (PRs 10, 11) and the courts' pointers
     * (`courtState`, `courtActiveDivision`, PR 13a): everything renamedDivisionState() rewrites.
     */
    divisionRenamed: setDivisionLists,
    /** A division's format. */
    divisionFormatChanged: setDivisionLists,
    /** Division courts (a division, a team division, a grand champion, the exhibitions; a default 'A'; one forgotten). */
    divisionCourtChanged: setDivisionLists,
    /** All individual divisions at once (the sample tournament). */
    divisionsReplaced: setDivisionLists,
    /** A standard division removed from this tournament: hidden from the presets. */
    presetHidden: setDivisionLists,
    /** Restore standard divisions: none hidden. */
    presetsRestored: setDivisionLists,
    // The people (#15 PR 10). Row actions name a row by its index (PersonRow); the bulk and team division actions set
    // lists the app computed with the engine (app/modules/registration/people-store.js), like the division actions.
    ...rowReducers('competitor', 'competitors'),
    ...rowReducers('team', 'teams'),
    ...rowReducers('exhibition', 'exhibitions'),
    /**
     * Whole lists at once: the samples, Clear, the team-division migration (ksmTeamDivisions(): `teamDivisions` built and
     * every team given an id and a team division), the test API.
     */
    peopleLoaded: setPeopleLists,
    /** A team division added (and, for the first one, the teams without one put in it). */
    teamDivisionAdded: setPeopleLists,
    /** A team division's fields (and its teams' match format with it). */
    teamDivisionUpdated: setPeopleLists,
    /** The team divisions' running order (`order`). */
    teamDivisionMoved: setPeopleLists,
    /** A team division removed, its teams moved to another one. */
    teamDivisionRemoved: setPeopleLists,
    // Awards and grand champions (#15 PR 11). Like the team divisions' edits, each is computed by the app from the current
    // rows (an award has no id: its row is found by its index right before the dispatch, in the same synchronous step;
    // a grand champion has an id and engine rules) and the reducer sets the list it is given.
    /** An award row added at the end (Results' Add award). */
    awardAdded: setAwardLists,
    /** An award's fields (an input's change); a field the row lacks is added at its end, as an assignment did. */
    awardSet: setAwardLists,
    /** An award removed (×). */
    awardRemoved: setAwardLists,
    /** The whole award list at once (the test API; a load goes through legacy/stateReplaced). */
    awardsLoaded: setAwardLists,
    /** A grand champion row added (with its court in `divisionCourts`, a separate action as before). */
    grandChampionAdded: setAwardLists,
    /** A grand champion row's fields, or a director's decision saved in it (keep / rebuild, a stand-in). */
    grandChampionUpdated: setAwardLists,
    /** The grand champions' running order (`order`). */
    grandChampionMoved: setAwardLists,
    /** A grand champion row removed (before its draw). */
    grandChampionRemoved: setAwardLists,
    // The draw (#15 PR 12a). Like the lists above, each is computed by the app (app/modules/engine/structure-store.js)
    // from the current maps and the engine's plan, and the reducer sets the maps it is given. The division's bouts
    // (`allMatches`, PR 13c-2: matchActions) are written in the same synchronous step right before the dispatch. A draw
    // action carries the division's bracket nodes too (PR 12b) and its queue position (`currentByDivision`, PR 13a).
    /** Generate Tournament starts: every division's pools, team pools, brackets, entrants and bye winners empty. */
    drawReset: setDrawLists,
    /** One division drawn from the engine's plan (generateDivision()): its entries in the maps it uses. */
    divisionGenerated: setDrawLists,
    /** Generate Tournament done: `generated` and the managementRevision bump. */
    tournamentGenerated: setDrawLists,
    /** Regenerate Single Division: the division's old entries removed, the new draw and the managementRevision bump. */
    divisionRegenerated: setDrawLists,
    /** A division's draw removed (a grand champion's draw cleared) or put back (a regenerate that failed). */
    divisionCleared: setDrawLists,
    /** Edit Pool's Save Pool Changes: the division's pools (and its championship template) and the bump. */
    poolsEdited: setDrawLists,
    /**
     * A drawn division's rows changed without a new draw: a No Show (with the bump), a grand champion's stand-in, a
     * division's court changed (its pools' courts), a pool's split court kept on it (poolCourtFor()), a Registration row
     * edit followed into the entrants; the test API's whole maps.
     */
    drawEntriesUpdated: setDrawLists,
    /**
     * Bracket winners advanced (PR 12b): the node lists a sync of a bracket gave new winners (a scored bout, a load's
     * repair), once per sync, after its bouts were written. Never a new draw.
     */
    advancementApplied: setDrawLists,
  },
  extraReducers: builder => {
    for (const action of Object.values(courtActions)) builder.addCase(action, setCourtPointers);
  },
});
