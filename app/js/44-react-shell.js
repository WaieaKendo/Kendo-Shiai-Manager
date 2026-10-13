/* ksm:post-split-begin react-shell */
// ==========================================================
// React shell (app/react/shell/, roadmap M.13: the navigation bar and its menus, the header's
// status row and the pop-up dialogs)
// React islands draw the navigation bar (the contents of header nav.minimal-nav), the status row
// (the contents of header .cloud-status-wrap), the Fusen-gachi dialog (#fusenDialog), the
// generation check (#validationModal), Regenerate Single Division (#regenerateModal) and the cloud
// modal (#ksmCloudModal, appended to <body>), mounted by app/react/shell/main.tsx. The legacy code
// still decides what is shown and when, and runs every action; it publishes what it drew as plain
// data, and these functions keep it:
// - ksm:shell-nav (window.ksmShellNavInput): the open menu, its placement on a phone or tablet
//   and the screen shown (toggleNavMenu(), closeNavMenus(), setNavMenuState(),
//   positionMobileNavMenu() and the resize listener in 23; setActiveNavForView() in 24);
// - ksm:shell-header (window.ksmShellHeaderInput): the staff button's text, the role, the
//   connection status, the devices online and the save status (setSessionRole() in 33,
//   setConnectionStatus() / renderPersistentSaveStatus() / updateSaveStatus() in 20,
//   renderCloudPresence() in 21);
// - ksm:shell-dialogs (window.ksmShellDialogsInput): which dialog is shown and what it says
//   (openFusenDialog() / closeFusenDialog() in 22; showValidationDialog(),
//   openRegenerateDivisionDialog(), continueRegenerateDivision() and closeManagementModal() in 03;
//   regenerateSingleDivision() in 08; openTournamentAccess() in 33; cloudDiagnostics(),
//   confirmTournamentFileLoad() and closeCloudModal() in 21).
// tests/golden/shell/*.json (recorded from the legacy shell) pin the result. Texts are what esc()
// showed after the HTML parser read it (ksmHtmlText(), 43). What a redraw replaced (the dialogs'
// innerHTML, a new cloud modal) lost the focus at that moment; React replaces it later, so the
// focus leaves it here, at the same moment (ksmShellBlurIn()).
// The legacy shell's DOM writing was removed in M.13 (the class and style writes of the menu
// functions and of setActiveNavForView(), the status writers' text writes, openCloudModal() and
// the dialogs' innerHTML); without the React module the header says so (the end of this part).
// Stays legacy: the brand (static markup), the body classes (ksm-staff, ksm-spectator, ...,
// read by the CSS and by code), the spectator banner (installRoleBanner() in 33: an element of
// <body> before the header, sticky at the top, which the CSS selects as a child of <body>; a React
// root needs an element of its own around it, which would change both) and the toast
// (showKsmToast() in 21).
// Post-split code: scripts/verify-split.mjs removes the marked regions before it compares.
// ==========================================================
function ksmPublishShell(event,key,input){
  window[key]=input;
  window.dispatchEvent(new CustomEvent(event));
}
// A focused element inside `el` loses the focus, as when the legacy code replaced it.
function ksmShellBlurIn(el){
  const active=document.activeElement;
  if(window.ksmShellMounted&&el&&active&&active!==document.body&&el.contains(active))active.blur();
}

// ---------------------------------------------------------- the navigation bar
// The open menu's id, its placement on a phone or tablet ({top,left,right,maxHeight} as CSS texts)
// and the label of the screen shown. Declared without a value: the app's boot code runs before
// this part of app.js, and a value here would undo what it set.
var ksmNavOpenMenu,ksmNavMenuStyle,ksmNavActive;
function ksmPublishNav(){
  ksmPublishShell('ksm:shell-nav','ksmShellNavInput',{open:ksmNavOpenMenu||null,style:ksmNavMenuStyle||null,active:ksmNavActive||null});
}
// setNavMenuState(menu,open): a menu shown or hidden; hiding it drops its placement.
function ksmSetNavMenuState(menu,open){
  if(!menu)return;
  if(open)ksmNavOpenMenu=menu.id;
  else if(ksmNavOpenMenu===menu.id){ksmNavOpenMenu=null;ksmNavMenuStyle=null}
  ksmPublishNav();
}
// closeNavMenus(exceptId): every menu but that one hidden.
function ksmCloseNavMenus(exceptId){
  if(ksmNavOpenMenu&&ksmNavOpenMenu!==exceptId){ksmNavOpenMenu=null;ksmNavMenuStyle=null}
  ksmPublishNav();
}
// positionMobileNavMenu(menu,trigger): on a phone or tablet (900 px or less) the open menu is
// placed under its tile, inside the window, with a height limit.
function ksmPositionNavMenu(menu,trigger){
  if(!menu||!trigger||!window.matchMedia('(max-width:900px)').matches)return;
  const rect=trigger.getBoundingClientRect();
  const margin=12;
  const top=Math.min(window.innerHeight-80,Math.max(margin,rect.bottom+8));
  ksmNavMenuStyle={top:`${top}px`,left:`${margin}px`,right:`${margin}px`,maxHeight:`${Math.max(120,window.innerHeight-top-margin)}px`};
  ksmPublishNav();
}
// The resize listener on a wider window: the open menu hangs from its tile again.
function ksmUnplaceNavMenu(){
  ksmNavMenuStyle=null;
  ksmPublishNav();
}
// setActiveNavForView(viewId): the tile of the screen shown (the first tile whose text starts with
// the screen's label; the island finds it).
function ksmSetActiveNav(viewId){
  const mapping={
    setup:"Setup",
    registration:"Registration",
    score:"Courts",
    public:"Live Scores",
    director:"Overview",
    tv:"TV Display",
    results:"Results",
    print:"Export"
  };
  ksmNavActive=mapping[viewId]||null;
  ksmPublishNav();
}

// ---------------------------------------------------------- the status row
var ksmShellHeader;
function ksmShellHeaderState(){
  if(!ksmShellHeader)ksmShellHeader={staffLabel:'Staff Login',role:{text:'Spectator',dataRole:null},connection:{text:'Local',mode:null,title:null},presence:'',save:'Not saved yet'};
  return ksmShellHeader;
}
function ksmPublishHeader(patch){
  const h=Object.assign(ksmShellHeaderState(),patch);
  ksmPublishShell('ksm:shell-header','ksmShellHeaderInput',{...h});
}
// setSessionRole() (33): the role (hidden) and the staff button.
function ksmRenderSessionRole(){
  ksmPublishHeader({role:{text:ksmSessionRole==='staff'?'Staff':'Spectator',dataRole:String(ksmSessionRole)},staffLabel:ksmSessionRole==='staff'?'Logout':'Staff Login'});
}
// setConnectionStatus(text,mode) (20): the mode's label, the mode and the text as the tooltip.
function ksmRenderConnectionStatus(text,mode='local'){
  const labels={online:'🟢 Online',offline:'🟠 Offline',connecting:'🟡 Connecting',error:'🔴 Attention',local:'Local'};
  const label=String(labels[mode]||text||'Local');
  ksmPublishHeader({connection:{text:label,mode:String(mode),title:String(text||label)}});
}
// renderPersistentSaveStatus() (20): the save status's text.
function ksmPersistentSaveStatusText(){
  if(ksmSaveStatusMode==='saving')return 'Saving…';
  if(ksmSaveStatusMode==='syncing')return 'Synchronizing…';
  if(ksmSaveStatusMode==='offline')return `Saved locally${readOutbox()?' · 1 change waiting':''}`;
  if(ksmSaveStatusMode==='error')return 'Save needs attention';
  return humanSaveAge();
}
// renderPersistentSaveStatus() and updateSaveStatus(text) (20): the save status (textContent).
function ksmRenderSaveStatus(text){
  ksmPublishHeader({save:text==null?'':String(text)});
}
// renderCloudPresence(clients) (21): the devices online (hidden).
function ksmRenderPresence(clients){
  ksmPublishHeader({presence:clients.length?`${clients.length} online`:''});
}

// ---------------------------------------------------------- the dialogs
var ksmShellDialogs,ksmShellDialogKey,ksmValidationConfirm;
function ksmShellDialogsState(){
  if(!ksmShellDialogs)ksmShellDialogs={
    fusen:{open:false},
    validation:{open:false,key:0,title:'Tournament Validation',content:null},
    regenerate:{open:false,key:0,title:'Regenerate Division',content:null},
    cloud:null,
  };
  return ksmShellDialogs;
}
function ksmPublishDialogs(part,value){
  const d=ksmShellDialogsState();
  d[part]=value;
  ksmPublishShell('ksm:shell-dialogs','ksmShellDialogsInput',{...d});
}
function ksmNextDialogKey(){ksmShellDialogKey=(ksmShellDialogKey||0)+1;return ksmShellDialogKey}
// openFusenDialog() / closeFusenDialog() (22).
function ksmSetFusenOpen(open){ksmPublishDialogs('fusen',{open:!!open})}
// closeManagementModal(id) (03): the generation check or Regenerate hidden; whether it was one of
// them.
function ksmCloseShellDialog(id){
  if(id!=='validationModal'&&id!=='regenerateModal')return false;
  const part=id==='validationModal'?'validation':'regenerate';
  ksmPublishDialogs(part,{...ksmShellDialogsState()[part],open:false});
  return true;
}
// showValidationDialog(result,onConfirm) (03): the title, the issues or the question, and the
// buttons, drawn afresh; Generate closes it and runs onConfirm (what the legacy code assigned to
// the button's onclick).
function ksmShowValidationDialog(result,onConfirm){
  ksmShellBlurIn(document.getElementById('validationModalBody'));
  ksmShellBlurIn(document.getElementById('validationModalActions'));
  ksmValidationConfirm=result.valid?onConfirm:null;
  ksmPublishDialogs('validation',{open:true,key:ksmNextDialogKey(),
    title:result.valid?'Tournament Validation Passed':'Tournament Validation',
    content:result.valid?{valid:true}:{valid:false,issues:result.issues.map(x=>({
      severity:ksmHtmlText(x.severity),division:ksmHtmlText(x.divisionId||'Tournament'),message:ksmHtmlText(x.message),
      action:x.suggestedAction?ksmHtmlText(x.suggestedAction):'',
    }))}});
}
// The generation check's Generate.
function ksmConfirmValidation(){
  const onConfirm=ksmValidationConfirm;
  closeManagementModal('validationModal');
  if(onConfirm)onConfirm();
}
function ksmShowRegenerate(title,content){
  ksmShellBlurIn(document.getElementById('regenerateModalBody'));
  ksmShellBlurIn(document.getElementById('regenerateModalActions'));
  ksmPublishDialogs('regenerate',{open:true,key:ksmNextDialogKey(),title:String(title),content});
}
// openRegenerateDivisionDialog() (03): every division (set up or generated) with its status; the
// first ready one chosen.
// Owner decision 3 (#29): the Pools tab's Regenerate (ksmRegeneratePoolDivision()) opens it with
// the Pools select's division chosen when it is ready (none chosen when it is not).
function ksmOpenRegenerateDialog(preferred){
  let all=[...new Set([...state.divisions,...Object.keys(state.allMatches||{})])].filter(Boolean);let selected='';
  if(preferred!==undefined)selected=divisionRegenerationStatus(preferred)==='ready'?preferred:null;
  const options=all.map(d=>{let st=divisionRegenerationStatus(d),ready=st==='ready';if(ready&&!selected&&selected!==null)selected=d;return {name:ksmHtmlText(d),status:st,checked:ready&&d===selected}});
  ksmShowRegenerate('Regenerate Division',{view:'list',options});
}
// The Pools tab's Regenerate button (app/index.html): Regenerate Single Division for the division
// in the Pools select (owner decision 3; it regenerated the whole tournament, which stays with
// Generate Tournament).
function ksmRegeneratePoolDivision(){
  const div=window.poolDiv?poolDiv.value:'';
  ksmOpenRegenerateDialog(div||undefined);
}
// continueRegenerateDivision() (03): the division chosen in the list (read from the page) to
// confirm.
function ksmContinueRegenerateDivision(){
  let selected=document.querySelector('input[name="regenDiv"]:checked')?.value;if(!selected){alert('No division is ready to regenerate.');return}if(divisionRegenerationStatus(selected)!=='ready'){alert('This division cannot be regenerated.');return}
  ksmShowRegenerate(`Regenerate ${selected}?`,{view:'confirm',division:selected});
}
// regenerateSingleDivision(div) (08): done.
function ksmRegenerateDone(div){
  ksmShowRegenerate('Division Regenerated',{view:'done',division:ksmHtmlText(div)});
}
// Escape closes the generation check, Regenerate Single Division and the cloud modal (Tournament
// Access, Developer Tools, the Load Tournament File confirmation) as their Close / Cancel button
// or the backdrop does, like the open menu, Fusen-gachi and the Results bracket (quirk pass).
document.addEventListener('keydown',function(e){
  if(e.key!=='Escape'||!ksmShellDialogs)return;
  if(ksmShellDialogs.cloud)closeCloudModal();
  if(ksmShellDialogs.validation.open)closeManagementModal('validationModal');
  if(ksmShellDialogs.regenerate.open)closeManagementModal('regenerateModal');
});
// openCloudModal(title,body) (21): a new cloud modal at the end of <body> (the one open closed
// first).
function ksmOpenCloudModal(title,body){
  ksmShellBlurIn(document.getElementById('ksmCloudModal'));
  ksmPublishDialogs('cloud',{key:ksmNextDialogKey(),title:ksmHtmlText(title),body});
}
// closeCloudModal() (21).
function ksmCloseCloudModal(){
  ksmShellBlurIn(document.getElementById('ksmCloudModal'));
  ksmPublishDialogs('cloud',null);
}
// openTournamentAccess() (33): the spectator link, Copy Link and its QR code.
function ksmOpenTournamentAccess(link,qr){
  ksmOpenCloudModal('Tournament Access',{kind:'access',link:ksmHtmlText(link),copy:String(link),qr:String(qr)});
}
// cloudDiagnostics() (21): Developer Tools with the details, the snapshot analysis
// (snapshotAnalysisHtml()), the action history analysis (actionHistoryAnalysisHtml(),
// historyEntryCard()) and the buttons ("Retry queued save" with work queued on a staff device).
function ksmSizeText(bytes){return ksmHtmlText(formatSnapshotBytes(bytes))}
// Owner decision 4 (#29): a court action's label as shown: "Fusen-gachi" reads "Fusen-sho" (the
// stored label in state.courtActionHistory is unchanged, so saved tournaments are unaffected).
function ksmActionLabelText(label){return String(label??'').replace(/Fusen-gachi/g,'Fusen-sho')}
function ksmHistoryEntryCard(title,item){
  if(!item)return {title:ksmHtmlText(title),entry:null};
  const largestChanges=(item.changes||[]).slice(0,6).map(x=>`${x.key}: ${formatSnapshotBytes(x.bytes)}`).join(' • ');
  return {title:ksmHtmlText(title),entry:{heading:`${ksmHtmlText(title)} • #${item.index+1}`,line:`${ksmHtmlText(ksmActionLabelText(item.label))} — ${ksmSizeText(item.totalBytes)}`,changes:ksmHtmlText(largestChanges||'No changed state properties')}};
}
// Owner decision 20 (#29): the sample-data buttons (Load Sample Players / Teams / Tournament,
// + Auto Test Team) show only while this device's test tools are on: body.ksm-test-tools (the
// owner-decisions CSS hides them otherwise), switched in Developer Tools ("Show test tools" /
// "Hide test tools") and kept in this device's storage (not the tournament: nothing is synced).
var KSM_TEST_TOOLS_KEY='ksm-test-tools';
function ksmTestToolsOn(){try{return localStorage.getItem(KSM_TEST_TOOLS_KEY)==='1'}catch(_){return false}}
function ksmApplyTestTools(){if(document.body)document.body.classList.toggle('ksm-test-tools',ksmTestToolsOn())}
function ksmSetTestTools(on){
  try{if(on)localStorage.setItem(KSM_TEST_TOOLS_KEY,'1');else localStorage.removeItem(KSM_TEST_TOOLS_KEY)}catch(_){}
  ksmApplyTestTools();
}
// Developer Tools' button: switch them and show Developer Tools again with the new label.
function ksmToggleTestTools(){ksmSetTestTools(!ksmTestToolsOn());cloudDiagnostics()}
ksmApplyTestTools();
document.addEventListener('DOMContentLoaded',ksmApplyTestTools);
function ksmOpenDiagnostics(details,analysis,historyAnalysis,retry){
  ksmOpenCloudModal('Developer Tools',{kind:'diagnostics',
    details:details.map(([a,b])=>({label:ksmHtmlText(a),value:ksmHtmlText(b)})),
    analysis:analysis?{
      total:ksmSizeText(analysis.totalBytes),analyzed:ksmHtmlText(formatDiagnosticTime(analysis.analyzedAt)),
      breakdown:(analysis.stateBreakdown||[]).slice(0,16).map(x=>({label:`state.${ksmHtmlText(x.key)}`,value:ksmSizeText(x.bytes),summary:ksmHtmlText(x.summary)})),
      largest:(analysis.largest||[]).slice(0,16).map(x=>({label:ksmHtmlText(x.path),value:ksmSizeText(x.bytes),summary:ksmHtmlText(x.summary)})),
    }:null,
    history:['A','B'].map(court=>{const c=historyAnalysis.courts[court];return {court,entries:ksmHtmlText(`${c.entryCount}`),
      total:ksmSizeText(c.totalBytes),average:ksmSizeText(c.averageBytes),largest:ksmSizeText(c.largest?.totalBytes||0),
      cards:[ksmHistoryEntryCard('First entry',c.first),ksmHistoryEntryCard('Latest entry',c.latest),ksmHistoryEntryCard('Largest entry',c.largest)]}}),
    retry:!!retry,testTools:ksmTestToolsOn()});
}
// confirmTournamentFileLoad() (21, roadmap 0.5): the file's and the open tournament's details,
// what loading it does, Cancel and Replace open tournament / Load as new tournament.
function ksmOpenFileLoadModal(title,details,message,same){
  ksmOpenCloudModal(title,{kind:'file',same:!!same,details:details.map(([a,b,id])=>({label:ksmHtmlText(a),value:ksmHtmlText(b),testId:id})),message});
}

// If the React module (app/react/main.tsx, a module script after app.js) did not run, say so in the
// header (e.g. an offline device whose cached copy lacks the module): nothing opens the menus or
// shows the dialogs any more, and the status line is not updated. The bar's plain tiles and Staff
// Login (static markup with their inline handlers) still work. Module scripts run before
// DOMContentLoaded, so a working page never shows this. Existing styles only (.muted-card, .small).
function ksmShowShellModuleMissing(){
  if(window.ksmShellMounted)return;
  const nav=document.querySelector('header.ksm-topbar nav.minimal-nav');
  if(!nav||document.getElementById('shellModuleMissing'))return;
  const notice=document.createElement('div');
  notice.id='shellModuleMissing';notice.className='muted-card';notice.setAttribute('role','alert');notice.setAttribute('data-testid','shell-module-missing');
  notice.innerHTML='<b>Menus and dialogs could not load</b><div class="small">Reload the page. If this device is offline, reconnect once so it can download the current version of the app.</div>';
  nav.before(notice);
}
document.addEventListener('DOMContentLoaded',ksmShowShellModuleMissing);
/* ksm:post-split-end */
