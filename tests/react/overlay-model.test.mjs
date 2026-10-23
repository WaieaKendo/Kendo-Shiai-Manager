import test from 'node:test';
import assert from 'node:assert/strict';
import { overlayLayout, overlayView, parseOverlayParams, DEFAULT_BAND_Y } from '../../app/react/features/overlay/overlay-model.ts';
import { selectCourtMatch } from '../../app/react/features/overlay/court-match.ts';

const ind = (white, red, extra = {}) => ({ division: 'Open', type: 'individual', white, red, wdojo: `${white} Dojo`, rdojo: `${red} Dojo`, wp: [], rp: [], done: false, pool: 'A', ...extra });
const stateWith = (matches, extra = {}) => ({
  allMatches: { Open: matches }, divisionCourts: { Open: 'A' },
  courtState: { A: { division: 'Open', index: 0 }, B: { division: null, index: 0 } },
  courtActiveDivision: { A: 'Open', B: null }, ...extra,
});

test('parseOverlayParams: defaults and options', () => {
  assert.deepEqual(parseOverlayParams('?tournament=abc'), { tournament: 'abc', court: 'A', red: 'right', pos: 'bottom', y: null, band: null, debug: false });
  assert.deepEqual(parseOverlayParams('?tournament=abc&court=b&red=left&pos=top&y=60&debug=1'),
    { tournament: 'abc', court: 'B', red: 'left', pos: 'top', y: 60, band: null, debug: true });
  assert.equal(parseOverlayParams('?y=150').y, 100);
  assert.equal(parseOverlayParams('?y=abc').y, null);
  assert.equal(parseOverlayParams('?band=0').band, false);
  assert.equal(parseOverlayParams('').tournament, null);
});

test('overlayLayout: band mode when the device is landscape but the page portrait', () => {
  const p = parseOverlayParams('');
  const band = overlayLayout({ width: 733, height: 1303, deviceLandscape: true }, p);
  assert.equal(band.mode, 'band');
  assert.equal(band.y, DEFAULT_BAND_Y);
  assert.ok(Math.abs(band.unit - 733 / 1920) < 1e-9);
  assert.equal(overlayLayout({ width: 733, height: 1303, deviceLandscape: false }, p).mode, 'normal', 'phone held portrait');
  assert.equal(overlayLayout({ width: 1920, height: 1080, deviceLandscape: true }, p).mode, 'normal', 'OBS 1080p source');
  assert.equal(overlayLayout({ width: 1920, height: 1080, deviceLandscape: true }, p).unit, 1);
  assert.deepEqual(overlayLayout({ width: 733, height: 1303, deviceLandscape: false }, parseOverlayParams('?y=60')), {
    mode: 'band', unit: 733 / 1920, y: 60, pageOrientation: 'portrait', deviceOrientation: 'portrait' });
  assert.equal(overlayLayout({ width: 733, height: 1303, deviceLandscape: true }, parseOverlayParams('?band=0')).mode, 'normal');
});

test('current match is courtState[court]; next is the following match on the court', () => {
  const s = stateWith([ind('A1', 'A2', { done: true }), ind('A3', 'A4', { wp: ['M'], rp: ['H'], wt: 1, rt: 2 }), ind('A5', 'A6')]);
  s.courtState.A.index = 1;
  const v = overlayView(s, 'A');
  assert.equal(v.kind, 'match');
  assert.deepEqual(v.white, { name: 'A3', sub: 'A3 Dojo', points: ['M'], hansoku: 1 });
  assert.deepEqual(v.red, { name: 'A4', sub: 'A4 Dojo', points: ['H'], hansoku: 2 });
  assert.equal(v.meta, 'Pool A');
  assert.equal(v.next, 'A5 vs A6');
});

test('a finished current match falls through to the next ready match (findNextForCourt)', () => {
  const s = stateWith([ind('A1', 'A2', { done: true }), ind('', 'A4'), ind('A5', 'A6'), ind('A7', 'A8', { court: 'B' })]);
  const found = selectCourtMatch(s, 'A');
  assert.equal(found.match.white, 'A5', 'skips the match without both names');
  assert.deepEqual(found.upcoming, [], 'the remaining match is on Court B');
  assert.equal(s.courtState.A.index, 0, 'input state is not modified');
});

test('idle: nothing on the court, final played, or no state', () => {
  const s = stateWith([ind('A1', 'A2')]);
  assert.deepEqual(overlayView(s, 'B'), { kind: 'idle', court: 'B', division: null });
  const done = stateWith([ind('A1', 'A2', { singleElim: true, position: 'Final', done: true }), ind('A3', 'A4')]);
  assert.deepEqual(overlayView(done, 'A'), { kind: 'idle', court: 'A', division: 'Open' });
  assert.deepEqual(overlayView(null, 'A'), { kind: 'idle', court: 'A', division: null });
});

test('team match: bout names, team names, position; next is the next pairing', () => {
  const bout = (pair, pos, white, red, extra = {}) => ({ division: 'Team', type: 'teamPosition', teamPair: pair, position: pos, white, red,
    teamWhite: pair === 'p1' ? 'Tigers' : 'Hawks', teamRed: pair === 'p1' ? 'Bears' : 'Owls', wdojo: '', rdojo: '', wp: [], rp: [], done: false, ...extra });
  const s = {
    allMatches: { Team: [bout('p1', 'Senpo', 'T1', 'B1', { done: true }), bout('p1', 'Chuken', 'T2', 'B2'), bout('p2', 'Senpo', 'H1', 'O1')] },
    divisionCourts: { Team: 'B' }, courtState: { A: { division: null, index: 0 }, B: { division: 'Team', index: 1 } }, courtActiveDivision: { A: null, B: 'Team' },
  };
  // Stored in queue order, as the scorekeeper's device saves it.
  const v = overlayView(s, 'B');
  assert.equal(v.kind, 'match');
  assert.equal(v.teamMode, true);
  assert.deepEqual([v.white.name, v.white.sub, v.red.name, v.red.sub, v.meta], ['T2', 'Tigers', 'B2', 'Bears', 'Chuken']);
  assert.equal(v.next, 'Hawks vs Owls');
});

test('championship placeholders use the TV labels', () => {
  const s = stateWith([
    ind('P1', 'P2', { championship: true, position: 'Semifinal', bracketSlot: 0, pool: 'Championship' }),
    ind('', '', { championship: true, position: 'Final', bracketSlot: 0, pool: 'Championship' }),
  ], { generated: true, brackets: { Open: [['A1', 'B2'], ['B1', 'A2']] } });
  const v = overlayView(s, 'A');
  assert.equal(v.meta, 'Semifinal');
  // Upcoming lists the Final before it is ready, with the TV's placeholder names.
  assert.equal(v.next, 'Winner of Semifinal Match 2 vs Winner of Semifinal Match 1');
});

test('team division overlay labels use names for active and idle courts without changing selection IDs',()=>{
  const id='team-stable-id',match=ind('A1','A2',{division:id,type:'teamPosition',teamWhite:'Team A',teamRed:'Team B'});
  const state=stateWith([],{allMatches:{[id]:[match]},divisionCourts:{[id]:'A'},courtState:{A:{division:id,index:0}},courtActiveDivision:{A:id},teamDivisions:[{id,name:'Adult Open'}]});
  assert.equal(selectCourtMatch(state,'A').division,id);
  assert.equal(overlayView(state,'A').division,'Adult Open');
  match.done=true;
  assert.equal(overlayView(state,'A').division,'Adult Open');
});
