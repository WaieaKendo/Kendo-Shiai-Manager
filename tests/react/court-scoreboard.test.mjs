import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_SCOREBOARD, representativeView, scoreboardView } from '../../app/react/court/scoreboard-model.ts';

const score = (W = [], R = [], WT = 0, RT = 0) => ({ W, R, WT, RT });
const ind = (extra = {}) => ({ white: 'Aoki', red: 'Baba', wdojo: 'Aiea', rdojo: 'Waipahu', type: 'individual', ...extra });

test('scoreboardView: no match shows dashes and nothing scored', () => {
  const side = { name: '—', representative: null, dojo: '—', points: [], hansoku: '' };
  assert.deepEqual(scoreboardView(EMPTY_SCOREBOARD), { white: side, red: side });
  assert.deepEqual(scoreboardView({ match: null, score: score(['M'], [], 1), representatives: null }).white, side, 'a stale score is not shown');
});

test('scoreboardView: names, dojos, points and hansoku per side', () => {
  const view = scoreboardView({ match: ind(), score: score(['M', 'K'], ['D'], 1, 2), representatives: null });
  assert.deepEqual(view.white, { name: 'Aoki', representative: null, dojo: 'Aiea', points: ['M', 'K'], hansoku: '△ ' });
  assert.deepEqual(view.red, { name: 'Baba', representative: null, dojo: 'Waipahu', points: ['D'], hansoku: '△ △ ' });
});

test('scoreboardView: legacy fallbacks (TBD name, team as dojo, dash)', () => {
  const view = scoreboardView({ match: ind({ white: '', red: undefined, wdojo: '', rdojo: '', teamWhite: 'Team A', type: 'teamPosition' }), score: score(), representatives: null });
  assert.equal(view.white.name, 'TBD');
  assert.equal(view.red.name, 'TBD');
  assert.equal(view.white.dojo, 'Team A');
  assert.equal(view.red.dojo, '—');
});

test('scoreboardView: the representative picker only for a team playoff', () => {
  const rep = { team: 'Team A', current: 'Team A Representative', roster: ['A1', 'A2'], editable: true };
  const input = { score: score(), representatives: { W: rep, R: { ...rep, team: 'Team B', current: 'B2', roster: ['B1', 'B2'] } } };
  const playoff = scoreboardView({ ...input, match: ind({ type: 'teamPlayoff', white: 'Team A Representative', red: 'B2', teamWhite: 'Team A', teamRed: 'Team B', wdojo: '', rdojo: '' }) });
  assert.equal(playoff.white.representative.value, '');
  assert.equal(playoff.red.representative.value, 'B2');
  assert.equal(playoff.white.dojo, 'Team A');
  assert.equal(scoreboardView({ ...input, match: ind() }).white.representative, null, 'ignored for other matches');
});

test('representativeView: as the legacy repSelect()', () => {
  const rep = { team: 'Team A', current: 'Team A Representative', roster: ['A1', 'A2'], editable: true };
  assert.deepEqual(representativeView(rep), { editable: true, placeholder: 'Team A Representative', text: 'Team A Representative', value: '', options: ['A1', 'A2'] });
  assert.equal(representativeView({ ...rep, current: 'A2' }).value, 'A2');
  assert.equal(representativeView({ ...rep, current: '' }).text, 'Team A Representative');
  assert.equal(representativeView({ ...rep, team: '' }).placeholder, 'Dojo Representative');
  assert.equal(representativeView({ ...rep, current: 'Stranger' }).value, '', 'a name outside the roster shows the placeholder option');
  assert.deepEqual(representativeView({ ...rep, current: 'A1', editable: false }), { editable: false, placeholder: 'Team A Representative', text: 'A1', value: 'A1', options: ['A1', 'A2'] });
});
