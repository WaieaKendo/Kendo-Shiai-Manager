// Live sync, cloud saves and tournament files live in app/modules/sync/cloud-realtime-save-and-load.js (step 3d of
// #136). Here, where this file used to load: its load-time side effects (initCloudRealtime(), then the save
// listeners and timers below, in their old order).
initCloudRealtime();
window.addEventListener('beforeunload', queueUnsyncedStaffWorkBeforeUnload);
window.addEventListener('beforeunload', autoSaveTournament);
document.addEventListener('input', scheduleAutoSave, true);
document.addEventListener('change', scheduleAutoSave, true);
document.addEventListener('click', function(e){ if(e.target.closest('button,.status,.search-item,.tab,.seg,.x')&&!e.target.closest('[data-testid="nav-toggle"],.mobile-nav-close')&&!ksmPoolEditorClick(e.target)&&!e.target.closest('.tie-flash-action')&&!e.target.closest('.match-timer')) scheduleAutoSave(e); }, true);
setInterval(()=>autoSaveTournament('10-minute safety autosave'),600000);
setInterval(renderPersistentSaveStatus,60000);


