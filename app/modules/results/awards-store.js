// @ts-check
// The awards and the grand champions in the store (#15 PR 11, docs/STORE.md section 3 item 11): `awards` and
// `grandChampions` are the `tournament` slice's; `state` reads them through getters (app/modules/app-state.js). Every
// write is one of these helpers, one tournament/… action each. Rows are store data (frozen in the tests): a row is never
// edited in place.
// An award has no id: its row is named by its index (the awards editor's handlers pass the index of the row they draw),
// resolved right before the dispatch in the same synchronous step. A grand champion has an id and engine rules
// (app/engine/grand-champion.ts). Either way the caller computes the new list from the current rows, like a team division
// edit, and the action sets it, so an edit is one action. Like the old in-place writes, none of them schedules a save or renders:
// the caller does what it did before.
import {state} from '../app-state.js';
import {dispatch,tournamentSlice} from '../../store/index.ts';
import {settingsMeta} from '../sync/cloud-session-and-autosave.js';
/** @typedef {Award} AwardRow */
/** @typedef {Partial<Award>&Record<string,unknown>} AwardChanges */
/** @typedef {import('../../engine/grand-champion.ts').GrandChampion} GrandChampionRow */
/** @typedef {'grandChampionAdded'|'grandChampionUpdated'|'grandChampionMoved'|'grandChampionRemoved'} GrandChampionAction */
/** @typedef {'awardAdded'|'awardSet'|'awardRemoved'|'awardsLoaded'} AwardAction */
/** @param {AwardAction|GrandChampionAction} type @param {{awards:AwardRow[]}|{grandChampions:GrandChampionRow[]}} lists */
function setLists(type,lists){dispatch(/** @type {any} */ (tournamentSlice.actions)[type](lists,settingsMeta()))}
/** An award row added at the end (Results' Add award; a list that was never set is created). @param {AwardRow} row */
export function ksmAddAward(row){setLists('awardAdded',{awards:[...(state.awards||[]),row]})}
/** The award at `index` with these fields (an input's change); a row that is not there changes nothing. @param {number} index @param {AwardChanges} changes */
export function ksmSetAward(index,changes){if(state.awards?.[index])setLists('awardSet',{awards:state.awards.map((r,i)=>i===index?{...r,...changes}:r)})}
/** The award at `index` removed (×). @param {number} index */
export function ksmRemoveAward(index){if(state.awards?.[index])setLists('awardRemoved',{awards:state.awards.filter((_,i)=>i!==index)})}
/** The whole award list at once (the test API). @param {AwardRow[]} awards */
export function ksmLoadAwards(awards){setLists('awardsLoaded',{awards})}
/** One grand champion action with the rows the edit computed (the whole list, in its order). @param {GrandChampionAction} type @param {GrandChampionRow[]} grandChampions */
export function ksmSetGrandChampions(type,grandChampions){setLists(type,{grandChampions})}
