// Navigation (step 4a of #136): the screens, the nav menus and the registration tabs. `show()` is one final function:
// before, app/js declared it (01-state-and-setup.js) and 24- and 27- reassigned it at load to add the active nav item
// and the Results redraw, in that order; the order of the calls below is the same.
import {state} from './app-state.js';
import {renderAll} from './court/court-context-and-pool-editing.js';
import {openCourt,openPublicCourt} from './court/court-match-order.js';
import {renderPools} from './engine/engine-generation.js';
import {ksmRecordScreenPath} from './links/path-urls.js';
import {ksmRenderRegistrationTab} from './react-bridges/registration.js';
import {ksmCloseNavMenus,ksmNavOpenMenu,ksmPositionNavMenu,ksmSetActiveNav,ksmSetNavMenuState,ksmUnplaceNavMenu} from './react-bridges/shell.js';
import {previewAllDivisionSheets,previewResultsSheet} from './results/print.js';
import {renderResultsDashboard} from './results/results-screen.js';
import {isSpectatorSession} from './session/staff-session-and-library.js';
import {startDirectorRefresh,stopDirectorRefresh} from './setup/director-progress.js';
import {pinCourtLocally} from './sync/sync-state-and-rebase.js';

// ---------- KSM v3.9.1 Minimal navigation ----------
function setNavMenuState(menu,open){
  ksmSetNavMenuState(menu,open);
}
function positionMobileNavMenu(menu,trigger){
  ksmPositionNavMenu(menu,trigger);
}
export function closeNavMenus(exceptId){
  ksmCloseNavMenus(exceptId);
}
export function toggleNavMenu(id,event){
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
export function navigateTo(id){
  if(isSpectatorSession()&&!['score','public','results','director'].includes(id)){navigateTo('public');return}
  closeNavMenus();
  show(id);
  if(id==='director') startDirectorRefresh(); else stopDirectorRefresh();
}
export function chooseCourt(court){
  closeNavMenus();
  pinCourtLocally(court);
  openCourt(court);
}
export function chooseLiveCourt(court){
  closeNavMenus();
  openPublicCourt(court);
}
export function openRegistrationTab(mode){
  if(isSpectatorSession())return;
  closeNavMenus();
  show('registration');
  regTab(mode||'individual');
}
export function exportTournamentBrackets(){
  closeNavMenus();
  show('print');
  previewAllDivisionSheets();
}
export function exportResultsAwards(){
  closeNavMenus();
  show('print');
  previewResultsSheet();
}
export function regTab(mode){
  state.regMode=mode;
  if(window.indReg)indReg.classList.toggle('hidden',mode!=='individual');
  if(window.teamReg)teamReg.classList.toggle('hidden',mode!=='team');
  if(window.exhibitionReg)exhibitionReg.classList.toggle('hidden',mode!=='exhibition');
  if(window.poolsReg)poolsReg.classList.toggle('hidden',mode!=='pools');
  ksmRenderRegistrationTab(mode);
  if(mode==='pools')renderPools();
  if(!document.getElementById('registration').classList.contains('hidden'))ksmRecordScreenPath('registration');
}
export function renderProgress(){ return; }

// ---------- KSM v3.9.1 Active navigation state ----------
function setActiveNavForView(viewId){
  ksmSetActiveNav(viewId);
}

export function show(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));document.getElementById(id).classList.remove('hidden');renderAll();if(id==='print')previewAllDivisionSheets();ksmRecordScreenPath(id);
  // Was 24-court-queue-and-context.js: the active nav item.
  setActiveNavForView(id);
  // Was 27-results-screen.js: the Results redraw.
  if(id==='results')renderResultsDashboard();
}

// Load-time listeners (app/js, where 23-navigation.js used to load).
export function initNavigation(){
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
}
