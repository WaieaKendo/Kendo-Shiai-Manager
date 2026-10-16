/* ksm:post-split-begin friendly-links */
var ksmPendingSlug=sessionStorage.getItem('ksm.pending-slug')||'';
function ksmCacheTournament(record){
  const slug=record.slug||cloudSession.slug||null;
  localStorage.setItem('ksm.tournament.record:'+record.tournamentId,JSON.stringify({...record,slug}));
  if(slug)localStorage.setItem('ksm.slug:'+slug,JSON.stringify({id:record.tournamentId,slug}));
}
async function ksmFetchTournament(id){
  if(navigator.onLine)return fetch(`/api/tournaments/${encodeURIComponent(id)}`);
  const record=localStorage.getItem('ksm.tournament.record:'+id);
  if(!record)throw new Error('No offline copy of this tournament is available');
  return new Response(record,{headers:{'content-type':'application/json'}});
}
async function ksmEditTournamentSlug(){
  if(isReadOnlySession())return;
  const slug=prompt('Tournament short name (lowercase letters, digits and dashes)',cloudSession.slug||KSMEngine.suggestSlug(tName.value,String(new Date().getFullYear())));
  if(slug===null)return;
  try{
    if(!cloudSession.tournamentId){
      if(!KSMEngine.isValidSlug(slug))throw new Error('Choose a valid, non-reserved tournament short name.');
      ksmPendingSlug=slug;sessionStorage.setItem('ksm.pending-slug',slug);await saveNow();return;
    }
    const response=await fetch(`/api/tournaments/${cloudSession.tournamentId}/slug`,{method:'POST',headers:cloudHeaders(),body:JSON.stringify({slug})});
    const info=await response.json();if(!response.ok)throw new Error(info.error||'Unable to change short name');
    const old=cloudSession.slug;cloudSession.slug=info.slug;persistCloudSession();
    if(old)localStorage.setItem('ksm.slug:'+old,JSON.stringify(info));
    const route=ksmResolvedUrl().route;
    if(route.screen!=='home'&&route.screen!=='invalid')ksmReplaceUrl(KSMEngine.routePath({...route,id:cloudSession.tournamentId,slug:info.slug})+location.search);
    rememberTournament({tournamentId:cloudSession.tournamentId,slug:info.slug,payload:tournamentPayload(),revision:cloudSession.revision,updatedAt:cloudSession.updatedAt});
    openTournamentAccess();
  }catch(err){alert(err.message)}
}
/* ksm:post-split-end */
