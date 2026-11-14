// @ts-check
import {state} from '../app-state.js';
import {syncOwnCourtPointer} from '../court/court-match-order.js';
import {cloudHeaders,connectCloudSocket,ksmCacheTournament,ksmCreateTournament,ksmExpireStaffSession,ksmFetchTournament,ksmUsesAccountAuth,loadTournamentFromCloud,readTournamentLibrary,renderHomeTournamentLibrary,setSessionRole,writeTournamentLibrary} from '../auth/auth0-access.js';
import {ksmPendingSlug,setKsmPendingSlug} from '../links/friendly-links.js';
import {ksmIsExplicitSpectatorUrl,ksmLinkParams,ksmLinkUrl,ksmResolveSlug,ksmShowRequestedScreen} from '../links/path-urls.js';
import {closeNavMenus,navigateTo,show} from '../navigation.js';
import {ksmRenderLibrary} from '../react-bridges/library.js';
import {ksmOpenTournamentAccess,ksmRenderSessionRole} from '../react-bridges/shell.js';
import {KSM_CLIENT_SCHEMA} from '../registration/team-divisions.js';
import {renderTvDisplay} from '../results/tv-display.js';
import {ksmOpenTournament,ksmPushTournamentAddress,ksmShowLibrary,ksmTournamentEpoch,setKsmStartupLoadFailed} from './tournament-switcher.js';
import {analyzeTournamentSnapshot,writeCloudDiagnosticsState} from '../sync/cloud-diagnostics.js';
import {applyTournamentPayload,cloudSaveTimeoutSignal,disconnectCloudSocket,ksmAnnounceTournamentGone,ksmCloudSocket,ksmGoneError,mergeQueuedStaffWork,renderTvRealtimeDiagnostics,setKsmApplyingRemoteSnapshot,setKsmLastSuccessfulSaveAt,setKsmSaveStatusMode,showKsmToast} from '../sync/cloud-realtime-save-and-load.js';
import {clearOutbox,cloudEnvelope,cloudSession,ensureClientIdentity,ksmSessionRole,ksmStoreAutosave,markLocalSave,scheduleAutoSave,persistCloudSession,preserveRecovery,readOutbox,renderPersistentSaveStatus,saveNow,setConnectionStatus,setKsmSessionRole,tournamentPayload,writeOutbox} from '../sync/cloud-session-and-autosave.js';
import {KSM_AUTOSAVE_CLOUD_ID,KSM_CLOUD_REBASE_MAX_ATTEMPTS,KSM_SAVE_KEY,cloudBaseFor,normalizeCourt,pendingLocalCourtActionsForRebase,pinCourtLocally,pinnedCourt,rebaseLocalPayloadOnRecord,rememberCloudBase,storedCourtPin} from '../sync/sync-state-and-rebase.js';
import {ksmWriterId} from '../sync/two-tabs.js';
import {ksmClearRestoreMark,ksmPendingRestoreMark,ksmRestoredSince} from '../sync/undo-regenerate.js';
// Staff sessions, the role and the Tournament Library (step 3d of #136, from app/js/33-staff-session-and-library.js).
// setSessionRole(), toggleStaffSession(), cloudHeaders(), cloudSocketUrl(), loadTournamentFromCloud(),
// ksmExpireStaffSession() and the library's read/write/render are the account-aware ones of
// app/modules/auth/auth0-access.js; the ksmAccount* functions below are the plain ones they call (until step 3d,
// 54-auth0-access.js kept these under those names and replaced the public ones at load).
// ---------- KSM v3.16.2 Spectator / Staff and Tournament Library ----------
export const KSM_V316_STAFF_SESSION='ksm.staff.session.v3_16';
const KSM_V316_LIBRARY='ksm.tournament.library.v3_16';
export const KSM_STAFF_TOURNAMENT='ksm.staff.tournament.v1';
function ksmStoreStaffToken(token,id=cloudSession.tournamentId){
  sessionStorage.setItem(KSM_V316_STAFF_SESSION,token);
  sessionStorage.setItem(KSM_STAFF_TOURNAMENT,id||'');
}
export function ksmAccountExpire(payload){
  if(!ksmStaffToken(v316StaffPassword()))return;
  if(payload)writeOutbox(payload,'Staff session expired');
  sessionStorage.removeItem(KSM_V316_STAFF_SESSION);
  sessionStorage.removeItem(KSM_STAFF_TOURNAMENT);
  setSessionRole('spectator');installRoleBanner('spectator');disconnectCloudSocket();connectCloudSocket();
  showKsmToast('Staff session expired · use Staff Login again',4000,true);
}
async function ksmResumeStaffSession(id){
  if(!v316StaffPassword()||!navigator.onLine)return;
  // Authorization precedes revision validation. -1 can never match a server revision:
  // a valid session gets 409 without writing, an expired/revoked one gets the usual 401.
  const epoch=ksmTournamentEpoch;
  let response;
  try{
    response=await fetch(`/api/tournaments/${encodeURIComponent(id)}`,{
      method:'PUT',headers:cloudHeaders(),body:JSON.stringify({revision:-1}),signal:cloudSaveTimeoutSignal(id)
    });
  }catch(_){setConnectionStatus('Offline · session check pending','offline');return}
  if(epoch!==ksmTournamentEpoch)throw Object.assign(new Error('Tournament changed'),{code:'transition-cancelled'});
  if(response.status===410){ksmAnnounceTournamentGone(id,true);throw ksmGoneError()}
  if(response.status===401)ksmExpireStaffSession();
  else if(response.status!==409)setConnectionStatus('Session check unavailable','offline');
}
export function v316StaffPassword(){
  const token=sessionStorage.getItem(KSM_V316_STAFF_SESSION)||'';
  if(!ksmStaffToken(token))return token; // Temporary creation password, never a persisted login.
  return sessionStorage.getItem(KSM_STAFF_TOURNAMENT)===cloudSession.tournamentId?token:'';
}
// Staff session (issue #9): KSM_V316_STAFF_SESSION holds the session token the server returned at
// Staff Login or tournament creation (sent as x-ksm-session-key and the live connection's key),
// or, only between New Tournament and the server's answer, the new password to create it with.
export function ksmStaffToken(value){return typeof value==='string'&&value.startsWith('ksmst_')}
// F33: work queued by staff stays staff work. A device logged out (a 401, Staff Logout) holds no
// staff work of its own, so it never replaces a queued staff snapshot of this tournament (by one
// stamped as spectator, which the next live update would discard) before Staff Login sends it.
export function ksmKeepStaffOutbox(){if(!isReadOnlySession()||!cloudSession.tournamentId)return false;const queued=readOutbox();return queued?.role==='staff'&&queued.tournamentId===cloudSession.tournamentId}
export function ksmAccountSetRole(role){setKsmSessionRole(role==='staff'?'staff':'spectator');document.body.classList.toggle('ksm-spectator',ksmSessionRole==='spectator');document.body.classList.toggle('ksm-staff',ksmSessionRole==='staff');document.body.classList.remove('ksm-scorekeeper','ksm-admin');ksmRenderSessionRole();
  // This device may now run its court: a division it picked before Staff Login becomes the court's (#15 PR 6), saved once.
  if(ksmSessionRole==='staff'&&syncOwnCourtPointer())scheduleAutoSave(`Court ${state.currentCourt} division: ${state.currentDivision}`);}
export function isReadOnlySession(){return ksmSessionRole!=='staff'}
export function isSpectatorSession(){return isReadOnlySession()}
export function canCloudWrite(){return ksmSessionRole==='staff'||!cloudSession.tournamentId}
export function sessionKey(){return v316StaffPassword()}
export function ksmAccountHeaders(){return {'content-type':'application/json','x-ksm-role':ksmSessionRole==='staff'?'staff':'spectator','x-ksm-session-key':sessionKey(),'x-ksm-client-id':ksmWriterId(),'x-ksm-client-name':cloudSession.clientName||'KSM Device','x-ksm-court':cloudSession.court||'','x-ksm-client-schema':String(KSM_CLIENT_SCHEMA)}}
export function ksmAccountSocketUrl(id){const protocol=location.protocol==='https:'?'wss:':'ws:';const url=new URL(`${protocol}//${location.host}/api/tournaments/${encodeURIComponent(id)}/live`);url.searchParams.set('role',ksmSessionRole==='staff'?'staff':'spectator');if(sessionKey())url.searchParams.set('key',sessionKey());url.searchParams.set('clientId',cloudSession.clientId||'');url.searchParams.set('name',cloudSession.clientName||'KSM Device');if(cloudSession.court)url.searchParams.set('court',cloudSession.court);return url.toString()}
export function promptNewStaffPassword(){const a=prompt('Create Staff password');if(!a)return '';if(a.length<4){alert('Staff password must be at least 4 characters.');return ''}const b=prompt('Confirm Staff password');if(a!==b){alert('Passwords do not match.');return ''}return a}
export async function ksmAccountToggleStaff(){if(ksmSessionRole==='staff'){sessionStorage.removeItem(KSM_V316_STAFF_SESSION);setSessionRole('spectator');installRoleBanner('spectator');disconnectCloudSocket();connectCloudSocket();navigateTo('public');return}if(!cloudSession.tournamentId){alert('Create or load a tournament before Staff Login.');return}const loginTournament=cloudSession.tournamentId,loginEpoch=ksmTournamentEpoch;const password=prompt('Enter Staff password');if(!password)return;try{const response=await fetch(`/api/tournaments/${encodeURIComponent(cloudSession.tournamentId)}/auth`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});if(response.status===410){ksmAnnounceTournamentGone(cloudSession.tournamentId);return}const info=await response.json().catch(()=>null);if(!response.ok){if(response.status===429&&info?.error){alert(info.error);return}throw new Error()}if(loginEpoch!==ksmTournamentEpoch||loginTournament!==cloudSession.tournamentId)return;ksmStoreStaffToken(info?.token||password,loginTournament);setSessionRole('staff');installRoleBanner('staff');mergeQueuedStaffWork();disconnectCloudSocket();connectCloudSocket();showKsmToast('✓ Staff access enabled',1500)}catch(_){alert('Incorrect Staff password.')}}
export function installRoleBanner(role){document.querySelector('.spectator-readonly-banner')?.remove();if(role!=='spectator')return;const banner=document.createElement('div');banner.className='spectator-readonly-banner';banner.textContent='LIVE SPECTATOR VIEW • READ ONLY';document.body.prepend(banner)}
export function ksmAccountReadLibrary(){try{return JSON.parse(localStorage.getItem(KSM_V316_LIBRARY)||'[]')}catch(_){return []}}
export function ksmAccountWriteLibrary(list){localStorage.setItem(KSM_V316_LIBRARY,JSON.stringify((list||[]).slice(0,100)))}
export function rememberTournament(record){ksmCacheTournament(record);if(!record?.tournamentId)return;const list=readTournamentLibrary().filter(x=>x.id!==record.tournamentId);list.unshift({id:record.tournamentId,name:record.payload?.setup?.tName||'Kendo Tournament',slug:record.slug||cloudSession.slug||null,updatedAt:record.updatedAt||new Date().toISOString()});writeTournamentLibrary(list)}
export function paintHomeTournamentLibrary(list,message='No tournaments yet.'){const host=document.getElementById('homeTournamentLibrary');if(!host)return;ksmRenderLibrary(list,message);}
export async function ksmAccountRenderLibrary(){const cached=readTournamentLibrary();paintHomeTournamentLibrary(cached,cached.length?'':'Loading tournaments…');if(!navigator.onLine){if(!cached.length)paintHomeTournamentLibrary([],'Offline — no cached tournaments are available.');return}try{const ids=cached.map(x=>x.id).filter(Boolean);const response=await fetch(ids.length?'/api/tournaments/discover':'/api/tournaments',{method:ids.length?'POST':'GET',headers:ids.length?{'content-type':'application/json'}:undefined,body:ids.length?JSON.stringify({ids}):undefined,cache:'no-store'});if(!response.ok)throw new Error(`Library load failed (${response.status})`);const cloud=await response.json();writeTournamentLibrary(cloud);paintHomeTournamentLibrary(cloud)}catch(err){console.warn(err);if(!cached.length)paintHomeTournamentLibrary([],'Unable to load the Tournament Library. Check your connection.') }}
export function showHomePage(){return ksmShowLibrary();closeNavMenus();disconnectCloudSocket();sessionStorage.removeItem(KSM_V316_STAFF_SESSION);setSessionRole('spectator');installRoleBanner('home');document.body.classList.add('ksm-home');renderHomeTournamentLibrary();show('home')}
export async function createNewTournament(){return ksmCreateTournament();const name=prompt('Tournament Name','Kendo Tournament');if(!name)return;const password=promptNewStaffPassword();if(!password)return;document.body.classList.remove('ksm-home');disconnectCloudSocket();cloudSession.tournamentId=null;cloudSession.revision=0;cloudSession.updatedAt=null;cloudSession.court='';persistCloudSession();sessionStorage.setItem(KSM_V316_STAFF_SESSION,password);if(window.tName)tName.value=name;setSessionRole('staff');installRoleBanner('staff');navigateTo('setup');markLocalSave('New tournament');showKsmToast('Creating tournament in cloud…',0);try{await performCloudSave(tournamentPayload(),0);showKsmToast('✓ Tournament created',2200)}catch(err){console.error(err);writeOutbox(tournamentPayload(),'New tournament');showKsmToast(navigator.onLine?'Unable to create tournament in cloud':'Offline · Tournament will sync when connected',3500,true)}}
export async function openTournamentFromHome(id){return ksmOpenTournament(id);sessionStorage.removeItem(KSM_V316_STAFF_SESSION);setSessionRole('spectator');document.body.classList.remove('ksm-home');try{await loadTournamentFromCloud(id,{spectator:true});setSessionRole('spectator');installRoleBanner('spectator');navigateTo('public')}catch(err){console.error(err);if(err?.code==='tournament-deleted')return;document.body.classList.add('ksm-home');renderHomeTournamentLibrary();alert('Unable to open that tournament. The network or tournament data could not be loaded. Please retry; if the problem continues, check the browser console.')}}
export async function openTournamentLibrary(){showHomePage()}
export function spectatorLink(){if(!cloudSession.tournamentId)return '';return ksmLinkUrl({screen:'tournament',id:cloudSession.tournamentId})}
export async function openTournamentAccess(){if(!cloudSession.tournamentId)await saveNow();if(!cloudSession.tournamentId){alert('Connect to the internet and save the tournament first.');return}const link=spectatorLink();const qr=`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(link)}`;ksmOpenTournamentAccess(link,qr);}
// Numbers the cloud save attempts in the diagnostics (from app/js/18-sync-state-and-rebase.js; only this function uses it).
let ksmCloudAttemptCounter=0;
export async function performCloudSave(payload=tournamentPayload(),baseRevision=cloudSession.revision||0,rebaseAttempt=0,originalBaseRevision=baseRevision,basePayload=cloudBaseFor(baseRevision),options={}){
  const savingEpoch=ksmTournamentEpoch;
  const existing=cloudSession.tournamentId;
  const attemptId=++ksmCloudAttemptCounter;
  let envelope=/** @type {any} */({...cloudEnvelope(payload),revision:baseRevision});
  if(!existing){
    const password=ksmUsesAccountAuth()?'':(ksmStaffToken(v316StaffPassword())?'':v316StaffPassword())||promptNewStaffPassword();
    if(!ksmUsesAccountAuth()&&!password)throw new Error('Staff password required');
    if(password)sessionStorage.setItem(KSM_V316_STAFF_SESSION,password);
    setSessionRole('staff');
    envelope={...envelope,staffPassword:password, ...(ksmPendingSlug?{slug:ksmPendingSlug}:{})};
  }
  // #129 part 3: the request that carries a full regenerate is marked, so the server keeps the record it
  // replaces (Undo regenerate). The mark comes from the queued entry (options.restoreMark) or this tab.
  const restoreMark=existing&&!options.wholeReplace?(options.restoreMark||ksmPendingRestoreMark(existing,payload)):null;
  if(restoreMark)envelope={...envelope,restorePoint:'regenerate',restorePointId:restoreMark.restorePointId||''};
  const body=JSON.stringify(envelope);
  const snapshotAnalysis=analyzeTournamentSnapshot(payload);
  writeCloudDiagnosticsState({
    attemptId,
    stage:rebaseAttempt?`Sending rebased cloud request (${rebaseAttempt}/${KSM_CLOUD_REBASE_MAX_ATTEMPTS})`:'Sending cloud request',
    lastAttemptAt:new Date().toISOString(),
    httpStatus:null,
    errorMessage:'',
    errorBody:'',
    baseRevision,
    originalBaseRevision,
    rebaseAttempt,
    snapshotBytes:new Blob([body]).size,
    snapshotAnalysis
  });
  let response;
  try{
    response=await fetch(existing?`/api/tournaments/${encodeURIComponent(existing)}`:'/api/tournaments',{
      method:existing?'PUT':'POST',
      headers:cloudHeaders(),
      signal:cloudSaveTimeoutSignal(existing),body
    });
  }catch(err){
    writeCloudDiagnosticsState({attemptId,stage:'Network request failed',errorMessage:String(err?.message||err),lastFailureAt:new Date().toISOString()});
    throw err;
  }
  if(savingEpoch!==ksmTournamentEpoch)throw Object.assign(new Error('Tournament changed'),{code:'transition-cancelled'});
  let responseText='';
  try{responseText=await response.text()}catch(_){}
  let parsed=null;
  if(responseText){try{parsed=JSON.parse(responseText)}catch(_){}}
  writeCloudDiagnosticsState({
    attemptId,
    stage:'Cloud response received',
    httpStatus:response.status,
    errorBody:response.ok?'':responseText.slice(0,1000),
    rebaseAttempt
  });
  // Issue #26: the tournament was deleted: this device forgets it and returns to the Library; the
  // save is neither queued nor retried.
  if(response.status===410){
    writeCloudDiagnosticsState({attemptId,stage:'Tournament deleted',errorMessage:'Tournament deleted'});
    ksmAnnounceTournamentGone(existing);
    throw ksmGoneError();
  }
  // #95: the server needs a newer app (this page was loaded before an update): reload, not retry.
  if(response.status===426){
    const message=(parsed&&parsed.error)||'Reload the page to update the app, then save again.';
    writeCloudDiagnosticsState({attemptId,stage:'App update required',errorMessage:message});
    showKsmToast(message,10000,true);
    throw new Error(message);
  }
  if(response.status===403){
    writeCloudDiagnosticsState({attemptId,stage:'Authorization rejected',errorMessage:'Session authorization required'});
    throw new Error('Session authorization required');
  }
  // The staff session token expired (24 h unused) or was revoked: the device becomes a spectator,
  // so Staff Login asks for the password again; the unsaved work stays queued for after it.
  if(response.status===401){
    writeCloudDiagnosticsState({attemptId,stage:'Staff session expired',errorMessage:(parsed&&parsed.error)||'Staff session expired'});
    // F33: queue the unsaved work as staff work before the role changes (writeOutbox() stamps the role).
    ksmExpireStaffSession(payload);
    throw new Error('Session authorization required');
  }
  if(parsed?.code==='slug-taken'||parsed?.code==='invalid-slug')throw Object.assign(new Error(parsed.error),{code:parsed.code});
  if(response.status===409){
    const conflict=parsed||{},serverRecord=conflict.record;
    // F37 (#88): a whole-tournament Replace is never rebased (that kept the server copy and dropped the
    // file silently): the caller asks the director.
    if(options.wholeReplace&&serverRecord){
      writeCloudDiagnosticsState({attemptId,stage:'Replace met another save',serverRevision:serverRecord.revision||null});
      throw Object.assign(new Error('Replace conflict'),{code:'replace-conflict',record:serverRecord});
    }
    // #129 part 3: another device undid the regenerate after this request's base: the restored copy wins.
    // This device's work (made on the regenerated draw) is not replayed onto it; the caller keeps it in
    // the recovery file and applies the restored record (03-, Undo regenerate).
    if(serverRecord&&existing&&ksmRestoredSince(serverRecord,originalBaseRevision)){
      writeCloudDiagnosticsState({attemptId,stage:'Save replaced by Undo regenerate',serverRevision:serverRecord.revision||null,originalBaseRevision});
      throw Object.assign(new Error('Replaced by Undo regenerate'),{code:'superseded-by-restore',record:serverRecord,payload});
    }
    if(serverRecord&&existing&&rebaseAttempt<KSM_CLOUD_REBASE_MAX_ATTEMPTS){
      const serverRevision=Number(serverRecord.revision||0);
      const replayActions=pendingLocalCourtActionsForRebase(payload,serverRecord,originalBaseRevision);
      const rebased=rebaseLocalPayloadOnRecord(payload,serverRecord,originalBaseRevision,basePayload);
      writeCloudDiagnosticsState({
        attemptId,
        stage:'Rebasing concurrent court changes',
        baseRevision,
        originalBaseRevision,
        serverRevision,
        rebaseAttempt:rebaseAttempt+1,
        replayActionCount:replayActions.length,
        pinnedCourt:pinnedCourt()||''
      });
      cloudSession.revision=serverRevision||Number(cloudSession.revision||0);
      cloudSession.updatedAt=serverRecord.updatedAt;
      persistCloudSession();
      const savedRecord=await performCloudSave(rebased,cloudSession.revision,rebaseAttempt+1,originalBaseRevision,serverRecord.payload,{...options,restoreMark});
      savedRecord.__ksmRebased=true;
      savedRecord.__ksmOriginalBaseRevision=originalBaseRevision;
      savedRecord.__ksmRebaseAttempts=Math.max(Number(savedRecord.__ksmRebaseAttempts||0),rebaseAttempt+1);
      return savedRecord;
    }
    if(serverRecord){
      cloudSession.revision=Number(serverRecord.revision||cloudSession.revision||0);
      cloudSession.updatedAt=serverRecord.updatedAt;
      persistCloudSession();
    }
    const outbox={tournamentId:existing,baseRevision:Number(serverRecord?.revision||baseRevision),payload,queuedAt:new Date().toISOString()};
    preserveRecovery(outbox,serverRecord);
    writeOutbox(payload,'Concurrent court conflict requires retry');
    writeCloudDiagnosticsState({
      attemptId,
      stage:'Revision conflict needs attention',
      errorMessage:'Cloud revision conflict',
      serverRevision:serverRecord?.revision||null,
      originalBaseRevision,
      rebaseAttempt
    });
    throw new Error('Cloud revision conflict');
  }
  if(!response.ok){
    const message=(parsed&&parsed.error)||`Cloud save failed (${response.status})`;
    writeCloudDiagnosticsState({attemptId,stage:'Cloud save rejected',errorMessage:message});
    throw new Error(message);
  }
  const record=parsed;
  if(!record)throw new Error('Cloud response was not valid JSON');
  const idChanged=cloudSession.tournamentId!==record.tournamentId;
  cloudSession.tournamentId=record.tournamentId;
  cloudSession.revision=record.revision;
  cloudSession.updatedAt=record.updatedAt;
  persistCloudSession();
  rememberCloudBase(record);
  cloudSession.slug=record.slug||null;if(!existing&&localStorage.getItem(KSM_SAVE_KEY))localStorage.setItem(KSM_AUTOSAVE_CLOUD_ID,record.tournamentId);setKsmPendingSlug('');sessionStorage.removeItem('ksm.pending-slug');persistCloudSession();
  rememberTournament(record);
  if(!existing)ksmPushTournamentAddress(record.tournamentId);
  // Creating the tournament logged this device in: keep the session token instead of the password.
  if(!existing){const token=response.headers.get('x-ksm-session-token');if(ksmStaffToken(token))ksmStoreStaffToken(token,record.tournamentId)}
  setSessionRole(v316StaffPassword()?'staff':'spectator');
  clearOutbox();
  // #129 part 3: the regenerate reached the server, which now keeps the copy before it (the Danger zone asks).
  if(restoreMark){ksmClearRestoreMark(record.tournamentId,restoreMark.restorePointId);globalThis.dispatchEvent?.(new Event('ksm:regenerate-saved'))}
  setKsmLastSuccessfulSaveAt(Date.parse(record.updatedAt)||Date.now());
  setKsmSaveStatusMode('saved');
  writeCloudDiagnosticsState({
    attemptId,
    stage:rebaseAttempt?'Rebased save completed':'Save completed',
    httpStatus:response.status,
    errorMessage:'',
    errorBody:'',
    retryCount:0,
    lastSuccessAt:record.updatedAt||new Date().toISOString(),
    serverRevision:record.revision,
    rebaseAttempt
  });
  setConnectionStatus('Connected','online');
  renderPersistentSaveStatus();
  if(idChanged||!ksmCloudSocket)connectCloudSocket();
  return record;
}
export async function ksmAccountLoad(tournamentId,options={}){const id=(tournamentId||cloudSession.tournamentId||'').trim();if(!id)throw new Error('Tournament ID required');setConnectionStatus('Loading cloud…','connecting');const epoch=ksmTournamentEpoch;const response=await ksmFetchTournament(id);if(epoch!==ksmTournamentEpoch)throw Object.assign(new Error('Tournament changed'),{code:'transition-cancelled'});if(response.status===410){ksmAnnounceTournamentGone(id,true);throw ksmGoneError()}if(!response.ok)throw new Error(`Cloud load failed (${response.status})`);const record=await response.json();cloudSession.slug=record.slug||null;const requestedCourt=options.court?normalizeCourt(options.court):pinnedCourt();cloudSession.tournamentId=record.tournamentId;if(requestedCourt)pinCourtLocally(requestedCourt);disconnectCloudSocket();setKsmApplyingRemoteSnapshot(true);try{applyTournamentPayload(record.payload,false,{pinnedCourt:requestedCourt});ksmStoreAutosave(record.payload)}finally{setKsmApplyingRemoteSnapshot(false)}cloudSession.tournamentId=record.tournamentId;cloudSession.revision=record.revision;cloudSession.updatedAt=record.updatedAt;cloudSession.court=requestedCourt||'';persistCloudSession();rememberCloudBase(record);rememberTournament(record);setKsmLastSuccessfulSaveAt(Date.parse(record.updatedAt)||Date.now());setKsmSaveStatusMode('saved');setSessionRole(v316StaffPassword()?'staff':'spectator');if(!isReadOnlySession())mergeQueuedStaffWork();installRoleBanner(ksmSessionRole);if(!options.resumeStaff)connectCloudSocket();setConnectionStatus('Connected','online');renderPersistentSaveStatus();return record}
// Counts the route loads in progress (from app/js/00-path-urls.js, which reads it).
export let ksmRouteLoading=0;
// A module's `let` is read-only to importers: the window accessor (tests) assigns it here.
export function setKsmRouteLoading(value){ksmRouteLoading=value}
export async function initializeCloudRoleFromUrl(){ksmRouteLoading++;try{await ksmResolveSlug();ensureClientIdentity();const params=ksmLinkParams();const id=params.get('tournament')||params.get('spectator')||'';const requestedView=params.get('view')||'';const requestedCourt=params.get('court')?normalizeCourt(params.get('court')):(requestedView!=='tv'&&id&&storedCourtPin(id))||'A';if(id){const staff=ksmStaffToken(sessionStorage.getItem(KSM_V316_STAFF_SESSION))&&sessionStorage.getItem(KSM_STAFF_TOURNAMENT)===id&&!ksmIsExplicitSpectatorUrl()&&requestedView!=='tv'&&params.get('role')!=='spectator'&&!params.has('spectator');if(!staff)sessionStorage.removeItem(KSM_V316_STAFF_SESSION);await loadTournamentFromCloud(id,{spectator:!staff,court:requestedCourt,resumeStaff:staff});setKsmStartupLoadFailed(false);if(staff)await ksmResumeStaffSession(id);connectCloudSocket();installRoleBanner(ksmSessionRole);document.body.classList.remove('ksm-home');if(requestedView==='tv'){document.body.classList.add('ksm-tv');cloudSession.court=requestedCourt;persistCloudSession();renderTvDisplay();renderTvRealtimeDiagnostics();show('tv')}else{document.body.classList.remove('ksm-tv');ksmShowRequestedScreen()}return true}
// The Library URL has no ID. Only this tab's explicitly scoped token may restore its context.
const savedId=sessionStorage.getItem(KSM_STAFF_TOURNAMENT);
if(!window.ksmBootstrapReady&&savedId&&ksmStaffToken(sessionStorage.getItem(KSM_V316_STAFF_SESSION))){
  await loadTournamentFromCloud(savedId,{resumeStaff:true});await ksmResumeStaffSession(savedId);disconnectCloudSocket();
  document.body.classList.add('ksm-home');installRoleBanner('home');renderHomeTournamentLibrary();show('home');return true;
}
// Unscoped legacy tokens are intentionally discarded; a fresh login binds them safely.
sessionStorage.removeItem(KSM_V316_STAFF_SESSION);
await showHomePage();return true}finally{ksmRouteLoading--;}}
