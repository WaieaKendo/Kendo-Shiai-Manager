// app/engine/teams.ts + kachinuki.ts (roadmap 2.6): team bouts per format and team count,
// bracket templates and courts, bracket advancement, pairing winners (bout wins, points,
// representative), kachinuki progression, round-robin standings/placements, award modes,
// plus equivalence with the pre-move legacy code over the golden team scenarios.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  teamSlots, slotLabel, buildTeamMatches, teamBracketNodesForCount, teamPairMatchObjects, syncTeamBracket, teamWinner,
  teamPairSummary, maybeCreateTeamTiebreak, teamStandings, teamRoundRobinPlacements, teamFinalPlacements, teamRoundRobinProgress,
} from '../../app/engine/teams.ts';
import { kachinukiTransitionState, kachinukiPairWinner, maybeCreateKachinukiNext } from '../../app/engine/kachinuki.ts';
import { html, engine, extractFunction } from '../lib/ksm-source.mjs';
import { gitShow } from '../lib/git-show.mjs';

const OLD = 'd3931d8';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const makeTeams = n => Array.from({ length: n }, (_, i) => {
  const L = LETTERS[i % 26] + (i >= 26 ? i : '');
  return { team: `Team ${L}`, senpo: `T${L}1`, jiho: `T${L}J`, chuken: `T${L}2`, fukusho: `T${L}F`, taisho: `T${L}3` };
});
const POSITION_KEYS = ['division', 'pool', 'white', 'red', 'wdojo', 'rdojo', 'teamWhite', 'teamRed', 'position', 'teamPair', 'done', 'wp', 'rp', 'type', 'origin', 'court'];
const settings = (teamFormat, teamTournamentFormat = 'Round Robin') => ({ teamFormat, teamTournamentFormat });
const score = (m, wp, rp) => Object.assign(m, { wp, rp, done: true });
const applySync = (nodes, arr, plan) => { plan.winners.forEach(w => { nodes[w.index].winner = w.winner; }); arr.push(...plan.added); };

test('positions per team format', () => {
  assert.deepEqual(teamSlots('3-Person Team'), ['senpo', 'chuken', 'taisho']);
  assert.deepEqual(teamSlots('Kachinuki'), ['senpo', 'chuken', 'taisho']);
  assert.deepEqual(teamSlots('5-Person Team'), ['senpo', 'jiho', 'chuken', 'fukusho', 'taisho']);
  assert.deepEqual(teamSlots(''), teamSlots('5-Person Team'), 'missing format means 5-person');
  assert.deepEqual(['senpo', 'jiho', 'chuken', 'fukusho', 'taisho', 'x'].map(slotLabel), ['Senpo', 'Jiho', 'Chuken', 'Fukusho', 'Taisho', 'x']);
});

test('round robin bouts per format and team count (2–8)', () => {
  for (const [fmt, per] of [['3-Person Team', 3], ['5-Person Team', 5], ['Kachinuki', 1]]) {
    for (let n = 2; n <= 8; n++) {
      const teams = makeTeams(n), { singleElim, matches } = buildTeamMatches('Team Tournament', teams, settings(fmt));
      assert.equal(singleElim, false);
      assert.equal(matches.length, (n * (n - 1) / 2) * per, `${fmt} ${n}`);
      const pairs = [...new Set(matches.map(m => m.teamPair))];
      assert.equal(pairs.length, n * (n - 1) / 2);
      for (const m of matches) {
        const [i, j] = m.teamPair.split('-').map(Number);
        assert.ok(i < j);
        assert.equal(m.teamWhite, teams[i].team); assert.equal(m.teamRed, teams[j].team);
        assert.equal(m.court, (i + j) % 2 === 0 ? 'A' : 'B');
        assert.equal(m.pool, 'A');
      }
    }
  }
  const [senpo] = buildTeamMatches('D', makeTeams(3), settings('5-Person Team')).matches;
  assert.deepEqual(Object.keys(senpo), POSITION_KEYS, 'position bout field order');
  assert.deepEqual([senpo.white, senpo.red, senpo.position, senpo.type, senpo.origin], ['TA1', 'TB1', 'Senpo', 'teamPosition', 'TEMPLATE']);
  const [k] = buildTeamMatches('D', makeTeams(3), settings('Kachinuki')).matches;
  assert.deepEqual(Object.keys(k), [...POSITION_KEYS, 'lineupW', 'lineupR', 'wIndex', 'rIndex'], 'kachinuki bout field order');
  assert.deepEqual([k.lineupW, k.lineupR, k.position], [['TA1', 'TA2', 'TA3'], ['TB1', 'TB2', 'TB3'], 'Kachinuki']);
  // Missing members get a placeholder name.
  const [p] = teamPairMatchObjects('D', { team: 'X' }, { team: 'Y', senpo: 'Y1' }, 'A', '0-1', 'A', '3-Person Team', teamSlots('3-Person Team'));
  assert.deepEqual([p.white, p.red], ['X Senpo', 'Y1']);
  assert.deepEqual(buildTeamMatches('D', makeTeams(4), settings('3-Person Team', 'Single Elimination')), { singleElim: true, matches: [] });
  assert.deepEqual(buildTeamMatches('D', makeTeams(4), settings('3-Person Team', '')), { singleElim: true, matches: [] }, 'default is single elimination');
});

test('bracket templates: every team placed once, feeders earlier, courts by half, Final on A', () => {
  assert.deepEqual(teamBracketNodesForCount(0), []); assert.deepEqual(teamBracketNodesForCount(1), []);
  assert.equal(teamBracketNodesForCount(33), null); assert.equal(teamBracketNodesForCount(4.5), null);
  for (let n = 2; n <= 32; n++) {
    const nodes = teamBracketNodesForCount(n);
    const teams = nodes.flatMap(x => [x.left, x.right]).filter(s => s?.team).map(s => s.team).sort((a, b) => a - b);
    assert.deepEqual(teams, Array.from({ length: n }, (_, i) => i + 1), `${n}: each team once`);
    nodes.forEach((node, i) => {
      assert.deepEqual(Object.keys(node), ['id', 'round', 'court', 'left', 'right', 'slot', 'winner']);
      for (const s of [node.left, node.right]) if (s?.ref) assert.ok(nodes.slice(0, i).some(x => x.id === s.ref), `${n}: ${node.id} fed by earlier ${s.ref}`);
    });
    assert.equal(new Set(nodes.map(x => x.id)).size, nodes.length, `${n}: unique ids`);
    const final = nodes.filter(x => x.round === 'Final');
    assert.equal(final.length, 1); assert.equal(final[0].court, 'A'); assert.equal(nodes.at(-1).id, 'F');
    if (n >= 4) assert.deepEqual(nodes.filter(x => x.round === 'Semifinal').map(x => x.court), ['A', 'B']);
  }
  assert.deepEqual(teamBracketNodesForCount(4).map(x => [x.id, x.court]), [['SF1', 'A'], ['SF2', 'B'], ['F', 'A']]);
  assert.equal(teamBracketNodesForCount(32).filter(x => x.round === 'Round of 32').length, 16);
});

test('bracket templates and a legacy global parity equal the pre-move code (2–33 teams)', t => {
  const old = gitShow(OLD, 'app/js/07-engine-team-bracket.js');
  if (old === null) return t.skip(`${OLD} not in this clone`);
  const ctx = vm.createContext({ alerted: 0 });
  vm.runInContext(`alert=()=>alerted++;\n${['T', 'W', 'N', 'teamBracketNodesForCount'].map(n => extractFunction(old, n)).join('\n')}`, ctx);
  const cur = vm.createContext({ alerted: 0 });
  vm.runInContext(`${engine}\nalert=()=>alerted++;\n${['T', 'W', 'N', 'teamBracketNodesForCount'].map(n => extractFunction(html, n)).join('\n')}`, cur);
  for (let n = 0; n <= 33; n++) {
    assert.equal(JSON.stringify(cur.teamBracketNodesForCount(n)), JSON.stringify(ctx.teamBracketNodesForCount(n)), `${n}`);
  }
  assert.deepEqual([cur.alerted, ctx.alerted], [1, 1], 'unsupported count alerts once');
});

test('single elimination bracket fills and advances: byes, White = right side, winner by bout wins, points, representative', () => {
  const teams = makeTeams(5), nodes = teamBracketNodesForCount(5).map(n => ({ ...n })), arr = [];
  applySync(nodes, arr, syncTeamBracket('D', nodes, arr, teams, '3-Person Team'));
  assert.deepEqual([...new Set(arr.map(m => m.teamPair))], ['node-QF1', 'node-QF2'], 'only nodes with both teams known');
  const qf1 = arr.filter(m => m.teamNodeId === 'QF1');
  assert.deepEqual(qf1.map(m => [m.teamWhite, m.teamRed, m.pool, m.court, m.bracketSlot]), Array(3).fill(['Team B', 'Team A', 'Quarterfinal', 'A', 0]));
  assert.deepEqual(Object.keys(qf1[0]), [...POSITION_KEYS, 'teamNodeId', 'bracketSlot']);
  // QF1: White wins 2 bouts to 1.
  score(qf1[0], ['M'], []); score(qf1[1], [], ['K']); score(qf1[2], ['D'], []);
  assert.equal(teamWinner(arr, 'node-QF1'), 'Team B');
  // QF2: 1-1 on bouts with a draw, Red ahead on points.
  const qf2 = arr.filter(m => m.teamNodeId === 'QF2');
  score(qf2[0], ['M'], []); score(qf2[1], [], ['K', 'D']); score(qf2[2], ['M'], ['M']);
  assert.deepEqual(teamPairSummary(arr, 'node-QF2'), { teamWhite: 'Team D', teamRed: 'Team C', wWins: 1, rWins: 1, wPts: 2, rPts: 3, done: 3, total: 3, matches: qf2 });
  assert.equal(teamWinner(arr, 'node-QF2'), 'Team C');
  const plan = syncTeamBracket('D', nodes, arr, teams, '3-Person Team');
  assert.deepEqual(plan.winners.map(w => [nodes[w.index].id, w.winner]), [['QF1', 'Team B'], ['QF2', 'Team C'], ['SF1', 'Team B']], 'SF1 bye advances Team B');
  applySync(nodes, arr, plan);
  assert.deepEqual(arr.filter(m => m.teamNodeId === 'SF2').map(m => [m.teamWhite, m.teamRed, m.court]), Array(3).fill(['Team E', 'Team C', 'B']));
  // SF2 level on bouts and points: representative playoff decides.
  const sf2 = arr.filter(m => m.teamNodeId === 'SF2');
  score(sf2[0], ['M'], []); score(sf2[1], [], ['K']); score(sf2[2], [], []);
  assert.equal(teamWinner(arr, 'node-SF2'), null);
  const tb = maybeCreateTeamTiebreak(sf2[2], arr, '3-Person Team');
  assert.equal(tb.anchor, sf2[2]); assert.equal(tb.dynamicType, 'TEAM_3_PERSON_REPRESENTATIVE');
  assert.deepEqual(Object.keys(tb.playoff), ['division', 'pool', 'white', 'red', 'wdojo', 'rdojo', 'teamWhite', 'teamRed', 'position', 'teamPair', 'done', 'wp', 'rp', 'tiebreak', 'type', 'court', 'teamNodeId', 'bracketSlot', 'parentTeamMatch']);
  assert.deepEqual([tb.playoff.white, tb.playoff.red, tb.playoff.court, tb.playoff.teamNodeId, tb.playoff.bracketSlot], ['Team E Representative', 'Team C Representative', 'B', 'SF2', 1]);
  arr.push(tb.playoff);
  assert.equal(maybeCreateTeamTiebreak(sf2[2], arr, '3-Person Team'), null, 'one playoff per pairing');
  assert.equal(syncTeamBracket('D', nodes, arr, teams, '3-Person Team').winners.length, 0, 'waits for the playoff');
  score(tb.playoff, [], ['M']);
  assert.equal(teamWinner(arr, 'node-SF2'), 'Team C');
  applySync(nodes, arr, syncTeamBracket('D', nodes, arr, teams, '3-Person Team'));
  const final = arr.filter(m => m.teamNodeId === 'F');
  assert.deepEqual(final.map(m => [m.teamWhite, m.teamRed, m.court]), Array(3).fill(['Team C', 'Team B', 'A']));
  assert.equal(teamFinalPlacements(nodes, teams), null, 'no placements before the Final');
  final.forEach(m => score(m, ['M'], []));
  applySync(nodes, arr, syncTeamBracket('D', nodes, arr, teams, '3-Person Team'));
  assert.deepEqual(teamFinalPlacements(nodes, teams), { first: 'Team C', second: 'Team B', thirds: ['Team E'], roundRobin: false }, 'SF1 was a bye: one third place');
});

test('representative playoff only when level on bouts and points; 5-person type', () => {
  const arr = buildTeamMatches('D', makeTeams(2), settings('5-Person Team')).matches;
  arr.slice(0, 4).forEach(m => score(m, [], []));
  assert.equal(maybeCreateTeamTiebreak(arr[3], arr, '5-Person Team'), null, 'not all bouts done');
  score(arr[4], ['M'], []);
  assert.equal(maybeCreateTeamTiebreak(arr[4], arr, '5-Person Team'), null, 'not level');
  score(arr[4], [], []);
  assert.equal(maybeCreateTeamTiebreak(arr[4], arr, '5-Person Team').dynamicType, 'TEAM_5_PERSON_REPRESENTATIVE');
  assert.equal(maybeCreateTeamTiebreak(arr[1], arr, '').anchor, arr[4], 'anchored on the last position bout');
  assert.equal(maybeCreateTeamTiebreak({ ...arr[4], tiebreak: true }, arr, ''), null);
  assert.equal(maybeCreateTeamTiebreak(null, arr, ''), null);
});

test('kachinuki: winner stays, draws, lineups exhausted, playoff', () => {
  assert.deepEqual(kachinukiTransitionState({ wp: ['M'], rp: [], wIndex: 0, rIndex: 0 }), { wi: 0, ri: 1, whiteExhausted: false, redExhausted: false });
  assert.deepEqual(kachinukiTransitionState({ wp: [], rp: ['K'], wIndex: 1, rIndex: 2 }), { wi: 2, ri: 2, whiteExhausted: false, redExhausted: false });
  assert.deepEqual(kachinukiTransitionState({ wp: [], rp: [], wIndex: 0, rIndex: 0 }), { wi: 1, ri: 1, whiteExhausted: false, redExhausted: false }, 'draw: both out');
  assert.deepEqual(kachinukiTransitionState({ wp: [], rp: [], wIndex: 2, rIndex: 0 }), { wi: 2, ri: 1, whiteExhausted: false, redExhausted: false }, 'draw: last White stays');
  assert.deepEqual(kachinukiTransitionState({ wp: [], rp: [], wIndex: 1, rIndex: 2 }), { wi: 2, ri: 2, whiteExhausted: false, redExhausted: false }, 'draw: last Red stays');
  assert.deepEqual(kachinukiTransitionState({ wp: [], rp: [], wIndex: 2, rIndex: 2 }), { wi: 3, ri: 3, whiteExhausted: true, redExhausted: true });

  const arr = buildTeamMatches('D', makeTeams(2), settings('Kachinuki')).matches;
  const play = (wp, rp) => {
    const m = arr.at(-1); score(m, wp, rp);
    const next = maybeCreateKachinukiNext(m);
    if (next) arr.push(next.match);
    return next;
  };
  let next = play(['M'], []);
  assert.equal(next.kind, 'continuation');
  assert.deepEqual([next.match.white, next.match.red, next.match.wIndex, next.match.rIndex, next.match.origin], ['TA1', 'TB2', 0, 1, 'TEMPLATE_CONTINUATION']);
  assert.deepEqual(Object.keys(next.match), ['division', 'pool', 'white', 'red', 'wdojo', 'rdojo', 'teamWhite', 'teamRed', 'position', 'teamPair', 'done', 'wp', 'rp', 'type', 'court', 'lineupW', 'lineupR', 'wIndex', 'rIndex', 'teamNodeId', 'bracketSlot', 'origin']);
  assert.equal(kachinukiPairWinner(arr), null);
  next = play([], []); // draw: TA1 and TB2 both out
  assert.deepEqual([next.match.white, next.match.red], ['TA2', 'TB3']);
  next = play([], ['K']); // TB3 beats TA2
  assert.deepEqual([next.match.white, next.match.red], ['TA3', 'TB3']);
  next = play([], []); // last players draw: both lineups exhausted
  assert.equal(next.kind, 'playoff');
  assert.deepEqual([next.match.white, next.match.position, next.match.tiebreak, next.match.type], ['Team A Representative', 'Kachinuki Playoff', true, 'teamPlayoff']);
  assert.equal(teamWinner(arr, '0-1'), null, 'playoff pending');
  assert.equal(maybeCreateKachinukiNext(next.match), null, 'playoff has no next bout');
  score(arr.at(-1), [], ['M']);
  assert.equal(teamWinner(arr, '0-1'), 'Team B');

  const won = buildTeamMatches('D', makeTeams(2), settings('Kachinuki')).matches;
  for (let i = 0; i < 3; i++) { const m = won.at(-1); score(m, ['M'], []); const n = maybeCreateKachinukiNext(m); if (n) won.push(n.match); }
  assert.equal(won.length, 3, 'TA1 beats all three: no fourth bout');
  assert.equal(kachinukiPairWinner(won), 'Team A'); assert.equal(teamWinner(won, '0-1'), 'Team A');
});

test('round robin standings, progress and placements', () => {
  const teams = makeTeams(4), arr = buildTeamMatches('D', teams, settings('3-Person Team')).matches;
  assert.deepEqual(teamRoundRobinProgress(arr), { complete: 0, total: 6 });
  assert.deepEqual(teamStandings(arr, teams).map(r => [r.name, r.played, r.rank, r.nameFallback]), teams.map((t, i) => [t.team, 0, i + 1, true]));
  // Lower-numbered team wins every pairing 2-1; pairing 0-1 on points only (1-1 bouts, one draw).
  for (const m of arr) {
    const [i, j] = m.teamPair.split('-').map(Number);
    if (i === 0 && j === 1) score(m, m.position === 'Senpo' ? ['M', 'K'] : [], m.position === 'Chuken' ? ['D'] : []);
    else score(m, m.position === 'Taisho' ? [] : ['M'], m.position === 'Taisho' ? ['M'] : []);
  }
  const rows = teamStandings(arr, teams);
  assert.deepEqual(Object.keys(rows[0]), ['name', 'played', 'wins', 'losses', 'matchWins', 'pts', 'rank', 'nameFallback']);
  assert.deepEqual(rows.map(r => [r.name, r.wins, r.losses, r.played]), [['Team A', 3, 0, 3], ['Team B', 2, 1, 3], ['Team C', 1, 2, 3], ['Team D', 0, 3, 3]]);
  assert.deepEqual(teamRoundRobinProgress(arr), { complete: 6, total: 6 });
  assert.equal(teamRoundRobinPlacements(false, arr, teams), null, 'not before the division is complete');
  const p = teamRoundRobinPlacements(true, arr, teams);
  assert.deepEqual([p.first, p.second, p.thirds, p.roundRobin], ['Team A', 'Team B', ['Team C'], true]);
  assert.equal(teamRoundRobinPlacements(true, [], []), null);
  // Level pairing without a playoff result does not count.
  const lvl = buildTeamMatches('D', makeTeams(2), settings('3-Person Team')).matches; lvl.forEach(m => score(m, [], []));
  assert.deepEqual(teamStandings(lvl, makeTeams(2)).map(r => r.played), [0, 0]);
});

test('award mode: top1 / top2 / dual3 rows from the team placements', () => {
  const ctx = vm.createContext({ state: {}, esc: s => String(s), teamFinalPlacements: () => ({ first: 'A', second: 'B', thirds: ['C', 'D'], roundRobin: false }) });
  vm.runInContext(extractFunction(html, 'teamFinalResultsHtml'), ctx);
  const rows = mode => { ctx.state.teamAwardMode = mode; return [...ctx.teamFinalResultsHtml('D').matchAll(/<span>([^<]*)<\/span>/g)].map(m => m[1]); };
  assert.deepEqual(rows('top1'), ['A']);
  assert.deepEqual(rows(undefined), ['A', 'B'], 'default top2');
  assert.deepEqual(rows('dual3'), ['A', 'B', 'C', 'D']);
  ctx.teamFinalPlacements = () => null;
  assert.match(ctx.teamFinalResultsHtml('D'), /Completed/);
});

test('team engine equals the pre-move legacy code over the golden team scenarios', t => {
  const files = ['05-engine-team-matches.js', '07-engine-team-bracket.js', '09-results-and-awards.js', '13-engine-standings-and-tiebreaks.js', '16-court-context-and-pool-editing.js'];
  const oldFiles = files.map(f => gitShow(OLD, `app/js/${f}`));
  if (oldFiles.includes(null)) return t.skip(`${OLD} not in this clone`);
  const oldSrc = oldFiles.join('\n');
  const MOVED = ['teamSlots', 'slotLabel', 'buildTeamMatches', 'teamSideTeam', 'nodeHasMatch', 'nodePairId', 'syncTeamBracket', 'T', 'W', 'N',
    'teamBracketNodesForCount', 'addTeamPairMatches', 'kachinukiTransitionState', 'kachinukiPairWinner', 'teamWinner', 'maybeAdvanceTeamBracket',
    'teamPairMatches', 'teamPositionMatches', 'teamPairSummary', 'teamPairIds', 'teamRoundRobinPairResolved', 'teamStandings',
    'teamRoundRobinProgress', 'teamRoundRobinPlacements', 'maybeCreateTeamTiebreak', 'teamNodeSideName', 'teamFinalPlacements', 'maybeCreateKachinukiNext'];
  const SHARED = ['winnerOf', 'isTeamMatch', 'teamNodeOrderMap', 'teamPairOrderMap', 'teamPositionOrder', 'teamMatchSortKey', 'sortTeamMatches', 'isTeamRoundRobinDivision'];
  const stubs = `alert=()=>{};isTeamDivision=()=>true;eligibleTeams=()=>teamsList;tournamentSettings=()=>settings;
    divisionComplete=div=>{const ms=state.allMatches[div]||[];return ms.length&&ms.every(m=>m.done)};
    appendApprovedDynamicMatches=(div,after,match,type)=>{const arr=state.allMatches[div]||[];match.origin='TIEBREAK';match.dynamicType=type;arr.splice(arr.indexOf(after)+1,0,match);state.allMatches[div]=arr;sortTeamMatches(div);return [match];};`;
  const load = src => {
    const ctx = vm.createContext({ state: null, teamsList: null, settings: null });
    vm.runInContext(`${engine}\n${stubs}\n${SHARED.map(n => extractFunction(html, n)).join('\n')}\n${MOVED.map(n => extractFunction(src, n)).join('\n')}`, ctx);
    return ctx;
  };
  const legacy = load(oldSrc), current = load(html);
  assert.ok(!/KSMEngine/.test(extractFunction(oldSrc, 'syncTeamBracket')), 'old code is pre-move');
  assert.ok(/KSMEngine\.syncTeamBracket/.test(extractFunction(html, 'syncTeamBracket')), 'current code delegates');
  const dir = new URL('../golden/engine/', import.meta.url);
  const outcome = line => {
    const [side, ...pts] = line.split(' | ').at(-1).split(' ');
    return { side, wp: pts.filter(p => p[0] === 'W').map(p => p.slice(1)), rp: pts.filter(p => p[0] === 'R').map(p => p.slice(1)) };
  };
  let scenarios = 0, steps = 0;
  for (const file of fs.readdirSync(dir).filter(f => /^(team[35]|kachinuki)-/.test(f)).sort()) {
    const g = JSON.parse(fs.readFileSync(new URL(file, dir), 'utf8'));
    const d = g.setup.find(s => s.team);
    const results = (g.play_order || []).map(outcome);
    const div = 'Team Tournament';
    for (const count of new Set([d.teams, 2, 3, 6, 8])) {
      for (const tfmt of ['Single Elimination', 'Round Robin']) {
        if (tfmt === 'Round Robin' && count > 5) continue;
        const run = ctx => {
          ctx.settings = { teamFormat: d.format, teamTournamentFormat: tfmt };
          ctx.teamsList = makeTeams(count);
          ctx.state = { allMatches: {}, teamBracketNodes: {}, teamElimTeams: {}, teamAwardMode: 'dual3' };
          const st = ctx.state, res = [];
          const snap = () => res.push(JSON.stringify(st.allMatches[div]), JSON.stringify(st.teamBracketNodes[div] || null),
            JSON.stringify(ctx.teamStandings(div)), JSON.stringify(ctx.teamFinalPlacements(div)), JSON.stringify(ctx.teamRoundRobinProgress(div)));
          st.allMatches[div] = ctx.buildTeamMatches(div, ctx.teamsList);
          ctx.sortTeamMatches(div); snap();
          for (let i = 0; i < 200; i++) {
            const m = st.allMatches[div].find(x => !x.done);
            if (!m) break;
            const r = results[i % Math.max(1, results.length)] || { wp: ['M'], rp: [] };
            Object.assign(m, { wp: [...r.wp], rp: [...r.rp], done: true });
            ctx.maybeCreateTeamTiebreak(m); ctx.maybeCreateKachinukiNext(m); ctx.maybeAdvanceTeamBracket(m); snap();
          }
          return res;
        };
        const a = run(legacy), b = run(current);
        assert.deepEqual(b, a, `${file} ${count} teams ${tfmt}`);
        scenarios++; steps += a.length;
      }
    }
  }
  assert.ok(scenarios >= 60 && steps > 1500, `scenarios: ${scenarios}, snapshots: ${steps}`);
});
