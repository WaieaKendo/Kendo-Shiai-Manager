// @ts-check
import {state} from '../app-state.js';
import {ksmCanDeleteTournament} from '../legacy.js';
import {requestTournamentGeneration} from '../registration/validation.js';
import {isReadOnlySession} from '../session/staff-session-and-library.js';
import {ksmRefreshRestorePoint,ksmRenderUndoRegenerate} from '../sync/undo-regenerate.js';
// #129: Setup → Advanced → Danger zone holds Regenerate Tournament (the toolbar drops it once the
// tournament is drawn) and Delete tournament (also in Cloud Diagnostics). Both call the existing flows.
export function ksmDangerRegenerate(){if(!state.generated||isReadOnlySession())return;requestTournamentGeneration()}
// refresh: the Advanced section was opened (its ontoggle), so the server's restore point is asked again.
export function ksmSyncDangerZone(refresh){
  const regen=/** @type {HTMLButtonElement|null} */(document.querySelector('[data-testid="setup-regenerate-tournament"]')),del=/** @type {HTMLButtonElement|null} */(document.querySelector('[data-testid="setup-delete-tournament"]')),note=document.getElementById('setupDangerReason');
  if(!regen||!del||!note)return;
  const canDelete=typeof ksmCanDeleteTournament==='function'&&!!ksmCanDeleteTournament(),reasons=[];
  regen.disabled=isReadOnlySession()||!state.generated;del.disabled=!canDelete;
  if(!state.generated)reasons.push('Regenerate Tournament is available once the tournament has been generated.');
  if(!canDelete)reasons.push('Delete tournament is available to staff of a saved cloud tournament.');
  note.textContent=reasons.join(' ');note.hidden=!reasons.length;
  ksmRenderUndoRegenerate();
  if(refresh===true)ksmRefreshRestorePoint();
}
