// @ts-check
// Selectors over the store's state (#15 item 14c, docs/STORE.md section 3): what a module's `state.x` read turns into,
// `selectX(getState())`. Each returns what the `state` getter of that key returns (state.matches is derived as in app-state.js),
// typed as `state` was (TournamentState, app/types/tournament.d.ts), so a read after a write is the new value. They are
// functions of the two slices (selectDevice, selectTournament: the only selectors in the store bundle, whose exports keep their
// names and are at the size budget, section 5), so these cost the store bundle nothing and the bundler mangles their names.
import {selectDevice,selectTournament} from '../store/index.ts';
/** @typedef {import('../store/index.ts').RootState} RootState */
/** @typedef {TournamentState} T */
/** The `tournament` slice's field `key`, as `state[key]` was typed. @template {keyof T} K @param {RootState} s @param {K} key @returns {T[K]} */
export const selectTournamentField=(s,key)=>/** @type {any} */ (selectTournament(s))[key];
/** `state.currentCourt` (this device's court). @param {RootState} s @returns {T['currentCourt']} */
export const selectCurrentCourt=s=>/** @type {any} */ (selectDevice(s).currentCourt);
/** `state.currentDivision`. @param {RootState} s @returns {T['currentDivision']} */
export const selectCurrentDivision=s=>selectDevice(s).currentDivision;
/** `state.poolViewDivision`. @param {RootState} s @returns {T['poolViewDivision']} */
export const selectPoolViewDivision=s=>selectDevice(s).poolViewDivision;
/** `state.current`: the index of the match this device shows. @param {RootState} s @returns {T['current']} */
export const selectCurrentIndex=s=>selectDevice(s).currentMatchIndex;
/** `state.regMode`. @param {RootState} s @returns {T['regMode']} */
export const selectRegMode=s=>selectDevice(s).regMode;
/** `state.score`: the pad of this device's court. @param {RootState} s @returns {T['score']} */
export const selectScore=s=>/** @type {any} */ (selectDevice(s).activeScore)[selectDevice(s).currentCourt||'A'];
/** `state.allMatches`: every division's bouts. @param {RootState} s @returns {T['allMatches']} */
export const selectAllMatches=s=>selectTournamentField(s,'allMatches');
/** `state.matches`: the bouts of the division this device shows ([] when it has none). @param {RootState} s @returns {T['matches']} */
export const selectMatches=s=>{const div=selectCurrentDivision(s),list=div!=null?selectAllMatches(s)?.[div]:undefined;return Array.isArray(list)?list:[]};
/** `state.courtState`. @param {RootState} s */
export const selectCourtState=s=>selectTournamentField(s,'courtState');
/** `state.courtActiveDivision`. @param {RootState} s */
export const selectCourtActiveDivision=s=>selectTournamentField(s,'courtActiveDivision');
/** `state.brackets`. @param {RootState} s */
export const selectBrackets=s=>selectTournamentField(s,'brackets');
/** `state.teamBracketNodes`. @param {RootState} s */
export const selectTeamBracketNodes=s=>selectTournamentField(s,'teamBracketNodes');
/** `state.singleElimNodes`. @param {RootState} s */
export const selectSingleElimNodes=s=>selectTournamentField(s,'singleElimNodes');
/** `state.divisionCourts`. @param {RootState} s */
export const selectDivisionCourts=s=>selectTournamentField(s,'divisionCourts');
/** `state.divisions`. @param {RootState} s */
export const selectDivisions=s=>selectTournamentField(s,'divisions');
/** `state.competitors`. @param {RootState} s */
export const selectCompetitors=s=>selectTournamentField(s,'competitors');
/** `state.teams`. @param {RootState} s */
export const selectTeams=s=>selectTournamentField(s,'teams');
/** `state.courtActionHistory`. @param {RootState} s */
export const selectCourtActionHistory=s=>selectTournamentField(s,'courtActionHistory');
/** `state.courtRedoHistory`. @param {RootState} s */
export const selectCourtRedoHistory=s=>selectTournamentField(s,'courtRedoHistory');
