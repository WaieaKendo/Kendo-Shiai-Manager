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
import {state} from '../app-state.js';
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
 * The whole map (Generate Tournament's reset; an Undo/Redo patch on `allMatches` itself). `undefined` removes the key.
 * @param {Record<string,Match[]>|undefined} map
 * @param {MatchRoot} [root]
 */
export function ksmSetAllMatches(map,root=state){
  ksmMatchWrite(root,r=>{if(map===undefined)delete r.allMatches;else r.allMatches=map});
}
/**
 * A division's list replaced (a draw, a rebuild, a reorder into a new list, a dedupe). `undefined` removes the division.
 * The list's own objects are stored as they are (in 13c-2 they become store data: the caller never writes them later).
 * @param {string} div
 * @param {Match[]|undefined} list
 * @param {MatchRoot} [root]
 */
export function ksmSetDivisionMatches(div,list,root=state){
  ksmMatchWrite(root,r=>{
    if(list===undefined){if(r.allMatches&&typeof r.allMatches==='object')delete r.allMatches[div];return}
    if(!r.allMatches||typeof r.allMatches!=='object')r.allMatches={};
    r.allMatches[div]=list;
  });
}
/**
 * Writes fields of several bouts of one division in one step (the engine syncs' plan values, a division's courts, a
 * substitution, the result repairs): for each update, `set`'s keys in their order (Object.assign), then `remove`'s
 * keys deleted. An index outside the list is skipped.
 * @param {string} div
 * @param {readonly MatchUpdate[]} updates
 * @param {MatchRoot} [root]
 */
export function ksmUpdateMatches(div,updates,root=state){
  if(!updates.length)return;
  ksmMatchWrite(root,r=>{
    const list=r.allMatches?.[div];if(!Array.isArray(list))return;
    for(const u of updates){
      const m=list[u.index];if(!m||typeof m!=='object')continue;
      if(u.set)Object.assign(m,u.set);
      for(const key of u.remove||[])delete m[key];
    }
  });
}
/**
 * Writes fields of one bout (a point, a result, a representative): `set`'s keys in their order, then `remove`'s
 * deleted. Returns the bout as it is after the write, read again from `root` (null when the index holds none).
 * @param {string} div
 * @param {number} index
 * @param {MatchSet} set
 * @param {readonly string[]} [remove]
 * @param {MatchRoot} [root]
 * @returns {Match|null}
 */
export function ksmUpdateMatch(div,index,set,remove=[],root=state){
  ksmUpdateMatches(div,[{index,set,remove}],root);
  return root.allMatches?.[div]?.[index]||null;
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
 * `count` bouts taken out of a division's list at `at` (the rebase's and an Undo's removed bouts).
 * @param {string} div
 * @param {number} at
 * @param {number} [count]
 * @param {MatchRoot} [root]
 */
export function ksmRemoveMatches(div,at,count=1,root=state){
  ksmMatchWrite(root,r=>{const list=r.allMatches?.[div];if(Array.isArray(list))list.splice(at,count)});
}
/**
 * A division's list sorted in place by `compare` (Array.prototype.sort: stable), as the old `arr.sort(...)` on the live
 * list did; returns the list as it is after, read again. A division without a list is left as it is ([] returned).
 * @param {string} div
 * @param {(a:Match,b:Match)=>number} compare
 * @param {MatchRoot} [root]
 * @returns {Match[]}
 */
export function ksmSortDivisionMatches(div,compare,root=state){
  ksmMatchWrite(root,r=>{const list=r.allMatches?.[div];if(Array.isArray(list))list.sort(compare)});
  return root.allMatches?.[div]||[];
}
/**
 * One path write under `allMatches` (`path[0]` is 'allMatches'): an Undo/Redo's patch-v1 patch, a match-op patch.
 * `value` is stored as given (the caller clones it); `missing` removes the entry (an array entry is spliced out). Two
 * rules, as the two path walkers they replace:
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
  return ksmMatchWrite(root,r=>{
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
  });
}
