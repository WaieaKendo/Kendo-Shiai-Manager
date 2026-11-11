// @ts-check
// The tournament state object (never reassigned) and the division presets its initial value is built from.
// Moved out of the classic script in step 3d of #136; app/main.js and app/modules import both from here.
// #15 step 2.8 moves its fields into the Redux Toolkit store (app/store) one group at a time: see docs/STORE.md.
// Each key of `state` is either a plain property or, once its group has moved, a store getter (moveToStore()); every
// write that replaces or assigns several keys at once goes through replaceState() / assignState() (STORE.md section 2).
import {dispatch,getState,legacyFieldAssigned,legacyStateAssigned,legacyStateReplaced,storeIsStrict} from '../store/index.ts';
/** @type {[string, string, CourtMode][]} */
export const DIVISION_PRESETS=[['Yonenbu (11 years and under)','Round Robin','A'],['Shonenbu (12–14 years old)','Round Robin','A'],['Seinenbu (15+ years without dan)','Round Robin','A'],['Women’s Open','Round Robin','B'],['Yudansha 1–3 Dan','Round Robin','A'],['Yudansha 4 Dan+','Round Robin','B'],['Masters Open (50+ years old)','Round Robin','B']];
/** @type {TournamentState} */
export const state={brackets:{},championshipNodes:{},teamBracketState:{},teamBracketNodes:{},singleElimNodes:{},divisions:DIVISION_PRESETS.map(x=>x[0]),divisionTypes:{},divisionCourts:{},competitors:[],teams:[],exhibitions:[],awards:[],pools:{},teamPools:{},allMatches:{},currentByDivision:{},courtState:{A:{division:null,index:0},B:{division:null,index:0}},matches:[],current:0,score:{W:[],R:[],WT:0,RT:0},history:[],currentDivision:'Women’s Open',poolViewDivision:'Women’s Open',currentCourt:'A',publicCourt:'A',courtActiveDivision:{A:null,B:null},regMode:'individual',contextMode:'pool',teamAwardMode:'top2',generated:false,teamElimTeams:{},managementRevision:0,courtActionHistory:{A:[],B:[]},courtRedoHistory:{A:[],B:[]}};
DIVISION_PRESETS.forEach(([d,f,c])=>{state.divisionTypes[d]=f;state.divisionCourts[d]=c});state.divisionCourts['Team Tournament']='Both';

/** @typedef {{field:string,path:string,stack:string}} StrayStoreWrite */
// For each object (the app's `state`, or a test's own), the keys moveToStore() made store getters -> their store path.
/** @type {WeakMap<object,Map<string,string[]>>} */
const storeFieldsByTarget=new WeakMap();
/** @param {object} target */
function storeFieldsOf(target){let fields=storeFieldsByTarget.get(target);if(!fields){fields=new Map();storeFieldsByTarget.set(target,fields)}return fields}
/** The store path of a key moveToStore() moved (e.g. ['device','regMode']), or null for a plain property. */
export function storeFieldPath(key,target=state){const path=storeFieldsOf(target).get(key);return path?[...path]:null}
/** @type {(write:StrayStoreWrite)=>void} */
let reportStrayStoreWrite=write=>console.warn('[KSM Store] A store field was assigned outside an action',write);
/** Where production logs a stray assignment (app/main.js: the cloud diagnostics). */
export function setStrayStoreWriteReporter(/** @type {(write:StrayStoreWrite)=>void} */ report){reportStrayStoreWrite=report}
/**
 * Makes `state[key]` an enumerable, non-configurable getter over the store at `path` (docs/STORE.md section 2, point 1),
 * so JSON.stringify(state) and Object.keys(state) still see it. The slice's initial state holds the value from then on.
 * An assignment the conversion missed (point 8): strict (tests) throws; production logs it (setStrayStoreWriteReporter)
 * and dispatches legacy/fieldAssigned, which puts the value at `path`. Unused until the first field group moves (PR 5).
 * @param {string} key
 * @param {string[]} path
 * @param {object} [target] the app's `state`; tests pass their own object
 */
export function moveToStore(key,path,target=state){
  if(!Array.isArray(path)||!path.length||!path.every(p=>typeof p==='string'&&p))throw new Error(`moveToStore(${key}): the store path must be a list of keys`);
  if(storeFieldsOf(target).has(key))throw new Error(`state.${key} is already in the store`);
  const at=[...path];
  const read=()=>{/** @type {any} */ let value=getState();for(const p of at)value=value==null?undefined:value[p];return value};
  Object.defineProperty(target,key,{enumerable:true,configurable:false,get:read,set(value){
    if(storeIsStrict())throw new TypeError(`state.${key} is in the store (${at.join('.')}): dispatch an action instead of assigning it`);
    reportStrayStoreWrite({field:key,path:at.join('.'),stack:String(new Error().stack||'').split('\n').slice(1,7).join('\n')});
    dispatch(legacyFieldAssigned({key,path:[...at],value}));
  }});
  storeFieldsOf(target).set(key,at);
}
/**
 * Replaces all of `state` with `loaded`'s keys (a load, a remote apply, the tournament switch): plain keys are deleted
 * and assigned in `loaded`'s order, as `Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,loaded)` did;
 * store-owned keys (absent ones as undefined) go to the store in one legacy/stateReplaced action.
 * @param {object} loaded
 * @param {object} [target]
 */
export function replaceState(loaded,target=state){
  const fields=storeFieldsOf(target),writes=[];
  const t=/** @type {Record<string,unknown>} */ (target);
  for(const key of Object.keys(t))if(!fields.has(key))delete t[key];
  for(const [key,value] of Object.entries(loaded)){const path=fields.get(key);if(path)writes.push({path:[...path],value});else t[key]=value}
  for(const [key,path] of fields)if(!Object.hasOwn(loaded,key))writes.push({path:[...path],value:undefined});
  if(writes.length)dispatch(legacyStateReplaced({writes}));
}
/**
 * Assigns `partial`'s keys to `state` (a division rename, the team-division migration), as Object.assign(state,partial)
 * did; store-owned keys go to the store in one legacy/stateAssigned action.
 * @param {object} partial
 * @param {object} [target]
 */
export function assignState(partial,target=state){
  const fields=storeFieldsOf(target),writes=[];
  const t=/** @type {Record<string,unknown>} */ (target);
  for(const [key,value] of Object.entries(partial)){const path=fields.get(key);if(path)writes.push({path:[...path],value});else t[key]=value}
  if(writes.length)dispatch(legacyStateAssigned({writes}));
}
