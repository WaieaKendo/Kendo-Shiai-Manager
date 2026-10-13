// app/engine/divisions.ts (issue #25): renaming a division before the draw, the rules (trimmed,
// non-empty, unique case-insensitively, the team event and exhibitions not renamable, nothing after
// the draw), the rewrite (running order position, format, court, competitors, views), presets
// followed through their renames, and the save-conflict rebase that replays a rename whole.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RENAME_AFTER_DRAW_MESSAGE, RENAME_EMPTY_MESSAGE, divisionRenameError, renamedDivisionState, presetNames, drawMade,
  rebaseDivisionRenames,
} from '../../app/engine/divisions.ts';

const PRESETS = ['Kids', 'Juniors', 'Women’s Open'];
const clone = v => JSON.parse(JSON.stringify(v));
const st = over => ({
  divisions: ['Kids', 'Juniors', 'Masters'],
  divisionTypes: { Kids: 'Round Robin', Juniors: 'Single Elimination', 'Women’s Open': 'Round Robin', Masters: 'Round Robin' },
  divisionCourts: { Kids: 'A', Juniors: 'B', 'Women’s Open': 'B', Masters: 'split', 'Team Tournament': 'Both' },
  competitors: [{ name: 'P1', division: 'Kids' }, { name: 'P2', division: 'Juniors' }, { name: 'P3', division: 'Kids' }],
  divisionRenames: [], generated: false, allMatches: {}, pools: {},
  currentDivision: 'Kids', poolViewDivision: 'Juniors', courtState: { A: { division: null, index: 0 }, B: { division: 'Kids', index: 0 } },
  courtActiveDivision: { A: 'Kids', B: null }, ...over,
});
const apply = (s, from, to, id = `${from}>${to}`) => ({ ...s, ...renamedDivisionState(s, from, to, { id, from, to }) });

test('a rename rewrites the name everywhere it is used, in place, keeping format and court', () => {
  const before = st();
  const frozen = clone(before);
  const after = apply(before, 'Kids', 'Under 12');
  assert.deepEqual(before, frozen, 'the input is not changed');
  assert.deepEqual(after.divisions, ['Under 12', 'Juniors', 'Masters'], 'the running order position is kept');
  assert.equal(after.divisionTypes['Under 12'], 'Round Robin');
  assert.equal(after.divisionCourts['Under 12'], 'A');
  assert.ok(!('Kids' in after.divisionTypes) && !('Kids' in after.divisionCourts), 'the old keys are gone');
  assert.deepEqual(Object.keys(after.divisionTypes), ['Under 12', 'Juniors', 'Women’s Open', 'Masters'], 'the key keeps its place');
  assert.deepEqual(after.competitors.map(c => c.division), ['Under 12', 'Juniors', 'Under 12'], 'every competitor follows');
  assert.equal(after.currentDivision, 'Under 12');
  assert.equal(after.poolViewDivision, 'Juniors');
  assert.equal(after.courtState.B.division, 'Under 12');
  assert.equal(after.courtActiveDivision.A, 'Under 12');
  assert.deepEqual(after.divisionRenames, [{ id: 'Kids>Under 12', from: 'Kids', to: 'Under 12' }], 'the rename is recorded');
});

test('names are trimmed, non-empty and unique among the divisions (case-insensitive)', () => {
  const s = st();
  assert.equal(divisionRenameError(s, PRESETS, 'Kids', '  Under 12  '), null);
  assert.equal(divisionRenameError(s, PRESETS, 'Kids', ''), RENAME_EMPTY_MESSAGE);
  assert.equal(divisionRenameError(s, PRESETS, 'Kids', '   '), RENAME_EMPTY_MESSAGE);
  assert.match(divisionRenameError(s, PRESETS, 'Kids', 'juniors'), /already a division named "Juniors"/);
  assert.match(divisionRenameError(s, PRESETS, 'Kids', ' MASTERS '), /already a division named "Masters"/);
  // A switched-off preset still has its row: its name is taken.
  assert.match(divisionRenameError(s, PRESETS, 'Kids', 'women’s open'), /already a division named "Women’s Open"/);
  assert.match(divisionRenameError(s, PRESETS, 'Kids', 'team tournament'), /team event/);
  assert.match(divisionRenameError(s, PRESETS, 'Kids', 'Exhibition Matches'), /exhibition/);
  assert.equal(divisionRenameError(s, PRESETS, 'Kids', 'Kids'), null, 'the same name changes nothing');
  assert.equal(divisionRenameError(s, PRESETS, 'Kids', 'KIDS'), null, 'a change of case is allowed');
  assert.equal(divisionRenameError(s, PRESETS, 'Women’s Open', 'Women'), null, 'a switched-off preset can be renamed');
  assert.match(divisionRenameError(s, PRESETS, 'Nope', 'X'), /no longer a division/);
});

test('the team event and the exhibitions are not renamable', () => {
  assert.match(divisionRenameError(st(), PRESETS, 'Team Tournament', 'Teams'), /team event/);
  assert.match(divisionRenameError(st(), PRESETS, 'Exhibition Matches', 'Shows'), /Exhibition/);
});

test('nothing is renamed after the draw: the whole tournament generated, or a division with pools or matches', () => {
  assert.equal(drawMade(st()), false);
  assert.equal(divisionRenameError(st({ generated: true }), PRESETS, 'Masters', 'Seniors'), RENAME_AFTER_DRAW_MESSAGE);
  assert.equal(divisionRenameError(st({ allMatches: { Kids: [{ white: 'P1', red: 'P3' }] } }), PRESETS, 'Kids', 'U12'), RENAME_AFTER_DRAW_MESSAGE);
  assert.equal(divisionRenameError(st({ pools: { Kids: [{ label: 'A' }] } }), PRESETS, 'Kids', 'U12'), RENAME_AFTER_DRAW_MESSAGE);
  assert.equal(divisionRenameError(st({ allMatches: { Kids: [] } }), PRESETS, 'Kids', 'U12'), null, 'an empty match list is no draw');
  assert.equal(RENAME_AFTER_DRAW_MESSAGE, "Divisions can't be renamed after the draw; rename-anytime comes with stable IDs.");
});

test('a renamed preset is still a preset under its new name; chains are followed', () => {
  let s = apply(st(), 'Women’s Open', 'Women');
  assert.deepEqual(presetNames(PRESETS, s.divisionRenames), ['Kids', 'Juniors', 'Women']);
  s = apply(s, 'Women', 'Ladies');
  s = apply(s, 'Masters', 'Seniors');
  assert.deepEqual(presetNames(PRESETS, s.divisionRenames), ['Kids', 'Juniors', 'Ladies']);
  assert.equal(s.divisionTypes.Ladies, 'Round Robin', 'it keeps its format');
  assert.equal(s.divisionCourts.Ladies, 'B', 'and its court');
  assert.equal(divisionRenameError(s, PRESETS, 'Kids', 'Women’s Open'), null, 'the old preset name is free again');
});

test('renaming onto an existing division (two devices meeting in a conflict) merges them, never two of one name', () => {
  const s = apply(st(), 'Kids', 'Juniors');
  assert.deepEqual(s.divisions, ['Juniors', 'Masters']);
  assert.equal(s.divisionTypes.Juniors, 'Single Elimination', "the existing division's format stays");
  assert.ok(!('Kids' in s.divisionTypes));
});

// ---------------------------------------------------------------------------- the rebase

test('no renames on either side: nothing to do', () => {
  assert.equal(rebaseDivisionRenames(st(), st(), st(), PRESETS), null);
});

test('this device renamed while the other edited and added competitors of that division: nobody is left on the old name', () => {
  const base = st();
  const local = apply(base, 'Kids', 'Under 12');
  const server = st({
    competitors: [{ name: 'P1', division: 'Kids', dojo: 'Edited' }, { name: 'P2', division: 'Juniors' }, { name: 'P3', division: 'Kids' }, { name: 'P4', division: 'Kids' }],
  });
  const r = rebaseDivisionRenames(server, local, base, PRESETS);
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.accepted.map(x => x.id), ['Kids>Under 12']);
  assert.deepEqual(r.server.divisions, ['Under 12', 'Juniors', 'Masters']);
  assert.deepEqual(r.server.competitors.map(c => [c.name, c.division]), [['P1', 'Under 12'], ['P2', 'Juniors'], ['P3', 'Under 12'], ['P4', 'Under 12']]);
  assert.equal(r.server.competitors[0].dojo, 'Edited', "the other device's edit is kept");
  // The three-way merge then sees no edit of this device in the lists (local = base), so it takes the server's.
  assert.deepEqual(r.local.competitors, r.base.competitors);
  assert.deepEqual(r.local.divisions, r.base.divisions);
  assert.deepEqual(r.server.divisionRenames.map(x => x.id), ['Kids>Under 12']);
});

test('the other device renamed while this one edited and added competitors: this device\'s edits move to the new name', () => {
  const base = st();
  const server = apply(base, 'Kids', 'Under 12', 'theirs');
  const local = st({
    competitors: [{ name: 'P1', division: 'Kids', seed: '1' }, { name: 'P2', division: 'Juniors' }, { name: 'P3', division: 'Kids' }, { name: 'P5', division: 'Kids' }],
  });
  const r = rebaseDivisionRenames(server, local, base, PRESETS);
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.local.competitors.map(c => [c.name, c.division]), [['P1', 'Under 12'], ['P2', 'Juniors'], ['P3', 'Under 12'], ['P5', 'Under 12']]);
  assert.equal(r.local.competitors[0].seed, '1');
  assert.deepEqual(r.base.competitors, r.server.competitors, 'the base follows the rename, so only this device\'s edits differ');
  assert.deepEqual(r.base.divisions, r.server.divisions);
  assert.deepEqual(r.local.divisions, ['Under 12', 'Juniors', 'Masters']);
});

test('a local rename that cannot be applied over the server copy is undone whole, with every later one', () => {
  const base = st();
  const local = apply(apply(base, 'Masters', 'Seniors', 'r1'), 'Seniors', 'Veterans', 'r2');
  const cases = {
    'the draw was made on another device': st({ generated: true, allMatches: { Masters: [{}] } }),
    'another device removed it': st({ divisions: ['Kids', 'Juniors'], divisionTypes: { Kids: 'Round Robin', Juniors: 'Single Elimination' }, divisionCourts: { Kids: 'A', Juniors: 'B' } }),
    'another device added a division with that name': st({ divisions: ['Kids', 'Juniors', 'Masters', 'seniors'], divisionTypes: { ...st().divisionTypes, seniors: 'Round Robin' } }),
  };
  for (const [reason, server] of Object.entries(cases)) {
    const r = rebaseDivisionRenames(server, local, base, PRESETS);
    assert.deepEqual(r.refused.map(x => [x.rename.id, x.reason]), [['r1', reason], ['r2', 'an earlier rename was not saved']], reason);
    assert.deepEqual(r.accepted, []);
    assert.deepEqual(r.local.divisions, base.divisions, `${reason}: the divisions are back`);
    assert.deepEqual(r.local.competitors, base.competitors, `${reason}: the competitors are back`);
    assert.deepEqual(r.local.divisionTypes, base.divisionTypes);
    assert.deepEqual(r.local.divisionCourts, base.divisionCourts);
    assert.deepEqual(r.server.divisionRenames, [], `${reason}: the refused renames are not recorded`);
  }
  // A preset is never removed (switched off, it keeps its row), so it can be renamed while off.
  const off = st({ divisions: ['Juniors', 'Masters'] });
  const r = rebaseDivisionRenames(off, apply(base, 'Kids', 'Under 12', 'r3'), base, PRESETS);
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.server.competitors.map(c => c.division), ['Under 12', 'Juniors', 'Under 12']);
});

test('a division added on this device since the last save and renamed is saved under its new name', () => {
  const base = st();
  const added = { ...base, divisions: [...base.divisions, 'Masters X'], divisionTypes: { ...base.divisionTypes, 'Masters X': 'Round Robin' },
    divisionCourts: { ...base.divisionCourts, 'Masters X': 'A' } };
  const local = apply(apply(added, 'Masters X', 'Seniors', 'r1'), 'Seniors', 'Veterans', 'r2');
  const server = st({ competitors: [...base.competitors, { name: 'P4', division: 'Juniors' }] });
  const r = rebaseDivisionRenames(server, local, base, PRESETS);
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.accepted.map(x => x.id), ['r1', 'r2']);
  assert.deepEqual(r.local.divisions, ['Kids', 'Juniors', 'Masters', 'Veterans'], 'the new division keeps its new name (the merge adds it)');
  assert.deepEqual(r.base.divisions, base.divisions);
  // Its new name taken on the server meanwhile: refused.
  const clash = rebaseDivisionRenames(st({ divisions: [...base.divisions, 'veterans'] }), local, base, PRESETS);
  assert.deepEqual(clash.refused.map(x => [x.rename.id, x.reason]), [['r2', 'another device added a division with that name']]);
  assert.deepEqual(clash.local.divisions, ['Kids', 'Juniors', 'Masters', 'Seniors'], 'only the refused rename is undone');
});

test('both devices renamed the same division: the server\'s rename wins, this device\'s is undone and replaced', () => {
  const base = st();
  const server = apply(base, 'Kids', 'Children', 'theirs');
  const local = apply(base, 'Kids', 'Under 12', 'mine');
  const r = rebaseDivisionRenames(server, local, base, PRESETS);
  assert.deepEqual(r.refused.map(x => x.reason), ['another device renamed a division with that name at the same time']);
  assert.deepEqual(r.local.divisions, ['Children', 'Juniors', 'Masters']);
  assert.deepEqual(r.local.competitors.map(c => c.division), ['Children', 'Juniors', 'Children']);
  assert.deepEqual(r.local, { ...r.local, divisions: r.base.divisions, competitors: r.base.competitors });
  assert.deepEqual(r.server.divisionRenames.map(x => x.id), ['theirs']);
});

test('both devices renamed different divisions: both renames hold everywhere', () => {
  const base = st();
  const server = apply(base, 'Juniors', 'Teens', 'theirs');
  const local = apply(base, 'Kids', 'Under 12', 'mine');
  const r = rebaseDivisionRenames(server, local, base, PRESETS);
  assert.deepEqual(r.refused, []);
  for (const side of ['server', 'local', 'base']) {
    assert.deepEqual(r[side].divisions, ['Under 12', 'Teens', 'Masters'], side);
    assert.deepEqual(r[side].competitors.map(c => c.division), ['Under 12', 'Teens', 'Under 12'], side);
    assert.deepEqual(r[side].divisionRenames.map(x => x.id), ['theirs', 'mine'], side);
  }
});

test('a rename already on the server (a retried save) is not applied twice', () => {
  const base = st();
  const local = apply(base, 'Kids', 'Under 12', 'r1');
  const r = rebaseDivisionRenames(local, local, base, PRESETS);
  assert.deepEqual(r.accepted, []);
  assert.deepEqual(r.local.divisions, ['Under 12', 'Juniors', 'Masters']);
  assert.deepEqual(r.server.divisionRenames.map(x => x.id), ['r1']);
});
