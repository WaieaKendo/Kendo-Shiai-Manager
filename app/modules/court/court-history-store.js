// @ts-check
// The court history in the store (#15 PR 13b, docs/STORE.md section 3 item 13): each court's Undo list
// (`courtActionHistory`), Redo list (`courtRedoHistory`) and F30 Undo log (`courtUndoLog`) are the `tournament` slice's;
// `state` reads them through getters (app/modules/app-state.js). Every write is one court/… action through these
// helpers (`meta.court`: the court whose history it is). An entry is store data (frozen in the tests): it is built
// whole before it is recorded and never edited afterwards. What is not in the store yet (`allMatches`: PR 13c) the
// caller writes as before, in the same synchronous step, before the dispatch.
// Like the old in-place writes, none of these schedules a save or renders: the caller does what it did before.
import {storeWrites} from '../app-state.js';
import {courtHistoryActions,dispatch,getState} from '../../store/index.ts';
import {selectTournamentField} from '../selectors.js';
import {settingsMeta} from '../sync/cloud-session-and-autosave.js';
/** @typedef {import('../../store/index.ts').CourtHistoryEntry} CourtHistoryEntry */
/** @typedef {'courtActionHistory'|'courtRedoHistory'|'courtUndoLog'} HistoryKey */
/** @typedef {import('../../store/index.ts').StoreWrite} StoreWrite */
/** How many entries each court's Undo and Redo lists keep. */
export const KSM_HISTORY_LIMIT=100;
// F30: an Undo or Redo removes or re-adds an action instead of adding one, so each is also logged (per court, with the
// action's patches and who/when) for the rebase to replay in time order with the court actions; the log keeps this many.
export const KSM_UNDO_LOG_LIMIT=40;
/** @param {string|null} court */
const meta=court=>({...settingsMeta(),court});
/** @param {HistoryKey} key @param {string} court @returns {CourtHistoryEntry[]} court `court`'s list in the store ([] when there is none) */
const listOf=(key,court)=>{const list=selectTournamentField(getState(),key)?.[court];return Array.isArray(list)?list:[]};
/**
 * The writes that set court `court`'s list in `key`'s map; when the map is missing, both courts' empty lists first, as the
 * old `state[key] = state[key] || {A: [], B: []}` made it.
 * @param {HistoryKey} key @param {string} court @param {CourtHistoryEntry[]} list @returns {StoreWrite[]}
 */
const courtList=(key,court,list)=>[...(selectTournamentField(getState(),key)?[]:[{path:['tournament',key],value:{A:[],B:[]}}]),{path:['tournament',key,court],value:list}];
/** `list` with `entry` pushed, its oldest dropped beyond `limit`. @param {CourtHistoryEntry[]} list @param {CourtHistoryEntry} entry @param {number} limit */
const pushed=(list,entry,limit)=>{const next=[...list,entry];return next.length>limit?next.slice(next.length-limit):next};
/**
 * A court action's entry: pushed on `court`'s Undo list (its oldest dropped beyond the limit), `court`'s Redo list
 * cleared, in one court/actionRecorded.
 * @param {string} court
 * @param {CourtHistoryEntry} entry
 */
export function ksmRecordCourtAction(court,entry){
  dispatch(courtHistoryActions.actionRecorded({writes:[...courtList('courtActionHistory',court,pushed(listOf('courtActionHistory',court),entry,KSM_HISTORY_LIMIT)),
    ...courtList('courtRedoHistory',court,[])]},meta(court)));
}
/**
 * An Undo ('undo': `court`'s last action moved to its Redo list) or a Redo ('redo': back), with its F30 log entry
 * appended and the store-owned keys its patches changed (`values`: key → the key's whole new value; the plain keys the
 * caller wrote before this), in one court/undo or court/redo: a notification never shows half an entry.
 * @param {'undo'|'redo'} kind
 * @param {string} court
 * @param {CourtHistoryEntry} log
 * @param {Record<string,unknown>} values
 */
export function ksmMoveCourtHistory(kind,court,log,values){
  /** @type {[HistoryKey,HistoryKey]} */ const [from,to]=kind==='undo'?['courtActionHistory','courtRedoHistory']:['courtRedoHistory','courtActionHistory'];
  const was=listOf(from,court),action=was[was.length-1];
  dispatch(courtHistoryActions[kind]({writes:[...courtList(from,court,was.slice(0,-1)),...courtList(to,court,pushed(listOf(to,court),action,KSM_HISTORY_LIMIT)),
    ...courtList('courtUndoLog',court,pushed(listOf('courtUndoLog',court),log,KSM_UNDO_LOG_LIMIT)),...storeWrites(values)]},meta(court)));
}
/**
 * Whole history maps (`maps`: each key it names gets that value), none when it names none: court/historyNormalized
 * (ensureCourtHistory()) or court/historyForgotten (a grand champion's draw gone).
 * @param {'historyNormalized'|'historyForgotten'} type
 * @param {Partial<Record<HistoryKey,Record<string,CourtHistoryEntry[]>>>} maps
 */
export function ksmSetCourtHistories(type,maps){
  const writes=Object.entries(maps).map(([key,value])=>({path:['tournament',key],value}));
  if(writes.length)dispatch(courtHistoryActions[type]({writes},meta(null)));
}
