// @ts-check
// Every write to `allMatches` (#15 PR 13c-1, docs/STORE.md section 3 item 13): the bouts of every division, by division.
// `allMatches` is still a plain field of `state` here and these helpers write it in place, as the code they replace did,
// so this PR changes no behaviour. PR 13c-2 moves `allMatches` into the `tournament` slice by changing only these
// bodies (each becomes one court/… or tournament/… action whose payload is `{path, value}` writes, applied by
// applyStoreWrites(): a path copy, never an Immer reducer that walks a whole list, #15 PR 13b). So the callers follow the
// 13c rules now:
//   - a call names its division and the match by its index in the division's list (an index found just before, by
//     KSMEngine.matchIndexIn() / findMatchAgain() when the caller held the match);
//   - a step that writes several fields of one bout writes them in one call (a point: wp, rp, wt, rt; a result: those,
//     completedResult and done), so 13c-2 dispatches once per step;
//   - every read after a write uses the match (and the list, and the map) looked up again, never an object read before
//     the call: the helpers that write one match return it as it is after the write, read again from `state`. In 13c-2
//     a write gives the list, the map and every match it changes new objects and leaves the old ones as they were.
// Outside this file app code never assigns, deletes or mutates `allMatches`, a division's list or a match in it
// (tests/store/match-writes.test.mjs checks the sources; tests/match-identity-copy-test.py and
// tests/match-writes-store-test.py run the app with every match, list and the map frozen between these calls).
// `root`: the object that holds `allMatches`. `state` (the default) is the live tournament; any other object is a payload
// copy (a load being built, the rebase's server copy), written in place without the test hooks, also in 13c-2.
// Like the old in-place writes, none of these saves, renders or notifies: the caller does what it did before.
// No write when nothing changes (#206 review M1): a list set to one with the same entries, or a sort that keeps the order,
// writes nothing (no hook here, no dispatch in 13c-2), so the read paths that sort or dedupe a division's list on every
// render (the court queue, Live Scores, the TV, findNextForCourt()) never write when the list is already as they want it.
import {state} from '../app-state.js';
import * as KSMEngine from '../../engine/index.ts';
/** @typedef {Record<string,any>} MatchSet the fields a write sets on a match */
/** @typedef {{index:number,set?:MatchSet,remove?:readonly string[]}} MatchUpdate */
/** @typedef {{allMatches?:Record<string,Match[]>}} MatchRoot */

/**
 * Runs `write` on `root`; on the live `state`, between the two test-only hooks (`globalThis.KSMTestMatchWrite`, unset in
 * the app: tests/lib/match-freeze-hook.js thaws the matches before and copies and freezes them after, as 13c-2's dispatch
 * will leave them).
 * @template T
 * @param {MatchRoot} root
 * @param {(root:any)=>T} write
 * @returns {T}
 */
function ksmMatchWrite(root,write){
  // (The hook is looked up first: a vm test that runs these functions on its own object has no `state`.)
  const hook=/** @type {any} */(globalThis).KSMTestMatchWrite&&root===state?/** @type {any} */(globalThis).KSMTestMatchWrite:null;
  if(hook)hook('before');
  try{return write(root)}finally{if(hook)hook('after')}
}
/** @param {any} root @param {string} div @returns {Match[]} the division's list, created ([]) when missing, as `arr||[]` + the old assignment did */
function ksmMatchList(root,div){
  if(!root.allMatches||typeof root.allMatches!=='object')root.allMatches={};
  if(!Array.isArray(root.allMatches[div]))root.allMatches[div]=[];
  return root.allMatches[div];
}
/**
 * The whole map (Generate Tournament's reset, the rename's renamed map), assigned as given (`undefined` too, as the old
 * assignment and assignState() did).
 * @param {Record<string,Match[]>|undefined} map
 * @param {MatchRoot} [root]
 */
export function ksmSetAllMatches(map,root=state){
  ksmMatchWrite(root,r=>{r.allMatches=map});
}
/** Whether `list` holds the same entries as `now` (the same objects, in the same order). @param {unknown} now @param {readonly unknown[]} list */
function ksmSameEntries(now,list){
  return Array.isArray(now)&&now.length===list.length&&list.every((m,i)=>m===now[i]);
}
/**
 * A division's list replaced (a draw, a rebuild, a reorder into a new list, a dedupe), stored as given; `undefined` is
 * stored as the old assignment stored it (the regenerate's restore of a division that had none). Nothing is written when
 * the division already holds the same entries in the same order (#206 review M1). The list's own objects are stored as
 * they are (in 13c-2 they become store data: the caller never writes them later).
 * @param {string} div
 * @param {Match[]|undefined} list
 * @param {MatchRoot} [root]
 */
export function ksmSetDivisionMatches(div,list,root=state){
  const map=root.allMatches;
  if(map&&typeof map==='object'&&Object.hasOwn(map,div)&&(list===undefined?map[div]===undefined:ksmSameEntries(map[div],list)))return;
  ksmMatchWrite(root,r=>{
    if(!r.allMatches||typeof r.allMatches!=='object')r.allMatches={};
    r.allMatches[div]=list;
  });
}
/**
 * A division taken out of the map (`delete`: a regenerate before its new draw, a grand champion's draw cleared).
 * @param {string} div
 * @param {MatchRoot} [root]
 */
export function ksmDeleteDivisionMatches(div,root=state){
  if(!root.allMatches||typeof root.allMatches!=='object'||!Object.hasOwn(root.allMatches,div))return;
  ksmMatchWrite(root,r=>{delete r.allMatches[div]});
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
  if(!updates.length)return;
  ksmMatchWrite(root,r=>{
    const list=/** @type {any} */(r.allMatches)[div];
    for(const u of updates){
      const m=Object.assign(list[u.index],u.set||{});
      for(const key of u.remove||[])delete m[key];
    }
  });
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
  ksmUpdateMatches(div,[{index,set,remove}],root);
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
  ksmMatchWrite(root,r=>{ksmMatchList(r,div).splice(at,0,...matches)});
}
/**
 * New bouts added at the end of a division's list (`arr.push(...)`), the list created when the division has none.
 * @param {string} div
 * @param {readonly Match[]} matches
 * @param {MatchRoot} [root]
 */
export function ksmAppendMatches(div,matches,root=state){
  if(!matches.length)return;
  ksmMatchWrite(root,r=>{ksmMatchList(r,div).push(...matches)});
}
/**
 * `count` bouts taken out of a division's list at `at`.
 * @param {string} div
 * @param {number} at
 * @param {number} [count]
 * @param {MatchRoot} [root]
 */
export function ksmRemoveMatches(div,at,count=1,root=state){
  ksmMatchWrite(root,r=>{const list=r.allMatches?.[div];if(Array.isArray(list))list.splice(at,count)});
}
/**
 * A division's list sorted by `compare` (Array.prototype.sort: stable), in place as the old `arr.sort(...)` on the live
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
  if(ksmSameEntries(list,[...list].sort(compare)))return list;
  ksmMatchWrite(root,r=>{/** @type {Match[]} */(r.allMatches?.[div]).sort(compare)});
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
  return ksmMatchWrite(root,r=>ksmWalkMatchPath(r,path,value,missing,how));
}
/** ksmWriteMatchPath()'s walk on `r` (inside a write). @returns {boolean} */
function ksmWalkMatchPath(r,path,value,missing,how){
  let target=r;
  for(let i=0;i<path.length-1;i++){
    const key=path[i],next=path[i+1];
    if(how==='replay'&&Array.isArray(target)&&typeof key==='number'){
      if(key<0||key>=target.length)return false;
      if(target[key]===undefined||target[key]===null)return false;
    }else if(target[key]===undefined||target[key]===null)target[key]=typeof next==='number'?[]:{};
    target=target[key];
    if(how==='replay'&&(target===undefined||target===null))return false;
  }
  const key=path[path.length-1];
  if(Array.isArray(target)&&typeof key==='number'){
    if(how==='replay'){
      if(key<0)return false;
      if(missing){if(key<target.length){target.splice(key,1);return true}return false}
      if(key>target.length)return false;
      if(key===target.length)target.push(value);else target[key]=value;
      return true;
    }
    if(missing){if(key>=0&&key<target.length)target.splice(key,1)}
    else if(key>=target.length)target.splice(key,0,value);
    else target[key]=value;
    return true;
  }
  if(missing)delete target[key];else target[key]=value;
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
 * before it left it), and the whole batch is one write (one dispatch in 13c-2: a working copy of the touched lists, then
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
  return ksmMatchWrite(root,r=>writes.map(w=>{
    if(w.remove!==undefined){
      const list=r.allMatches?.[w.remove];if(!Array.isArray(list))return {applied:false};
      const i=ksmIndexByIdentity(list,[w.id]);if(i>=0)list.splice(i,1);
      return {applied:i>=0};
    }
    if(w.insert!==undefined){
      const list=r.allMatches?.[w.insert];if(!Array.isArray(list))return {applied:false};
      if(ksmIndexByIdentity(list,[KSMEngine.matchSyncIdentity(w.match)])>=0)return {applied:false};
      const anchor=w.after?ksmIndexByIdentity(list,[w.after]):-1;
      list.splice(w.after?(anchor>=0?anchor+1:list.length):0,0,w.match);
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
    const missing=Boolean(w.missing),value=w.clone&&!missing?JSON.parse(JSON.stringify(w.value)):w.value;
    return {applied:ksmWalkMatchPath(r,path,value,missing,w.how),path};
  }));
}
