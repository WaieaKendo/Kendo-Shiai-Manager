// @ts-check
// Every write to `allMatches` (#15 PR 13c-1 and 13c-2, docs/STORE.md section 3 item 13): the bouts of every division, by
// division. Since 13c-2 `allMatches` is the `tournament` slice's (`state.allMatches` is a store getter): each helper call
// on the live `state` is one action (matchActions: court/matchUpdated for a court's own bout, tournament/… for the rest)
// whose payload is one write, the new map at ['tournament', 'allMatches'], applied by applyStoreWrites(). The map is a
// path copy: only the lists and bouts the call changes are new objects (the others are the same objects), so no Immer
// reducer walks a whole list (#15 PR 13b). The callers follow the 13c rules:
//   - a call names its division and the match by its index in the division's list (an index found just before, by
//     KSMEngine.matchIndexIn() / findMatchAgain() when the caller held the match);
//   - a step that writes several fields of one bout writes them in one call (a point: wp, rp, wt, rt; a result: those,
//     completedResult and done): one dispatch per step;
//   - every read after a write uses the match (and the list, and the map) looked up again, never an object read before
//     the call: a write gives the list, the map and every match it changes new objects and leaves the old ones as they
//     were. The helpers that write one match return it as it is after the write, read again from `state`.
// Outside this file app code never assigns, deletes or mutates `allMatches`, a division's list or a match in it
// (tests/store/match-writes.test.mjs checks the sources; in the tests the store's data is deep-frozen, so a write that
// misses these helpers throws; in production it is not frozen and such a write lands in place, docs/STORE.md point 8).
// `root`: the object that holds `allMatches`. `state` (the default) is the live tournament; any other object is a payload
// copy (a load being built, the rebase's server copy), written in place, as before.
// Like the old in-place writes, none of these saves or renders: the caller does what it did before.
// No write when nothing changes (#206 review M1): a list set to one with the same entries, or a sort that keeps the order,
// dispatches nothing, so the read paths that sort or dedupe a division's list on every render (the court queue, Live
// Scores, the TV, findNextForCourt()) never dispatch when the list is already as they want it (a subscriber that renders
// would loop).
import {state} from '../app-state.js';
import {dispatch,matchActions} from '../../store/index.ts';
import {settingsMeta} from '../sync/cloud-session-and-autosave.js';
import * as KSMEngine from '../../engine/index.ts';
/** @typedef {Record<string,any>} MatchSet the fields a write sets on a match */
/** @typedef {{index:number,set?:MatchSet,remove?:readonly string[]}} MatchUpdate */
/** @typedef {{allMatches?:Record<string,Match[]>}} MatchRoot */
/** @typedef {keyof typeof matchActions} MatchActionType */
/** @typedef {(parent:any,key:string|number)=>any} Own `parent[key]` made writable: on the live state a copy put in its place (once per write), on a payload copy the object itself */

/** Whether `root` is the live `state`, whose `allMatches` is the store's (a vm test's own `state` is plain: tests/lib/ksm-source.mjs). @param {unknown} root */
function ksmInStore(root){return root===state}
/** On a payload copy every object is written in place. @type {Own} */
const ksmInPlace=(parent,key)=>parent[key];
/**
 * A copy-on-write `own` for one write on the live state: the first time an object (the map, a list, a bout, a point
 * list) is made writable, a shallow copy takes its place in its (already copied) parent; the old object is left as it
 * was. Primitives and missing values are returned as they are (the caller creates what is missing, as before).
 * @returns {Own}
 */
function ksmCopyOnWrite(){
  const copies=new Set();
  return (parent,key)=>{
    const was=parent[key];
    if(!was||typeof was!=='object'||copies.has(was))return was;
    const copy=Array.isArray(was)?[...was]:{...was};
    copies.add(copy);parent[key]=copy;return copy;
  };
}
/**
 * Runs `write(r, own)`. On a payload copy, `r` is `root` and every write is in place. On the live state, `r` is a working
 * root whose `allMatches` starts as the store's map; `own` copies what the write changes; when the map is a new one at
 * the end (something was written), it is dispatched as one `type` action (`meta.court`: `court`, for a court's own write).
 * Nothing is dispatched when `write` throws.
 * @template T
 * @param {MatchRoot} root
 * @param {MatchActionType} type
 * @param {(r:any,own:Own)=>T} write
 * @param {string|null} [court]
 * @returns {T}
 */
function ksmMatchWrite(root,type,write,court=null){
  if(!ksmInStore(root))return write(root,ksmInPlace);
  const was=state.allMatches,r={allMatches:was};
  const result=write(r,ksmCopyOnWrite());
  if(r.allMatches!==was)dispatch(matchActions[type]({writes:[{path:['tournament','allMatches'],value:r.allMatches}]},{...settingsMeta(),court}));
  return result;
}
/** @param {any} r @param {Own} own @returns {Record<string,Match[]>} the map made writable, created ({}) when missing */
function ksmOwnMap(r,own){
  if(!r.allMatches||typeof r.allMatches!=='object')r.allMatches={};
  return own(r,'allMatches');
}
/** @param {any} r @param {string} div @param {Own} own @returns {Match[]} the division's list made writable, created ([]) when missing, as `arr||[]` + the old assignment did */
function ksmMatchList(r,div,own){
  const map=ksmOwnMap(r,own);
  if(!Array.isArray(map[div]))map[div]=[];
  return own(map,div);
}
/**
 * The whole map (Generate Tournament's reset, the rename's renamed map), assigned as given (`undefined` too, as the old
 * assignment and assignState() did).
 * @param {Record<string,Match[]>|undefined} map
 * @param {MatchRoot} [root]
 */
export function ksmSetAllMatches(map,root=state){
  ksmMatchWrite(root,'allMatchesSet',r=>{r.allMatches=map});
}
/** Whether `list` holds the same entries as `now` (the same objects, in the same order). @param {unknown} now @param {readonly unknown[]} list */
function ksmSameEntries(now,list){
  return Array.isArray(now)&&now.length===list.length&&list.every((m,i)=>m===now[i]);
}
/**
 * A division's list replaced (a draw, a rebuild, a reorder into a new list, a dedupe), stored as given; `undefined` is
 * stored as the old assignment stored it (the regenerate's restore of a division that had none). Nothing is written when
 * the division already holds the same entries in the same order (#206 review M1). The list's own objects are stored as
 * they are: they become store data (frozen in the tests), so the caller never writes them later.
 * @param {string} div
 * @param {Match[]|undefined} list
 * @param {MatchRoot} [root]
 */
export function ksmSetDivisionMatches(div,list,root=state){
  const map=root.allMatches;
  if(map&&typeof map==='object'&&Object.hasOwn(map,div)&&(list===undefined?map[div]===undefined:ksmSameEntries(map[div],list)))return;
  ksmMatchWrite(root,'divisionMatchesSet',(r,own)=>{ksmOwnMap(r,own)[div]=/** @type {Match[]} */(list)});
}
/**
 * A division taken out of the map (`delete`: a regenerate before its new draw, a grand champion's draw cleared).
 * @param {string} div
 * @param {MatchRoot} [root]
 */
export function ksmDeleteDivisionMatches(div,root=state){
  if(!root.allMatches||typeof root.allMatches!=='object'||!Object.hasOwn(root.allMatches,div))return;
  ksmMatchWrite(root,'divisionMatchesSet',(r,own)=>{delete own(r,'allMatches')[div]});
}
/**
 * Writes fields of several bouts of one division in one step (the engine syncs' plan values, a division's courts, a
 * substitution, the result repairs): for each update, `set`'s keys in their order (Object.assign), then `remove`'s
 * keys deleted. An index without a bout throws, as Object.assign on it did (#206 review L4).
 * @param {string} div
 * @param {readonly MatchUpdate[]} updates
 * @param {MatchRoot} [root]
 */
export function ksmUpdateMatches(div,updates,root=state){
  ksmWriteUpdates(div,updates,root,'matchesUpdated',null);
}
/**
 * ksmUpdateMatches()'s write, as one `type` action. Each bout it changes is copied once (the keys keep their order: the
 * copy has them in the same order and Object.assign adds new ones at the end, as on the bout itself).
 * @param {string} div @param {readonly MatchUpdate[]} updates @param {MatchRoot} root @param {MatchActionType} type @param {string|null} court
 */
function ksmWriteUpdates(div,updates,root,type,court){
  // No write when nothing changes (#206 review M1, for fields too since #15 PR 13c-2): an update whose every field already
  // holds the value (a repair or an engine sync that finds the bouts as it wants them, on every load and render) is
  // left out, and none left dispatches nothing. A missing bout counts as a change (the write throws, as before).
  const list=/** @type {any} */(root.allMatches)?.[div];
  updates=updates.filter(u=>ksmUpdateChanges(list?.[u.index],u));
  if(!updates.length)return;
  ksmMatchWrite(root,type,(r,own)=>{
    const list=own(own(r,'allMatches'),div);
    for(const u of updates){
      const m=Object.assign(own(list,u.index),u.set||{});
      for(const key of u.remove||[])delete m[key];
    }
  },court);
}
/** Whether `u` changes `m`: a field it sets that `m` lacks or holds another value in (JSON-equal counts as the same), or a field it removes that `m` has. @param {any} m @param {MatchUpdate} u */
function ksmUpdateChanges(m,u){
  if(!m||typeof m!=='object')return true;
  const same=(/** @type {unknown} */ a,/** @type {unknown} */ b)=>a===b||(a!==null&&b!==null&&typeof a==='object'&&typeof b==='object'&&JSON.stringify(a)===JSON.stringify(b));
  return Object.entries(u.set||{}).some(([k,v])=>!Object.hasOwn(m,k)||!same(m[k],v))||(u.remove||[]).some(k=>Object.hasOwn(m,k));
}
/**
 * Writes fields of one bout (a point, a result, a representative): `set`'s keys in their order, then `remove`'s
 * deleted. Returns the bout as it is after the write, read again from `root`. An index without a bout throws.
 * @param {string} div
 * @param {number} index
 * @param {MatchSet} set
 * @param {readonly string[]} [remove]
 * @param {MatchRoot} [root]
 * @returns {Match}
 */
export function ksmUpdateMatch(div,index,set,remove=[],root=state){
  ksmWriteUpdates(div,[{index,set,remove}],root,'matchUpdated',ksmInStore(root)?state.currentCourt||null:null);
  return /** @type {any} */(root.allMatches)[div][index];
}
/**
 * New bouts put into a division's list at `at` (a tiebreak, a playoff, kachinuki's next bout, a missing template bout;
 * `at` past the end appends), in their order. The list is created when the division has none.
 * @param {string} div
 * @param {number} at
 * @param {readonly Match[]} matches
 * @param {MatchRoot} [root]
 */
export function ksmInsertMatches(div,at,matches,root=state){
  if(!matches.length)return;
  ksmMatchWrite(root,'matchesAdded',(r,own)=>{ksmMatchList(r,div,own).splice(at,0,...matches)});
}
/**
 * New bouts added at the end of a division's list (`arr.push(...)`), the list created when the division has none.
 * @param {string} div
 * @param {readonly Match[]} matches
 * @param {MatchRoot} [root]
 */
export function ksmAppendMatches(div,matches,root=state){
  if(!matches.length)return;
  ksmMatchWrite(root,'matchesAdded',(r,own)=>{ksmMatchList(r,div,own).push(...matches)});
}
/**
 * `count` bouts taken out of a division's list at `at`.
 * @param {string} div
 * @param {number} at
 * @param {number} [count]
 * @param {MatchRoot} [root]
 */
export function ksmRemoveMatches(div,at,count=1,root=state){
  ksmMatchWrite(root,'matchesRemoved',(r,own)=>{if(Array.isArray(r.allMatches?.[div]))own(own(r,'allMatches'),div).splice(at,count)});
}
/**
 * A division's list sorted by `compare` (Array.prototype.sort: stable), as the old `arr.sort(...)` on the live
 * list did; returns the list as it is after, read again. Nothing is written when the order would not change (#206 review
 * M1). A division without a list is left as it is ([] returned).
 * @param {string} div
 * @param {(a:Match,b:Match)=>number} compare
 * @param {MatchRoot} [root]
 * @returns {Match[]}
 */
export function ksmSortDivisionMatches(div,compare,root=state){
  const list=root.allMatches?.[div];
  if(!Array.isArray(list))return [];
  const sorted=[...list].sort(compare);
  if(ksmSameEntries(list,sorted))return list;
  // The order the sort gave (computed on the list as it is, so a comparator that reads the list reads it as before).
  ksmMatchWrite(root,'matchesSorted',(r,own)=>{const target=own(own(r,'allMatches'),div);target.splice(0,target.length,...sorted)});
  return root.allMatches?.[div]||[];
}
/**
 * One path write under `allMatches` (`path[0]` is 'allMatches'), with one of two rules, as the two path walkers it
 * replaces. `value` is stored as given (the caller clones it); `missing` removes the entry (an array entry is spliced out).
 *   - 'history' (applyHistoryPatch()'s writeHistoryValue()): a missing parent is created ([] before a number key, else
 *     {}); an array index at or past the end inserts there (splice). Returns true.
 *   - 'replay' (the rebase's applyPatchToStateObject()): an array on the way must hold the index (never a sparse
 *     list); a missing object parent is created; an array index past the end is refused, at the end appends. Returns
 *     whether it wrote.
 * @param {readonly (string|number)[]} path
 * @param {unknown} value
 * @param {boolean} missing
 * @param {'history'|'replay'} how
 * @param {MatchRoot} [root]
 * @returns {boolean}
 */
export function ksmWriteMatchPath(path,value,missing,how,root=state){
  if(path[0]!=='allMatches')throw new Error('ksmWriteMatchPath: not an allMatches path: '+JSON.stringify(path));
  return ksmMatchWrite(root,'matchesPatched',(r,own)=>ksmWalkMatchPath(r,path,()=>value,missing,how,own));
}
/**
 * ksmWriteMatchPath()'s walk on `r` (inside a write), each object on the way made writable by `own`. `make()` gives the
 * value, called only when it is written (a write that is refused never builds it: #206 re-review L-c).
 * @param {any} r @param {readonly (string|number)[]} path @param {()=>unknown} make @param {boolean} missing
 * @param {'history'|'replay'} how @param {Own} own @returns {boolean}
 */
function ksmWalkMatchPath(r,path,make,missing,how,own){
  let target=r;
  for(let i=0;i<path.length-1;i++){
    const key=path[i],next=path[i+1];
    if(how==='replay'&&Array.isArray(target)&&typeof key==='number'){
      if(key<0||key>=target.length)return false;
      if(target[key]===undefined||target[key]===null)return false;
    }else if(target[key]===undefined||target[key]===null)target[key]=typeof next==='number'?[]:{};
    target=own(target,key);
    if(how==='replay'&&(target===undefined||target===null))return false;
  }
  const key=path[path.length-1];
  if(Array.isArray(target)&&typeof key==='number'){
    if(how==='replay'){
      if(key<0)return false;
      if(missing){if(key<target.length){target.splice(key,1);return true}return false}
      if(key>target.length)return false;
      if(key===target.length)target.push(make());else target[key]=make();
      return true;
    }
    if(missing){if(key>=0&&key<target.length)target.splice(key,1)}
    else if(key>=target.length)target.splice(key,0,make());
    else target[key]=make();
    return true;
  }
  if(missing)delete target[key];else target[key]=make();
  return true;
}
/** The index of the bout of `list` with one of `ids` (the first id found wins), else -1. @param {readonly unknown[]} list @param {readonly (string|null|undefined)[]} ids */
function ksmIndexByIdentity(list,ids){
  for(const id of ids){if(!id)continue;const i=list.findIndex(m=>KSMEngine.matchHasSyncIdentity(m,id));if(i>=0)return i}
  return -1;
}
/**
 * Several writes in one step, in order (#206 review M2): an Undo/Redo entry's `allMatches` patches and match ops, a
 * rebase's match ops. Each write sees the earlier ones (a bout found by identity is looked up in the list as the writes
 * before it left it), and the whole batch is one write (one dispatch: a working copy of the touched lists, then
 * their new values). A write is one of:
 *   - {path, value, missing, how, clone}: ksmWriteMatchPath()'s write at a fixed path (`clone`: the value is copied as
 *     JSON when it is written, as the two walkers did, so a write that is never made never copies);
 *   - {division, ids, rest, value, missing, how}: the same at ['allMatches', division, i, ...rest], `i` the bout with the
 *     first of `ids` found (not written when none is);
 *   - {remove: division, id}: the bout with identity `id` taken out (none when it is gone);
 *   - {insert: division, after, match}: `match` put after the bout `after` (at the end when that is gone; first when
 *     `after` is null), unless a bout with its identity is already there; nothing when the division has no list.
 * Returns, per write, {applied, path} (`path`: where a path write went; `applied`: whether it wrote).
 * @param {readonly any[]} writes
 * @param {MatchRoot} [root]
 * @returns {{applied:boolean,path?:(string|number)[]}[]}
 */
export function ksmWriteMatchPaths(writes,root=state){
  if(!writes.length)return [];
  return ksmMatchWrite(root,'matchesPatched',(r,own)=>ksmApplyMatchPaths(r,own,writes));
}
/**
 * An Undo/Redo's batch (app/modules/court/court-scoring-and-history.js, #15 PR 13c-2): ksmWriteMatchPaths()'s writes on
 * the live state, not dispatched. Returns the per-write results and the map as the writes leave it (the store's own map
 * when nothing changed; else a path copy, the store's objects untouched), which the caller reads while it finishes the
 * entry and puts in the entry's one court/undo or court/redo.
 * @param {readonly any[]} writes
 * @returns {{results:{applied:boolean,path?:(string|number)[]}[],allMatches:Record<string,Match[]>|undefined}}
 */
export function ksmPlanMatchPaths(writes){
  // (A vm test's plain `state` is written in place, as before.)
  const inStore=ksmInStore(state),r=inStore?{allMatches:state.allMatches}:state;
  const results=writes.length?ksmApplyMatchPaths(r,inStore?ksmCopyOnWrite():ksmInPlace,writes):[];
  return {results,allMatches:r.allMatches};
}
/** ksmWriteMatchPaths()'s writes on `r`, in order. @param {any} r @param {Own} own @param {readonly any[]} writes */
function ksmApplyMatchPaths(r,own,writes){
  return writes.map(w=>{
    if(w.remove!==undefined){
      const list=r.allMatches?.[w.remove];if(!Array.isArray(list))return {applied:false};
      const i=ksmIndexByIdentity(list,[w.id]);if(i>=0)own(own(r,'allMatches'),w.remove).splice(i,1);
      return {applied:i>=0};
    }
    if(w.insert!==undefined){
      const list=r.allMatches?.[w.insert];if(!Array.isArray(list))return {applied:false};
      if(ksmIndexByIdentity(list,[KSMEngine.matchSyncIdentity(w.match)])>=0)return {applied:false};
      const anchor=w.after?ksmIndexByIdentity(list,[w.after]):-1;
      own(own(r,'allMatches'),w.insert).splice(w.after?(anchor>=0?anchor+1:list.length):0,0,w.match);
      return {applied:true};
    }
    let path=w.path;
    if(!path){
      const list=r.allMatches?.[w.division];
      const i=Array.isArray(list)?ksmIndexByIdentity(list,w.ids):-1;
      if(i<0)return {applied:false};
      path=['allMatches',w.division,i,...(w.rest||[])];
    }
    if(path[0]!=='allMatches')throw new Error('ksmWriteMatchPaths: not an allMatches path: '+JSON.stringify(path));
    const missing=Boolean(w.missing),make=w.clone?()=>JSON.parse(JSON.stringify(w.value)):()=>w.value;
    return {applied:ksmWalkMatchPath(r,path,make,missing,w.how,own),path};
  });
}
