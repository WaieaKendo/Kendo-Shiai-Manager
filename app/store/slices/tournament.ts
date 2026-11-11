// Tournament data (#15 step 2.8): shared between devices, synced, saved in the cloud snapshot, the autosave and the
// .ksm file. Empty for now: docs/STORE.md lists the `state` fields that move here and in which order.
import { createSlice } from '@reduxjs/toolkit';

/** Bumped when the shape of this slice changes in a way saved data must be migrated for. */
export const TOURNAMENT_SLICE_VERSION = 1;

export interface TournamentSliceState {
  sliceVersion: number;
}

export const initialTournamentState: TournamentSliceState = { sliceVersion: TOURNAMENT_SLICE_VERSION };

export const tournamentSlice = createSlice({
  name: 'tournament',
  initialState: initialTournamentState,
  reducers: {},
});
