// ---------- KSM v3.9.1 Minimal navigation ----------
function setNavMenuState(menu,open){
  /* ksm:post-split-begin react-shell */ksmSetNavMenuState(menu,open);/* ksm:post-split-end */
}
function positionMobileNavMenu(menu,trigger){
  /* ksm:post-split-begin react-shell */ksmPositionNavMenu(menu,trigger);/* ksm:post-split-end */
}
function closeNavMenus(exceptId){
  /* ksm:post-split-begin react-shell */ksmCloseNavMenus(exceptId);/* ksm:post-split-end */
}
function toggleNavMenu(id,event){
  if(event){event.preventDefault();event.stopPropagation();}
  const menu=document.getElementById(id);
  if(!menu)return false;
  const trigger=(event&&event.currentTarget)||document.querySelector(`[aria-controls="${id}"]`);
  const opening=/* ksm:post-split-begin react-shell was:menu.classList.contains('hidden') */ksmNavOpenMenu!==id/* ksm:post-split-end */;
  closeNavMenus(id);
  setNavMenuState(menu,opening);
  if(opening)positionMobileNavMenu(menu,trigger);
  return false;
}
function navigateTo(id){
  if(isSpectatorSession()&&!['score','public','results','director'].includes(id)){navigateTo('public');return}
  closeNavMenus();
  show(id);
  if(id==='director') startDirectorRefresh(); else stopDirectorRefresh();
}
function chooseCourt(court){
  closeNavMenus();
  pinCourtLocally(court);
  openCourt(court);
}
function chooseLiveCourt(court){
  closeNavMenus();
  openPublicCourt(court);
}
function openRegistrationTab(mode){
  if(isSpectatorSession())return;
  closeNavMenus();
  show('registration');
  regTab(mode||'individual');
}
function exportTournamentBrackets(){
  closeNavMenus();
  show('print');
  previewAllDivisionSheets();
}
function exportResultsAwards(){
  closeNavMenus();
  show('print');
  previewResultsSheet();
}
function regTab(mode){
  state.regMode=mode;
  if(window.indReg)indReg.classList.toggle('hidden',mode!=='individual');
  if(window.teamReg)teamReg.classList.toggle('hidden',mode!=='team');
  if(window.exhibitionReg)exhibitionReg.classList.toggle('hidden',mode!=='exhibition');
  if(window.poolsReg)poolsReg.classList.toggle('hidden',mode!=='pools');
  /* ksm:post-split-begin react-registration */ksmRenderRegistrationTab(mode);/* ksm:post-split-end */
  if(mode==='pools')renderPools();
}
function renderProgress(){ return; }
document.addEventListener('click',function(event){
  if(!event.target.closest('.nav-menu'))closeNavMenus();
});
document.addEventListener('keydown',function(event){
  if(event.key==='Escape')closeNavMenus();
});
window.addEventListener('resize',function(){
  const openMenu=/* ksm:post-split-begin react-shell was:document.querySelector('.nav-dropdown:not(.hidden)') */ksmNavOpenMenu?document.getElementById(ksmNavOpenMenu):null/* ksm:post-split-end */;
  if(!openMenu)return;
  const trigger=document.querySelector(`[aria-controls="${openMenu.id}"]`);
  if(window.matchMedia('(max-width:900px)').matches)positionMobileNavMenu(openMenu,trigger);
  else {
    /* ksm:post-split-begin react-shell */ksmUnplaceNavMenu();/* ksm:post-split-end */
  }
});


