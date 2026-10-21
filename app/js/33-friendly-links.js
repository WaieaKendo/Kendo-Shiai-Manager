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
async function ksmEditTournamentSlug(showAccess=true){
  if(isReadOnlySession())return;
  const slug=prompt('Tournament short name (lowercase letters, digits and dashes)',cloudSession.slug||KSMEngine.suggestSlug(tName.value,String(new Date().getFullYear())));
  if(slug===null)return;
  try{await ksmRenameTournamentSlug(slug);if(showAccess)openTournamentAccess()}catch(err){alert(err.message)}
}
async function ksmRenameTournamentSlug(slug){
    if(isReadOnlySession())return;
    if(!KSMEngine.isValidSlug(slug))throw new Error('Choose a valid, non-reserved tournament short name.');
    if(!cloudSession.tournamentId){
      const previous=ksmPendingSlug;
      ksmPendingSlug=slug;sessionStorage.setItem('ksm.pending-slug',slug);
      const started=new Date().toISOString();
      try{
        const saved=await saveNow();
        // Only this attempt's error: the diagnostics can still hold an older one.
        const diag=readCloudDiagnosticsState();
        if(!saved||!cloudSession.tournamentId||cloudSession.slug!==slug)throw new Error((String(diag.lastAttemptAt||'')>=started&&diag.errorMessage)||'Unable to save short name');
      }catch(err){
        ksmPendingSlug=previous;
        if(previous)sessionStorage.setItem('ksm.pending-slug',previous);else sessionStorage.removeItem('ksm.pending-slug');
        throw err;
      }
      return;
    }
    const response=await fetch(`/api/tournaments/${cloudSession.tournamentId}/slug`,{method:'POST',headers:cloudHeaders(),body:JSON.stringify({slug})});
    const info=await response.json();if(!response.ok)throw new Error(info.code==='slug-taken'?'That name is taken':info.error||'Unable to change short name');
    const old=cloudSession.slug;cloudSession.slug=info.slug;persistCloudSession();
    if(old)localStorage.setItem('ksm.slug:'+old,JSON.stringify(info));
    const route=ksmResolvedUrl().route;
    if(route.screen!=='home'&&route.screen!=='invalid')ksmReplaceUrl(KSMEngine.routePath({...route,id:cloudSession.tournamentId,slug:info.slug})+location.search);
    rememberTournament({tournamentId:cloudSession.tournamentId,slug:info.slug,payload:tournamentPayload(),revision:cloudSession.revision,updatedAt:cloudSession.updatedAt});
    ksmRefreshTournamentChip();
}
let ksmShortUrlSaving=false;
async function ksmSaveShortUrl(input){
  if(isReadOnlySession()||ksmShortUrlSaving||input.value===(cloudSession.slug||ksmPendingSlug||''))return;
  ksmShortUrlSaving=true;input.disabled=true;
  const hint=document.getElementById('setupShortUrlStatus');
  try{await ksmRenameTournamentSlug(input.value.trim());hint.textContent='Saved';input.removeAttribute('aria-invalid');input.value=cloudSession.slug||ksmPendingSlug||''}
  catch(err){hint.textContent=err.message;input.setAttribute('aria-invalid','true')}
  finally{ksmShortUrlSaving=false;input.disabled=false}
}
/* ksm:post-split-end */
