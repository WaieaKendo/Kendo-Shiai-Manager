// The sync state and the 409 rebase live in app/modules/sync/sync-state-and-rebase.js, the save state lets in
// app/modules/sync/cloud-realtime-save-and-load.js (step 3d of #136). What stays here:
// - ksmCloudAttemptCounter: only performCloudSave() (33-staff-session-and-library.js) uses it;
// - noteLocalMutation(): tests wrap it through window (golden *_SAVES_INIT_JS), so it is declared in app/js.
let ksmCloudAttemptCounter=0;
function noteLocalMutation(){setKsmLocalMutationVersion(ksmLocalMutationVersion+1)}
