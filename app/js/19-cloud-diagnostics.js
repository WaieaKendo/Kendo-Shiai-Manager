// Cloud diagnostics live in app/modules/sync/cloud-diagnostics.js (step 3d of #136). The one-time reset of
// v3.17.3 runs here, where this file used to load: before 20-'s initCloudSession() reads the stored session.
resetLegacyTournamentDataOnce();
