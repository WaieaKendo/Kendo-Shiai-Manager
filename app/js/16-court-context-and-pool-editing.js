
function renderAll(){if(typeof ksmRefreshTournamentChip==='function')ksmRefreshTournamentChip();ksmSyncDangerZone();ensureCourtHistory();renderDivisions();renderReg();renderTeams();renderExhibitions();renderPools();renderScore();renderProgress();renderContext();saveSetup();renderTournamentStatus();updateUndoButton();if(typeof ksmNotifyStateChanged==='function')ksmNotifyStateChanged('render')}
document.addEventListener('paste',e=>{if(!registration.classList.contains('hidden')&&state.regMode==='individual'){let text=e.clipboardData.getData('text');if(text&&text.includes('\t')){e.preventDefault();text.trim().split(/\r\n|\r|\n/).forEach(line=>{let[name,dojo,division,seed,status]=line.split('\t').map(cell=>cell.trim());if(name)ksmPasteRow(name,dojo,division,seed,status)});ksmPasteNotice();renderDivisions();renderReg();scheduleAutoSave('Paste from Excel')}}});


