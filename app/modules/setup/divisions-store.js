// @ts-check
// The division lists in the store (#15 PR 9, docs/STORE.md section 3 item 9): `divisions`, `divisionTypes`,
// `divisionCourts`, `hiddenPresets` and `divisionRenames` are the `tournament` slice's; `state` reads them through
// getters (app/modules/app-state.js). Every write is one of these helpers: the edit is pure engine code
// (app/engine/division-lists.ts, divisions.ts) run on the current lists, and its result is one tournament/division…
// action. Nothing is dispatched when nothing changes. Like the old in-place writes, none of them schedules a save or
// renders: the caller does what it did before.
// The team court: `divisionCourts['Team Tournament']` is the Setup field `settings.teamCourt` (the store keeps the two
// equal after every action); a court change for that key is the Setup's (ksmSetTeamCourt()), never a division action.
import {state} from '../app-state.js';
import {dispatch,tournamentSlice} from '../../store/index.ts';
import {ksmSetTeamCourt} from '../registration/team-divisions.js';
import {settingsMeta} from '../sync/cloud-session-and-autosave.js';
import * as KSMEngine from '../../engine/index.ts';
/** @typedef {import('../../engine/index.ts').DivisionListsState} DivisionLists */
/** @typedef {'divisionAdded'|'divisionRemoved'|'divisionMoved'|'divisionRenamed'|'divisionFormatChanged'|'divisionCourtChanged'|'divisionsReplaced'|'presetHidden'|'presetsRestored'} DivisionAction */
/** The lists as the store holds them now (the engine's input). @returns {DivisionLists} */
const lists=()=>({divisions:state.divisions,divisionTypes:state.divisionTypes,divisionCourts:state.divisionCourts,hiddenPresets:state.hiddenPresets,divisionRenames:state.divisionRenames});
/** One division action with the lists the edit changed; none for an edit that changes nothing. */
function divisionAction(/** @type {DivisionAction} */ type,/** @type {DivisionLists} */ changed){
  if(!Object.keys(changed).length)return;
  dispatch(tournamentSlice.actions[type](/** @type {any} */ (changed),settingsMeta()));
}
/** An individual division added at the end of the running order (nothing when it is there already). */
export function ksmAddDivision(/** @type {string} */ division,/** @type {string} */ format,/** @type {string} */ court){divisionAction('divisionAdded',KSMEngine.addedDivision(lists(),division,format,court))}
/** A division put back at the end of the running order alone (a Registration row choosing it), its format and court as they are. */
export function ksmOfferDivision(/** @type {string} */ division){if(!(state.divisions||[]).includes(division))divisionAction('divisionAdded',{divisions:[...(state.divisions||[]),division]})}
/**
 * A division taken out of the running order, at `index` (removeDivision(i)) or wherever it is; its format and court
 * are forgotten unless `keepSettings` (a preset switched off).
 * @param {string} division
 * @param {{index?:number,keepSettings?:boolean}} [options]
 */
export function ksmRemoveDivision(division,options={}){divisionAction('divisionRemoved',KSMEngine.removedDivision(lists(),division,options))}
/** A division one place up or down in the running order (#31). */
export function ksmMoveDivision(/** @type {string} */ division,/** @type {'up'|'down'} */ direction){divisionAction('divisionMoved',KSMEngine.movedDivision(lists(),division,direction))}
/** A division's format. */
export function ksmSetDivisionFormat(/** @type {string} */ division,/** @type {string} */ format){
  if(state.divisionTypes?.[division]===format&&Object.hasOwn(state.divisionTypes,division))return;
  divisionAction('divisionFormatChanged',{divisionTypes:{...(state.divisionTypes||{}),[division]:format}});
}
/**
 * Courts of divisions (an individual division, a team division, a grand champion, the exhibitions), `null` to forget
 * one. 'Team Tournament' is the Setup's team court: ksmSetTeamCourt() (forgetting it keeps it, as removing the team
 * division always did).
 * @param {Record<string,string|null>} changes
 */
export function ksmSetDivisionCourts(changes){
  const rest={...changes};
  if(Object.hasOwn(rest,KSMEngine.TEAM_COURT_KEY)){const court=rest[KSMEngine.TEAM_COURT_KEY];delete rest[KSMEngine.TEAM_COURT_KEY];if(court!==null&&court!==undefined)ksmSetTeamCourt(court)}
  const now=state.divisionCourts||{};
  if(!Object.entries(rest).some(([d,c])=>c===null?Object.hasOwn(now,d):now[d]!==c||!Object.hasOwn(now,d)))return;
  divisionAction('divisionCourtChanged',{divisionCourts:KSMEngine.withDivisionCourts(now,rest)});
}
/** One division's court (see ksmSetDivisionCourts()). */
export function ksmSetDivisionCourt(/** @type {string} */ division,/** @type {string|null} */ court){ksmSetDivisionCourts({[division]:court})}
/** Each listed division without a court gets `court` (renderDivisions(): 'A'). */
export function ksmDefaultDivisionCourts(/** @type {readonly string[]} */ divisions,court='A'){divisionAction('divisionCourtChanged',KSMEngine.defaultedDivisionCourts(lists(),divisions,court))}
/**
 * All individual divisions at once (the sample tournament; the test API). The team court's entry stays the Setup's: where
 * `divisionCourts` names it, it keeps its place with the current value; where not, the store adds it after the others.
 * @param {string[]} divisions
 * @param {Record<string,string>} divisionTypes
 * @param {Record<string,string>} divisionCourts
 */
export function ksmReplaceDivisions(divisions,divisionTypes,divisionCourts){
  const courts={...divisionCourts};
  if(Object.hasOwn(courts,KSMEngine.TEAM_COURT_KEY))courts[KSMEngine.TEAM_COURT_KEY]=state.divisionCourts?.[KSMEngine.TEAM_COURT_KEY];
  divisionAction('divisionsReplaced',{divisions:[...divisions],divisionTypes:{...divisionTypes},divisionCourts:courts});
}
/** A standard division removed from this tournament: hidden from the presets (nothing when it already is). */
export function ksmHidePreset(/** @type {string} */ name){
  const hidden=state.hiddenPresets||[];
  if(!hidden.includes(name))divisionAction('presetHidden',{hiddenPresets:[...hidden,name]});
}
/** Restore standard divisions: none hidden. */
export function ksmRestorePresets(){divisionAction('presetsRestored',{hiddenPresets:[]})}
/**
 * A division rename's lists as renamedDivisionState() rewrote them (`divisions`, `divisionTypes`, `divisionCourts`, and
 * `divisionRenames` with the record appended): one tournament/divisionRenamed. The caller assigns the rest of what the
 * engine rewrote (competitors, grand champions, the courts' divisions) before it, so no store subscriber ever sees the
 * two halves disagree (ksmRenameSetupDivision()).
 * @param {Record<string,unknown>} renamed
 */
export function ksmRenameDivisionLists(renamed){
  /** @type {DivisionLists} */ const changed={};
  for(const key of /** @type {const} */ (['divisions','divisionTypes','divisionCourts','hiddenPresets','divisionRenames']))if(Object.hasOwn(renamed,key))/** @type {any} */ (changed)[key]=renamed[key];
  divisionAction('divisionRenamed',changed);
}
/** The keys of `state` this module's actions own (a rename's partial without them is what the caller assigns). */
export const KSM_DIVISION_STATE_KEYS=Object.freeze(['divisions','divisionTypes','divisionCourts','hiddenPresets','divisionRenames']);
