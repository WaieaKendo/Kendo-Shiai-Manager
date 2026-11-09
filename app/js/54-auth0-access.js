// Auth0 accounts live in app/modules/auth/auth0-access.js (step 3d of #136). Here, where this file used to load:
// its load-time side effects (initAuth0Access(): the auth-ready promise, window.ksmAuthBridge), the account rules
// of the app/js functions that have not moved yet (still replaced here, at the same point of the load: 40- and 44-
// are not modules yet), and the ready-UI reveal, which waits for 34-bootstrap.js's ksmBootstrapInitialization.
initAuth0Access();
var ksmAccountCanDelete=ksmCanDeleteTournament;
ksmCanDeleteTournament=function(){return ksmAccount.enabled?ksmAccount.globalRole==='admin'&&!!ksmAccount.token&&!!cloudSession.tournamentId:ksmAccountCanDelete()};
var ksmAccountManageLibrary=ksmCanManageLibraryTournament;
ksmCanManageLibraryTournament=function(id){return ksmAccount.enabled?!ksmLibraryAuthInvalid&&!!ksmAccount.token&&!!ksmVisibleLibrary.find(row=>row.id===id)?.canManage:ksmAccountManageLibrary(id)};
var ksmAccountDecorateLibrary=ksmDecorateLibraryInput;
ksmDecorateLibraryInput=function(input){
  if(ksmAccount.enabled&&input?.kind==='library'){
    const admin=!ksmLibraryAuthInvalid&&ksmAccount.globalRole==='admin'&&!!ksmAccount.token;
    const creator=!ksmLibraryAuthInvalid&&['admin','creator'].includes(ksmAccount.globalRole)&&!!ksmAccount.token;
    const active=ksmVisibleLibrary.find(row=>row.id===input.activeId);
    input={...input,hasActive:!!input.hasActive&&!!active&&!!cloudBaseFor(cloudSession.revision),activeName:active?.name||'',authEnabled:true,accountEmail:ksmAccount.email,accountRole:ksmAccount.globalRole,authInvalid:ksmLibraryAuthInvalid,canCreate:creator,canDelete:admin,accessLabels:Object.fromEntries(ksmVisibleLibrary.map(row=>[row.id,row.role])),authorizedIds:ksmLibraryAuthInvalid?[]:ksmVisibleLibrary.filter(row=>admin||row.canManage).map(row=>row.id)};
  }
  return ksmAccountDecorateLibrary(input);
};
Promise.all([ksmBootstrapInitialization,ksmAuthReady]).then(ksmRevealReadyUi,ksmRevealReadyUi);
// Preserve the existing module-load failure notices when the account module cannot run.
document.addEventListener('DOMContentLoaded',()=>{if(!window.ksmShellMounted)ksmRevealReadyUi()});
