// F36 (two tabs) lives in app/modules/sync/two-tabs.js (step 3d of #136). Its load-time side effects (the
// beforeunload/pagehide/pageshow/visibilitychange listeners, the heartbeat, the clean-ups) run here, where this
// file used to load.
initTwoTabs();
