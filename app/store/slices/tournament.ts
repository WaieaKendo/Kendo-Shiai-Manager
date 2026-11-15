// Tournament data (#15 step 2.8): shared between devices, synced, saved in the cloud snapshot, the autosave and the
// .ksm file. docs/STORE.md lists the `state` fields that move here and in which order. PR 8 moved the Setup form
// (`payload.setup`, which the DOM inputs held) into `settings`; PR 9 the divisions (`divisions`, `divisionTypes`,
// `divisionCourts`, `hiddenPresets`, `divisionRenames`); PR 10 the people (`competitors`, `teams`, `exhibitions`,
// `teamDivisions`). `state` reads them through getters (app/modules/app-state.js).
import { createNextState, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DIVISION_PRESETS, TEAM_COURT_KEY, type DivisionRename } from '../../engine/division-lists.ts';
import { statusCycle } from '../../engine/registration.ts';
import type { TeamDivision } from '../../engine/team-divisions.ts';
import { withMeta, type ActionMeta } from '../meta.ts';

/** Bumped when the shape of this slice changes in a way saved data must be migrated for. */
export const TOURNAMENT_SLICE_VERSION = 4;

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
}

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
 * rename's `competitors` too, PR 10).
 */
export type DivisionLists = Partial<Pick<TournamentSliceState, 'divisions' | 'divisionTypes' | 'divisionCourts' | 'hiddenPresets' | 'divisionRenames' | 'competitors'>>;
/** The people lists a bulk or team division action sets (PR 10): each key it names gets that value. */
export type PeopleLists = Partial<Pick<TournamentSliceState, PeopleKey | 'teamDivisions'>>;

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
     * `divisionRenames` with the record appended. The rest of what it rewrites (competitors, grand champions, the courts'
     * divisions) is not in the store yet: the app assigns it just before this dispatch (ksmRenameSetupDivision()).
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
  },
});
