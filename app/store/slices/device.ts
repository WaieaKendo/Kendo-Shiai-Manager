// Device / screen state (#15 step 2.8): this device only (the court it is pinned to, the open view, selections). Never
// merged from other devices, and a load never overwrites it (replaceState() skips device keys). Still written into the
// snapshot for 4.0 devices: `state` reads these through getters (moveToStore()). docs/STORE.md lists the fields that
// move here; PR 5 moved the first two, PR 6 the court view, PR 7 the shown match index and the score pad.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** Bumped when the shape of this slice changes. */
export const DEVICE_SLICE_VERSION = 4;

/** The Registration tab (state.regMode as regTab() sets it; any text is kept as given). */
export type RegistrationTab = 'individual' | 'team' | 'exhibition' | 'pools';

/** The division a court device chose, per court (was `ksmLocalCourtDivision` in sync-state-and-rebase.js). */
export interface LocalCourtDivisions { A: string | null; B: string | null }

/** The score pad of the match a court screen shows (state.score): points per side and hansoku counts. */
export interface ActiveScore { W: string[]; R: string[]; WT: number; RT: number }

/** An empty score pad (a fresh or finished match). */
export const emptyActiveScore = (): ActiveScore => ({ W: [], R: [], WT: 0, RT: 0 });

export interface DeviceSliceState {
  sliceVersion: number;
  /** The open Registration tab. */
  regMode: RegistrationTab;
  /** The division the Pools tab shows. */
  poolViewDivision: string;
  /** The court this device scores or shows (state.currentCourt; set from the court pin). */
  currentCourt: string;
  /** The court Live Scores / the TV follows (state.publicCourt). */
  publicCourt: string;
  /** The division this device's court screen shows (state.currentDivision). */
  currentDivision: string | null;
  /** The division this device chose per court; a load and a remote apply keep it (not in `state` or the snapshot). */
  localCourtDivision: LocalCourtDivisions;
  /** The index in allMatches[currentDivision] of the match this device's court screen shows (state.current). */
  currentMatchIndex: number;
  /** The score pad per court (state.score is this device's court's pad); copied into the match by the court actions. */
  activeScore: Record<string, ActiveScore>;
}

// The defaults of the `state` object in app/modules/app-state.js.
export const initialDeviceState: DeviceSliceState = {
  sliceVersion: DEVICE_SLICE_VERSION,
  regMode: 'individual',
  poolViewDivision: 'Women’s Open',
  currentCourt: 'A',
  publicCourt: 'A',
  currentDivision: 'Women’s Open',
  localCourtDivision: { A: null, B: null },
  currentMatchIndex: 0,
  activeScore: { A: emptyActiveScore(), B: emptyActiveScore() },
};

export const deviceSlice = createSlice({
  name: 'device',
  initialState: initialDeviceState,
  reducers: {
    /** regTab(): the Registration tab this device opened. */
    registrationTabChanged(state, action: PayloadAction<RegistrationTab>) { state.regMode = action.payload; },
    /** The Pools tab's division select, the pool/court order renders and generation. */
    poolViewDivisionChanged(state, action: PayloadAction<string>) { state.poolViewDivision = action.payload; },
    /** The court this device shows: a court opened, a load (from the pin), restorePinnedCourt(). */
    courtChosen(state, action: PayloadAction<string>) { state.currentCourt = action.payload; },
    /** The court Live Scores / the TV follows. */
    publicCourtChanged(state, action: PayloadAction<string>) { state.publicCourt = action.payload; },
    /** The division this device's court screen shows (a view choice; the court's shared pointer is separate). */
    divisionShown(state, action: PayloadAction<string | null>) { state.currentDivision = action.payload; },
    /** The division this device chose for a court (a court opened, a division picked, a load's rehydrate). */
    localCourtDivisionChosen(state, action: PayloadAction<{ court: 'A' | 'B'; division: string | null }>) {
      state.localCourtDivision[action.payload.court] = action.payload.division;
    },
    /** A new tournament: no court division chosen yet. */
    localCourtDivisionsCleared(state) { state.localCourtDivision = { A: null, B: null }; },
    /** The match this device's court screen shows: its index in the shown division's match list. */
    matchShown(state, action: PayloadAction<number>) { state.currentMatchIndex = action.payload; },
    /** A court's score pad changed (a point, a hansoku, a fusen, a match loaded or the pad emptied). */
    scoreChanged(state, action: PayloadAction<{ court: string; score: ActiveScore }>) {
      const { W, R, WT, RT } = action.payload.score;
      state.activeScore[action.payload.court] = { W: [...W], R: [...R], WT, RT };
    },
    /** A tournament closed: every court's pad is empty again. */
    scoresCleared(state) { state.activeScore = { A: emptyActiveScore(), B: emptyActiveScore() }; },
  },
});
