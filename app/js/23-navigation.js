// ---------- KSM v3.9.1 Minimal navigation ----------
function setNavMenuState(menu,open){
  if(!menu)return;
  menu.classList.toggle('hidden',!open);
  menu.classList.toggle('is-open',open);
  const trigger=document.querySelector(`[aria-controls="${menu.id}"]`);
  if(trigger)trigger.setAttribute('aria-expanded',open?'true':'false');
  if(!open){
    menu.style.removeProperty('top');
    menu.style.removeProperty('left');
    menu.style.removeProperty('right');
    menu.style.removeProperty('max-height');
  }
}
function positionMobileNavMenu(menu,trigger){
  if(!menu||!trigger||!window.matchMedia('(max-width:900px)').matches)return;
  const rect=trigger.getBoundingClientRect();
  const margin=12;
  const top=Math.min(window.innerHeight-80,Math.max(margin,rect.bottom+8));
  menu.style.top=`${top}px`;
  menu.style.left=`${margin}px`;
  menu.style.right=`${margin}px`;
  menu.style.maxHeight=`${Math.max(120,window.innerHeight-top-margin)}px`;
}
function closeNavMenus(exceptId){
  document.querySelectorAll('.nav-dropdown').forEach(menu=>{
    if(menu.id!==exceptId)setNavMenuState(menu,false);
  });
}
function toggleNavMenu(id,event){
  if(event){event.preventDefault();event.stopPropagation();}
  const menu=document.getElementById(id);
  if(!menu)return false;
  const trigger=(event&&event.currentTarget)||document.querySelector(`[aria-controls="${id}"]`);
  const opening=menu.classList.contains('hidden');
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
  if(window.indTab)indTab.classList.toggle('active',mode==='individual');
  if(window.teamTab)teamTab.classList.toggle('active',mode==='team');
  if(window.exhibitionTab)exhibitionTab.classList.toggle('active',mode==='exhibition');
  if(window.poolsTab)poolsTab.classList.toggle('active',mode==='pools');
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
  const openMenu=document.querySelector('.nav-dropdown:not(.hidden)');
  if(!openMenu)return;
  const trigger=document.querySelector(`[aria-controls="${openMenu.id}"]`);
  if(window.matchMedia('(max-width:900px)').matches)positionMobileNavMenu(openMenu,trigger);
  else {
    openMenu.style.removeProperty('top');
    openMenu.style.removeProperty('left');
    openMenu.style.removeProperty('right');
    openMenu.style.removeProperty('max-height');
  }
});


