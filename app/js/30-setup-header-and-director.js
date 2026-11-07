
if(window.tName){
  tName.addEventListener('input',syncSetupHeader);
}
const originalSaveSetupForHeader=saveSetup;
saveSetup=function(){
  originalSaveSetupForHeader();
  syncSetupHeader();
};

let directorRefreshTimer=null;
function startDirectorRefresh(){stopDirectorRefresh();renderDirector();directorRefreshTimer=setInterval(()=>{if(!document.getElementById('director')?.classList.contains('hidden'))renderDirector();},5000)}
function stopDirectorRefresh(){if(directorRefreshTimer){clearInterval(directorRefreshTimer);directorRefreshTimer=null}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopDirectorRefresh();else if(!document.getElementById('director')?.classList.contains('hidden'))startDirectorRefresh()});
const originalRenderAllForDirector=renderAll;
renderAll=function(){originalRenderAllForDirector();if(!document.getElementById('director')?.classList.contains('hidden'))renderDirector();};


