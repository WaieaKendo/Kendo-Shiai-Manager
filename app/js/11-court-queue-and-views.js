
function showDojoProfile(x){let n=state.competitors.filter(c=>c.dojo===x).length,t=state.teams.filter(c=>c.dojo===x).length;profile.innerHTML=`<h1>${esc(x)}</h1><p>${n} individual entries • ${t} teams</p>`}
