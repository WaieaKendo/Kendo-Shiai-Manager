// @ts-check
// The court pointers in the store (#15 PR 13a, docs/STORE.md section 3 item 13): `courtState` (what each court runs:
// {division, index}), `courtActiveDivision` (each court's division, kept twice for 4.0) and `currentByDivision` (each
// division's queue position) are the `tournament` slice's; `state` reads them through getters (app/modules/app-state.js).
// Every write is one court/… action through ksmMoveCourtPointers() (`meta.court`: the court whose pointer moves), a
// division's draw (its queue position rides in the draw action, structure-store.js) or the rename
// (tournament/divisionRenamed). A pointer is store data (frozen in the tests): never `cs.index++`, build a new one.
// What is not in the store yet (`allMatches`: PR 13c) the caller writes as before, in the same synchronous step, before
// the dispatch: a store notification never shows a pointer into a list that is not there yet.
// Like the old in-place writes, none of these schedules a save or renders: the caller does what it did before.
import {state} from '../app-state.js';
import {courtActions,dispatch} from '../../store/index.ts';
import {settingsMeta} from '../sync/cloud-session-and-autosave.js';
/** @typedef {import('../../store/index.ts').CourtPointers} CourtPointers */
/** @typedef {keyof typeof courtActions} CourtPointerAction */
/** The three pointer maps, in the order of `state`'s literal. */
export const KSM_POINTER_KEYS=Object.freeze(/** @type {const} */ (['currentByDivision','courtState','courtActiveDivision']));
/**
 * One court/… action with the entries of `pointers` that change something (an entry equal to the store's, as JSON, is left
 * out; a missing map is created, as the old `||{}` did); none when nothing changes, so a
 * render's self-heal that lands where the court already is notifies no one.
 * @param {CourtPointerAction} type
 * @param {CourtPointers} pointers
 * @param {string|null} [court] the court whose pointer moves (`meta.court`); null for a structural edit
 */
export function ksmMoveCourtPointers(type,pointers,court=null){
  /** @type {Record<string,Record<string,unknown>>} */ const out={};
  for(const key of KSM_POINTER_KEYS){
    const entries=/** @type {Record<string,unknown>|undefined} */ (pointers[key]),now=/** @type {Record<string,unknown>|undefined} */ (state[key]);
    if(!entries)continue;
    if(!now){out[key]={...entries};continue}
    const changed=Object.entries(entries).filter(([k,v])=>!Object.hasOwn(now,k)||JSON.stringify(now[k])!==JSON.stringify(v));
    if(changed.length)out[key]=Object.fromEntries(changed);
  }
  if(Object.keys(out).length)dispatch(courtActions[type](/** @type {CourtPointers} */ (out),{...settingsMeta(),court}));
}
/**
 * Court `court`'s pointer entries: its `courtState` entry `cs` (the object itself, as the old assignment stored it) and
 * `courtActiveDivision` (its division); with `queue`, the division's queue position too.
 * @param {string} court
 * @param {{division:string|null,index:number}} cs
 * @param {number} [queue]
 * @returns {CourtPointers}
 */
export function ksmCourtPointer(court,cs,queue){
  /** @type {any} */ const out={courtState:{[court]:cs},courtActiveDivision:{[court]:cs.division}};
  if(queue!==undefined)out.currentByDivision={[String(cs.division)]:queue};
  return out;
}
/**
 * The courts' pointers `next` gives a new value (each court of `courts`): one court/pointersResolved (a structural edit:
 * generation, Edit Pool, a division's court, a grand champion's draw, the No Shows), with `queue` (division → position)
 * when the edit resets one. `next(c)` is computed for every court before the dispatch, as the old loop computed each
 * from the lists (no court's pointer is read on the way).
 * @param {readonly string[]} courts
 * @param {(court:string)=>{division:string|null,index:number}} next
 * @param {Record<string,number>} [queue]
 */
export function ksmResolveCourts(courts,next,queue){
  /** @type {any} */ const out={courtState:{},courtActiveDivision:{}};
  for(const c of courts){const cs=next(c);out.courtState[c]=cs;out.courtActiveDivision[c]=cs.division}
  if(queue)out.currentByDivision=queue;
  if(!courts.length){delete out.courtState;delete out.courtActiveDivision}
  ksmMoveCourtPointers('pointersResolved',out);
}
