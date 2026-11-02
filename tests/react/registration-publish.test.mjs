import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ksmExhibitionsData, ksmRegistrationData, ksmStatusInput, ksmTabInput, ksmTeamsData, startRegistrationInput,
} from '../../app/react/features/registration/publish.ts';

// A fake `window` with the legacy functions and elements publish.ts reads through shared/legacy.ts.
function fakeWindow({
  state = {}, regFilter, teamFilter, teamDivisionFilter, teamTournamentFormat, tCourts, exhibitionsEnabled = false,
  teamDivisions = [{ id: 'Team Tournament', name: 'Team Tournament', order: 1 }], formats = {}, onBlur = () => {},
} = {}) {
  const listeners = new Map();
  const s = { competitors: [], divisions: ['Open', 'Women'], teams: [], exhibitions: [], ...state };
  const active = { blur: () => onBlur(win) };
  const blurred = [];
  const bound = new WeakMap();
  const win = {
    ksmLegacyState: () => s,
    ksmHtmlText: x => String(x || '').replace(/\r\n?/g, '\n'),
    ksmBindRegistrationRow: (competitor, row) => { bound.set(row, competitor); return row; },
    ksmBindRegistrationEntry: (entry, row) => { bound.set(row, entry); return row; },
    ksmBlurRedrawn: island => { blurred.push(island); onBlur(win); },
    ksmExhibitionsEnabled: () => exhibitionsEnabled,
    ksmTeamDivisions: () => teamDivisions,
    ksmTeamSettings: id => ({ teamFormat: formats[id ?? ''] ?? '5-Person Team', teamTournamentFormat: 'Single Elimination' }),
    KSMEngine: { teamSlots: f => (f === '3-Person Team' || f === 'Kachinuki' ? ['senpo', 'chuken', 'taisho'] : ['senpo', 'jiho', 'chuken', 'fukusho', 'taisho']) },
    regFilter, teamFilter, teamDivisionFilter, teamTournamentFormat, tCourts,
    regTable: { contains: el => el === active },
    exhibitionTable: { id: 'exhibitionTable' },
    ksmRegistrationMounted: true,
    document: { activeElement: active, body: {}, querySelector: () => ({ id: 'teamTable' }) },
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    dispatch: type => listeners.get(type)?.(),
    bound, blurred, active,
  };
  globalThis.window = win;
  return win;
}

const person = (name, dojo, division, status = 'Registered', seed = '') => ({ name, dojo, division, status, seed });

test('players: a row per competitor, bound to its competitor, with the text as the markup showed it', () => {
  const win = fakeWindow({ state: { competitors: [person('Ann\r\nB', 'Aiea', 'Open', 'Checked', '1'), person('Bo', 'Maui', 'Women')] } });
  const input = ksmRegistrationData();
  assert.deepEqual(input.divisions, ['Open', 'Women']);
  assert.equal(input.rows.length, 2);
  assert.deepEqual(input.rows[0], {
    index: 0, name: 'Ann\nB', dojo: 'Aiea', seed: '1', status: 'Checked', checked: true, noShow: false, selected: [0],
  });
  assert.equal(win.bound.get(input.rows[1]), win.ksmLegacyState().competitors[1]);
  assert.deepEqual(input.rows[1].selected, [1]);
});

test('players: the filter matches the stored words and the status as shown (checked in, no show)', () => {
  const competitors = [person('Ann', 'A', 'Open', 'Checked'), person('Bo', 'B', 'Open', 'NoShow'), person('Cy', 'C', 'Women', 'Registered')];
  const names = filter => {
    fakeWindow({ state: { competitors }, regFilter: { value: filter } });
    return ksmRegistrationData().rows.map(r => r.name);
  };
  assert.deepEqual(names(''), ['Ann', 'Bo', 'Cy']);
  assert.deepEqual(names('checked in'), ['Ann']);
  assert.deepEqual(names('NO SHOW'), ['Bo']);
  assert.deepEqual(names('noshow'), ['Bo']);
  assert.deepEqual(names('registered'), ['Cy']);
  assert.deepEqual(names('women'), ['Cy']);
  assert.deepEqual(names('zzz'), []);
});

test('players: a division no longer offered is an extra selected option; selected lists every equal division', () => {
  fakeWindow({ state: { divisions: ['Open', 'Open'], competitors: [person('Ann', 'A', 'Open'), person('Bo', 'B', 'Gone'), person('Cy', 'C', '')] } });
  const [a, b, c] = ksmRegistrationData().rows;
  assert.deepEqual(a.selected, [0, 1]);
  assert.equal('notOffered' in a, false);
  assert.equal(b.notOffered, 'Gone');
  assert.deepEqual(b.selected, []);
  assert.equal('notOffered' in c, false);
});

test('players: the status class keeps CR LF as LF but is not otherwise escaped', () => {
  fakeWindow({ state: { competitors: [person('Ann', 'A', 'Open', 'Chec\r\nked')] } });
  assert.equal(ksmRegistrationData().rows[0].status, 'Chec\nked');
});

test('status: counts as requested, courts as the field says (2 when empty), valid as a boolean', () => {
  fakeWindow({ tCourts: { value: '4\r\n' } });
  assert.deepEqual(ksmStatusInput({ valid: 1, competitors: 3, divisions: 2, errors: 1 }), { valid: true, competitors: 3, divisions: 2, courts: '4\n', errors: 1 });
  fakeWindow({});
  assert.equal(ksmStatusInput({ valid: false, competitors: 0, divisions: 0, errors: 0 }).courts, '2');
});

test('teams: format slots follow the Setup format, cards are bound, the division filter applies', () => {
  const teams = [
    { team: 'Aiea A', teamDivisionId: 'D1', senpo: 'S1', jiho: 'J1', chuken: 'C1', fukusho: 'F1', taisho: 'T1', status: 'Checked' },
    { team: 'Maui', teamDivisionId: 'D2', senpo: 'S2', chuken: 'C2', taisho: 'T2', status: 'NoShow' },
  ];
  const win = fakeWindow({
    state: { teams }, formats: { '': '3-Person Team', D1: '5-Person Team', D2: '3-Person Team' },
    teamDivisions: [{ id: 'D1', name: 'One', order: 1 }, { id: 'D2', name: 'Two', order: 2 }],
    teamTournamentFormat: { value: 'Round Robin' },
  });
  const input = ksmTeamsData();
  assert.deepEqual(input.slots, ['senpo', 'chuken', 'taisho']);
  assert.equal(input.format, '3-Person Team');
  assert.equal(input.tournamentFormat, 'Round Robin');
  assert.deepEqual(input.divisions, [{ id: 'D1', name: 'One' }, { id: 'D2', name: 'Two' }]);
  assert.equal(input.cards.length, 2);
  assert.deepEqual(input.cards[0].members, ['S1', 'J1', 'C1', 'F1', 'T1']);
  assert.deepEqual(input.cards[1].members, ['S2', 'C2', 'T2']);
  assert.equal(input.cards[0].checked, true);
  assert.equal(input.cards[1].noShow, true);
  assert.equal(win.bound.get(input.cards[1]), teams[1]);
  win.teamDivisionFilter = { value: 'D2' };
  assert.deepEqual(ksmTeamsData().cards.map(c => c.team), ['Maui']);
  win.teamDivisionFilter = { value: '' };
  win.teamFilter = { value: 'aiea' };
  assert.deepEqual(ksmTeamsData().cards.map(c => c.team), ['Aiea A']);
  win.teamFilter = { value: 'kachinuki' };
  assert.deepEqual(ksmTeamsData().cards, []);
});

test('teams: Kachinuki and the default format give their slots; a team without a division gets the first one', () => {
  fakeWindow({ state: { teams: [{ team: 'X', status: 'Registered' }] }, formats: { '': 'Kachinuki' } });
  const input = ksmTeamsData();
  assert.deepEqual(input.slots, ['senpo', 'chuken', 'taisho']);
  assert.equal(input.cards[0].teamDivisionId, 'Team Tournament');
  fakeWindow({ state: { teams: [] } });
  assert.deepEqual(ksmTeamsData().slots, ['senpo', 'jiho', 'chuken', 'fukusho', 'taisho']);
  assert.equal(ksmTeamsData().tournamentFormat, 'Single Elimination');
});

test('exhibitions: a bound row per match', () => {
  const exhibitions = [{ white: 'A\r\n', red: 'B', status: 'Checked' }, { white: '', red: '', status: 'NoShow' }];
  const win = fakeWindow({ state: { exhibitions } });
  const { rows } = ksmExhibitionsData();
  assert.deepEqual(rows[0], { index: 0, white: 'A\n', red: 'B', status: 'Checked', checked: true, noShow: false });
  assert.equal(rows[1].noShow, true);
  assert.equal(win.bound.get(rows[1]), exhibitions[1]);
  win.ksmLegacyState().exhibitions = undefined;
  assert.deepEqual(ksmExhibitionsData().rows, []);
});

test('tab: the mode as text and whether exhibitions are enabled', () => {
  fakeWindow({ exhibitionsEnabled: true });
  assert.deepEqual(ksmTabInput({ mode: 'team' }), { mode: 'team', exhibitions: true });
  assert.deepEqual(ksmTabInput({ mode: 5 }), { mode: '5', exhibitions: true });
});

test('events compute only what was requested', () => {
  const win = fakeWindow({ state: { competitors: [person('Ann', 'A', 'Open')] } });
  startRegistrationInput();
  win.dispatch('ksm:registration-players');
  assert.equal(win.ksmRegistrationPlayersInput, undefined);
  win.ksmRegistrationPlayersRequested = true;
  win.dispatch('ksm:registration-players');
  assert.equal(win.ksmRegistrationPlayersInput.rows.length, 1);
  win.ksmRegistrationStatusRequested = { valid: true, competitors: 1, divisions: 1, errors: 0 };
  win.dispatch('ksm:registration-status');
  assert.equal(win.ksmRegistrationStatusInput.competitors, 1);
  win.ksmRegistrationTabRequested = { mode: 'pools' };
  win.dispatch('ksm:registration-tab');
  assert.deepEqual(win.ksmRegistrationTabInput, { mode: 'pools', exhibitions: false });
  win.ksmRegistrationTeamsRequested = true;
  win.dispatch('ksm:registration-teams');
  assert.deepEqual(win.ksmRegistrationTeamsInput.cards, []);
  win.ksmRegistrationExhibitionsRequested = true;
  win.dispatch('ksm:registration-exhibitions');
  assert.deepEqual(win.ksmRegistrationExhibitionsInput.rows, []);
});

test('F17 players: a blur that sets the stale flag makes the input be computed twice and clears the flag', () => {
  let blurs = 0;
  const win = fakeWindow({
    state: { competitors: [person('Ann', 'A', 'Open')] },
    onBlur: w => { blurs++; w.ksmRegistrationRowsStale = true; w.ksmLegacyState().competitors[0].name = 'Typed'; },
  });
  startRegistrationInput();
  win.ksmRegistrationPlayersRequested = true;
  win.ksmRegistrationRowsStale = true; // an earlier stale flag is cleared before the blur
  win.dispatch('ksm:registration-players');
  assert.equal(blurs, 1);
  assert.equal(win.ksmRegistrationRowsStale, false);
  // The published rows are the second computation: they show what the blur committed.
  assert.equal(win.ksmRegistrationPlayersInput.rows[0].name, 'Typed');
});

test('F17 players: no stale flag, one computation; the blur happens only while mounted and inside the table', () => {
  let blurs = 0;
  const win = fakeWindow({ state: { competitors: [person('Ann', 'A', 'Open')] }, onBlur: () => { blurs++; } });
  startRegistrationInput();
  win.ksmRegistrationPlayersRequested = true;
  win.dispatch('ksm:registration-players');
  assert.equal(blurs, 1);
  const first = win.ksmRegistrationPlayersInput;
  win.ksmRegistrationMounted = false;
  win.dispatch('ksm:registration-players');
  assert.equal(blurs, 1);
  assert.notEqual(win.ksmRegistrationPlayersInput, first);
  win.ksmRegistrationMounted = true;
  win.regTable = { contains: () => false };
  win.dispatch('ksm:registration-players');
  assert.equal(blurs, 1);
  win.regTable = { contains: el => el === win.active };
  win.document.activeElement = win.document.body;
  win.dispatch('ksm:registration-players');
  assert.equal(blurs, 1);
});

test('F20 teams and exhibitions: the same compute, blur, compute again order', () => {
  const win = fakeWindow({
    state: { teams: [{ team: 'T', status: 'Registered' }], exhibitions: [{ white: 'A', red: 'B', status: 'Registered' }] },
    onBlur: w => {
      w.ksmTeamsStale = true; w.ksmExhibitionsStale = true;
      w.ksmLegacyState().teams[0].team = 'Typed team'; w.ksmLegacyState().exhibitions[0].white = 'Typed white';
    },
  });
  startRegistrationInput();
  win.ksmRegistrationTeamsRequested = true;
  win.ksmTeamsStale = true;
  win.dispatch('ksm:registration-teams');
  assert.equal(win.ksmTeamsStale, false);
  assert.equal(win.ksmRegistrationTeamsInput.cards[0].team, 'Typed team');
  assert.deepEqual(win.blurred[0], { id: 'teamTable' });
  win.ksmRegistrationExhibitionsRequested = true;
  win.dispatch('ksm:registration-exhibitions');
  assert.equal(win.ksmExhibitionsStale, false);
  assert.equal(win.ksmRegistrationExhibitionsInput.rows[0].white, 'Typed white');
  assert.equal(win.blurred[1], win.exhibitionTable);
});

test('F20: without a stale flag the first computation is published', () => {
  const win = fakeWindow({ state: { teams: [{ team: 'T', status: 'Registered' }] }, onBlur: () => {} });
  startRegistrationInput();
  win.ksmRegistrationTeamsRequested = true;
  win.dispatch('ksm:registration-teams');
  const first = win.ksmRegistrationTeamsInput;
  win.dispatch('ksm:registration-teams');
  assert.notEqual(win.ksmRegistrationTeamsInput, first);
  assert.equal(win.ksmRegistrationTeamsInput.cards[0].team, 'T');
});

test('start-up computes every input whose request was made earlier, and only those', () => {
  const win = fakeWindow({ state: { competitors: [person('Ann', 'A', 'Open')], teams: [{ team: 'T', status: 'Registered' }] }, exhibitionsEnabled: true });
  win.ksmRegistrationPlayersRequested = true;
  win.ksmRegistrationStatusRequested = { valid: false, competitors: 1, divisions: 1, errors: 2 };
  win.ksmRegistrationTeamsRequested = true;
  win.ksmRegistrationTabRequested = { mode: 'team' };
  startRegistrationInput();
  assert.equal(win.ksmRegistrationPlayersInput.rows.length, 1);
  assert.equal(win.ksmRegistrationStatusInput.errors, 2);
  assert.equal(win.ksmRegistrationTeamsInput.cards.length, 1);
  assert.deepEqual(win.ksmRegistrationTabInput, { mode: 'team', exhibitions: true });
  assert.equal(win.ksmRegistrationExhibitionsInput, undefined);
});

test('start-up before the island is mounted does not blur', () => {
  let blurs = 0;
  const win = fakeWindow({ state: { competitors: [person('Ann', 'A', 'Open')] }, onBlur: () => { blurs++; } });
  win.ksmRegistrationMounted = undefined;
  win.ksmRegistrationPlayersRequested = true;
  startRegistrationInput();
  assert.equal(blurs, 0);
  assert.equal(win.ksmRegistrationPlayersInput.rows.length, 1);
});
