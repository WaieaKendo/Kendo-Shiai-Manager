function divisionComplete(div){const matches=(state.allMatches[div]||[]).filter(isValidMatchObject);return matches.some(m=>m.championship&&m.position==='Final'&&m.done) || ((isTeamDivision(div)||isPoolOnlyDivision(div))&&matches.length && matches.every(m=>m.done));}
// Individual round robins too small for a championship bracket (3–5 entrants: a single pool
// and no frozen template) have no Final; they are decided by the final pool standings.
function isPoolOnlyDivision(div){
  if(isTeamDivision(div)||(state.divisionTypes?.[div]||'Round Robin')!=='Round Robin')return false;
  const pools=state.pools?.[div]||[];
  return pools.length===1&&!championshipLabels(div).length;
}

function teamNodeSideName(side,div){
  /* ksm:post-split-begin engine-bridge */return KSMEngine.teamNodeSideName(side,eligibleTeams(div),state.teamBracketNodes?.[div]||[]);
  /* ksm:post-split-end */
}
function teamFinalPlacements(div){
  /* ksm:post-split-begin engine-bridge */if(isTeamRoundRobinDivision(div))return teamRoundRobinPlacements(div);
  return KSMEngine.teamFinalPlacements(state.teamBracketNodes?.[div]||[],eligibleTeams(div));
  /* ksm:post-split-end */
}

function exportCSV(){let rows=[['Name','Dojo','Division','Seed','Status'],...state.competitors.map(c=>[c.name,c.dojo,c.division,c.seed,c.status])];let csv=rows.map(r=>r.map(x=>`"${String(x||'').replace(/"/g,'""')}"`).join(',')).join('\n');let blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ksm-registration.csv';a.click();URL.revokeObjectURL(url)}
function teamRoster(team/* ksm:post-split-begin team-divisions */,div/* ksm:post-split-end */){let t=(state.teams||[]).find(x=>/* ksm:post-split-begin team-divisions was:String(x.team).trim()===String(team).trim() */String(x.team).trim()===String(team).trim()&&(!div||(x.teamDivisionId||'Team Tournament')===div)/* ksm:post-split-end */);if(!t)return [];let fmt=/* ksm:post-split-begin team-divisions was:t.type||teamFormat?.value||'5-Person Team' */ksmTeamSettings(t.teamDivisionId).teamFormat||t.type||'5-Person Team'/* ksm:post-split-end */;let keys=(fmt==='3-Person Team'||fmt==='Kachinuki')?['senpo','chuken','taisho']:['senpo','jiho','chuken','fukusho','taisho'];return keys.map(k=>t[k]).filter(n=>n&&String(n).trim());}
function canModifyRepresentative(m){
  if(!m||m.type!=='teamPlayoff'||isReadOnlySession())return false;
  if(['local','admin','director','staff'].includes(ksmSessionRole))return true;
  if(ksmSessionRole==='scorekeeper'){
    const assigned=(cloudSession.court||state.currentCourt||'').toUpperCase();
    return !!assigned&&matchBelongsToCourt(m,assigned);
  }
  return false;
}
function repSelect(side,team,current){
  let m=state.matches[state.current];
  let roster=(m&&m.type==='teamPlayoff')?(side==='W'?/* ksm:post-split-begin team-divisions was:teamRoster(m.teamWhite):teamRoster(m.teamRed)):teamRoster(team) */teamRoster(m.teamWhite,m.division):teamRoster(m.teamRed,m.division)):teamRoster(team,m?.division)/* ksm:post-split-end */;
  let placeholder=!current||/Representative/.test(current);
  if(!canModifyRepresentative(m))return `<span class="representative-readonly" data-testid="representative-readonly">${esc(placeholder?`${team||'Dojo'} Representative`:current)}</span>`;
  let opts=`<option value="" ${placeholder?'selected':''}>${esc(team||'Dojo')} Representative</option>`+roster.map(n=>`<option value="${esc(n)}" ${n===current?'selected':''}>${esc(n)}</option>`).join('');
  return `<select onchange="setRepresentative('${side}',this.value)" data-testid="representative-select">${opts}</select>`;
}
function setRepresentative(side,val){
  let m=state.matches[state.current];
  if(!m||!val||!canModifyRepresentative(m)){if(m&&!canModifyRepresentative(m))updateSaveStatus('Representative selection is read only');return;}
  performCourtAction(`${side==='W'?'White':'Red'} Representative`,()=>{if(side==='W')m.white=val;else m.red=val;renderScore()});
}

