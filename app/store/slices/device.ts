// Device / screen state (#15 step 2.8): this device only (the court it is pinned to, the open view, selections). Never
// in the cloud snapshot, never merged from other devices. Empty for now: docs/STORE.md lists the fields that move here.
import { createSlice } from '@reduxjs/toolkit';

/** Bumped when the shape of this slice changes. */
export const DEVICE_SLICE_VERSION = 1;

export interface DeviceSliceState {
  sliceVersion: number;
}

export const initialDeviceState: DeviceSliceState = { sliceVersion: DEVICE_SLICE_VERSION };

export const deviceSlice = createSlice({
  name: 'device',
  initialState: initialDeviceState,
  reducers: {},
});
