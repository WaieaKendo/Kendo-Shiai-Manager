// ---------- KSM v3.9.1 Minimal navigation ----------
function setNavMenuState(menu,open){
  ksmSetNavMenuState(menu,open);
}
function positionMobileNavMenu(menu,trigger){
  ksmPositionNavMenu(menu,trigger);
}
function closeNavMenus(exceptId){
  ksmCloseNavMenus(exceptId);
}
function toggleNavMenu(id,event){
  if(event){event.preventDefault();event.stopPropagation();}
  const menu=document.getElementById(id);
  if(!menu)return false;
  const trigger=(event&&event.currentTarget)||document.querySelector(`[aria-controls="${id}"]`);
  const opening=ksmNavOpenMenu!==id;
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
  ksmRenderRegistrationTab(mode);
  if(mode==='pools')renderPools();
  if(!document.getElementById('registration').classList.contains('hidden'))ksmRecordScreenPath('registration');
}
function renderProgress(){ return; }
document.addEventListener('click',function(event){
  if(!event.target.closest('.nav-menu'))closeNavMenus();
});
document.addEventListener('keydown',function(event){
  if(event.key==='Escape')closeNavMenus();
});
window.addEventListener('resize',function(){
  const openMenu=ksmNavOpenMenu?document.getElementById(ksmNavOpenMenu):null;
  if(!openMenu)return;
  const trigger=document.querySelector(`[aria-controls="${openMenu.id}"]`);
  if(window.matchMedia('(max-width:900px)').matches)positionMobileNavMenu(openMenu,trigger);
  else {
    ksmUnplaceNavMenu();
  }
});


