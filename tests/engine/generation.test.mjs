// app/engine/generation.ts (roadmap 2.7): eligibility, the per-format division plan, and
// equivalence of generateDivisionState() with the pre-move legacy code over every golden
// scenario (round robin, single elimination, seeded, no-shows, split courts, 3/5-person and
// kachinuki teams in bracket and round robin) plus exhibitions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { eligibleIndividuals, eligibleTeams, generateDivision } from '../../app/engine/generation.ts';
import { readSettings } from '../../app/engine/settings.ts';
import { html, withDependencies, extractFunction } from '../lib/ksm-source.mjs';
import { gitShow } from '../lib/git-show.mjs';

const OLD = 'e7312a6';
const people = (n, div = 'Open') => Array.from({ length: n }, (_, i) => ({ name: `P${String(i + 1).padStart(2, '0')}`, dojo: `Dojo ${'ABC'[i % 3]}`, seed: '', status: 'Checked', division: div }));
const makeTeams = n => Array.from({ length: n }, (_, i) => ({ team: `Team ${'ABCDEFGH'[i]}`, senpo: `T${i}1`, jiho: `T${i}J`, chuken: `T${i}2`, fukusho: `T${i}F`, taisho: `T${i}3`, status: 'Checked' }));
const settings = over => ({ ...readSettings({}), ...over });

test('eligibility excludes no-shows, nameless rows and other divisions', () => {
  const comps = [...people(3), { name: 'X', dojo: '', division: 'Open', status: 'NoShow' }, { name: '', dojo: '', division: 'Open' }, ...people(2, 'Kids')];
  assert.deepEqual(eligibleIndividuals(comps, 'Open').map(c => c.name), ['P01', 'P02', 'P03']);
  assert.deepEqual(eligibleTeams([...makeTeams(2), { team: 'Gone', status: 'NoShow' }, { team: '' }]).map(t => t.team), ['Team A', 'Team B']);
});

test('plan per format', () => {
  const base = { competitors: people(8), teams: makeTeams(4), settings: settings({}) };
  assert.equal(generateDivision({ ...base, division: 'Nobody' }), null, 'no entrants: nothing to write');
  const rr = generateDivision({ ...base, division: 'Open', courtMode: 'split' });
  assert.equal(rr.kind, 'roundRobin');
  assert.deepEqual(rr.pools.map(p => p.court), ['A', 'B'], 'split courts: first half of the pools on A');
  assert.ok(rr.championshipNodes.length && rr.matches.some(m => m.championship));
  assert.ok(rr.matches.filter(m => !m.championship).every(m => m.court === rr.pools.find(p => p.label === m.pool).court));
  const se = generateDivision({ ...base, division: 'Open', divisionType: 'Single Elimination' });
  assert.equal(se.kind, 'singleElim'); assert.equal(se.singleElimComps.length, 8); assert.deepEqual(se.pools, []);
  const teamSE = generateDivision({ ...base, division: 'Team Tournament' });
  assert.equal(teamSE.kind, 'team'); assert.ok(teamSE.singleElim && teamSE.teamBracketNodes.length); assert.equal(teamSE.divisionCourt, 'Both');
  const teamRR = generateDivision({ ...base, division: 'Team Tournament', courtMode: 'B', settings: settings({ teamTournamentFormat: 'Round Robin', teamFormat: 'Kachinuki' }) });
  assert.equal(teamRR.teamBracketNodes, null); assert.equal(teamRR.pools, teamRR.teamPools, 'team pool is shared'); assert.equal(teamRR.matches.length, 6);
  const ex = [{ white: 'A', red: 'B' }, { white: 'C', red: 'D', status: 'NoShow' }];
  assert.equal(generateDivision({ ...base, division: 'Exhibition Matches', exhibitions: ex }), null, 'exhibitions disabled');
  const exPlan = generateDivision({ ...base, division: 'Exhibition Matches', exhibitions: ex, settings: settings({ exhibitionEnabled: 'Enabled' }) });
  assert.equal(exPlan.pools[0].size, 2); assert.equal(exPlan.matches.length, 1); assert.equal(exPlan.matches[0].court, 'B'); assert.ok(exPlan.generated);
  assert.equal(generateDivision({ ...base, division: 'Exhibition Matches', exhibitions: [ex[1]], settings: settings({ exhibitionEnabled: 'Enabled' }) }).generated, false);
});

test('F21: the Setup team court A or B puts every team bout on that court; Both keeps the split', () => {
  const base = { competitors: [], teams: makeTeams(6), division: 'Team Tournament' };
  for (const tournament of ['Round Robin', 'Single Elimination']) for (const format of ['3-Person Team', 'Kachinuki']) {
    const s = settings({ teamTournamentFormat: tournament, teamFormat: format });
    const both = generateDivision({ ...base, settings: s, courtMode: 'Both' });
    const courtsOf = p => [...new Set([...p.matches, ...(p.teamBracketNodes || [])].map(x => x.court))].sort();
    assert.deepEqual(courtsOf(both), ['A', 'B'], `${tournament} ${format}: Both uses both courts`);
    assert.deepEqual(generateDivision({ ...base, settings: s }), both, 'nothing saved = Both');
    for (const court of ['A', 'B']) {
      const one = generateDivision({ ...base, settings: s, courtMode: court });
      assert.deepEqual(courtsOf(one), [court], `${tournament} ${format}: everything on Court ${court}`);
      assert.equal(one.divisionCourt, court);
      // Only the courts differ from Both.
      const strip = p => JSON.parse(JSON.stringify({ ...p, divisionCourt: null }), (k, v) => k === 'court' ? null : v);
      assert.deepEqual(strip(one), strip(both));
    }
  }
});

test('F21: generateDivisionState keeps later team bracket bouts on the Setup team court', () => {
  const exclude = ['state', 'alert', 'console', 'tournamentSettings'];
  const code = withDependencies(html, extractFunction(html, 'generateDivisionState'), { exclude });
  for (const court of ['A', 'B']) {
    const ctx = vm.createContext({ alert() {}, console: { warn() {}, error() {}, info() {}, log() {} } });
    vm.runInContext(code, ctx);
    ctx.tournamentSettings = () => settings({ teamTournamentFormat: 'Single Elimination', teamFormat: '3-Person Team' });
    ctx.state = { competitors: [], teams: makeTeams(5), exhibitions: [], divisions: [], divisionTypes: {}, divisionCourts: { 'Team Tournament': court },
      pools: {}, teamPools: {}, allMatches: {}, teamBracketNodes: {}, singleElimNodes: {}, singleElimComps: {}, teamElimTeams: {}, brackets: {}, championshipNodes: {}, byeWinners: {}, currentByDivision: {} };
    assert.equal(ctx.generateDivisionState('Team Tournament'), true);
    const st = ctx.state, ms = st.allMatches['Team Tournament'];
    assert.ok(ms.length, 'bye-advanced nodes created bouts');
    assert.deepEqual([...new Set(ms.map(m => m.court))], [court]);
    assert.deepEqual([...new Set(st.teamBracketNodes['Team Tournament'].map(n => n.court))], [court]);
    assert.equal(st.divisionCourts['Team Tournament'], court);
  }
});

test('generateDivisionState equals the pre-move legacy code on every golden scenario', t => {
  const files = fs.readdirSync(new URL('../../app/js/', import.meta.url)).filter(f => f.endsWith('.js')).sort();
  const oldFiles = files.map(f => gitShow(OLD, `app/js/${f}`));
  if (oldFiles.includes(null)) return t.skip(`${OLD} not in this clone`);
  const oldSrc = oldFiles.join('\n');
  assert.ok(!/KSMEngine/.test(extractFunction(oldSrc, 'generateDivisionState')), 'old code is pre-move');
  assert.ok(/KSMEngine\.generateDivision\(/.test(extractFunction(html, 'generateDivisionState')), 'current code delegates');
  const exclude = ['state', 'alert', 'console', 'tournamentSettings'];
  const code = src => withDependencies(src, extractFunction(src, 'generateDivisionState'), { exclude });
  const legacyCode = code(oldSrc), currentCode = code(html);
  const run = (src, setup, over) => {
    const alerts = [];
    const ctx = vm.createContext({ alert: m => alerts.push(m), console: { warn() {}, error() {}, info() {}, log() {} } });
    vm.runInContext(src, ctx);
    ctx.tournamentSettings = () => settings(over);
    ctx.state = {
      competitors: [], teams: [], exhibitions: [], divisions: [], divisionTypes: {}, divisionCourts: {}, currentDivision: null,
      pools: {}, teamPools: {}, allMatches: {}, teamBracketNodes: {}, singleElimNodes: {}, singleElimComps: {}, teamElimTeams: {},
      brackets: {}, championshipNodes: {}, byeWinners: {}, currentByDivision: {},
    };
    const st = ctx.state, results = [];
    for (const d of setup) {
      if (d.exhibitions) st.exhibitions = d.exhibitions;
      if (d.team) {
        st.teams = makeTeams(d.teams); st.divisionCourts['Team Tournament'] = d.court;
        over.teamFormat = d.format; over.teamTournamentFormat = d.tournament;
      } else {
        st.divisions.push(d.name); st.divisionTypes[d.name] = d.format; if (d.court) st.divisionCourts[d.name] = d.court;
        st.competitors.push(...d.entrants.map(e => ({ ...e, division: d.name })));
      }
    }
    for (const div of [...st.divisions, 'Team Tournament', 'Exhibition Matches']) results.push(ctx.generateDivisionState(div));
    return JSON.stringify({ results, alerts, state: st });
  };
  const dir = new URL('../golden/engine/', import.meta.url);
  let scenarios = 0;
  const cases = fs.readdirSync(dir).sort().map(f => [f, JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')).setup]);
  // Exhibitions (with a no-show) and more split/Both court modes than the goldens hold.
  cases.push(['exhibitions', [{ name: 'Open', format: 'Round Robin', court: 'B', entrants: people(5),
    exhibitions: [{ white: 'A', red: 'B' }, { white: 'C', red: 'D', status: 'NoShow' }, { white: 'E', red: '' }] }]]);
  cases.push(['single-elim-both', [{ name: 'Open', format: 'Single Elimination', court: 'split', entrants: people(11) }]]);
  for (const [name, setup] of cases) {
    const over = { exhibitionEnabled: name === 'exhibitions' ? 'Enabled' : 'Disabled' };
    const current = run(currentCode, setup, { ...over });
    // F21 (intended change): a team event set to Court A or B now has every bout and
    // bracket node on that court; everything else is still the pre-move code's output.
    const legacy = JSON.parse(run(legacyCode, setup, { ...over }));
    const teamCourt = setup.find(d => d.team)?.court;
    if (teamCourt === 'A' || teamCourt === 'B') {
      for (const x of [...(legacy.state.allMatches['Team Tournament'] || []), ...(legacy.state.teamBracketNodes['Team Tournament'] || [])]) x.court = teamCourt;
    }
    assert.equal(current, JSON.stringify(legacy), name);
    const { results, state } = JSON.parse(current);
    assert.ok(results.some(Boolean) && Object.values(state.allMatches).every(a => a.length), `${name} generated matches`);
    scenarios++;
  }
  assert.ok(scenarios >= 78);
});
