// @ts-check
// The tournament state object (never reassigned) and the division presets its initial value is built from.
// Moved out of the classic script in step 3d of #136; app/main.js and app/modules import both from here.
// #15 step 2.8 moves its fields into the Redux Toolkit store (app/store) one group at a time: see docs/STORE.md.
// Each key of `state` is either a plain property or, once its group has moved, a store getter (moveToStore()); every
// write that replaces or assigns several keys at once goes through replaceState() / assignState() (STORE.md section 2).
import {deviceSlice,dispatch,getState,legacyFieldAssigned,legacyStateAssigned,legacyStateReplaced,storeIsStrict} from '../store/index.ts';
/** @typedef {string[]|(()=>string[])} StorePath a store path, or (for state.score) one that depends on this device's court */
/** @type {[string, string, CourtMode][]} */
export const DIVISION_PRESETS=[['Yonenbu (11 years and under)','Round Robin','A'],['Shonenbu (12–14 years old)','Round Robin','A'],['Seinenbu (15+ years without dan)','Round Robin','A'],['Women’s Open','Round Robin','B'],['Yudansha 1–3 Dan','Round Robin','A'],['Yudansha 4 Dan+','Round Robin','B'],['Masters Open (50+ years old)','Round Robin','B']];
/** @type {TournamentState} */
export const state={brackets:{},championshipNodes:{},teamBracketState:{},teamBracketNodes:{},singleElimNodes:{},divisions:DIVISION_PRESETS.map(x=>x[0]),divisionTypes:{},divisionCourts:{},competitors:[],teams:[],exhibitions:[],awards:[],pools:{},teamPools:{},allMatches:{},currentByDivision:{},courtState:{A:{division:null,index:0},B:{division:null,index:0}},matches:[],current:0,score:{W:[],R:[],WT:0,RT:0},history:[],currentDivision:'Women’s Open',poolViewDivision:'Women’s Open',currentCourt:'A',publicCourt:'A',courtActiveDivision:{A:null,B:null},regMode:'individual',contextMode:'pool',teamAwardMode:'top2',generated:false,teamElimTeams:{},managementRevision:0,courtActionHistory:{A:[],B:[]},courtRedoHistory:{A:[],B:[]}};
DIVISION_PRESETS.forEach(([d,f,c])=>{state.divisionTypes[d]=f;state.divisionCourts[d]=c});state.divisionCourts['Team Tournament']='Both';

/** @typedef {{field:string,path:string,stack:string}} StrayStoreWrite */
// For each object (the app's `state`, or a test's own), the keys moveToStore() made store getters -> their store path.
/** @type {WeakMap<object,Map<string,StorePath>>} */
const storeFieldsByTarget=new WeakMap();
/** @param {object} target */
function storeFieldsOf(target){let fields=storeFieldsByTarget.get(target);if(!fields){fields=new Map();storeFieldsByTarget.set(target,fields)}return fields}
// For each object, the keys deriveInState() made read-only getters computed from other fields (state.matches).
/** @type {WeakMap<object,Set<string>>} */
const derivedFieldsByTarget=new WeakMap();
/** @param {object} target */
function derivedFieldsOf(target){let keys=derivedFieldsByTarget.get(target);if(!keys){keys=new Set();derivedFieldsByTarget.set(target,keys)}return keys}
/** @param {StorePath} path @returns {string[]} the path as it is now (a court-dependent path is resolved) */
function resolvePath(path){return typeof path==='function'?[...path()]:[...path]}
/** The store path of a key moveToStore() moved (e.g. ['device','regMode']), or null for a plain property or a derived one. */
export function storeFieldPath(key,target=state){const path=storeFieldsOf(target).get(key);return path?resolvePath(path):null}
/** Whether `state[key]` is a read-only getter derived from other fields (deriveInState(): state.matches). */
export function stateFieldIsDerived(key,target=state){return derivedFieldsOf(target).has(key)}
/** @type {(write:StrayStoreWrite)=>void} */
let reportStrayStoreWrite=write=>console.warn('[KSM Store] A store field was assigned outside an action',write);
/** Where production logs a stray assignment (app/main.js: the cloud diagnostics). */
export function setStrayStoreWriteReporter(/** @type {(write:StrayStoreWrite)=>void} */ report){reportStrayStoreWrite=report}
const strayStack=()=>String(new Error().stack||'').split('\n').slice(2,8).join('\n');
/**
 * Makes `state[key]` an enumerable, non-configurable getter over the store at `path` (docs/STORE.md section 2, point 1),
 * so JSON.stringify(state) and Object.keys(state) still see it. The slice's initial state holds the value from then on.
 * An assignment the conversion missed (point 8): strict (tests) throws; production logs it (setStrayStoreWriteReporter)
 * and dispatches legacy/fieldAssigned, which puts the value at `path`. `path` may be a function (state.score: the pad of
 * this device's court), resolved on every read and write.
 * @param {string} key
 * @param {StorePath} path
 * @param {object} [target] the app's `state`; tests pass their own object
 */
export function moveToStore(key,path,target=state){
  const valid=/** @param {unknown} p */ p=>Array.isArray(p)&&p.length>0&&p.every(k=>typeof k==='string'&&k);
  if(typeof path!=='function'&&!valid(path))throw new Error(`moveToStore(${key}): the store path must be a list of keys`);
  if(storeFieldsOf(target).has(key)||derivedFieldsOf(target).has(key))throw new Error(`state.${key} is already in the store`);
  const at=typeof path==='function'?path:[...path];
  const now=()=>{const p=resolvePath(at);if(!valid(p))throw new Error(`moveToStore(${key}): the store path must be a list of keys`);return p};
  const read=()=>{/** @type {any} */ let value=getState();for(const p of now())value=value==null?undefined:value[p];return value};
  Object.defineProperty(target,key,{enumerable:true,configurable:false,get:read,set(value){
    const p=now();
    if(storeIsStrict())throw new TypeError(`state.${key} is in the store (${p.join('.')}): dispatch an action instead of assigning it`);
    reportStrayStoreWrite({field:key,path:p.join('.'),stack:strayStack()});
    dispatch(legacyFieldAssigned({key,path:p,value}));
  }});
  storeFieldsOf(target).set(key,at);
}
/**
 * Makes `state[key]` an enumerable, non-configurable, read-only getter computed by `derive` (docs/STORE.md section 3,
 * PR 7: state.matches). Enumerable, so the snapshot still carries its value. It has no store path of its own: a load,
 * a remote apply and assignState() ignore a value for it, and so does an assignment the conversion missed (strict:
 * throws; production: logged, then ignored, since the fields it is derived from already say what it is).
 * @param {string} key
 * @param {()=>unknown} derive
 * @param {object} [target]
 */
export function deriveInState(key,derive,target=state){
  if(storeFieldsOf(target).has(key)||derivedFieldsOf(target).has(key))throw new Error(`state.${key} is already in the store`);
  Object.defineProperty(target,key,{enumerable:true,configurable:false,get:derive,set(){
    if(storeIsStrict())throw new TypeError(`state.${key} is derived from other fields: write those instead of assigning it`);
    reportStrayStoreWrite({field:key,path:'(derived; ignored)',stack:strayStack()});
  }});
  derivedFieldsOf(target).add(key);
}
// Device fields (PR 5 of docs/STORE.md section 3): the store holds them from here on, `state` reads them through getters,
// and they are written only through device/registrationTabChanged and device/poolViewDivisionChanged. Done once here,
// before any code reads them; the literal above only fixes their place in Object.keys(state).
moveToStore('regMode',['device','regMode']);
moveToStore('poolViewDivision',['device','poolViewDivision']);
/** The Pools tab's division, as this device shows it (a device field: device/poolViewDivisionChanged). */
export function ksmSetPoolViewDivision(/** @type {string} */ division){dispatch(deviceSlice.actions.poolViewDivisionChanged(division))}
// The court view (PR 6): the court this device shows, the court Live Scores / the TV follows, and the division its court
// screen shows. Written only through these three helpers (device/courtChosen, device/publicCourtChanged,
// device/divisionShown); the court's shared pointer (courtState[c], courtActiveDivision[c]) is tournament data, written
// only by that court's own actions (isCourtScorekeeper() in court-match-order.js, docs/STORE.md section 1.2).
moveToStore('currentCourt',['device','currentCourt']);
moveToStore('publicCourt',['device','publicCourt']);
moveToStore('currentDivision',['device','currentDivision']);
/** The court this device shows (state.currentCourt). */
export function ksmSetCurrentCourt(/** @type {string} */ court){if(state.currentCourt!==court)dispatch(deviceSlice.actions.courtChosen(court))}
/** The court Live Scores / the TV follows (state.publicCourt). */
export function ksmSetPublicCourt(/** @type {string} */ court){if(state.publicCourt!==court)dispatch(deviceSlice.actions.publicCourtChanged(court))}
/** The division this device's court screen shows (state.currentDivision). */
export function ksmShowDivision(/** @type {string|null} */ division){if(state.currentDivision!==division)dispatch(deviceSlice.actions.divisionShown(division))}
// The match the court screen shows and its score pad (PR 7, docs/STORE.md section 3 item 7). `matches` is derived: the
// live match list of the division this device shows (the same array object as allMatches[currentDivision], never a
// copy, so a write through state.matches[i] lands in allMatches; [] while that division has none). `current` is this
// device's shown index (device/matchShown); it is not the court's shared pointer (courtState[c].index), which only the
// court's scorekeeper moves (section 1.2). `score` is the pad of this device's court (device/scoreChanged).
deriveInState('matches',()=>{const div=state.currentDivision,list=div!=null?state.allMatches?.[div]:undefined;return Array.isArray(list)?list:[]});
moveToStore('current',['device','currentMatchIndex']);
moveToStore('score',()=>['device','activeScore',state.currentCourt||'A']);
/** A tournament closed (ksmResetTournament()): the shown match is the first and every court's pad is empty. */
export function ksmResetCourtPads(){ksmShowMatch(0);dispatch(deviceSlice.actions.scoresCleared())}
/** The match this device's court screen shows: its index in state.matches (state.current). */
export function ksmShowMatch(/** @type {number} */ index){if(state.current!==index)dispatch(deviceSlice.actions.matchShown(index))}
/** @typedef {{W:string[],R:string[],WT:number,RT:number}} ScorePad */
/** An empty score pad. */
export const ksmEmptyScore=()=>/** @type {ScorePad} */ ({W:[],R:[],WT:0,RT:0});
/**
 * The score pad of this device's court (state.score): one device/scoreChanged, none when `score` equals the pad. The
 * pad is frozen store data: build a new value (`{...state.score, W:[...state.score.W, 'M']}`), never write into it.
 */
export function ksmSetScore(/** @type {ScorePad} */ score){
  const next={W:[...(score?.W||[])],R:[...(score?.R||[])],WT:score?.WT||0,RT:score?.RT||0},now=state.score;
  const same=(/** @type {string[]} */ a,/** @type {string[]} */ b)=>Array.isArray(a)&&a.length===b.length&&a.every((x,i)=>x===b[i]);
  if(now&&same(now.W,next.W)&&same(now.R,next.R)&&now.WT===next.WT&&now.RT===next.RT)return;
  dispatch(deviceSlice.actions.scoreChanged({court:state.currentCourt||'A',score:next}));
}
/**
 * Replaces all of `state` with `loaded`'s keys (a load, a remote apply, the tournament switch): plain keys are deleted
 * and assigned in `loaded`'s order, as `Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,loaded)` did;
 * store-owned keys (absent ones as undefined) go to the store in one legacy/stateReplaced action, except the device
 * fields, which this device keeps (a payload's value is ignored), and the derived keys (state.matches), whose payload
 * value is ignored.
 * @param {object} loaded
 * @param {object} [target]
 */
export function replaceState(loaded,target=state){
  const fields=storeFieldsOf(target),derived=derivedFieldsOf(target),writes=[];
  const t=/** @type {Record<string,unknown>} */ (target);
  for(const key of Object.keys(t))if(!fields.has(key)&&!derived.has(key))delete t[key];
  // A device field (path in the `device` slice) is this device's: a payload never overwrites it (docs/STORE.md point 4).
  for(const [key,value] of Object.entries(loaded)){
    if(derived.has(key))continue;
    const path=fields.get(key);
    if(path){const p=resolvePath(path);if(p[0]!=='device')writes.push({path:p,value})}else t[key]=value;
  }
  for(const [key,path] of fields){const p=resolvePath(path);if(p[0]!=='device'&&!Object.hasOwn(loaded,key))writes.push({path:p,value:undefined})}
  if(writes.length)dispatch(legacyStateReplaced({writes}));
}
/**
 * Assigns `partial`'s keys to `state` (a division rename, the team-division migration), as Object.assign(state,partial)
 * did; store-owned keys go to the store in one legacy/stateAssigned action; a derived key (state.matches) is ignored.
 * @param {object} partial
 * @param {object} [target]
 */
export function assignState(partial,target=state){
  const fields=storeFieldsOf(target),derived=derivedFieldsOf(target),writes=[];
  const t=/** @type {Record<string,unknown>} */ (target);
  for(const [key,value] of Object.entries(partial)){if(derived.has(key))continue;const path=fields.get(key);if(path)writes.push({path:resolvePath(path),value});else t[key]=value}
  if(writes.length)dispatch(legacyStateAssigned({writes}));
}
