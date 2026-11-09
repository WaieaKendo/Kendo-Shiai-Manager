// The cloud session, outbox and autosave live in app/modules/sync/cloud-session-and-autosave.js (step 3d of #136).
// cloudSession is read from localStorage here, where this file used to load (after 19-'s reset).
// scheduleAutoSave(), saveAuto() and criticalAutoSave() stay in app/js: tests wrap them through window
// (golden *_SAVES_INIT_JS, KSMTest.watchSaves()), and the document listeners of 21- hold scheduleAutoSave itself.
initCloudSession();
// Remote snapshots never echo into cloud: if(!ksmApplyingRemoteSnapshot)scheduleCloudSave()
function scheduleAutoSave(reason='Edit'){
  // Read-only controls must not create mutations or rewrite the autosave/outbox.
  if(reason instanceof Event&&reason.target?.closest?.('#home, .cloud-status-wrap, #ksmCloudModal, .setup-tournament-actions, .setup-short-url, input[type="file"]'))return;
if(ksmStartupLoadFailed&&!ksmStartupHasCache)return;ksmSyncGrandChampions(typeof reason==='string'?reason:'edit');noteLocalMutation();clearTimeout(ksmSaveTimer);setKsmSaveTimer(setTimeout(()=>{setKsmSaveTimer(null);autoSaveTournament(reason)},2000))}
// F11: the Results awards editor calls saveAuto() (add, remove, edit), which was never defined, so
// every award action threw: award edits were never autosaved and add/remove did not redraw.
// It is an ordinary edit, saved like the others.
function saveAuto(){scheduleAutoSave('Awards')}
function criticalAutoSave(reason){if(ksmStartupLoadFailed&&!ksmStartupHasCache)return;ksmSyncGrandChampions(reason);noteLocalMutation();markLocalSave(reason);if(!isReadOnlySession())saveTournamentToCloudWithReason(reason,true)}
