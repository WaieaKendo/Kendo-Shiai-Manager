// @ts-check
import {state} from '../app-state.js';
import {cloudSession} from '../sync/cloud-session-and-autosave.js';
// ==========================================================
// React islands bridge: the legacy `state` and the cloud session, for the islands' publishers
// (app/react/features/*/publish.ts read them through window). An island that re-renders when
// the tournament changes subscribes to the store (window.KSMStore.subscribe, or
// useStoreSelector() in app/store/react.ts); the 'ksm:state-changed' window event that did
// this before #15 item 14a is gone (docs/STORE.md section 4).
// ==========================================================
export function ksmLegacyState(){return state}
export function ksmLegacyCloudSession(){return cloudSession}
