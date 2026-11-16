// @ts-check
// The people in the store (#15 PR 10, docs/STORE.md section 3 item 10): `competitors`, `teams`, `exhibitions` and
// `teamDivisions` are the `tournament` slice's; `state` reads them through getters (app/modules/app-state.js). Every
// write is one of these helpers, one tournament/… action each. Rows are store data (frozen in the tests): a row is never
// edited in place; its fields change through …Updated.
// How a row is named: by its index in its list, resolved by the caller right before the dispatch from the row the screen
// showed (registration's bound rows, F17 / F20, or the index an inline handler passed), in the same synchronous step,
// so no other write can move the list in between. Players and exhibition matches have no id; teams have one since
// the team divisions (#95), but a 4.0 save's teams get theirs only at the migration, so teams are named by index too.
// Like the old in-place writes, none of them schedules a save or renders: the caller does what it did before.
// A row edited (…Updated, …StatusCycled, a team division edit that changes its teams) is a new object, where the in-place
// write kept the old one. Registration's islands bind each shown row to its row object (F17 / F20) and an edit can
// arrive after another edit of the same row without a redraw in between (a typed field committed by the redraw that a
// status click caused): ksmCurrentPerson() follows a row to the object that replaced it, as identity did.
// The draw holds some rows themselves, not copies: an individual single elimination's entrants (`singleElimComps`, store data since PR 12a) and a
// team bracket's teams (`teamElimTeams`, whose rosters the next rounds' bouts are built from), from generation until the
// next load. An edit of such a row showed there too (the same object), so the row that replaces it takes its place there
// (followDraw()); a list a load or a remote apply gave holds copies, which no edit ever reached, then or now.
import {state} from '../app-state.js';
import {dispatch,tournamentSlice} from '../../store/index.ts';
import {settingsMeta} from '../sync/cloud-session-and-autosave.js';
import {ksmSetDraw} from '../engine/structure-store.js';
/** @typedef {'competitor'|'team'|'exhibition'} PersonKind */
/** @typedef {Record<string,unknown>} PersonRow */
/** The lists of the store's PeopleLists, as the app's types have them (Competitor, Team, Exhibition, TeamDivision). @typedef {{competitors?:object[],teams?:object[],exhibitions?:object[],teamDivisions?:object[]|undefined}} PeopleLists */
/** @typedef {'peopleLoaded'|'teamDivisionAdded'|'teamDivisionUpdated'|'teamDivisionMoved'|'teamDivisionRemoved'} PeopleAction */
const LIST=/** @type {const} */ ({competitor:'competitors',team:'teams',exhibition:'exhibitions'});
/** Each row an edit replaced → the row that replaced it. @type {WeakMap<object,object>} */
const successors=new WeakMap();
/** The row object `row` is now: itself, or the one the edits since made of it (it may since be removed: then not in its list). @template T @param {T} row @returns {T} */
export function ksmCurrentPerson(row){let r=/** @type {any} */ (row);while(r&&typeof r==='object'&&successors.has(r))r=successors.get(r);return r}
/**
 * One action; for an edit, each row of `follow`'s list it replaced (same place, a new object) is noted as replaced.
 * @param {string} type @param {unknown} payload @param {PersonKind} [follow]
 */
function act(type,payload,follow){
  const before=follow&&/** @type {PersonRow[]|undefined} */ (/** @type {unknown} */ (state[LIST[follow]]));
  dispatch(/** @type {any} */ (tournamentSlice.actions)[type](payload,settingsMeta()));
  const after=follow&&/** @type {PersonRow[]|undefined} */ (/** @type {unknown} */ (state[LIST[follow]]));
  if(before&&after&&before!==after&&before.length===after.length){
    /** @type {Map<object,object>} */ const replaced=new Map();
    before.forEach((r,i)=>{if(r&&typeof r==='object'&&after[i]&&after[i]!==r)replaced.set(r,/** @type {object} */ (after[i]))});
    replaced.forEach((to,from)=>successors.set(from,to));
    if(replaced.size)followDraw(replaced);
  }
}
/**
 * The draw's own lists of rows: each row an edit replaced, replaced there too. `singleElimComps` and `teamElimTeams` are
 * store data (#15 PR 12a, 12b): new lists, one tournament/drawEntriesUpdated.
 * @param {Map<object,object>} replaced
 */
function followDraw(replaced){
  /** @type {Record<string,unknown>} */ const lists={};
  for(const key of /** @type {const} */ (['singleElimComps','teamElimTeams'])){ // both store data (PR 12a, 12b)
    /** @type {Record<string,unknown[]>} */ const changed={};
    for(const [div,list] of Object.entries(/** @type {Record<string,unknown>} */ (state[key]||{}))){
      if(Array.isArray(list)&&list.some(r=>r&&replaced.has(r)))changed[div]=list.map(r=>(r&&replaced.get(r))||r);
    }
    if(Object.keys(changed).length)lists[key]={...state[key],...changed};
  }
  ksmSetDraw('drawEntriesUpdated',/** @type {any} */ (lists));
}
/** The row of `kind` at `index` now, or undefined. @param {PersonKind} kind @param {number} index @returns {PersonRow|undefined} */
export function ksmPersonAt(kind,index){return /** @type {PersonRow[]|undefined} */ (/** @type {unknown} */ (state[LIST[kind]]))?.[index]}
/** Rows appended to the list (Add rows, a pasted or imported player, a new team). @param {PersonKind} kind @param {PersonRow[]} rows */
export function ksmAddPeople(kind,rows){if(rows.length)act(`${kind}Added`,{rows})}
/**
 * The row's fields (`changes`), at its index now. Nothing is dispatched when the row is missing or already holds each
 * value (a field the row lacks is added, as an assignment did).
 * @param {PersonKind} kind @param {number} index @param {PersonRow} changes
 */
export function ksmUpdatePerson(kind,index,changes){
  const row=ksmPersonAt(kind,index);
  if(!row||Object.entries(changes).every(([k,v])=>Object.hasOwn(row,k)&&row[k]===v))return;
  act(`${kind}Updated`,{index,changes},kind);
}
/** The row at `index` removed (×). @param {PersonKind} kind @param {number} index */
export function ksmRemovePerson(kind,index){if(ksmPersonAt(kind,index))act(`${kind}Removed`,{index})}
/** The row's status, one step on (KSMEngine.statusCycle(): Registered → Checked → NoShow → Registered). @param {PersonKind} kind @param {number} index */
export function ksmCyclePersonStatus(kind,index){if(ksmPersonAt(kind,index))act(`${kind}StatusCycled`,{index},kind)}
/**
 * Whole lists at once, or a team division edit with the lists it changed (`teamDivisions` and, where its teams change
 * with it, `teams`), computed by the caller from the current lists. A key it does not name keeps its value; `undefined`
 * clears it (the test API's "no team divisions yet").
 * @param {PeopleAction} type @param {PeopleLists} lists
 */
export function ksmSetPeople(type,lists){if(Object.keys(lists).length)act(type,lists,type==='peopleLoaded'?undefined:'team')}
/**
 * Whole lists at once (the samples, Clear, the team-division migration, the test API): tournament/peopleLoaded. Its rows
 * are new rows, never the old ones edited (the old code assigned new objects here too).
 * @param {PeopleLists} lists
 */
export function ksmLoadPeople(lists){ksmSetPeople('peopleLoaded',lists)}
