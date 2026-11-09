// Auth0 accounts live in app/modules/auth/auth0-access.js (step 3d of #136). Here, where this file used to load:
// its load-time side effects (initAuth0Access(): the auth-ready promise, window.ksmAuthBridge) and the ready-UI reveal,
// which waits for ksmBootstrapInitialization (app/modules/boot.js). The account rules of ksmCanDeleteTournament (shell),
// ksmCanManageLibraryTournament and ksmDecorateLibraryInput (library) are the final functions of app/modules/react-bridges.
initAuth0Access();
Promise.all([ksmBootstrapInitialization,ksmAuthReady]).then(ksmRevealReadyUi,ksmRevealReadyUi);
// Preserve the existing module-load failure notices when the account module cannot run.
document.addEventListener('DOMContentLoaded',()=>{if(!window.ksmShellMounted)ksmRevealReadyUi()});
