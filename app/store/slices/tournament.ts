// Tournament data (#15 step 2.8): shared between devices, synced, saved in the cloud snapshot, the autosave and the
// .ksm file. docs/STORE.md lists the `state` fields that move here and in which order. PR 8 moved the Setup form
// (`payload.setup`, which the DOM inputs held) into `settings`.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { withMeta, type ActionMeta } from '../meta.ts';

/** Bumped when the shape of this slice changes in a way saved data must be migrated for. */
export const TOURNAMENT_SLICE_VERSION = 2;

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
}

export const initialTournamentState: TournamentSliceState = { sliceVersion: TOURNAMENT_SLICE_VERSION, settings: { ...initialSettings } };

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
  },
});
