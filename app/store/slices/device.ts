// Device / screen state (#15 step 2.8): this device only (the court it is pinned to, the open view, selections). Never
// merged from other devices, and a load never overwrites it (replaceState() skips device keys). Still written into the
// snapshot for 4.0 devices: `state` reads these through getters (moveToStore()). docs/STORE.md lists the fields that
// move here; PR 5 moved the first two.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** Bumped when the shape of this slice changes. */
export const DEVICE_SLICE_VERSION = 2;

/** The Registration tab (state.regMode as regTab() sets it; any text is kept as given). */
export type RegistrationTab = 'individual' | 'team' | 'exhibition' | 'pools';

export interface DeviceSliceState {
  sliceVersion: number;
  /** The open Registration tab. */
  regMode: RegistrationTab;
  /** The division the Pools tab shows. */
  poolViewDivision: string;
}

// The defaults of the `state` object in app/modules/app-state.js.
export const initialDeviceState: DeviceSliceState = {
  sliceVersion: DEVICE_SLICE_VERSION,
  regMode: 'individual',
  poolViewDivision: 'Women’s Open',
};

export const deviceSlice = createSlice({
  name: 'device',
  initialState: initialDeviceState,
  reducers: {
    /** regTab(): the Registration tab this device opened. */
    registrationTabChanged(state, action: PayloadAction<RegistrationTab>) { state.regMode = action.payload; },
    /** The Pools tab's division select, the pool/court order renders and generation. */
    poolViewDivisionChanged(state, action: PayloadAction<string>) { state.poolViewDivision = action.payload; },
  },
});
