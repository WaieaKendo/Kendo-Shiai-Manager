// #15 item 14c-1 (docs/STORE.md section 3): app/modules/selectors.js. Each selector returns what the `state` getter of its key
// returns, before and after a write, so a module's `state.x` read and `selectX(getState())` are the same value.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sel from '../../app/modules/selectors.js';
import { getState, selectDevice, selectTournament } from '../../app/store/index.ts';
import { ksmSetCurrentCourt, ksmSetScore, ksmShowDivision, ksmShowMatch, ksmSetPoolViewDivision, state } from '../../app/modules/app-state.js';
import { assignStoreKeys } from '../lib/store-keys.mjs';

const bout = n => ({ division: 'Open', white: `W${n}`, red: `R${n}`, wp: [], rp: [], done: false });
const BY_KEY = {
  selectCurrentCourt: 'currentCourt', selectCurrentDivision: 'currentDivision', selectPoolViewDivision: 'poolViewDivision',
  selectCurrentIndex: 'current', selectRegMode: 'regMode', selectScore: 'score', selectAllMatches: 'allMatches', selectMatches: 'matches',
  selectCourtState: 'courtState', selectCourtActiveDivision: 'courtActiveDivision', selectBrackets: 'brackets',
  selectTeamBracketNodes: 'teamBracketNodes', selectSingleElimNodes: 'singleElimNodes', selectDivisionCourts: 'divisionCourts',
  selectDivisions: 'divisions', selectCompetitors: 'competitors', selectTeams: 'teams', selectCourtActionHistory: 'courtActionHistory',
  selectCourtRedoHistory: 'courtRedoHistory',
  selectDivisionTypes: 'divisionTypes',
  selectExhibitions: 'exhibitions',
  selectTeamDivisions: 'teamDivisions',
  selectPools: 'pools',
  selectTeamPools: 'teamPools',
  selectSingleElimComps: 'singleElimComps',
  selectByeWinners: 'byeWinners',
  selectGenerated: 'generated',
  selectManagementRevision: 'managementRevision',
  selectChampionshipNodes: 'championshipNodes',
  selectTeamElimTeams: 'teamElimTeams',
  selectCurrentByDivision: 'currentByDivision', selectGrandChampions: 'grandChampions', selectAwards: 'awards', selectTeamAwardMode: 'teamAwardMode',
  selectPublicCourt: 'publicCourt', selectHiddenPresets: 'hiddenPresets', selectDivisionRenames: 'divisionRenames',
};
const same = () => {
  for (const [name, key] of Object.entries(BY_KEY)) if (key === 'matches') assert.deepEqual(sel[name](getState()), state[key], `${name} is state.${key}`); // ([] is a new list each time while none is shown)
    else assert.ok(Object.is(sel[name](getState()), state[key]), `${name} is state.${key}`);
  assert.ok(Object.is(sel.selectTournamentField(getState(), 'courtUndoLog'), state.courtUndoLog), 'selectTournamentField');
};

test('the two slices are the store\'s own', () => {
  assert.equal(selectDevice(getState()), getState().device);
  assert.equal(selectTournament(getState()), getState().tournament);
});

test('every selector returns what the state getter returns, and follows a write at once', () => {
  assert.deepEqual(Object.keys(BY_KEY).sort(), Object.keys(sel).filter(n => n !== 'selectTournamentField').sort(), 'every selector is checked here');
  same();
  assignStoreKeys({
    allMatches: { Open: [bout(1), bout(2)] }, courtState: { A: { division: 'Open', index: 1 }, B: { division: null, index: 0 } },
    courtActiveDivision: { A: 'Open', B: null }, brackets: { Open: ['Final'] }, divisionCourts: { Open: 'A' }, divisions: ['Open'],
    competitors: [{ name: 'A', dojo: 'D', division: 'Open', seed: '', status: 'Present' }], teams: [{ team: 'T', dojo: 'D' }],
    teamBracketNodes: { Open: [{ id: 'n1' }] }, singleElimNodes: { Open: [{ id: 's1' }] },
    courtActionHistory: { A: [{ label: 'x' }], B: [] }, courtRedoHistory: { A: [], B: [] }, courtUndoLog: { A: [], B: [] },
  });
  ksmShowDivision('Open'); ksmShowMatch(1); ksmSetCurrentCourt('B'); ksmSetPoolViewDivision('Open');
  ksmSetScore({ W: ['M'], R: [], WT: 1, RT: 0 });
  same();
  assert.equal(sel.selectCurrentCourt(getState()), 'B');
  assert.equal(sel.selectCurrentDivision(getState()), 'Open');
  assert.equal(sel.selectCurrentIndex(getState()), 1);
  assert.equal(sel.selectMatches(getState())[1].white, 'W2');
  assert.deepEqual(sel.selectScore(getState()), { W: ['M'], R: [], WT: 1, RT: 0 });
  assert.deepEqual(sel.selectCourtState(getState()).A, { division: 'Open', index: 1 });
});

test('selectMatches: the list of the shown division, [] when it has none or none is shown, and the list itself (not a copy)', () => {
  ksmShowDivision('Open');
  assert.equal(sel.selectMatches(getState()), sel.selectAllMatches(getState()).Open);
  ksmShowDivision('No such division');
  assert.deepEqual(sel.selectMatches(getState()), []);
  ksmShowDivision(null);
  assert.deepEqual(sel.selectMatches(getState()), []);
});

test('selectScore: the pad of the court this device shows, and a read after a write is the new pad', () => {
  ksmShowDivision('Open'); ksmSetCurrentCourt('A');
  assert.deepEqual(sel.selectScore(getState()), { W: [], R: [], WT: 0, RT: 0 });
  ksmSetScore({ W: ['M', 'K'], R: [], WT: 0, RT: 0 });
  assert.deepEqual(sel.selectScore(getState()).W, ['M', 'K']);
  ksmSetCurrentCourt('B');
  assert.deepEqual(sel.selectScore(getState()).W, ['M']);
});
