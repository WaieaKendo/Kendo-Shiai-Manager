// The rest of Live Scores is in app/modules/results/live-scores.js. These stay because ksmLinkParams() (00-path-urls.js)
// cannot be read while the modules load, and tests read the constant.
const KSM_TV_ASSIGNED_COURT=(()=>{const value=(ksmLinkParams().get('court')||'A').toUpperCase();return value==='B'?'B':'A'})();
function tvAssignedCourt(){return KSM_TV_ASSIGNED_COURT}
