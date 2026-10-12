/* ksm:post-split-begin react-bridge */
// ==========================================================
// React islands bridge (app/react/legacy-bridge.ts)
// React components mounted inside this app re-render when `state` changes. The two
// places where it changes as a whole, court actions (performCourtAction) and full
// renders (renderAll, also run after a live-sync update), call ksmNotifyStateChanged(),
// which dispatches one 'ksm:state-changed' window event per task (queued in a
// microtask, so a burst of changes is one re-render). Everything lives on `window`, so
// the helpers also work before this script has finished running and in extracted-
// function tests without a window (then they do nothing).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmLegacyState(){return state}
function ksmLegacyStateVersion(){return typeof window==='undefined'?0:(window.ksmStateVersion||0)}
function ksmNotifyStateChanged(reason){
  if(typeof window==='undefined'||typeof window.dispatchEvent!=='function'||typeof CustomEvent!=='function')return;
  window.ksmStateVersion=(window.ksmStateVersion||0)+1;
  if(window.ksmStateChangeReasons){window.ksmStateChangeReasons.push(reason);return}
  window.ksmStateChangeReasons=[reason];
  queueMicrotask(()=>{const reasons=window.ksmStateChangeReasons||[];window.ksmStateChangeReasons=null;window.dispatchEvent(new CustomEvent('ksm:state-changed',{detail:{version:window.ksmStateVersion,reasons}}))});
}
/* ksm:post-split-end */
