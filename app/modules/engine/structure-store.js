// @ts-check
// The draw structure in the store (#15 PR 12a, docs/STORE.md section 3 item 12): `pools`, `teamPools`, `brackets`,
// `singleElimComps`, `byeWinners`, `generated` and `managementRevision` are the `tournament` slice's; `state` reads them
// through getters (app/modules/app-state.js). Every write is one tournament/… action through ksmSetDraw(), with maps the
// caller computed from the current ones (ksmDrawWith(), ksmEditedPools()), like the division and people edits. The draw
// is store data (frozen in the tests): a pool, a player row, an entrant or a template is never edited in place; an edit
// builds the new rows. What is not in the store yet (the bracket nodes, `teamElimTeams`: PR 12b; `allMatches`,
// `courtState`, `currentByDivision`: PR 13) the caller writes as before, in the same synchronous step as the dispatch.
// Like the old in-place writes, none of these schedules a save or renders: the caller does what it did before.
import {state} from '../app-state.js';
import {dispatch,tournamentSlice} from '../../store/index.ts';
import {settingsMeta} from '../sync/cloud-session-and-autosave.js';
/** @typedef {'pools'|'teamPools'|'brackets'|'singleElimComps'|'byeWinners'} DrawKey */
/** @typedef {import('../../store/index.ts').DrawLists} DrawLists */
/** @typedef {'drawReset'|'divisionGenerated'|'tournamentGenerated'|'divisionRegenerated'|'divisionCleared'|'poolsEdited'|'drawEntriesUpdated'} DrawAction */
/** The five maps by division (KSM_STRUCTURAL_DIVISION_KEYS has them with the plain ones). @type {readonly DrawKey[]} */
export const KSM_DRAW_KEYS=Object.freeze(['pools','teamPools','brackets','singleElimComps','byeWinners']);
/** One structure action; none for an empty edit. @param {DrawAction} type @param {DrawLists} lists */
export function ksmSetDraw(type,lists){
  if(!Object.keys(lists).length)return;
  dispatch(tournamentSlice.actions[type](/** @type {any} */ (lists),settingsMeta()));
}
/**
 * The maps with `div`'s entries changed, as the old writes left them: each key of `remove` loses the entry (a map that is
 * not there stays so, as `if(state.x)delete state.x[div]` did), then each key of `set` gets its value (at the end of the
 * map when the entry is new or was just removed, as an assignment after a `delete` put it; the map is created when
 * missing). Only the maps it touches are in the result.
 * @param {string} div
 * @param {Partial<Record<DrawKey,unknown>>} set
 * @param {readonly DrawKey[]} [remove]
 * @returns {DrawLists}
 */
export function ksmDrawWith(div,set,remove=[]){
  /** @type {Record<string,Record<string,unknown>>} */ const out={};
  const now=(/** @type {DrawKey} */ key)=>/** @type {Record<string,unknown>|undefined} */ (out[key]||state[key]);
  for(const key of remove){const map=now(key);if(map&&Object.hasOwn(map,div)){const next={...map};delete next[div];out[key]=next}}
  for(const [key,value] of Object.entries(set))out[key]={...(now(/** @type {DrawKey} */ (key))||{}),[div]:value};
  return /** @type {DrawLists} */ (out);
}
/**
 * `div`'s pools and team pools with each pool `edit` returns (the pool itself: unchanged). The draw can hold one pool
 * object, or one list, in both maps (a team round robin's pools are its team pools until a load copies them): an edit in
 * place showed in both, so the edited pool replaces it in both, and a list both maps share stays one list.
 * @param {string} div
 * @param {(pool:any)=>any} edit
 * @returns {DrawLists}
 */
export function ksmEditedPools(div,edit){
  /** @type {Map<unknown,unknown>} */ const pools=new Map(),lists=new Map();
  const once=(/** @type {unknown} */ p)=>{if(!pools.has(p))pools.set(p,p&&typeof p==='object'?edit(p):p);return pools.get(p)};
  /** @type {DrawLists} */ let out={};
  for(const key of /** @type {const} */ (['pools','teamPools'])){
    const list=state[key]?.[div];if(!Array.isArray(list))continue;
    if(!lists.has(list)){const mapped=list.map(once);lists.set(list,mapped.some((p,i)=>p!==list[i])?mapped:list)}
    const next=lists.get(list);
    if(next!==list)out={...out,...ksmDrawWith(div,{[key]:next})};
  }
  return out;
}
/** Whether `pool` is one of the draw's pools of `div` now (store data), in `pools` or `teamPools`. @param {string} div @param {unknown} pool */
export function ksmDrawHolds(div,pool){return (/** @type {const} */ (['pools','teamPools'])).some(k=>Array.isArray(state[k]?.[div])&&/** @type {unknown[]} */ (state[k][div]).includes(pool))}
/** The managementRevision a structural edit saves: the current one plus one (F10: the rebase compares it). */
export function ksmNextManagementRevision(){return (state.managementRevision||0)+1}
