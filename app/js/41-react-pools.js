// ==========================================================
// React Pools view (app/react/features/pools/, roadmap M.13, #136 step 2)
// The Pools view (Registration -> Pools, #poolsReg) draws #poolOutput with one React island,
// mounted by app/react/features/pools/main.tsx. The island's input is computed by the module
// (publish.ts: the division's pools, the message when there are none, whether Edit Pool is offered,
// the Championship Preview / Team Standings, and the editor, as plain data in window.ksmPoolsInput);
// legacy only signals. renderPools() (08-engine-generation.js) calls ksmRenderPools(div) and
// toggleEditPools() (16-court-context-and-pool-editing.js) ksmRenderPoolEditor(div) below; each
// records the request (window.ksmPoolsRequested = {kind:'pools'|'editor', div}) and dispatches
// ksm:pools. They must not call a function defined in the module: this script runs before it (the
// module may not exist yet, or at all). The module computes the LAST request, on the event and
// once when it loads, for a request that came earlier.
// tests/golden/pools/*.json (recorded from the legacy renderer) pin what the island draws. The
// island's drag and drop and buttons call dragPoolPlayer(), dropPoolPlayer(), insertPoolPlayer(),
// toggleEditPools(), saveEditedPools() and renderPools() (08, 16), as the inline handlers did.
// What stays here, and why: the F12 edit copy (ksmPoolEdit, ksmPoolEditPools, ksmPoolEditorClick,
// ksmPoolEditToSave): classic code reads and writes it synchronously (the drop handlers in 16-, the
// click listener in 21-, Save in 16-), so it cannot move behind an event. The two stubs keep the
// order that depends on it: ksmRenderPools() drops the copy first, ksmRenderPoolEditor() creates it
// first, both synchronously, before the signal. The module reads the copy through
// ksmPoolEditPools() (shared/legacy.ts). The division select (#poolDiv, written by
// renderDivisions() in 02-, read synchronously by the pool functions), Regenerate and
// #poolOutput's class stay legacy too, as does the notice below.
// If the React module does not load, the Pools view shows a notice (the end of this file).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmRenderPools(div){
  // The view replaces the editor: an edit not saved is dropped (F12, see below).
  ksmPoolEdit=null;
  window.ksmPoolsRequested={kind:'pools',div};
  window.dispatchEvent(new CustomEvent('ksm:pools'));
}
// F12: Edit Pool works on a copy of the division's pools. The drops (dropPoolPlayer(),
// insertPoolPlayer(), movePoolPlayer() in 16-) move players in the copy, which the editor shows;
// state.pools changes only when Save Pool Changes applies it (saveEditedPools(), 16-). Leaving the
// editor any other way - Cancel, the division select, a live update or any other redraw of the
// view (renderPools()) - drops the copy, so the pools are exactly as before. Clicks in the editor
// (Save, Cancel) do not ask for an autosave (the click listener, 21-): only an applied Save saves.
var ksmPoolEdit=null;
function ksmPoolEditPools(div){
  if(!ksmPoolEdit||ksmPoolEdit.div!==div)ksmPoolEdit={div,pools:cloneJson(state.pools[div]||[])};
  return ksmPoolEdit.pools;
}
function ksmPoolEditorClick(target){return !!ksmPoolEdit&&!!target?.closest?.('#poolOutput')}
// Save Pool Changes: the edited pools to apply, or null (nothing to do). Without a move it only
// closes the editor (nothing is rebuilt). With matches already played it asks first: rebuilding
// the division's matches deletes their results; Cancel keeps them and the editor (nothing saved).
function ksmPoolEditToSave(div){
  const pools=ksmPoolEdit&&ksmPoolEdit.div===div?ksmPoolEdit.pools:null;
  if(!pools||JSON.stringify(pools)===JSON.stringify(state.pools[div]||[])){renderPools();return null}
  const played=(state.allMatches?.[div]||[]).filter(m=>m&&m.done).length;
  if(played&&!confirm(`Delete the results of ${played} played ${played===1?'match':'matches'} in ${div}?\n\nSaving the new pools rebuilds the division's matches, so the results played so far are deleted. Cancel keeps the results and the editor open (nothing is saved).`))return null;
  ksmPoolEdit=null;
  return pools;
}
// toggleEditPools() (16): the editor of the division's pools. The edit copy is created here, before
// the signal, exactly when it was; the module reads it (ksmPoolEditPools() returns the existing one).
function ksmRenderPoolEditor(div){
  ksmPoolEditPools(div);
  window.ksmPoolsRequested={kind:'editor',div};
  window.dispatchEvent(new CustomEvent('ksm:pools'));
}

// If the React module (app/react/main.tsx, a module script after app.js) did not run, say so in the
// Pools view instead of an empty #poolOutput, which nothing fills any more (e.g. an offline device
// whose cached copy lacks the module). The division select and Regenerate stay. Module scripts run
// before DOMContentLoaded, so a working page never shows this. Existing styles only (.muted-card,
// .small).
function ksmShowPoolsModuleMissing(){
  if(window.ksmPoolsMounted)return;
  const output=document.getElementById('poolOutput');
  if(!output||document.getElementById('poolsModuleMissing'))return;
  const notice=document.createElement('div');
  notice.id='poolsModuleMissing';notice.className='muted-card';notice.setAttribute('role','alert');notice.setAttribute('data-testid','pools-module-missing');
  notice.innerHTML='<b>Pools could not load</b><div class="small">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</div>';
  output.style.display='none';
  output.before(notice);
}
document.addEventListener('DOMContentLoaded',ksmShowPoolsModuleMissing);
