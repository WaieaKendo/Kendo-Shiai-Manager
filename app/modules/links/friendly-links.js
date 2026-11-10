// @ts-check
import {cloudHeaders} from '../auth/auth0-access.js';
import {ksmReplaceUrl,ksmResolvedUrl} from './path-urls.js';
import {isReadOnlySession,openTournamentAccess,rememberTournament} from '../session/staff-session-and-library.js';
import {ksmRefreshTournamentChip} from '../session/tournament-switcher.js';
import {readCloudDiagnosticsState} from '../sync/cloud-diagnostics.js';
import {cloudSession,persistCloudSession,saveNow,tournamentPayload} from '../sync/cloud-session-and-autosave.js';
// Friendly links: the tournament short name (slug) and the cached tournament records (step 3d of #136, from
// app/js/33-friendly-links.js). ksmPendingSlug is read from sessionStorage by initFriendlyLinks(), which
// app/js/33-friendly-links.js runs where this file used to load.
// ksmCacheTournament() and ksmFetchTournament() are the account-aware ones of app/modules/auth/auth0-access.js;
// the plain ones below are what they call (54-auth0-access.js replaced them at load until step 3d).
export let ksmPendingSlug='';
// A module's `let` is read-only to importers: the session modules assign it here.
export function setKsmPendingSlug(value){ksmPendingSlug=value}
export function ksmAccountCacheTournament(record){
  const slug=record.slug||cloudSession.slug||null;
  localStorage.setItem('ksm.tournament.record:'+record.tournamentId,JSON.stringify({...record,slug}));
  if(slug)localStorage.setItem('ksm.slug:'+slug,JSON.stringify({id:record.tournamentId,slug}));
}
export async function ksmAccountFetchTournament(id){
  if(navigator.onLine)return fetch(`/api/tournaments/${encodeURIComponent(id)}`);
  const record=localStorage.getItem('ksm.tournament.record:'+id);
  if(!record)throw new Error('No offline copy of this tournament is available');
  return new Response(record,{headers:{'content-type':'application/json'}});
}
export async function ksmEditTournamentSlug(showAccess=true){
  if(isReadOnlySession())return;
  const slug=prompt('Tournament short name (lowercase letters, digits and dashes)',cloudSession.slug||KSMEngine.suggestSlug(tName.value,String(new Date().getFullYear())));
  if(slug===null)return;
  try{await ksmRenameTournamentSlug(slug);if(showAccess)openTournamentAccess()}catch(err){alert(err.message)}
}
export async function ksmRenameTournamentSlug(slug){
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
export async function ksmSaveShortUrl(input){
  if(isReadOnlySession()||ksmShortUrlSaving||input.value===(cloudSession.slug||ksmPendingSlug||''))return;
  ksmShortUrlSaving=true;input.disabled=true;
  const hint=document.getElementById('setupShortUrlStatus');
  try{await ksmRenameTournamentSlug(input.value.trim());hint.textContent='Saved';input.removeAttribute('aria-invalid');input.value=cloudSession.slug||ksmPendingSlug||''}
  catch(err){hint.textContent=err.message;input.setAttribute('aria-invalid','true')}
  finally{ksmShortUrlSaving=false;input.disabled=false}
}
// Load-time side effect (the pending short name read from sessionStorage), run from app/js where this file was loaded.
export function initFriendlyLinks(){
ksmPendingSlug=sessionStorage.getItem('ksm.pending-slug')||'';
}
